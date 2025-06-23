/**
 * File: src/main/preload.ts
 * Module: Preload Script
 * Purpose: Secure bridge between main and renderer processes
 * Usage: Loaded in renderer context with access to Node APIs
 * Contains: IPC channel definitions and secure API exposure
 * Dependencies: electron
 * Iteration: 5
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

console.log('[Preload] Starting preload script');

// Inline constants to avoid module resolution issues in dist folder
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

// Secure API exposed to renderer
const electronAPI: ElectronAPI = {
    // Invoke main process methods
    invoke: async <T = any, R = any>(channel: string, data: T): Promise<R> => {
        console.log('[Preload] Invoking channel:', channel);

        if (!validInvokeChannels.includes(channel)) {
            console.error('[Preload] Invalid invoke channel:', channel);
            throw new Error(`Invalid invoke channel: ${channel}`);
        }

        try {
            const result = await ipcRenderer.invoke(channel, data);
            console.log('[Preload] Invoke result for channel:', channel, result);
            return result;
        } catch (error) {
            console.error('[Preload] Invoke error for channel:', channel, error);
            throw error;
        }
    },

    // Event listeners
    on: (channel: string, callback: (data: any) => void): (() => void) => {
        console.log('[Preload] Setting up listener for channel:', channel);

        if (!validEventChannels.includes(channel)) {
            console.error('[Preload] Invalid event channel:', channel);
            throw new Error(`Invalid event channel: ${channel}`);
        }

        const listener = (_event: IpcRendererEvent, data: any) => {
            console.log('[Preload] Received event on channel:', channel, data);
            callback(data);
        };

        ipcRenderer.on(channel, listener);

        // Return cleanup function
        return () => {
            console.log('[Preload] Removing listener for channel:', channel);
            ipcRenderer.removeListener(channel, listener);
        };
    },

    // One-time event listeners
    once: (channel: string, callback: (data: any) => void): void => {
        console.log('[Preload] Setting up one-time listener for channel:', channel);

        if (!validEventChannels.includes(channel)) {
            console.error('[Preload] Invalid event channel:', channel);
            throw new Error(`Invalid event channel: ${channel}`);
        }

        ipcRenderer.once(channel, (_event: IpcRendererEvent, data: any) => {
            console.log('[Preload] Received one-time event on channel:', channel, data);
            callback(data);
        });
    },

    // Remove all listeners for a channel
    removeAllListeners: (channel: string): void => {
        console.log('[Preload] Removing all listeners for channel:', channel);

        if (!validEventChannels.includes(channel)) {
            console.error('[Preload] Invalid event channel:', channel);
            throw new Error(`Invalid event channel: ${channel}`);
        }

        ipcRenderer.removeAllListeners(channel);
    },

    // Platform information
    platform: {
        os: process.platform,
        arch: process.arch,
        version: process.versions.electron,
    },

    // Available channels
    channels: IPCChannels,
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Global type augmentation
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

console.log('[Preload] Successfully exposed electronAPI to main world');
console.log('[Preload] Available channels:', Object.keys(IPCChannels));