/**
 * File: src/main/preload.ts
 * Module: Preload Script
 * Purpose: Secure bridge between main and renderer processes
 * Usage: Loaded in renderer context with access to Node APIs
 * Contains: IPC channel definitions and secure API exposure
 * Dependencies: electron
 * Iteration: 2
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannels } from '@shared/constants';

// Define valid channels for security
const validInvokeChannels:string[] = Object.values(IPCChannels);

const validEventChannels:string[] = [
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

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    ...api,
    platform,
    channels: IPCChannels,
});

// Import the shared type - no need to redefine it here
import type { ElectronAPI } from '@shared/electron-api';