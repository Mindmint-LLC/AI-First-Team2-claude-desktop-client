/**
 * File: src/shared/constants.ts
 * Module: Shared Constants
 * Purpose: Define constants used across main and renderer processes
 * Usage: Import for IPC channels, limits, and configuration values
 * Contains: IPC channel names, app constants, API endpoints
 * Dependencies: none
 * Iteration: 1
 */

// IPC Channel definitions
export const IPCChannels = {
    // Conversation channels
    CREATE_CONVERSATION: 'conversation:create',
    GET_CONVERSATIONS: 'conversation:list',
    GET_CONVERSATION: 'conversation:get',
    UPDATE_CONVERSATION: 'conversation:update',
    DELETE_CONVERSATION: 'conversation:delete',
    SEARCH_CONVERSATIONS: 'conversation:search',

    // Message channels
    ADD_MESSAGE: 'message:add',
    GET_MESSAGES: 'message:list',
    DELETE_MESSAGE: 'message:delete',
    SEND_MESSAGE: 'message:send',
    STOP_GENERATION: 'message:stop',

    // Stream channels
    STREAM_START: 'stream:start',
    STREAM_TOKEN: 'stream:token',
    STREAM_END: 'stream:end',
    STREAM_ERROR: 'stream:error',

    // Settings channels
    GET_SETTINGS: 'settings:get',
    UPDATE_SETTINGS: 'settings:update',
    SET_API_KEY: 'settings:set-api-key',

    // API channels
    TEST_CONNECTION: 'api:test',
    GET_MODELS: 'api:models',

    // Export/Import channels
    EXPORT_CONVERSATION: 'export:conversation',
    IMPORT_CONVERSATION: 'import:conversation',

    // Stats channels
    GET_STATS: 'stats:get',
} as const;

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

// Type exports
export type IPCChannelType = typeof IPCChannels[keyof typeof IPCChannels];
export type ErrorCodeType = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type ProviderType = 'CLAUDE' | 'OPENAI' | 'OLLAMA';