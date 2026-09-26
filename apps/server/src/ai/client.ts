// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
// pgvector's indexed-dimension cap requires outputDimensionality: 768.
export const EMBEDDING_DIMS = 768;
// gemini-2.5-flash returns 404 for new API keys (checked 2026-09-26 via models.list); pinned, not the -latest alias,
// so the model can't change under the demo.
export const FLASH_MODEL = 'gemini-3.8-flash';
// Backup when Flash is overloaded (503s were common on the free tier Sep 26); Lite answered when Flash didn't.
export const FLASH_LITE_MODEL = 'gemini-3.5-flash-lite';

let client: GoogleGenAI | undefined;

export function getAiClient(): GoogleGenAI {
  if (!env.geminiApiKey) {
    throw new Error('Gemini client requested without GEMINI_API_KEY.');
  }
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}
