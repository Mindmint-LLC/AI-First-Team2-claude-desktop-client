import { EventEmitter } from 'events';

// Inline types to avoid module resolution issues
type Provider = 'claude' | 'openai' | 'ollama';

interface Settings {
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

interface APIResponse {
    content: string;
    model: string;
    usage: {
        input: number;
        output: number;
        total: number;
    };
    cost?: {
        input: number;
        output: number;
        total: number;
    };
}

interface StreamEvent {
    type: 'start' | 'token' | 'end' | 'error';
    messageId: string;
    content?: string;
    error?: string;
    metadata?: {
        model?: string;
        tokenCount?: number;
        finishReason?: string;
    };
}

// Define response types
interface AnthropicResponse {
    content: Array<{ text: string }>;
    model: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

interface OpenAIResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

interface OllamaResponse {
    response: string;
    model?: string;
    prompt_eval_count?: number;
    eval_count?: number;
}

interface OllamaModel {
    name: string;
}

export class BaseAPIAdapter extends EventEmitter {
    protected apiKey: string;
    protected baseURL: string;
    protected provider: Provider;

    constructor(provider: Provider, apiKey: string, baseURL: string) {
        super();
        this.provider = provider;
        this.apiKey = apiKey;
        this.baseURL = baseURL;
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await fetch(this.baseURL, {
                method: 'GET',
                headers: this.getHeaders(),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    protected getHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
        };
    }

    async abortStream(_messageId: string): Promise<void> {
        // Implementation would depend on the specific provider
    }

    async streamMessage(_messageId: string, _userMessage: string, _history: any[]): Promise<void> {
        throw new Error('Method must be implemented by subclass');
    }

    async getModels(): Promise<string[]> {
        throw new Error('Method must be implemented by subclass');
    }
}

export class AnthropicAdapter extends BaseAPIAdapter {
    constructor(settings: Settings) {
        super('claude', settings.apiKeys.claude, 'https://api.anthropic.com/v1');
    }

    protected getHeaders(): Record<string, string> {
        return {
            ...super.getHeaders(),
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
        };
    }

    async sendMessage(messages: any[], model: string): Promise<APIResponse> {
        const response = await fetch(`${this.baseURL}/messages`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model,
                messages,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.statusText}`);
        }

        const data = await response.json() as AnthropicResponse;

        return {
            content: data.content[0].text,
            model: data.model,
            usage: {
                input: data.usage.input_tokens,
                output: data.usage.output_tokens,
                total: data.usage.input_tokens + data.usage.output_tokens,
            },
            cost: {
                input: (data.usage.input_tokens / 1000) * 0.015,
                output: (data.usage.output_tokens / 1000) * 0.075,
                total: ((data.usage.input_tokens / 1000) * 0.015) + ((data.usage.output_tokens / 1000) * 0.075),
            }
        };
    }

    async streamMessage(messageId: string, userMessage: string, _history: any[]): Promise<void> {
        const response = await fetch(`${this.baseURL}/messages`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                messages: [{ role: 'user', content: userMessage }],
                max_tokens: 4096,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.statusText}`);
        }

        this.emit('stream:start', { type: 'start', messageId });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error('Response body is not readable');
        }

        let buffer = '';
        let reading = true;
        while (reading) {
            const { done, value } = await reader.read();
            if (done) {
                reading = false;
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        this.emit('stream:end', { type: 'end', messageId });
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                            this.emit('stream:token', { type: 'token', messageId, content: parsed.delta.text });
                        } else if (parsed.type === 'message_stop') {
                            this.emit('stream:end', { 
                                type: 'end',
                                messageId,
                                metadata: parsed.usage ? {
                                    tokenCount: parsed.usage.input_tokens + parsed.usage.output_tokens
                                } : undefined
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing stream data:', e);
                    }
                }
            }
        }
    }

    async getModels(): Promise<string[]> {
        return ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
    }
}

export class OpenAIAdapter extends BaseAPIAdapter {
    constructor(settings: Settings) {
        super('openai', settings.apiKeys.openai, 'https://api.openai.com/v1');
    }

    protected getHeaders(): Record<string, string> {
        return {
            ...super.getHeaders(),
            'Authorization': `Bearer ${this.apiKey}`
        };
    }

    async sendMessage(messages: any[], model: string): Promise<APIResponse> {
        const response = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model,
                messages
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json() as OpenAIResponse;

        return {
            content: data.choices[0].message.content,
            model: data.model,
            usage: {
                input: data.usage.prompt_tokens,
                output: data.usage.completion_tokens,
                total: data.usage.total_tokens,
            },
            cost: {
                input: (data.usage.prompt_tokens / 1000) * 0.03,
                output: (data.usage.completion_tokens / 1000) * 0.06,
                total: ((data.usage.prompt_tokens / 1000) * 0.03) + ((data.usage.completion_tokens / 1000) * 0.06),
            }
        };
    }

    async streamMessage(messageId: string, userMessage: string, _history: any[]): Promise<void> {
        const response = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [{ role: 'user', content: userMessage }],
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        this.emit('stream:start', { type: 'start', messageId });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error('Response body is not readable');
        }

        let buffer = '';
        let reading = true;
        while (reading) {
            const { done, value } = await reader.read();
            if (done) {
                reading = false;
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        this.emit('stream:end', { type: 'end', messageId });
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices?.[0]?.delta?.content) {
                            this.emit('stream:token', { type: 'token', messageId, content: parsed.choices[0].delta.content });
                        }
                    } catch (e) {
                        console.error('Error parsing stream data:', e);
                    }
                }
            }
        }
    }

    async getModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseURL}/models`, {
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.statusText}`);
            }

            const data = await response.json() as { data: Array<{ id: string }> };
            if (!data.data || !Array.isArray(data.data)) {
                return [];
            }
            return data.data
                .filter(model => model.id.startsWith('gpt'))
                .map(model => model.id);
        } catch (error) {
            console.error('Error fetching OpenAI models:', error);
            return [];
        }
    }
}

export class OllamaAdapter extends BaseAPIAdapter {
    constructor(settings: Settings) {
        super('ollama', '', settings.ollamaEndpoint || 'http://localhost:11434');
    }

    protected getHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json'
        };
    }

    async sendMessage(messages: any[], model: string): Promise<APIResponse> {
        const response = await fetch(`${this.baseURL}/api/chat`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model,
                messages,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json() as OllamaResponse;

        return {
            content: data.response,
            model,
            usage: {
                input: data.prompt_eval_count || 0,
                output: data.eval_count || 0,
                total: (data.prompt_eval_count || 0) + (data.eval_count || 0),
            },
            cost: {
                input: 0,
                output: 0,
                total: 0,
            }
        };
    }

    async streamMessage(messageId: string, userMessage: string, _history: any[]): Promise<void> {
        const response = await fetch(`${this.baseURL}/api/chat`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model: 'llama2',
                messages: [{ role: 'user', content: userMessage }],
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }

        this.emit('stream:start', { type: 'start', messageId });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error('Response body is not readable');
        }

        let buffer = '';
        let reading = true;
        while (reading) {
            const { done, value } = await reader.read();
            if (done) {
                reading = false;
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.message?.content) {
                            this.emit('stream:token', { type: 'token', messageId, content: parsed.message.content });
                        }
                        if (parsed.done) {
                            this.emit('stream:end', { 
                                type: 'end',
                                messageId,
                                metadata: {
                                    tokenCount: (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0)
                                }
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing stream data:', e);
                    }
                }
            }
        }
    }

    async getModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseURL}/api/tags`);
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }
            const data = await response.json() as { models?: OllamaModel[] };
            return data.models?.map((model) => model.name) || [];
        } catch (error) {
            console.error('Error fetching Ollama models:', error);
            return [];
        }
    }
}

export class ProviderRegistry {
    private adapters: Map<Provider, BaseAPIAdapter> = new Map();
    private settings: Settings;

    constructor(settings: Settings) {
        this.settings = settings;
        this.initializeAdapters();
    }

    private initializeAdapters(): void {
        if (this.settings.apiKeys.claude) {
            this.adapters.set('claude', new AnthropicAdapter(this.settings));
        }
        if (this.settings.apiKeys.openai) {
            this.adapters.set('openai', new OpenAIAdapter(this.settings));
        }
        // Ollama doesn't need an API key
        this.adapters.set('ollama', new OllamaAdapter(this.settings));
    }

    updateAdapters(settings: Settings): void {
        this.settings = settings;
        this.adapters.clear();
        this.initializeAdapters();
    }

    getAdapter(provider: Provider): BaseAPIAdapter | null {
        return this.adapters.get(provider) || null;
    }

    async testProvider(provider: Provider): Promise<boolean> {
        const adapter = this.getAdapter(provider);
        if (!adapter) return false;
        return await adapter.testConnection();
    }

    async getModels(provider: Provider): Promise<string[]> {
        const adapter = this.getAdapter(provider);
        if (!adapter) return [];
        return await adapter.getModels();
    }

    updateApiKey(provider: Provider, apiKey: string): void {
        const newSettings = {
            ...this.settings,
            apiKeys: {
                ...this.settings.apiKeys,
                [provider]: apiKey
            }
        };
        this.updateAdapters(newSettings);
    }

    updateOllamaEndpoint(endpoint: string): void {
        const newSettings = {
            ...this.settings,
            ollamaEndpoint: endpoint
        };
        this.updateAdapters(newSettings);
    }

    async testConnection(provider: Provider): Promise<boolean> {
        return await this.testProvider(provider);
    }
}

// For backwards compatibility
export const DatabaseManager = class {
    // This will be replaced by the Database class
};

// Alias for backwards compatibility with tests
export const ClaudeAdapter = AnthropicAdapter;