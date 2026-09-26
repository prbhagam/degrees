// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
// pgvector's indexed-dimension cap requires outputDimensionality: 768.
export const EMBEDDING_DIMS = 768;
// TODO(Christian): confirm the Gemini Flash model at implementation time.
export const FLASH_MODEL = 'gemini-2.5-flash';

let client: GoogleGenAI | undefined;

export function getAiClient(): GoogleGenAI {
  if (!env.geminiApiKey) {
    throw new Error('Gemini client requested without GEMINI_API_KEY.');
  }
  client ??= new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}
