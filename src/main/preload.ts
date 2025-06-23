/**
 * File: src/main/preload.ts
 * Module: Preload Script
 * Purpose: Secure bridge between main and renderer processes
 * Usage: Loaded in renderer context with access to Node APIs
 * Contains: IPC channel definitions and secure API exposure
 * Dependencies: electron
 * Iteration: 3
 */

import { contextBridge, ipcRenderer } from 'electron';

// Inline constants to avoid module resolution issues
const IPCChannels = {
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

// Define valid channels for security
const validInvokeChannels: string[] = Object.values(IPCChannels);

const validEventChannels: string[] = [
    IPCChannels.STREAM_START,
    IPCChannels.STREAM_TOKEN,
    IPCChannels.STREAM_END,
    IPCChannels.STREAM_ERROR,
    'menu:new-conversation',
    'menu:open-conversation',
    'menu:export',
    'menu:import',
    'menu:settings',
    'conversation:created',
    'conversation:updated',
    'conversation:deleted',
    'message:created',
    'message:updated',
    'message:deleted',
    'settings:updated',
];

// Secure API exposed to renderer
const api = {
    // Invoke main process methods
    invoke: <T = any, R = any>(channel: string, data: T): Promise<R> => {
        if (!validInvokeChannels.includes(channel)) {
            throw new Error(`Invalid invoke channel: ${channel}`);
        }
        return ipcRenderer.invoke(channel, data);
    },

    // Event listeners
    on: (channel: string, callback: (data: any) => void) => {
        if (!validEventChannels.includes(channel)) {
            throw new Error(`Invalid event channel: ${channel}`);
        }

        const listener = (_event: Electron.IpcRendererEvent, data: any) => {
            callback(data);
        };

        ipcRenderer.on(channel, listener);

        // Return cleanup function
        return () => {
            ipcRenderer.removeListener(channel, listener);
        };
    },

    // One-time event listeners
    once: (channel: string, callback: (data: any) => void) => {
        if (!validEventChannels.includes(channel)) {
            throw new Error(`Invalid event channel: ${channel}`);
        }

        ipcRenderer.once(channel, (_event, data) => {
            callback(data);
        });
    },

    // Remove all listeners for a channel
    removeAllListeners: (channel: string) => {
        if (!validEventChannels.includes(channel)) {
            throw new Error(`Invalid event channel: ${channel}`);
        }

        ipcRenderer.removeAllListeners(channel);
    },
};

// Platform information
const platform = {
    os: process.platform,
    arch: process.arch,
    version: process.versions.electron,
};

// Inline ElectronAPI interface to avoid imports
interface ElectronAPI {
    invoke: <T = any, R = any>(channel: string, data: T) => Promise<R>;
    on: (channel: string, callback: (data: any) => void) => () => void;
    once: (channel: string, callback: (data: any) => void) => void;
    removeAllListeners: (channel: string) => void;
    platform: {
        os: string;
        arch: string;
        version: string;
    };
    channels: typeof IPCChannels;
}

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    ...api,
    platform,
    channels: IPCChannels,
});

// Global type augmentation
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}