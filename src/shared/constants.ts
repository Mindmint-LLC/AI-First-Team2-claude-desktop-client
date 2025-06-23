/**
 * File: src/shared/constants.ts
 * Module: Shared Constants
 * Purpose: Define constants used across main and renderer processes
 * Usage: Import for app constants, error codes, and configuration values
 * Contains: App constants, API endpoints, error codes
 * Dependencies: none
 * Iteration: 5
 */

// Application constants
export const APP_CONSTANTS = {
    // Database
    MAX_CONVERSATIONS: 1000,
    MAX_MESSAGES_PER_CONVERSATION: 10000,
    DEFAULT_PAGE_SIZE: 50,

    // UI
    MESSAGE_RENDER_BATCH_SIZE: 20,
    SCROLL_THRESHOLD: 100,
    DEBOUNCE_DELAY: 300,

    // API
    DEFAULT_TEMPERATURE: 0.7,
    DEFAULT_MAX_TOKENS: 2048,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000,
    STREAM_RATE_LIMIT: 50, // ms between tokens

    // Storage
    SETTINGS_KEY: 'app-settings',
    DATABASE_VERSION: 1,

    // Validation
    MIN_MESSAGE_LENGTH: 1,
    MAX_MESSAGE_LENGTH: 100000,
    MIN_TITLE_LENGTH: 1,
    MAX_TITLE_LENGTH: 200,
    MIN_SYSTEM_PROMPT_LENGTH: 0,
    MAX_SYSTEM_PROMPT_LENGTH: 10000,
} as const;

// Provider endpoints
export const PROVIDER_ENDPOINTS = {
    CLAUDE: 'https://api.anthropic.com/v1',
    OPENAI: 'https://api.openai.com/v1',
    OLLAMA: 'http://localhost:11434/api',
} as const;

// Model definitions
export const MODELS = {
    CLAUDE: [
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', maxTokens: 4096 },
        { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', maxTokens: 4096 },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', maxTokens: 4096 },
        { id: 'claude-2.1', name: 'Claude 2.1', maxTokens: 100000 },
        { id: 'claude-2.0', name: 'Claude 2.0', maxTokens: 100000 },
    ],
    OPENAI: [
        { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo', maxTokens: 4096 },
        { id: 'gpt-4', name: 'GPT-4', maxTokens: 8192 },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 4096 },
    ],
    OLLAMA: [
        { id: 'llama2', name: 'Llama 2', maxTokens: 4096 },
        { id: 'mistral', name: 'Mistral', maxTokens: 8192 },
        { id: 'codellama', name: 'Code Llama', maxTokens: 4096 },
    ],
} as const;

// Error codes
export const ERROR_CODES = {
    // Database errors
    DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
    DB_QUERY_FAILED: 'DB_QUERY_FAILED',
    DB_TRANSACTION_FAILED: 'DB_TRANSACTION_FAILED',

    // API errors
    API_KEY_MISSING: 'API_KEY_MISSING',
    API_KEY_INVALID: 'API_KEY_INVALID',
    API_REQUEST_FAILED: 'API_REQUEST_FAILED',
    API_RATE_LIMITED: 'API_RATE_LIMITED',
    API_QUOTA_EXCEEDED: 'API_QUOTA_EXCEEDED',

    // Validation errors
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    INVALID_CONVERSATION_ID: 'INVALID_CONVERSATION_ID',
    INVALID_MESSAGE_ID: 'INVALID_MESSAGE_ID',
    INVALID_PROVIDER: 'INVALID_PROVIDER',
    INVALID_MODEL: 'INVALID_MODEL',

    // Stream errors
    STREAM_ABORTED: 'STREAM_ABORTED',
    STREAM_TIMEOUT: 'STREAM_TIMEOUT',

    // File errors
    FILE_READ_FAILED: 'FILE_READ_FAILED',
    FILE_WRITE_FAILED: 'FILE_WRITE_FAILED',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INVALID_FILE_FORMAT: 'INVALID_FILE_FORMAT',
} as const;

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
    NEW_CONVERSATION: 'CmdOrCtrl+N',
    DELETE_CONVERSATION: 'Delete',
    RENAME_CONVERSATION: 'F2',
    SEARCH_CONVERSATIONS: 'CmdOrCtrl+F',
    SETTINGS: 'CmdOrCtrl+,',
    EXPORT: 'CmdOrCtrl+E',
    IMPORT: 'CmdOrCtrl+I',
    SEND_MESSAGE: 'Enter',
    NEW_LINE: 'Shift+Enter',
    STOP_GENERATION: 'Escape',
} as const;

// Theme constants
export const THEME_COLORS = {
    DARK: {
        PRIMARY: '#3b82f6',
        SECONDARY: '#6b7280',
        SUCCESS: '#10b981',
        WARNING: '#f59e0b',
        ERROR: '#ef4444',
        INFO: '#06b6d4',
        BACKGROUND: '#1a1a1a',
        SURFACE: '#2d2d2d',
        TEXT: '#ffffff',
        TEXT_MUTED: '#9ca3af',
    },
} as const;

// File size limits
export const FILE_LIMITS = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES_PER_UPLOAD: 5,
    SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    SUPPORTED_DOCUMENT_TYPES: ['text/plain', 'text/markdown', 'application/json'],
} as const;

// API rate limits
export const RATE_LIMITS = {
    CLAUDE: {
        REQUESTS_PER_MINUTE: 60,
        TOKENS_PER_MINUTE: 100000,
    },
    OPENAI: {
        REQUESTS_PER_MINUTE: 60,
        TOKENS_PER_MINUTE: 90000,
    },
    OLLAMA: {
        REQUESTS_PER_MINUTE: 1000, // Local, so higher limit
        TOKENS_PER_MINUTE: 1000000,
    },
} as const;

// Type exports
export type ErrorCodeType = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type ProviderType = 'claude' | 'openai' | 'ollama';

// Validation functions
export const isValidProvider = (provider: string): provider is ProviderType => {
    return ['claude', 'openai', 'ollama'].includes(provider);
};

export const isValidErrorCode = (code: string): code is ErrorCodeType => {
    return Object.values(ERROR_CODES).includes(code as ErrorCodeType);
};