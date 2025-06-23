/**
 * File: src/shared/schemas.ts
 * Module: Validation Schemas
 * Purpose: Zod validation schemas for data validation
 * Usage: Import for validating user input and API responses
 * Contains: SettingsSchema and other validation schemas
 * Dependencies: zod
 * Iteration: 1
 */

import { z } from 'zod';

export const SettingsSchema = z.object({
    provider: z.enum(['claude', 'openai', 'ollama']),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().min(1).max(128000),
    systemPrompt: z.string(),
    apiKeys: z.object({
        claude: z.string(),
        openai: z.string(),
        ollama: z.string(),
    }),
    retryAttempts: z.number().min(0).max(10),
    streamRateLimit: z.number().min(10).max(1000),
    theme: z.literal('dark'),
    ollamaEndpoint: z.string().url().optional(),
});