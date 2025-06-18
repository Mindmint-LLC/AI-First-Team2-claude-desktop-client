/**
 * File: src/shared/electron-api.ts
 * Module: Electron API Type Definitions
 * Purpose: Single source of truth for ElectronAPI interface
 * Usage: Import in both preload and renderer for consistent types
 * Contains: ElectronAPI interface definition
 * Dependencies: IPCChannels from constants
 * Iteration: 1
 */

import { IPCChannels } from './constants';

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

// Global type augmentation
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}