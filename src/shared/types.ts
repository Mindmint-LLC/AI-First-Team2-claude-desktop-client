/**
 * File: src/shared/types.ts
 * Module: Shared Type Definitions
 * Purpose: Define TypeScript types used across main and renderer processes
 * Usage: Import for type safety in both processes
 * Contains: Data models, IPC types, API types
 * Dependencies: zod (for schema validation)
 * Iteration: 1
 */

import { z } from 'zod';

// Base data types
export interface Conversation {
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messageIds: string[];
    totalTokens: number;
    estimatedCost: number;
    metadata?: Record<string, unknown>;
}

export interface Message {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    model: string;
    provider: Provider;
    tokenCount: number;
    cost: number;
    metadata?: Record<string, unknown>;
    streaming?: boolean;
    error?: string;
}

export interface Settings {
    provider: Provider;
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    apiKeys: Record<Provider, string>;
    retryAttempts: number;
    streamRateLimit: number;
    theme: 'dark';
    ollamaEndpoint?: string;
}

export type Provider = 'claude' | 'openai' | 'ollama';

export interface ModelInfo {
    id: string;
    name: string;
    maxTokens: number;
    costPer1kInput?: number;
    costPer1kOutput?: number;
}

export interface ProviderConfig {
    models: ModelInfo[];
    endpoint: string;
    headers: Record<string, string>;
}

// IPC Types
export interface IPCRequest<T = unknown> {
    channel: string;
    data: T;
    requestId: string;
}

export interface IPCResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    requestId: string;
}

// Stream event types
export interface StreamEvent {
    type: 'start' | 'token' | 'end' | 'error';
    messageId: string;
    content?: string;
    error?: string;
    metadata?: {
        model?: string;
        tokenCount?: number;
        finishReason?: string;
    };
}

// API Response types
export interface APIResponse {
    content: string;
    model: string;
    tokenCount: {
        input: number;
        output: number;
        total: number;
    };
    cost?: {
        input: number;
        output: number;
        total: number;
    };
}

// Database types
export interface DatabaseError extends Error {
    code: string;
    query?: string;
}

export interface UsageStats {
    totalConversations: number;
    totalMessages: number;
    totalTokens: number;
    totalCost: number;
    byProvider: Record<Provider, {
        messages: number;
        tokens: number;
        cost: number;
    }>;
    byModel: Record<string, {
        messages: number;
        tokens: number;
        cost: number;
    }>;
}

// Export/Import types
export interface ExportedConversation {
    version: string;
    exportedAt: Date;
    conversation: Conversation;
    messages: Message[];
}

// Zod Schemas for validation
export const ConversationSchema = z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    messageIds: z.array(z.string()),
    totalTokens: z.number(),
    estimatedCost: z.number(),
    metadata: z.record(z.unknown()).optional(),
});

export const MessageSchema = z.object({
    id: z.string(),
    conversationId: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.date(),
    model: z.string(),
    provider: z.enum(['claude', 'openai', 'ollama']),
    tokenCount: z.number(),
    cost: z.number(),
    metadata: z.record(z.unknown()).optional(),
    streaming: z.boolean().optional(),
    error: z.string().optional(),
});

export const SettingsSchema = z.object({
    provider: z.enum(['claude', 'openai', 'ollama']),
    model: z.string(),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().positive(),
    systemPrompt: z.string(),
    apiKeys: z.record(z.enum(['claude', 'openai', 'ollama']), z.string()),
    retryAttempts: z.number().min(0).max(5),
    streamRateLimit: z.number().min(10).max(1000),
    theme: z.literal('dark'),
    ollamaEndpoint: z.string().url().optional(),
});

// Type guards
export function isConversation(obj: unknown): obj is Conversation {
    try {
        ConversationSchema.parse(obj);
        return true;
    } catch {
        return false;
    }
}

export function isMessage(obj: unknown): obj is Message {
    try {
        MessageSchema.parse(obj);
        return true;
    } catch {
        return false;
    }
}

export function isSettings(obj: unknown): obj is Settings {
    try {
        SettingsSchema.parse(obj);
        return true;
    } catch {
        return false;
    }
}

// Default values
export const DEFAULT_SETTINGS: Settings = {
    provider: 'claude',
    model: 'claude-3-opus-20240229',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful AI assistant.',
    apiKeys: {
        claude: '',
        openai: '',
        ollama: '',
    },
    retryAttempts: 3,
    streamRateLimit: 50,
    theme: 'dark',
    ollamaEndpoint: 'http://localhost:11434/api',
};