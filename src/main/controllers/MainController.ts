/**
 * File: src/main/controllers/MainController.ts
 * Module: Main Controller (Controller)
 * Purpose: Central controller for handling IPC requests and coordinating between models
 * Usage: Handles all IPC communication between main and renderer processes
 * Contains: IPC handlers, business logic coordination, stream management
 * Dependencies: DatabaseManager, ProviderRegistry, Electron IPC
 * Iteration: 6
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
        ipcMain.handle(IPCChannels.CONVERSATION_CREATE, async (_event, data: { title?: string } | undefined) => {
            return this.handleRequest(data || {}, async (requestData) => {
                const conversation = this.db.createConversation(requestData.title);
                return conversation;
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_LIST, async (_event, data: { limit?: number; offset?: number } | undefined) => {
            return this.handleRequest(data || {}, async (requestData) => {
                const result = this.db.listConversations(requestData.limit, requestData.offset);
                return result;
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_GET, async (_event, data: { id: string }) => {
            return this.handleRequest(data, async (requestData) => {
                const conversation = this.db.getConversation(requestData.id);
                if (!conversation) {
                    throw new Error(`Conversation ${requestData.id} not found`);
                }
                return conversation;
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_UPDATE, async (_event, data: { id: string; updates: Partial<Conversation> }) => {
            return this.handleRequest(data, async (requestData) => {
                const conversation = this.db.updateConversation(requestData.id, requestData.updates);
                return conversation;
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_DELETE, async (_event, data: { id: string }) => {
            return this.handleRequest(data, async (requestData) => {
                this.db.deleteConversation(requestData.id);
                return { success: true };
            });
        });

        ipcMain.handle(IPCChannels.CONVERSATION_SEARCH, async (_event, data: { query: string; limit?: number; offset?: number }) => {
            return this.handleRequest(data, async (requestData) => {
                const conversations = this.db.searchConversations(requestData.query, requestData.limit, requestData.offset);
                return conversations;
            });
        });

        // Message handlers
        ipcMain.handle(IPCChannels.MESSAGE_SEND, async (_event, data: { conversationId: string; content: string; model?: string; provider?: Provider }) => {
            return this.handleRequest(data, async (requestData) => {
                const settings = this.db.getSettings();
                const provider = requestData.provider || settings.provider;
                const model = requestData.model || settings.model;

                // Create user message
                const userMessage = this.db.createMessage({
                    conversationId: requestData.conversationId,
                    role: 'user',
                    content: requestData.content,
                    model,
                    provider,
                    tokenCount: Math.ceil(requestData.content.length / 4), // Rough estimate
                    cost: 0,
                });

                // Get conversation history
                const messages = this.db.getMessages(requestData.conversationId);
                const conversationHistory = messages
                    .filter(m => m.role !== 'system')
                    .map(m => ({ role: m.role, content: m.content }));

                // Start streaming response
                await this.streamMessage(requestData.conversationId, requestData.content, conversationHistory, provider, model);

                return userMessage;
            });
        });

        ipcMain.handle(IPCChannels.MESSAGE_LIST, async (_event, data: { conversationId: string }) => {
            return this.handleRequest(data, async (requestData) => {
                const messages = this.db.getMessages(requestData.conversationId);
                return messages;
            });
        });

        ipcMain.handle(IPCChannels.MESSAGE_DELETE, async (_event, data: { id: string }) => {
            return this.handleRequest(data, async (requestData) => {
                this.db.deleteMessage(requestData.id);
                return { success: true };
            });
        });

        ipcMain.handle(IPCChannels.MESSAGE_STOP, async (_event, data: { messageId: string }) => {
            return this.handleRequest(data, async (requestData) => {
                const adapter = this.activeStreams.get(requestData.messageId);
                if (adapter) {
                    adapter.abortStream(requestData.messageId);
                    this.activeStreams.delete(requestData.messageId);
                }
                return { success: true };
            });
        });

        // Settings handlers
        ipcMain.handle(IPCChannels.SETTINGS_GET, async (_event, data: any) => {
            return this.handleRequest(data || {}, async () => {
                const settings = this.db.getSettings();
                return settings;
            });
        });

        ipcMain.handle(IPCChannels.SETTINGS_UPDATE, async (_event, data: { settings: Partial<Settings> }) => {
            return this.handleRequest(data, async (requestData) => {
                const newSettings = this.db.updateSettings(requestData.settings);

                // Update provider registry with new settings
                this.providerRegistry.updateAdapters(newSettings);

                return newSettings;
            });
        });

        ipcMain.handle(IPCChannels.SETTINGS_SET_API_KEY, async (_event, data: { provider: Provider; apiKey: string }) => {
            return this.handleRequest(data, async (requestData) => {
                const settings = this.db.getSettings();
                settings.apiKeys[requestData.provider] = requestData.apiKey;
                this.db.updateSettings({ apiKeys: settings.apiKeys });

                // Update provider registry
                this.providerRegistry.updateAdapters(settings);

                return { success: true };
            });
        });

        // API handlers
        ipcMain.handle(IPCChannels.API_TEST, async (_event, data: { provider: Provider }) => {
            return this.handleRequest(data, async (requestData) => {
                const result = await this.providerRegistry.testProvider(requestData.provider);
                return { success: result };
            });
        });

        ipcMain.handle(IPCChannels.API_MODELS, async (_event, data: { provider: Provider }) => {
            return this.handleRequest(data, async (requestData) => {
                const models = await this.providerRegistry.getModels(requestData.provider);
                return models;
            });
        });

        // Export/Import handlers
        ipcMain.handle(IPCChannels.EXPORT_CONVERSATION, async (_event, data: { conversationId: string }) => {
            return this.handleRequest(data, async (requestData) => {
                const exportData = this.db.exportConversation(requestData.conversationId);
                return exportData;
            });
        });

        ipcMain.handle(IPCChannels.IMPORT_CONVERSATION, async (_event, data: { data: unknown }) => {
            return this.handleRequest(data, async (_requestData) => {
                // Implementation for importing conversations
                // This would need validation and proper error handling
                throw new Error('Import not yet implemented');
            });
        });

        // Stats handlers
        ipcMain.handle(IPCChannels.STATS_GET, async (_event, data: any) => {
            return this.handleRequest(data || {}, async () => {
                const stats = this.db.getUsageStatistics();
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
                this.mainWindow?.webContents.send('conversation:deleted', { id });
            });

            this.db.on('message:created', (message: Message) => {
                this.mainWindow?.webContents.send('message:created', message);
            });

            this.db.on('message:updated', (message: Message) => {
                this.mainWindow?.webContents.send('message:updated', message);
            });

            this.db.on('message:deleted', (id: string) => {
                this.mainWindow?.webContents.send('message:deleted', { id });
            });

            this.db.on('settings:updated', (settings: Settings) => {
                this.mainWindow?.webContents.send('settings:updated', settings);
            });
        }
    }

    private async streamMessage(
        conversationId: string,
        content: string,
        conversationHistory: Array<{ role: string; content: string }>,
        provider: Provider,
        model: string
    ): Promise<void> {
        const adapter = this.providerRegistry.getAdapter(provider);
        if (!adapter) {
            throw new Error(`No adapter for provider: ${provider}`);
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

        // Store active stream
        this.activeStreams.set(assistantMessage.id, adapter);

        let accumulatedContent = '';
        let outputTokens = 0;

        const onStreamStart = (event: StreamEvent) => {
            this.mainWindow?.webContents.send(IPCChannels.STREAM_START, {
                ...event,
                messageId: assistantMessage.id,
            });
        };

        const onStreamToken = (event: StreamEvent) => {
            if (event.content) {
                accumulatedContent += event.content;
                outputTokens++;
            }
            this.mainWindow?.webContents.send(IPCChannels.STREAM_TOKEN, {
                ...event,
                messageId: assistantMessage.id,
            });
        };

        const onStreamEnd = (event: StreamEvent) => {
            // Update message with final content
            const inputTokens = conversationHistory.reduce((acc, msg) => acc + Math.ceil(msg.content.length / 4), 0);
            const cost = this.calculateCost(provider, model, inputTokens, outputTokens);

            this.db.updateMessage(assistantMessage.id, {
                content: accumulatedContent,
                tokenCount: outputTokens,
                cost,
                streaming: false,
                metadata: event.metadata,
            });

            this.activeStreams.delete(assistantMessage.id);
            this.mainWindow?.webContents.send(IPCChannels.STREAM_END, {
                ...event,
                messageId: assistantMessage.id,
            });
        };

        const onStreamError = (event: StreamEvent) => {
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

        // Set up stream listeners
        adapter.on('stream:start', onStreamStart);
        adapter.on('stream:token', onStreamToken);
        adapter.on('stream:end', onStreamEnd);
        adapter.on('stream:error', onStreamError);

        try {
            // Start streaming
            await adapter.streamMessage(assistantMessage.id, content, conversationHistory);
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
        data: T,
        handler: (data: T) => Promise<R> | R
    ): Promise<R> {
        try {
            const result = await handler(data);
            return result;
        } catch (error) {
            console.error(`IPC Error for undefined:`, error);
            throw error;
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