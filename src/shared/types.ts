/**
 * File: src/shared/types.ts
 * Module: Shared Type Definitions
 * Purpose: Define TypeScript types used across main and renderer processes
 * Usage: Import for type safety in both processes
 * Contains: Data models, IPC types, API types
 * Dependencies: none
 * Iteration: 10
 */

// Re-export from other files for compatibility
export { IPCChannels } from './channels';
export { DEFAULT_SETTINGS } from './settings';
export type { Settings, Provider } from './settings';
export { SettingsSchema } from './schemas';

// Re-export Provider type for local use
import type { Provider } from './settings';

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

export interface ConversationMetadata {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    totalTokens: number;
    totalCost: number;
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

export interface Usage {
    input: number;
    output: number;
    total: number;
    cost?: {
        input: number;
        output: number;
        total: number;
    };
}

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

export interface UsageStats {
    totalConversations: number;
    totalMessages: number;
    totalTokens: number;
    totalCost: number;
    messagesThisMonth: number;
    costThisMonth: number;
    averageTokensPerMessage: number;
    mostUsedModel: string;
    mostUsedProvider: Provider;
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
    usage: {
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
export type UpdateType = 'created' | 'updated' | 'deleted';

// Error types
export class AppError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export class APIError extends AppError {
    constructor(
        message: string,
        public statusCode: number,
        public provider: Provider,
        details?: Record<string, unknown>
    ) {
        super(message, 'API_ERROR', { statusCode, provider, ...details });
        this.name = 'APIError';
    }
}

export class DatabaseError extends AppError {
    public dbCode?: string;
    public query?: string;
    public params?: unknown[];

    constructor(
        message: string,
        public operation: string,
        public originalError?: Error,
        dbCode?: string,
        query?: string,
        params?: unknown[]
    ) {
        super(message, 'DATABASE_ERROR', { operation, originalError: originalError?.message, dbCode, query, params });
        this.name = 'DatabaseError';
        this.dbCode = dbCode;
        this.query = query;
        this.params = params;
    }
}

export class ValidationError extends AppError {
    constructor(
        message: string,
        public field: string,
        public value: unknown
    ) {
        super(message, 'VALIDATION_ERROR', { field, value });
        this.name = 'ValidationError';
    }
}