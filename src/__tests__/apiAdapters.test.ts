import { ClaudeAdapter, OpenAIAdapter, OllamaAdapter, ProviderRegistry } from '../main/models/APIAdapters';
import { Message, StreamEvent } from '../shared/types';
import type { Settings } from '../shared/settings';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

const mockSettings: Settings = {
    provider: 'claude' as const,
    model: 'claude-3-sonnet-20240229',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful assistant.',
    apiKeys: {
        claude: 'test-claude-key',
        openai: 'test-openai-key',
        ollama: '',
    },
    retryAttempts: 3,
    streamRateLimit: 50,
    theme: 'dark' as const,
    ollamaEndpoint: 'http://localhost:11434/api',
};

describe('API Adapters', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('ClaudeAdapter', () => {
        let adapter: ClaudeAdapter;

        beforeEach(() => {
            adapter = new ClaudeAdapter(mockSettings);
        });

        test('should set authorization header', () => {
            expect(adapter['apiKey']).toBe('test-claude-key');
        });

        test('should handle non-streaming response', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    content: [{ text: 'Hello, world!' }],
                    model: 'claude-3-opus-20240229',
                    usage: { input_tokens: 10, output_tokens: 5 },
                }),
            };

            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

            const result = await adapter.sendMessage([{ role: 'user', content: 'Hello' }], 'claude-3-opus-20240229');

            expect(result.content).toBe('Hello, world!');
            expect(result.usage?.input).toBe(10);
            expect(result.usage?.output).toBe(5);
        });

        test('should handle API errors', async () => {
            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
                ok: false,
                status: 401,
                text: async () => 'Unauthorized',
            } as any);

            const messages: Message[] = [{
                id: 'test-msg',
                conversationId: 'test-conv',
                role: 'user',
                content: 'Hello',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 5,
                cost: 0.001,
            }];

            await expect(adapter.sendMessage([{ role: 'user', content: 'Hello' }], 'claude-3-opus-20240229'))
                .rejects.toThrow('Anthropic API error');
        });

        test('should test connection', async () => {
            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
                ok: true,
            } as any);

            const result = await adapter.testConnection();
            expect(result).toBe(true);
        });

        test('should return hardcoded models', async () => {
            const models = await adapter.getModels();
            expect(models).toHaveLength(3);
            expect(models[0]).toBe('claude-3-opus-20240229');
        });
    });

    describe('OpenAIAdapter', () => {
        let adapter: OpenAIAdapter;

        beforeEach(() => {
            adapter = new OpenAIAdapter(mockSettings);
        });

        test('should set authorization header', () => {
            expect(adapter['apiKey']).toBe('test-openai-key');
        });

        test('should handle non-streaming response', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    choices: [{ message: { content: 'Hello, world!' } }],
                    model: 'gpt-4',
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
            };

            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

            const result = await adapter.sendMessage([{ role: 'user', content: 'Hello' }], 'gpt-4');

            expect(result.content).toBe('Hello, world!');
            expect(result.usage?.input).toBe(10);
            expect(result.usage?.output).toBe(5);
        });

        test('should fetch available models', async () => {
            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'gpt-4' },
                        { id: 'gpt-3.5-turbo' },
                        { id: 'text-davinci-003' }, // Should be filtered out
                    ],
                }),
            } as any);

            const models = await adapter.getModels();
            expect(models).toHaveLength(2);
            expect(models).toContain('gpt-4');
            expect(models).not.toContain('text-davinci-003');
        });
    });

    describe('OllamaAdapter', () => {
        let adapter: OllamaAdapter;

        beforeEach(() => {
            adapter = new OllamaAdapter(mockSettings);
        });

        test('should not set authorization header', () => {
            expect(adapter['apiKey']).toBe('');
        });

        test('should handle non-streaming response', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({
                    response: 'Hello, world!',
                    prompt_eval_count: 10,
                    eval_count: 5,
                }),
            };

            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

            const result = await adapter.sendMessage([{ role: 'user', content: 'Hello' }], 'llama2');

            expect(result.content).toBe('Hello, world!');
            expect(result.usage?.input).toBe(10);
            expect(result.usage?.output).toBe(5);
            expect(result.cost?.total).toBe(0); // Ollama is free
        });

        test('should fetch available models', async () => {
            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
                ok: true,
                json: async () => ({
                    models: [
                        { name: 'llama2' },
                        { name: 'codellama' },
                    ],
                }),
            } as any);

            const models = await adapter.getModels();
            expect(models).toHaveLength(2);
            expect(models[0]).toBe('llama2');
        });
    });

    describe('ProviderRegistry', () => {
        let registry: ProviderRegistry;

        beforeEach(() => {
            registry = new ProviderRegistry(mockSettings);
        });

        test('should initialize adapters based on API keys', () => {
            expect(registry.getAdapter('claude')).toBeInstanceOf(ClaudeAdapter);
            expect(registry.getAdapter('openai')).toBeInstanceOf(OpenAIAdapter);
            expect(registry.getAdapter('ollama')).toBeInstanceOf(OllamaAdapter);
        });

        test('should update API key and create adapter', () => {
            // Remove claude adapter
            registry['adapters'].delete('claude');
            expect(registry.getAdapter('claude')).toBeNull();

            // Update key and check adapter is created
            registry.updateApiKey('claude', 'new-key');
            const adapter = registry.getAdapter('claude');
            expect(adapter).toBeInstanceOf(ClaudeAdapter);
            expect(adapter!['apiKey']).toBe('new-key');
        });

        test('should update Ollama endpoint', () => {
            registry.updateOllamaEndpoint('http://custom:11434/api/chat');
            const adapter = registry.getAdapter('ollama');
            expect(adapter).toBeInstanceOf(OllamaAdapter);
            expect(adapter!['baseURL']).toBe('http://custom:11434/api/chat');
        });

        test('should test connection for provider', async () => {
            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
                ok: true,
            } as any);

            const result = await registry.testConnection('claude');
            expect(result).toBe(true);
        });

        test('should get models for provider', async () => {
            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
                ok: true,
                json: async () => ({ data: [] }),
            } as any);

            const models = await registry.getModels('openai');
            expect(Array.isArray(models)).toBe(true);
        });
    });
});