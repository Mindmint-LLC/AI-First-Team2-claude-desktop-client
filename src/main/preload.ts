import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannels, IPCRequest, IPCResponse } from '@shared/types';

// Validate channel names
const validChannels:string[] = Object.values(IPCChannels);
const validEventChannels:string[] = [
    'conversation:created',
    'conversation:updated',
    'conversation:deleted',
    'message:created',
    'message:updated',
    'message:deleted',
    'message:stream:start',
    'message:stream:token',
    'message:stream:complete',
    'message:stream:error',
    'settings:updated',
    'menu:new-conversation',
    'menu:open-conversation',
    'menu:export',
    'menu:import',
    'menu:settings',
    'menu:find',
    'menu:rename-conversation',
    'menu:delete-conversation',
    'menu:clear-messages',
];

// Create secure API bridge
const api = {
    // IPC communication
    invoke: async <T = any, R = any>(channel: string, data: T): Promise<R> => {
        if (!validChannels.includes(channel)) {
            throw new Error(`Invalid channel: ${channel}`);
        }

        const request: IPCRequest<T> = {
            channel,
            data,
            requestId: `${Date.now()}-${Math.random()}`,
        };

        const response: IPCResponse<R> = await ipcRenderer.invoke(channel, request);

        if (!response.success) {
            throw new Error(response.error || 'Unknown error');
        }

        return response.data!;
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

// Type augmentation for TypeScript
export interface ElectronAPI {
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

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}