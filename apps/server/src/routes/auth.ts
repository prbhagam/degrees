// Owner: Christian (Server & Infra) — see docs/ROLES.md. Signup added by Sahith (Sep 26).
// Public (mounted before requireAuth). Signup lives on the server because the shared Supabase project
// requires email confirmation, whose built-in mailer is rate-limited, and because nothing else creates a new
// user's `profiles` row. The service role creates the auth user already confirmed, then the profile row; the app
// signs in with the email + password right after.
// CHANGED Sep 27: the auth email is the person's real email (it used to be `<username>@degrees.demo`). The
// username is still collected and unique, as the @handle. `@degrees.demo` is reserved for the seeded demo
// accounts (signupEmailSchema rejects it), so supabase/scripts/purge_demo_users.sql can find them by domain.
// CHANGED Sep 27: POST /auth/login signs in with a username. The app can't turn a username into the account's email
// (auth.users isn't readable, and handing emails out by username would leak them), so the server looks the email up
// and signs in itself, returning only the session. Email logins still go straight from the app to Supabase.
import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import {
  loginRequestSchema,
  signupRequestSchema,
  type LoginResponse,
  type SignupResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { REQUESTER_ID } from '../mocks/fixtures.js';

const usernameTaken = () =>
  new ApiError(409, 'username_taken', 'That username is taken.');
const emailTaken = () =>
  new ApiError(409, 'email_taken', 'An account with that email already exists. Try logging in.');
// One message for an unknown username and a wrong password, so the route can't be used to check which usernames exist.
const invalidCredentials = () =>
  new ApiError(401, 'invalid_credentials', 'Wrong username or password.');

export const authRoutes = new Hono<AppEnv>()
  .post('/auth/login', async (context) => {
    const request = await validateJson(context, loginRequestSchema);

    if (env.mockMode) {
      // The app skips sign-in entirely when it has no Supabase project, so this only runs against a half-configured
      // setup; there's no real session to hand back.
      throw new ApiError(503, 'mock_mode', 'Username login needs the real server. Log in with your email instead.');
    }

    const db = getServiceClient();
    const { data: profile, error: lookupError } = await db
      .from('profiles')
      .select('id')
      .eq('username', request.username)
      .maybeSingle();
    if (lookupError) {
      throw new Error(`profiles lookup failed: ${lookupError.message}`);
    }
    if (!profile) {
      throw invalidCredentials();
    }

    const { data: found, error: userError } = await db.auth.admin.getUserById(profile.id);
    if (userError || !found.user?.email) {
      console.error('[auth/login] no auth email for profile', profile.id, userError);
      throw invalidCredentials();
    }

    // A throwaway client: signing in stores the user's session on the client, which would turn the shared service
    // client's requests into that user's.
    const signIn = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: session, error: signInError } = await signIn.auth.signInWithPassword({
      email: found.user.email,
      password: request.password,
    });
    if (signInError || !session.session) {
      if (signInError?.code === 'invalid_credentials') {
        throw invalidCredentials();
      }
      if (signInError?.status === 429) {
        throw new ApiError(429, 'rate_limited', 'Too many tries. Wait a minute and try again.');
      }
      console.error('[auth/login] signInWithPassword failed:', signInError);
      throw new ApiError(500, 'login_failed', 'Could not log in right now.');
    }

    const response = {
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
    } satisfies LoginResponse;
    return context.json(response);
  })
  .post('/auth/signup', async (context) => {
    const request = await validateJson(context, signupRequestSchema);

    if (env.mockMode) {
      const response = { ok: true, userId: REQUESTER_ID } satisfies SignupResponse;
      return context.json(response);
    }

    const db = getServiceClient();
    const { data: existing, error: lookupError } = await db
      .from('profiles')
      .select('id')
      .eq('username', request.username)
      .maybeSingle();
    if (lookupError) {
      throw new Error(`profiles lookup failed: ${lookupError.message}`);
    }
    if (existing) {
      throw usernameTaken();
    }

    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: request.email,
      password: request.password,
      email_confirm: true,
      user_metadata: { username: request.username },
    });
    if (createError || !created.user) {
      if (createError?.code === 'email_exists' || /already/i.test(createError?.message ?? '')) {
        throw emailTaken();
      }
      if (createError?.code === 'weak_password') {
        throw new ApiError(400, 'invalid_request', createError.message);
      }
      console.error('[auth/signup] createUser failed:', createError);
      throw new ApiError(500, 'signup_failed', 'Could not create the account.');
    }

    const userId = created.user.id;
    const { error: profileError } = await db.from('profiles').insert({
      id: userId,
      username: request.username,
      display_name: request.displayName,
      phone: request.phone,
      pronouns: request.pronouns || null,
    });
    if (profileError) {
      // Roll back so the username isn't stuck on an auth user with no profile.
      const { error: rollbackError } = await db.auth.admin.deleteUser(userId);
      if (rollbackError) {
        console.error('[auth/signup] rollback failed for', userId, rollbackError);
      }
      if (profileError.code === '23505') {
        throw usernameTaken();
      }
      console.error('[auth/signup] profile insert failed:', profileError);
      throw new ApiError(500, 'signup_failed', 'Could not create the account.');
    }

    const response = { ok: true, userId } satisfies SignupResponse;
    return context.json(response);
  });
