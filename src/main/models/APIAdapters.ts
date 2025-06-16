import { EventEmitter } from 'events';
import { Provider, ModelInfo, Message, StreamEvent, APIError, MODEL_CONFIGS } from '@shared/types';
import { net } from 'electron';

// Token counting approximation
function estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
}

// Base API Adapter
export abstract class BaseAPIAdapter extends EventEmitter {
    protected provider: Provider;
    protected endpoint: string;
    protected headers: Record<string, string>;
    protected retryAttempts: number;
    protected requestQueue: Array<() => Promise<void>> = [];
    protected isProcessing = false;

    constructor(provider: Provider, apiKey: string, retryAttempts: number = 3) {
        super();
        this.provider = provider;
        const config = MODEL_CONFIGS[provider];
        this.endpoint = config.endpoint;
        this.headers = { ...config.headers };
        this.retryAttempts = retryAttempts;

        if (apiKey) {
            this.setAuthHeader(apiKey);
        }
    }

    abstract setAuthHeader(apiKey: string): void;
    abstract sendMessage(messages: Message[], model: string, settings: any): Promise<void>;
    abstract testConnection(): Promise<boolean>;
    abstract getModels(): Promise<ModelInfo[]>;

    protected async makeRequest(url: string, options: any): Promise<any> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
            try {
                const response = await this.fetchWithTimeout(url, options);

                if (!response.ok) {
                    const error = await response.text();
                    throw new APIError(
                        `API request failed: ${error}`,
                        'API_ERROR',
                        response.status,
                        this.provider
                    );
                }

                return response;
            } catch (error) {
                lastError = error as Error;

                if (attempt < this.retryAttempts - 1) {
                    // Exponential backoff
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                }
            }
        }

        throw lastError || new Error('Unknown error');
    }

    protected async fetchWithTimeout(url: string, options: any, timeout: number = 30000): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });

            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    protected async processQueue(): Promise<void> {
        if (this.isProcessing || this.requestQueue.length === 0) return;

        this.isProcessing = true;

        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();
            if (request) {
                try {
                    await request();
                } catch (error) {
                    this.emit('error', error);
                }
            }
        }

        this.isProcessing = false;
    }

    protected calculateCost(inputTokens: number, outputTokens: number, model: string): number {
        const modelInfo = MODEL_CONFIGS[this.provider].models.find(m => m.id === model);
        if (!modelInfo) return 0;

        return (inputTokens * modelInfo.costPer1kInput / 1000) +
            (outputTokens * modelInfo.costPer1kOutput / 1000);
    }
}

// Claude API Adapter
export class ClaudeAdapter extends BaseAPIAdapter {
    setAuthHeader(apiKey: string): void {
        this.headers['x-api-key'] = apiKey;
    }

    async sendMessage(messages: Message[], model: string, settings: any): Promise<void> {
        const messageId = messages[messages.length - 1]?.id || 'unknown';

        this.emit('stream', {
            type: 'start',
            messageId,
        } as StreamEvent);

        try {
            // Convert messages to Claude format
            const claudeMessages = messages
                .filter(m => m.role !== 'system')
                .map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content,
                }));

            const systemPrompt = messages.find(m => m.role === 'system')?.content || settings.systemPrompt;

            const requestBody = {
                model,
                messages: claudeMessages,
                system: systemPrompt,
                max_tokens: settings.maxTokens,
                temperature: settings.temperature,
                stream: true,
            };

            const response = await this.makeRequest(this.endpoint, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(requestBody),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let tokenCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);

                            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                                fullContent += parsed.delta.text;
                                tokenCount = estimateTokens(fullContent);

                                this.emit('stream', {
                                    type: 'token',
                                    messageId,
                                    data: parsed.delta.text,
                                    tokenCount,
                                } as StreamEvent);
                            } else if (parsed.type === 'message_stop') {
                                const inputTokens = parsed.usage?.input_tokens || estimateTokens(messages.map(m => m.content).join(' '));
                                const outputTokens = parsed.usage?.output_tokens || tokenCount;
                                const cost = this.calculateCost(inputTokens, outputTokens, model);

                                this.emit('stream', {
                                    type: 'complete',
                                    messageId,
                                    tokenCount: outputTokens,
                                    cost,
                                } as StreamEvent);
                            }
                        } catch (e) {
                            console.error('Failed to parse Claude SSE:', e);
                        }
                    }
                }
            }
        } catch (error) {
            this.emit('stream', {
                type: 'error',
                messageId,
                error: (error as Error).message,
            } as StreamEvent);

            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeRequest(this.endpoint, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 1,
                }),
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async getModels(): Promise<ModelInfo[]> {
        // Claude doesn't have a models endpoint, return hardcoded list
        return MODEL_CONFIGS.claude.models;
    }
}

// OpenAI API Adapter
export class OpenAIAdapter extends BaseAPIAdapter {
    setAuthHeader(apiKey: string): void {
        this.headers['Authorization'] = `Bearer ${apiKey}`;
    }

    async sendMessage(messages: Message[], model: string, settings: any): Promise<void> {
        const messageId = messages[messages.length - 1]?.id || 'unknown';

        this.emit('stream', {
            type: 'start',
            messageId,
        } as StreamEvent);

        try {
            // Convert messages to OpenAI format
            const openAIMessages = messages.map(m => ({
                role: m.role,
                content: m.content,
            }));

            if (settings.systemPrompt && !messages.some(m => m.role === 'system')) {
                openAIMessages.unshift({
                    role: 'system',
                    content: settings.systemPrompt,
                });
            }

            const requestBody = {
                model,
                messages: openAIMessages,
                max_tokens: settings.maxTokens,
                temperature: settings.temperature,
                stream: true,
            };

            const response = await this.makeRequest(this.endpoint, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(requestBody),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let tokenCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            const inputTokens = estimateTokens(messages.map(m => m.content).join(' '));
                            const outputTokens = tokenCount;
                            const cost = this.calculateCost(inputTokens, outputTokens, model);

                            this.emit('stream', {
                                type: 'complete',
                                messageId,
                                tokenCount: outputTokens,
                                cost,
                            } as StreamEvent);
                            continue;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta;

                            if (delta?.content) {
                                fullContent += delta.content;
                                tokenCount = estimateTokens(fullContent);

                                this.emit('stream', {
                                    type: 'token',
                                    messageId,
                                    data: delta.content,
                                    tokenCount,
                                } as StreamEvent);
                            }
                        } catch (e) {
                            console.error('Failed to parse OpenAI SSE:', e);
                        }
                    }
                }
            }
        } catch (error) {
            this.emit('stream', {
                type: 'error',
                messageId,
                error: (error as Error).message,
            } as StreamEvent);

            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeRequest('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: this.headers,
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async getModels(): Promise<ModelInfo[]> {
        try {
            const response = await this.makeRequest('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: this.headers,
            });

            const data = await response.json();
            const availableModels = data.data
                .filter((model: any) => model.id.includes('gpt'))
                .map((model: any) => model.id);

            // Return only our supported models that are available
            return MODEL_CONFIGS.openai.models.filter(m =>
                availableModels.some((am: string) => am.includes(m.id))
            );
        } catch (error) {
            // Return hardcoded list on error
            return MODEL_CONFIGS.openai.models;
        }
    }
}

// Ollama API Adapter
export class OllamaAdapter extends BaseAPIAdapter {
    constructor(provider: Provider, apiKey: string, retryAttempts: number = 3, endpoint?: string) {
        super(provider, apiKey, retryAttempts);
        if (endpoint) {
            this.endpoint = endpoint;
        }
    }

    setAuthHeader(apiKey: string): void {
        // Ollama doesn't use API keys
    }

    async sendMessage(messages: Message[], model: string, settings: any): Promise<void> {
        const messageId = messages[messages.length - 1]?.id || 'unknown';

        this.emit('stream', {
            type: 'start',
            messageId,
        } as StreamEvent);

        try {
            // Convert messages to Ollama format
            const ollamaMessages = messages.map(m => ({
                role: m.role,
                content: m.content,
            }));

            if (settings.systemPrompt && !messages.some(m => m.role === 'system')) {
                ollamaMessages.unshift({
                    role: 'system',
                    content: settings.systemPrompt,
                });
            }

            const requestBody = {
                model,
                messages: ollamaMessages,
                options: {
                    temperature: settings.temperature,
                    num_predict: settings.maxTokens,
                },
                stream: true,
            };

            const response = await this.makeRequest(this.endpoint, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(requestBody),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let tokenCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);

                        if (parsed.message?.content) {
                            fullContent += parsed.message.content;
                            tokenCount = estimateTokens(fullContent);

                            this.emit('stream', {
                                type: 'token',
                                messageId,
                                data: parsed.message.content,
                                tokenCount,
                            } as StreamEvent);
                        }

                        if (parsed.done) {
                            const inputTokens = parsed.prompt_eval_count || estimateTokens(messages.map(m => m.content).join(' '));
                            const outputTokens = parsed.eval_count || tokenCount;
                            // Ollama is free, so cost is 0
                            const cost = 0;

                            this.emit('stream', {
                                type: 'complete',
                                messageId,
                                tokenCount: outputTokens,
                                cost,
                            } as StreamEvent);
                        }
                    } catch (e) {
                        console.error('Failed to parse Ollama response:', e);
                    }
                }
            }
        } catch (error) {
            this.emit('stream', {
                type: 'error',
                messageId,
                error: (error as Error).message,
            } as StreamEvent);

            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeRequest(
                this.endpoint.replace('/api/chat', '/api/tags'),
                {
                    method: 'GET',
                    headers: this.headers,
                }
            );

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async getModels(): Promise<ModelInfo[]> {
        try {
            const response = await this.makeRequest(
                this.endpoint.replace('/api/chat', '/api/tags'),
                {
                    method: 'GET',
                    headers: this.headers,
                }
            );

            const data = await response.json();
            return data.models.map((model: any) => ({
                id: model.name,
                name: model.name,
                maxTokens: 4096, // Default for most models
                costPer1kInput: 0,
                costPer1kOutput: 0,
            }));
        } catch (error) {
            return [];
        }
    }
}

// Provider Registry
export class ProviderRegistry {
    private adapters: Map<Provider, BaseAPIAdapter> = new Map();
    private settings: any;

    constructor(settings: any) {
        this.settings = settings;
        this.initializeAdapters();
    }

    private initializeAdapters(): void {
        const { apiKeys, retryAttempts, ollamaEndpoint } = this.settings;

        if (apiKeys.claude) {
            this.adapters.set('claude', new ClaudeAdapter('claude', apiKeys.claude, retryAttempts));
        }

        if (apiKeys.openai) {
            this.adapters.set('openai', new OpenAIAdapter('openai', apiKeys.openai, retryAttempts));
        }

        this.adapters.set('ollama', new OllamaAdapter('ollama', '', retryAttempts, ollamaEndpoint));
    }

    getAdapter(provider: Provider): BaseAPIAdapter | null {
        return this.adapters.get(provider) || null;
    }

    updateApiKey(provider: Provider, apiKey: string): void {
        const adapter = this.adapters.get(provider);
        if (adapter) {
            adapter.setAuthHeader(apiKey);
        } else if (apiKey) {
            // Create new adapter if key is provided
            switch (provider) {
                case 'claude':
                    this.adapters.set(provider, new ClaudeAdapter(provider, apiKey, this.settings.retryAttempts));
                    break;
                case 'openai':
                    this.adapters.set(provider, new OpenAIAdapter(provider, apiKey, this.settings.retryAttempts));
                    break;
            }
        }
    }

    updateOllamaEndpoint(endpoint: string): void {
        this.adapters.set('ollama', new OllamaAdapter('ollama', '', this.settings.retryAttempts, endpoint));
    }

    async testConnection(provider: Provider): Promise<boolean> {
        const adapter = this.adapters.get(provider);
        if (!adapter) return false;

        return adapter.testConnection();
    }

    async getModels(provider: Provider): Promise<ModelInfo[]> {
        const adapter = this.adapters.get(provider);
        if (!adapter) return [];

        return adapter.getModels();
    }
}