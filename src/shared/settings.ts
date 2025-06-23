/**
 * File: src/shared/settings.ts
 * Module: Settings Constants
 * Purpose: Default settings configuration
 * Usage: Import for default settings values
 * Contains: DEFAULT_SETTINGS constant
 * Dependencies: none
 * Iteration: 1
 */

export type Provider = 'claude' | 'openai' | 'ollama';

export interface Settings {
    provider: Provider;
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    apiKeys: Record<Provider, string>;
    retryAttempts: number;
    streamRateLimit: number;
    theme: 'dark';
    ollamaEndpoint?: string;
}

export const DEFAULT_SETTINGS: Settings = {
    provider: 'claude',
    model: 'claude-3-sonnet-20240229',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful, harmless, and honest AI assistant.',
    apiKeys: {
        claude: '',
        openai: '',
        ollama: '',
    },
    retryAttempts: 3,
    streamRateLimit: 50,
    theme: 'dark',
    ollamaEndpoint: 'http://localhost:11434/api',
};