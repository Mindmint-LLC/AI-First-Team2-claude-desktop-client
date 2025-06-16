import { ipcMain, safeStorage, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { DatabaseManager } from '../models/Database';
import { ProviderRegistry, BaseAPIAdapter } from '../models/APIAdapters';
import {
    IPCChannels,
    IPCRequest,
    IPCResponse,
    Conversation,
    Message,
    Settings,
    StreamEvent,
    Provider
} from '@shared/types';

export class MainController extends EventEmitter {
    private db: DatabaseManager;
    private providerRegistry: ProviderRegistry;
    private activeStreams: Map<string, BaseAPIAdapter> = new Map();
    private mainWindow: BrowserWindow | null = null;

    constructor() {
        super();
        this.db = new DatabaseManager();
        const settings = this.db.getSettings();
        this.providerRegistry = new ProviderRegistry(settings);
        this.setupIPC();
        this.setupDatabaseListeners();
    }

    setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window;
    }

    private setupIPC(): void {
        // Conversation handlers
        ipcMain.handle(IPCChannels.CONVERSATION_CREATE, async (_event, request: IPCRequest<{ title?: string }>) => {
            return this.handleRequest(request, async (data) => {
                const conversation = this.db.createConversation(data.title);
                return conversation;
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_LIST, async (_event, request: IPCRequest<{ limit?: number; offset?: number }>) => {
            return this.handleRequest(request, async (data) => {
                const result = this.db.listConversations(data.limit, data.offset);
                return result;
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_GET, async (_event, request: IPCRequest<{ id: string }>) => {
            return this.handleRequest(request, async (data) => {
                const conversation = this.db.getConversation(data.id);
                if (!conversation) {
                    throw new Error(`Conversation ${data.id} not found`);
                }
                return conversation;
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_UPDATE, async (_event, request: IPCRequest<{ id: string; updates: Partial<Conversation> }>) => {
            return this.handleRequest(request, async (data) => {
                const conversation = this.db.updateConversation(data.id, data.updates);
                return conversation;
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_DELETE, async (_event, request: IPCRequest<{ id: string }>) => {
            return this.handleRequest(request, async (data) => {
                this.db.deleteConversation(data.id);
                return { success: true };
            });
        });

        // Message handlers
        ipcMain.handle(IPCChannels.MESSAGE_SEND, async (_event, request: IPCRequest<{ conversationId: string; content: string; model?: string; provider?: Provider }>) => {
            return this.handleRequest(request, async (data) => {
                const settings = this.db.getSettings();
                const provider = data.provider || settings.provider;
                const model = data.model || settings.model;

                // Create user message
                const userMessage = this.db.createMessage({
                    conversationId: data.conversationId,
                    role: 'user',
                    content: data.content,
                    timestamp: new Date(),
                    model,
                    provider,
                    tokenCount: this.estimateTokens(data.content),
                    cost: 0,
                });

                // Create placeholder assistant message
                const assistantMessage = this.db.createMessage({
                    conversationId: data.conversationId,
                    role: 'assistant',
                    content: '',
                    timestamp: new Date(),
                    model,
                    provider,
                    tokenCount: 0,
                    cost: 0,
                    streaming: true,
                });

                // Get conversation messages for context
                const messages = this.db.getMessages(data.conversationId);

                // Send to API
                this.sendMessageToAPI(messages, assistantMessage, model, provider, settings);

                return { userMessage, assistantMessage };
            });
        });

        ipcMain.handle(IPCChannels.MESSAGE_LIST, async (_event, request: IPCRequest<{ conversationId: string }>) => {
            return this.handleRequest(request, async (data) => {
                const messages = this.db.getMessages(data.conversationId);
                return messages;
            });
        });

        ipcMain.handle(IPCChannels.MESSAGE_DELETE, async (_event, request: IPCRequest<{ id: string }>) => {
            return this.handleRequest(request, async (data) => {
                this.db.deleteMessage(data.id);
                return { success: true };
            });
        });

        // Settings handlers
        ipcMain.handle(IPCChannels.SETTINGS_GET, async (_event, request: IPCRequest) => {
            return this.handleRequest(request, async () => {
                const settings = this.db.getSettings();
                // Decrypt API keys
                const decrypted = { ...settings };
                if (safeStorage.isEncryptionAvailable()) {
                    Object.keys(settings.apiKeys).forEach(provider => {
                        const encrypted = settings.apiKeys[provider as Provider];
                        if (encrypted) {
                            try {
                                decrypted.apiKeys[provider as Provider] = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
                            } catch (e) {
                                decrypted.apiKeys[provider as Provider] = encrypted; // Fallback to plain text
                            }
                        }
                    });
                }
                return decrypted;
            });
        });

        ipcMain.handle(IPCChannels.SETTINGS_UPDATE, async (_event, request: IPCRequest<Partial<Settings>>) => {
            return this.handleRequest(request, async (data) => {
                const updates = { ...data };

                // Encrypt API keys
                if (updates.apiKeys && safeStorage.isEncryptionAvailable()) {
                    const encrypted: Record<Provider, string> = { claude: '', openai: '', ollama: '' };
                    Object.keys(updates.apiKeys).forEach(provider => {
                        const key = updates.apiKeys![provider as Provider];
                        if (key) {
                            encrypted[provider as Provider] = safeStorage.encryptString(key).toString('base64');
                        }
                    });
                    updates.apiKeys = encrypted;
                }

                const settings = this.db.updateSettings(updates);

                // Update provider registry
                if (data.apiKeys) {
                    Object.entries(data.apiKeys).forEach(([provider, key]) => {
                        this.providerRegistry.updateApiKey(provider as Provider, key);
                    });
                }

                if (data.ollamaEndpoint) {
                    this.providerRegistry.updateOllamaEndpoint(data.ollamaEndpoint);
                }

                return settings;
            });
        });

        // API handlers
        ipcMain.handle(IPCChannels.API_TEST, async (_event, request: IPCRequest<{ provider: Provider }>) => {
            return this.handleRequest(request, async (data) => {
                const success = await this.providerRegistry.testConnection(data.provider);
                return { success };
            });
        });

        ipcMain.handle(IPCChannels.API_MODELS, async (_event, request: IPCRequest<{ provider: Provider }>) => {
            return this.handleRequest(request, async (data) => {
                const models = await this.providerRegistry.getModels(data.provider);
                return models;
            });
        });

        // Utility handlers
        ipcMain.handle(IPCChannels.USAGE_STATS, async (_event, request: IPCRequest) => {
            return this.handleRequest(request, async () => {
                const stats = this.db.getUsageStats();
                return stats;
            });
        });

        ipcMain.handle(IPCChannels.EXPORT_CONVERSATION, async (_event, request: IPCRequest<{ conversationId: string; format: 'json' | 'markdown' }>) => {
            return this.handleRequest(request, async (data) => {
                const exported = this.db.exportConversation(data.conversationId);

                if (data.format === 'markdown') {
                    return this.convertToMarkdown(exported);
                }

                return exported;
            });
        });

        ipcMain.handle(IPCChannels.IMPORT_CONVERSATION, async (_event, request: IPCRequest<{ data: any }>) => {
            return this.handleRequest(request, async (data) => {
                const conversation = this.db.importConversation(data.data);
                return conversation;
            });
        });
    }

    private setupDatabaseListeners(): void {
        // Forward database events to renderer
        this.db.on('conversation:created', (conversation) => {
            this.sendToRenderer('conversation:created', conversation);
        });

        this.db.on('conversation:updated', (conversation) => {
            this.sendToRenderer('conversation:updated', conversation);
        });

        this.db.on('conversation:deleted', (id) => {
            this.sendToRenderer('conversation:deleted', id);
        });

        this.db.on('message:created', (message) => {
            this.sendToRenderer('message:created', message);
        });

        this.db.on('message:updated', (message) => {
            this.sendToRenderer('message:updated', message);
        });

        this.db.on('settings:updated', (settings) => {
            this.sendToRenderer('settings:updated', settings);
        });
    }

    private async handleRequest<T, R>(
        request: IPCRequest<T>,
        handler: (data: T) => Promise<R>
    ): Promise<IPCResponse<R>> {
        try {
            const result = await handler(request.data);
            return {
                success: true,
                data: result,
                requestId: request.requestId,
            };
        } catch (error) {
            console.error('IPC handler error:', error);
            return {
                success: false,
                error: (error as Error).message,
                requestId: request.requestId,
            };
        }
    }

    private async sendMessageToAPI(
        messages: Message[],
        assistantMessage: Message,
        model: string,
        provider: Provider,
        settings: Settings
    ): Promise<void> {
        const adapter = this.providerRegistry.getAdapter(provider);
        if (!adapter) {
            this.db.updateMessage(assistantMessage.id, {
                content: 'Error: Provider not configured',
                streaming: false,
                error: 'Provider not configured',
            });
            return;
        }

        // Store active stream
        this.activeStreams.set(assistantMessage.id, adapter);

        // Set up stream listeners
        let content = '';
        let tokenCount = 0;
        let lastUpdate = Date.now();

        const updateMessage = () => {
            this.db.updateMessage(assistantMessage.id, {
                content,
                tokenCount,
                streaming: true,
            });
        };

        adapter.on('stream', (event: StreamEvent) => {
            if (event.messageId !== assistantMessage.id) return;

            switch (event.type) {
                case 'start':
                    this.sendToRenderer('message:stream:start', { messageId: assistantMessage.id });
                    break;

                case 'token':
                    if (event.data) {
                        content += event.data;
                        tokenCount = event.tokenCount || tokenCount;

                        // Rate limit updates
                        const now = Date.now();
                        if (now - lastUpdate > settings.streamRateLimit) {
                            updateMessage();
                            lastUpdate = now;

                            this.sendToRenderer('message:stream:token', {
                                messageId: assistantMessage.id,
                                token: event.data,
                                fullContent: content,
                            });
                        }
                    }
                    break;

                case 'complete':
                    // Final update
                    this.db.updateMessage(assistantMessage.id, {
                        content,
                        tokenCount: event.tokenCount || tokenCount,
                        cost: event.cost || 0,
                        streaming: false,
                    });

                    this.sendToRenderer('message:stream:complete', {
                        messageId: assistantMessage.id,
                        fullContent: content,
                        tokenCount: event.tokenCount,
                        cost: event.cost,
                    });

                    this.activeStreams.delete(assistantMessage.id);
                    adapter.removeAllListeners('stream');
                    break;

                case 'error':
                    this.db.updateMessage(assistantMessage.id, {
                        content: content || 'Error generating response',
                        streaming: false,
                        error: event.error,
                    });

                    this.sendToRenderer('message:stream:error', {
                        messageId: assistantMessage.id,
                        error: event.error,
                    });

                    this.activeStreams.delete(assistantMessage.id);
                    adapter.removeAllListeners('stream');
                    break;
            }
        });

        // Send message
        try {
            await adapter.sendMessage(messages, model, settings);
        } catch (error) {
            console.error('Failed to send message:', error);

            this.db.updateMessage(assistantMessage.id, {
                content: 'Error: Failed to send message',
                streaming: false,
                error: (error as Error).message,
            });

            this.sendToRenderer('message:stream:error', {
                messageId: assistantMessage.id,
                error: (error as Error).message,
            });

            this.activeStreams.delete(assistantMessage.id);
        }
    }

    private sendToRenderer(channel: string, data: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    private estimateTokens(text: string): number {
        // Simple estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    private convertToMarkdown(data: { conversation: Conversation; messages: Message[] }): string {
        let markdown = `# ${data.conversation.title}\n\n`;
        markdown += `Created: ${data.conversation.createdAt.toLocaleString()}\n`;
        markdown += `Total tokens: ${data.conversation.totalTokens}\n`;
        markdown += `Estimated cost: ${data.conversation.estimatedCost.toFixed(4)}\n\n`;
        markdown += '---\n\n';

        for (const message of data.messages) {
            const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
            markdown += `## ${role}\n\n`;
            markdown += `${message.content}\n\n`;

            if (message.tokenCount > 0) {
                markdown += `*Tokens: ${message.tokenCount}, Cost: ${message.cost.toFixed(4)}*\n\n`;
            }

            markdown += '---\n\n';
        }

        return markdown;
    }

    // Cleanup
    stopStream(messageId: string): void {
        const adapter = this.activeStreams.get(messageId);
        if (adapter) {
            adapter.removeAllListeners('stream');
            this.activeStreams.delete(messageId);
        }
    }

    cleanup(): void {
        // Stop all active streams
        this.activeStreams.forEach((_adapter, messageId) => {
            this.stopStream(messageId);
        });

        // Close database
        this.db.close();
    }
}