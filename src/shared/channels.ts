/**
 * File: src/shared/channels.ts
 * Module: IPC Channel Constants
 * Purpose: Define IPC channel constants for communication between processes
 * Usage: Import for IPC channel names in main and renderer processes
 * Contains: IPC channel string constants
 * Dependencies: none
 * Iteration: 1
 */

export const IPCChannels = {
    CONVERSATION_CREATE: 'conversation:create',
    CONVERSATION_LIST: 'conversation:list',
    CONVERSATION_GET: 'conversation:get',
    CONVERSATION_UPDATE: 'conversation:update',
    CONVERSATION_DELETE: 'conversation:delete',
    CONVERSATION_SEARCH: 'conversation:search',
    MESSAGE_ADD: 'message:add',
    MESSAGE_LIST: 'message:list',
    MESSAGE_DELETE: 'message:delete',
    MESSAGE_SEND: 'message:send',
    MESSAGE_STOP: 'message:stop',
    STREAM_START: 'stream:start',
    STREAM_TOKEN: 'stream:token',
    STREAM_END: 'stream:end',
    STREAM_ERROR: 'stream:error',
    SETTINGS_GET: 'settings:get',
    SETTINGS_UPDATE: 'settings:update',
    SETTINGS_SET_API_KEY: 'settings:set-api-key',
    API_TEST: 'api:test',
    API_MODELS: 'api:models',
    EXPORT_CONVERSATION: 'export:conversation',
    IMPORT_CONVERSATION: 'import:conversation',
    STATS_GET: 'stats:get',
} as const;