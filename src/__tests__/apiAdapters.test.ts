import { ClaudeAdapter, OpenAIAdapter, OllamaAdapter, ProviderRegistry } from '../main/models/APIAdapters';
import { Message, StreamEvent } from '../shared/types';
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('API Adapters', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('ClaudeAdapter', () => {
        let adapter: ClaudeAdapter;

        beforeEach(() => {
            adapter = new ClaudeAdapter('claude', 'test-api-key', 3);
        });

        test('should set authorization header', () => {
            expect(adapter['headers']['x-api-key']).toBe('test-api-key');
        });

        test('should handle streaming response', async () => {
            const mockResponse = {
                ok: true,
                body: {
                    getReader: () => ({
                        read: jest.fn()
                            .mockResolvedValueOnce({
                                done: false,
                                value: new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n'),
                            })
                            .mockResolvedValueOnce({
                                done: false,
                                value: new TextEncoder().encode('data: {"type":"message_stop","usage":{"input_tokens":10,"output_tokens":5}}\n'),
                            })
                            .mockResolvedValueOnce({
                                done: true,
                                value: undefined,
                            }),
                    }),
                },
            };

            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

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

            const events: StreamEvent[] = [];
            adapter.on('stream', (event) => events.push(event));

            await adapter.sendMessage(messages, 'claude-3-opus-20240229', {
                systemPrompt: '',
                maxTokens: 100,
                temperature: 0.7,
            });

            expect(events).toHaveLength(3);
            expect(events[0].type).toBe('start');
            expect(events[1].type).toBe('token');
            expect(events[1].data).toBe('Hello');
            expect(events[2].type).toBe('complete');
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

            await expect(adapter.sendMessage(messages, 'claude-3-opus-20240229', {}))
                .rejects.toThrow('API request failed');
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
            expect(models[0].id).toBe('claude-3-opus-20240229');
        });
    });

    describe('OpenAIAdapter', () => {
        let adapter: OpenAIAdapter;

        beforeEach(() => {
            adapter = new OpenAIAdapter('openai', 'test-api-key', 3);
        });

        test('should set authorization header', () => {
            expect(adapter['headers']['Authorization']).toBe('Bearer test-api-key');
        });

        test('should handle streaming response', async () => {
            const mockResponse = {
                ok: true,
                body: {
                    getReader: () => ({
                        read: jest.fn()
                            .mockResolvedValueOnce({
                                done: false,
                                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n'),
                            })
                            .mockResolvedValueOnce({
                                done: false,
                                value: new TextEncoder().encode('data: [DONE]\n'),
                            })
                            .mockResolvedValueOnce({
                                done: true,
                                value: undefined,
                            }),
                    }),
                },
            };

            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

            const messages: Message[] = [{
                id: 'test-msg',
                conversationId: 'test-conv',
                role: 'user',
                content: 'Hello',
                timestamp: new Date(),
                model: 'gpt-4',
                provider: 'openai',
                tokenCount: 5,
                cost: 0.001,
            }];

            const events: StreamEvent[] = [];
            adapter.on('stream', (event) => events.push(event));

            await adapter.sendMessage(messages, 'gpt-4', {
                systemPrompt: '',
                maxTokens: 100,
                temperature: 0.7,
            });

            expect(events).toHaveLength(3);
            expect(events[0].type).toBe('start');
            expect(events[1].type).toBe('token');
            expect(events[1].data).toBe('Hello');
            expect(events[2].type).toBe('complete');
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
            expect(models.map(m => m.id)).toContain('gpt-4');
            expect(models.map(m => m.id)).not.toContain('text-davinci-003');
        });
    });

    describe('OllamaAdapter', () => {
        let adapter: OllamaAdapter;

        beforeEach(() => {
            adapter = new OllamaAdapter('ollama', '', 3, 'http://localhost:11434/api/chat');
        });

        test('should not set authorization header', () => {
            expect(adapter['headers']['Authorization']).toBeUndefined();
        });

        test('should handle streaming response', async () => {
            const mockResponse = {
                ok: true,
                body: {
                    getReader: () => ({
                        read: jest.fn()
                            .mockResolvedValueOnce({
                                done: false,
                                value: new TextEncoder().encode('{"message":{"content":"Hello"}}\n'),
                            })
                            .mockResolvedValueOnce({
                                done: false,
                                value: new TextEncoder().encode('{"done":true,"prompt_eval_count":10,"eval_count":5}\n'),
                            })
                            .mockResolvedValueOnce({
                                done: true,
                                value: undefined,
                            }),
                    }),
                },
            };

            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse as any);

            const messages: Message[] = [{
                id: 'test-msg',
                conversationId: 'test-conv',
                role: 'user',
                content: 'Hello',
                timestamp: new Date(),
                model: 'llama2',
                provider: 'ollama',
                tokenCount: 5,
                cost: 0,
            }];

            const events: StreamEvent[] = [];
            adapter.on('stream', (event) => events.push(event));

            await adapter.sendMessage(messages, 'llama2', {
                systemPrompt: '',
                maxTokens: 100,
                temperature: 0.7,
            });

            expect(events).toHaveLength(3);
            expect(events[0].type).toBe('start');
            expect(events[1].type).toBe('token');
            expect(events[2].type).toBe('complete');
            expect(events[2].cost).toBe(0); // Ollama is free
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
            expect(models[0].id).toBe('llama2');
            expect(models[0].costPer1kInput).toBe(0);
            expect(models[0].costPer1kOutput).toBe(0);
        });
    });

    describe('ProviderRegistry', () => {
        let registry: ProviderRegistry;

        beforeEach(() => {
            registry = new ProviderRegistry({
                apiKeys: {
                    claude: 'claude-key',
                    openai: 'openai-key',
                    ollama: '',
                },
                retryAttempts: 3,
                ollamaEndpoint: 'http://localhost:11434/api/chat',
            });
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
            expect(adapter!['headers']['x-api-key']).toBe('new-key');
        });

        test('should update Ollama endpoint', () => {
            registry.updateOllamaEndpoint('http://custom:11434/api/chat');
            const adapter = registry.getAdapter('ollama');
            expect(adapter).toBeInstanceOf(OllamaAdapter);
            expect(adapter!['endpoint']).toBe('http://custom:11434/api/chat');
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