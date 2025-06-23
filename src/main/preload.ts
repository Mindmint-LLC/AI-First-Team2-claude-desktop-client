/**
 * File: src/main/preload.ts
 * Module: Preload Script
 * Purpose: Secure bridge between main and renderer processes
 * Usage: Loaded in renderer context with access to Node APIs
 * Contains: IPC channel definitions and secure API exposure
 * Dependencies: electron
 * Iteration: 4
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPCChannels } from '../shared/channels';
import { ElectronAPI } from '../shared/electron-api';

console.log('[Preload] Starting preload script');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
    invoke: async (channel: string, data: any): Promise<any> => {
        console.log('[Preload] Invoking channel:', channel);
        const validChannels = Object.values(IPCChannels);

        if (validChannels.includes(channel)) {
            try {
                const result = await ipcRenderer.invoke(channel, data);
                return result;
            } catch (error) {
                console.error('[Preload] Invoke error:', error);
                throw error;
            }
        } else {
            console.error('[Preload] Invalid channel:', channel);
            throw new Error(`Invalid channel: ${channel}`);
        }
    },

    on: (channel: string, callback: (data: any) => void): (() => void) => {
        console.log('[Preload] Setting up listener for channel:', channel);
        const validChannels = Object.values(IPCChannels);

        if (validChannels.includes(channel)) {
            const listener = (_event: IpcRendererEvent, data: any) => {
                console.log('[Preload] Received event on channel:', channel);
                callback(data);
            };

            ipcRenderer.on(channel, listener);

            // Return unsubscribe function
            return () => {
                console.log('[Preload] Removing listener for channel:', channel);
                ipcRenderer.removeListener(channel, listener);
            };
        } else {
            console.error('[Preload] Invalid channel:', channel);
            throw new Error(`Invalid channel: ${channel}`);
        }
    },

    once: (channel: string, callback: (data: any) => void): void => {
        console.log('[Preload] Setting up one-time listener for channel:', channel);
        const validChannels = Object.values(IPCChannels);

        if (validChannels.includes(channel)) {
            ipcRenderer.once(channel, (_event: IpcRendererEvent, data: any) => {
                console.log('[Preload] Received one-time event on channel:', channel);
                callback(data);
            });
        } else {
            console.error('[Preload] Invalid channel:', channel);
            throw new Error(`Invalid channel: ${channel}`);
        }
    },

    removeAllListeners: (channel: string): void => {
        console.log('[Preload] Removing all listeners for channel:', channel);
        const validChannels = Object.values(IPCChannels);

        if (validChannels.includes(channel)) {
            ipcRenderer.removeAllListeners(channel);
        } else {
            console.error('[Preload] Invalid channel:', channel);
            throw new Error(`Invalid channel: ${channel}`);
        }
    },

    platform: {
        os: process.platform,
        arch: process.arch,
        version: process.version,
    },

    channels: IPCChannels,
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

console.log('[Preload] ElectronAPI exposed to renderer');

// Handle file drop events properly
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Preload] DOM content loaded, setting up drag handlers');

    // Prevent default drag behaviors
    document.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);

    document.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        console.log('[Preload] Drop event intercepted');

        // Handle file drops if needed in the future
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            console.log('[Preload] Files dropped:', e.dataTransfer.files.length);
            // You can emit an event here if you want to handle file drops
            // For now, we just prevent the default behavior
        }
    }, false);

    // Prevent dragging text/images out of the window
    document.addEventListener('dragstart', (e: DragEvent) => {
        const target = e.target as HTMLElement;

        // Only allow drag for elements that explicitly have draggable="true"
        if (!target.hasAttribute('draggable') || target.getAttribute('draggable') !== 'true') {
            e.preventDefault();
            return false;
        }

        console.log('[Preload] Drag start allowed for element:', target);
    }, false);

    console.log('[Preload] Drag event handlers installed');
});

// Log any uncaught errors in the preload script
window.addEventListener('error', (event) => {
    console.error('[Preload] Uncaught error:', event.error);
});

console.log('[Preload] Preload script completed');