/**
 * File: src/main/controllers/MainController.ts
 * Module: Main Controller (Controller)
 * Purpose: Central controller for handling IPC requests and coordinating between models
 * Usage: Handles all IPC communication between main and renderer processes
 * Contains: IPC handlers, business logic coordination, stream management
 * Dependencies: DatabaseManager, ProviderRegistry, Electron IPC
 * Iteration: 4
 */

import { ipcMain, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { Database } from '../models/JsonDatabase';
import { ProviderRegistry, BaseAPIAdapter } from '../models/APIAdapters';
import type { Settings, Provider } from '../../shared/settings';

// Inline types to avoid module resolution issues

interface Conversation {
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messageIds: string[];
    totalTokens: number;
    estimatedCost: number;
    metadata?: Record<string, unknown>;
}

interface Message {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    model: string;
    provider: Provider;
    tokenCount: number;
    cost: number;
    metadata?: Record<string, unknown>;
    streaming?: boolean;
    error?: string;
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



interface IPCRequest<T = unknown> {
    channel: string;
    data: T;
    requestId: string;
}

interface IPCResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    requestId: string;
}

// Inline constants to avoid module resolution issues
const IPCChannels = {
    CONVERSATION_CREATE: 'conversation:create',
    CONVERSATION_LIST: 'conversation:list',
    CONVERSATION_GET: 'conversation:get',
    CONVERSATION_UPDATE: 'conversation:update',
    CONVERSATION_DELETE: 'conversation:delete',
    CONVERSATION_SEARCH: 'conversation:search',
    MESSAGE_ADD: 'message:add',
    MESSAGE_LIST: 'message:list',
    MESSAGE_DELETE: 'message:delete',
    MESSAGE_SEND: 'message:send',
    MESSAGE_STOP: 'message:stop',
    STREAM_START: 'stream:start',
    STREAM_TOKEN: 'stream:token',
    STREAM_END: 'stream:end',
    STREAM_ERROR: 'stream:error',
    SETTINGS_GET: 'settings:get',
    SETTINGS_UPDATE: 'settings:update',
    SETTINGS_SET_API_KEY: 'settings:set-api-key',
    API_TEST: 'api:test',
    API_MODELS: 'api:models',
    EXPORT_CONVERSATION: 'export:conversation',
    IMPORT_CONVERSATION: 'import:conversation',
    STATS_GET: 'stats:get',
} as const;

export class MainController extends EventEmitter {
    private db: Database;
    private providerRegistry: ProviderRegistry;
    private activeStreams: Map<string, BaseAPIAdapter> = new Map();
    private mainWindow: BrowserWindow | null = null;

    constructor() {
        super();
        this.db = new Database();
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

        ipcMain.handle(IPCChannels.CONVERSATION_SEARCH, async (_event, request: IPCRequest<{ query: string; limit?: number; offset?: number }>) => {
            return this.handleRequest(request, async (data) => {
                const conversations = this.db.searchConversations(data.query, data.limit, data.offset);
                return conversations;
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
                    model,
                    provider,
                    tokenCount: Math.ceil(data.content.length / 4), // Rough estimate
                    cost: 0,
                });

                // Get conversation history
                const messages = this.db.getMessages(data.conversationId);
                const conversationHistory = messages
                    .filter(m => m.role !== 'system')
                    .map(m => ({ role: m.role, content: m.content }));

                // Start streaming response
                await this.streamMessage(data.conversationId, data.content, conversationHistory, provider, model);

                return userMessage;
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

        ipcMain.handle(IPCChannels.MESSAGE_STOP, async (_event, request: IPCRequest<{ messageId: string }>) => {
            return this.handleRequest(request, async (data) => {
                const adapter = this.activeStreams.get(data.messageId);
                if (adapter) {
                    adapter.abortStream(data.messageId);
                    this.activeStreams.delete(data.messageId);
                }
                return { success: true };
            });
        });

        // Settings handlers
        ipcMain.handle(IPCChannels.SETTINGS_GET, async (_event, request: IPCRequest<Record<string, never>>) => {
            return this.handleRequest(request, async () => {
                const settings = this.db.getSettings();
                return settings;
            });
        });

        ipcMain.handle(IPCChannels.SETTINGS_UPDATE, async (_event, request: IPCRequest<{ settings: Partial<Settings> }>) => {
            return this.handleRequest(request, async (data) => {
                this.db.updateSettings(data.settings);
                
                // Update provider registry with new settings
                const newSettings = this.db.getSettings();
                this.providerRegistry.updateAdapters(newSettings);
                
                return newSettings;
            });
        });

        ipcMain.handle(IPCChannels.SETTINGS_SET_API_KEY, async (_event, request: IPCRequest<{ provider: Provider; apiKey: string }>) => {
            return this.handleRequest(request, async (data) => {
                const settings = this.db.getSettings();
                settings.apiKeys[data.provider] = data.apiKey;
                this.db.updateSettings({ apiKeys: settings.apiKeys });
                
                // Update provider registry
                this.providerRegistry.updateAdapters(settings);
                
                return { success: true };
            });
        });

        // API handlers
        ipcMain.handle(IPCChannels.API_TEST, async (_event, request: IPCRequest<{ provider: Provider }>) => {
            return this.handleRequest(request, async (data) => {
                const result = await this.providerRegistry.testProvider(data.provider);
                return { success: result };
            });
        });

        ipcMain.handle(IPCChannels.API_MODELS, async (_event, request: IPCRequest<{ provider: Provider }>) => {
            return this.handleRequest(request, async (data) => {
                const models = await this.providerRegistry.getModels(data.provider);
                return models;
            });
        });

        // Export/Import handlers
        ipcMain.handle(IPCChannels.EXPORT_CONVERSATION, async (_event, request: IPCRequest<{ conversationId: string }>) => {
            return this.handleRequest(request, async (data) => {
                const conversation = this.db.getConversation(data.conversationId);
                if (!conversation) {
                    throw new Error('Conversation not found');
                }
                
                const messages = this.db.getMessages(data.conversationId);
                
                return {
                    conversation,
                    messages,
                    exportedAt: new Date(),
                };
            });
        });

        ipcMain.handle(IPCChannels.IMPORT_CONVERSATION, async (_event, request: IPCRequest<{ data: unknown }>) => {
            return this.handleRequest(request, async (_data) => {
                // Implementation for importing conversations
                // This would need validation and proper error handling
                throw new Error('Import not yet implemented');
            });
        });

        // Stats handlers
        ipcMain.handle(IPCChannels.STATS_GET, async (_event, request: IPCRequest<Record<string, never>>) => {
            return this.handleRequest(request, async () => {
                const stats = this.db.getUsageStats();
                return stats;
            });
        });
    }

    private setupDatabaseListeners(): void {
        // Check if db has event emitter methods before setting up listeners
        if (typeof this.db.on === 'function') {
            // Forward database events to renderer
            this.db.on('conversation:created', (conversation: Conversation) => {
                this.mainWindow?.webContents.send('conversation:created', conversation);
            });

            this.db.on('conversation:updated', (conversation: Conversation) => {
                this.mainWindow?.webContents.send('conversation:updated', conversation);
            });

            this.db.on('conversation:deleted', (id: string) => {
                this.mainWindow?.webContents.send('conversation:deleted', id);
            });

            this.db.on('message:created', (message: Message) => {
                this.mainWindow?.webContents.send('message:created', message);
            });

            this.db.on('message:updated', (message: Message) => {
                this.mainWindow?.webContents.send('message:updated', message);
            });

            this.db.on('message:deleted', (id: string) => {
                this.mainWindow?.webContents.send('message:deleted', id);
            });

            this.db.on('settings:updated', (settings: Partial<Settings>) => {
                this.mainWindow?.webContents.send('settings:updated', settings);
            });
        }
    }

    private async streamMessage(
        conversationId: string,
        userMessage: string,
        conversationHistory: Array<{role: string, content: string}>,
        provider: Provider,
        model: string
    ): Promise<void> {
        const adapter = this.providerRegistry.getAdapter(provider);
        if (!adapter) {
            throw new Error(`Provider ${provider} not available`);
        }

        // Create assistant message placeholder
        const assistantMessage = this.db.createMessage({
            conversationId,
            role: 'assistant',
            content: '',
            model,
            provider,
            tokenCount: 0,
            cost: 0,
            streaming: true,
        });

        this.activeStreams.set(assistantMessage.id, adapter);

        // Set up stream event handlers
        const onStreamStart = (event: StreamEvent) => {
            this.mainWindow?.webContents.send(IPCChannels.STREAM_START, {
                ...event,
                messageId: assistantMessage.id,
            });
        };

        const onStreamToken = (event: StreamEvent) => {
            // Update message content incrementally
            const currentMessage = this.db.getMessage(assistantMessage.id);
            if (currentMessage) {
                const updatedContent = currentMessage.content + (event.content || '');
                this.db.updateMessage(assistantMessage.id, { content: updatedContent });
                
                this.mainWindow?.webContents.send(IPCChannels.STREAM_TOKEN, {
                    ...event,
                    messageId: assistantMessage.id,
                });
            }
        };

        const onStreamEnd = (event: StreamEvent) => {
            // Finalize message
            const currentMessage = this.db.getMessage(assistantMessage.id);
            if (currentMessage) {
                const finalTokenCount = Math.ceil(currentMessage.content.length / 4); // Rough estimate
                const cost = this.calculateCost(provider, model, 0, finalTokenCount);
                
                this.db.updateMessage(assistantMessage.id, {
                    streaming: false,
                    tokenCount: finalTokenCount,
                    cost,
                });
            }

            this.activeStreams.delete(assistantMessage.id);
            this.mainWindow?.webContents.send(IPCChannels.STREAM_END, {
                ...event,
                messageId: assistantMessage.id,
            });
        };

        const onStreamError = (event: StreamEvent) => {
            // Mark message as errored
            this.db.updateMessage(assistantMessage.id, {
                streaming: false,
                error: event.error,
            });

            this.activeStreams.delete(assistantMessage.id);
            this.mainWindow?.webContents.send(IPCChannels.STREAM_ERROR, {
                ...event,
                messageId: assistantMessage.id,
            });
        };

        // Attach event listeners
        adapter.on('stream:start', onStreamStart);
        adapter.on('stream:token', onStreamToken);
        adapter.on('stream:end', onStreamEnd);
        adapter.on('stream:error', onStreamError);

        try {
            // Start streaming
            await adapter.streamMessage(assistantMessage.id, userMessage, conversationHistory);
        } catch (error) {
            onStreamError({
                type: 'error',
                messageId: assistantMessage.id,
                error: (error as Error).message,
            });
        } finally {
            // Clean up listeners
            adapter.removeListener('stream:start', onStreamStart);
            adapter.removeListener('stream:token', onStreamToken);
            adapter.removeListener('stream:end', onStreamEnd);
            adapter.removeListener('stream:error', onStreamError);
        }
    }

    private calculateCost(provider: Provider, _model: string, inputTokens: number, outputTokens: number): number {
        // Simple cost calculation - in a real app, this would use actual pricing
        const costs: Record<Provider, { input: number; output: number }> = {
            claude: { input: 0.008, output: 0.024 },
            openai: { input: 0.01, output: 0.03 },
            ollama: { input: 0, output: 0 },
        };

        const providerCosts = costs[provider] || { input: 0, output: 0 };
        return ((inputTokens / 1000) * providerCosts.input) + ((outputTokens / 1000) * providerCosts.output);
    }

    private async handleRequest<T, R>(
        request: IPCRequest<T>,
        handler: (data: T) => Promise<R> | R
    ): Promise<IPCResponse<R>> {
        try {
            const result = await handler(request.data);
            return {
                success: true,
                data: result,
                requestId: request.requestId,
            };
        } catch (error) {
            console.error(`IPC Error for ${request.channel}:`, error);
            return {
                success: false,
                error: (error as Error).message,
                requestId: request.requestId,
            };
        }
    }

    cleanup(): void {
        // Abort all active streams
        for (const [messageId, adapter] of this.activeStreams) {
            adapter.abortStream(messageId);
        }
        this.activeStreams.clear();

        // Close database
        this.db.close();
    }
}