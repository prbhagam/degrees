// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { AiRateLimiter } from './rateLimiter.js';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
// pgvector's indexed-dimension cap requires outputDimensionality: 768.
export const EMBEDDING_DIMS = 768;
// gemini-2.5-flash returns 404 for new API keys (checked 2026-09-26 via models.list); pinned, not the -latest alias,
// so the model can't change under the demo.
export const FLASH_MODEL = 'gemini-3.8-flash';
// Backup when Flash is overloaded (503s were common on the free tier Sep 26); Lite answered when Flash didn't.
export const FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';

export const aiRateLimiter = new AiRateLimiter(env.geminiRpm);

let rawClient: GoogleGenAI | undefined;
let wrappedClient: GoogleGenAI | undefined;

export function getAiClient(): GoogleGenAI {
  if (!env.geminiApiKey) {
    throw new Error('Gemini client requested without GEMINI_API_KEY.');
  }
  if (!wrappedClient) {
    rawClient = new GoogleGenAI({ apiKey: env.geminiApiKey });
    const originalModels = rawClient.models;

    const modelsProxy = new Proxy(originalModels, {
      get(target, prop, receiver) {
        if (prop === 'generateContent') {
          return async (params: any) => {
            const signal = params?.config?.abortSignal;
            await aiRateLimiter.acquire(signal);
            return (target.generateContent as any).call(target, params);
          };
        }
        if (prop === 'embedContent') {
          return async (params: any) => {
            const signal = params?.config?.abortSignal;
            await aiRateLimiter.acquire(signal);
            return (target.embedContent as any).call(target, params);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    wrappedClient = new Proxy(rawClient, {
      get(target, prop, receiver) {
        if (prop === 'models') {
          return modelsProxy;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }
  return wrappedClient;
}
