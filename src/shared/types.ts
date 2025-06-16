import { z } from 'zod';

// Core Data Models
export interface Conversation {
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messageIds: string[];
    totalTokens: number;
    estimatedCost: number;
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
    costPer1kInput: number;
    costPer1kOutput: number;
}

export interface ProviderConfig {
    models: ModelInfo[];
    endpoint: string;
    headers: Record<string, string>;
}

// IPC Message Types
export const IPCChannels = {
    // Conversation channels
    CONVERSATION_CREATE: 'conversation:create',
    CONVERSATION_LIST: 'conversation:list',
    CONVERSATION_GET: 'conversation:get',
    CONVERSATION_UPDATE: 'conversation:update',
    CONVERSATION_DELETE: 'conversation:delete',

    // Message channels
    MESSAGE_SEND: 'message:send',
    MESSAGE_STREAM: 'message:stream',
    MESSAGE_LIST: 'message:list',
    MESSAGE_DELETE: 'message:delete',

    // Settings channels
    SETTINGS_GET: 'settings:get',
    SETTINGS_UPDATE: 'settings:update',

    // API channels
    API_TEST: 'api:test',
    API_MODELS: 'api:models',

    // Utility channels
    USAGE_STATS: 'usage:stats',
    EXPORT_CONVERSATION: 'export:conversation',
    IMPORT_CONVERSATION: 'import:conversation',
} as const;

// Zod Schemas for validation
export const ConversationSchema = z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    messageIds: z.array(z.string()),
    totalTokens: z.number(),
    estimatedCost: z.number(),
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
    temperature: z.number().min(0).max(1),
    maxTokens: z.number().positive(),
    systemPrompt: z.string(),
    apiKeys: z.record(z.enum(['claude', 'openai', 'ollama']), z.string()),
    retryAttempts: z.number().min(0).max(5),
    streamRateLimit: z.number().min(10).max(100),
    theme: z.literal('dark'),
    ollamaEndpoint: z.string().url().optional(),
});

// IPC Request/Response Types
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

// Streaming Event Types
export interface StreamEvent {
    type: 'start' | 'token' | 'error' | 'complete';
    messageId: string;
    data?: string;
    error?: string;
    tokenCount?: number;
    cost?: number;
}

// Usage Statistics
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
    dailyUsage: Array<{
        date: string;
        tokens: number;
        cost: number;
    }>;
}

// Error Types
export class APIError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode?: number,
        public provider?: Provider
    ) {
        super(message);
        this.name = 'APIError';
    }
}

export class DatabaseError extends Error {
    constructor(
        message: string,
        public operation: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'DatabaseError';
    }
}

// Utility Types
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AsyncResult<T> = Promise<{ success: true; data: T } | { success: false; error: string }>;

// Model Configurations
export const MODEL_CONFIGS: Record<Provider, ProviderConfig> = {
    claude: {
        models: [
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', maxTokens: 4096, costPer1kInput: 0.015, costPer1kOutput: 0.075 },
            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', maxTokens: 4096, costPer1kInput: 0.003, costPer1kOutput: 0.015 },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', maxTokens: 4096, costPer1kInput: 0.00025, costPer1kOutput: 0.00125 },
        ],
        endpoint: 'https://api.anthropic.com/v1/messages',
        headers: {
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
    },
    openai: {
        models: [
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 128000, costPer1kInput: 0.01, costPer1kOutput: 0.03 },
            { id: 'gpt-4', name: 'GPT-4', maxTokens: 8192, costPer1kInput: 0.03, costPer1kOutput: 0.06 },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 16385, costPer1kInput: 0.0005, costPer1kOutput: 0.0015 },
        ],
        endpoint: 'https://api.openai.com/v1/chat/completions',
        headers: {
            'content-type': 'application/json',
        },
    },
    ollama: {
        models: [], // Populated dynamically
        endpoint: 'http://localhost:11434/api/chat',
        headers: {
            'content-type': 'application/json',
        },
    },
};