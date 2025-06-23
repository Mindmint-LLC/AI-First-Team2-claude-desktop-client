/**
 * File: src/renderer/stores/index.ts
 * Module: Renderer State Management (View/Controller)
 * Purpose: MobX stores for managing application state in renderer process
 * Usage: Import RootStore and use in React components with observer
 * Contains: RootStore, ConversationStore, MessageStore, SettingsStore, UIStore
 * Dependencies: mobx, electron API types
 * Iteration: 6
 */

import { makeAutoObservable, runInAction } from 'mobx';
import {
    Conversation,
    Message,
    Provider,
    ModelInfo,
    UsageStats,
} from '../../shared/types';
import type { ElectronAPI } from '../../shared/electron-api';
import { ToastItem } from '../components/ToastManager';

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

const DEFAULT_SETTINGS = {
    provider: 'claude' as const,
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
    theme: 'dark' as const,
    ollamaEndpoint: 'http://localhost:11434/api',
};

type Settings = typeof DEFAULT_SETTINGS;

// Conversation Store
export class ConversationStore {
    conversations: Conversation[] = [];
    activeConversation: Conversation | null = null;
    isLoading = false;
    error: string | null = null;

    constructor(private rootStore: RootStore) {
        makeAutoObservable(this);
    }

    async loadConversations(): Promise<void> {
        this.isLoading = true;
        this.error = null;

        try {
            const response = await window.electronAPI.invoke(IPCChannels.CONVERSATION_LIST, {
                limit: 100,
                offset: 0,
            });

            if (response.success) {
                runInAction(() => {
                    this.conversations = response.data.conversations || [];
                });
            } else {
                throw new Error(response.error || 'Failed to load conversations');
            }
        } catch (error) {
            runInAction(() => {
                this.error = (error as Error).message;
            });
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async createConversation(title?: string): Promise<Conversation | null> {
        try {
            const response = await window.electronAPI.invoke(IPCChannels.CONVERSATION_CREATE, {
                title,
            });

            if (response.success) {
                runInAction(() => {
                    this.conversations.unshift(response.data);
                    this.setActiveConversation(response.data.id);
                });
                return response.data;
            } else {
                throw new Error(response.error || 'Failed to create conversation');
            }
        } catch (error) {
            this.rootStore.uiStore.showToast((error as Error).message, 'error');
            return null;
        }
    }

    async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
        try {
            const response = await window.electronAPI.invoke(IPCChannels.CONVERSATION_UPDATE, {
                id,
                updates,
            });

            if (response.success) {
                runInAction(() => {
                    const index = this.conversations.findIndex(c => c.id === id);
                    if (index !== -1) {
                        this.conversations[index] = response.data;
                    }
                    if (this.activeConversation?.id === id) {
                        this.activeConversation = response.data;
                    }
                });
            } else {
                throw new Error(response.error || 'Failed to update conversation');
            }
        } catch (error) {
            this.rootStore.uiStore.showToast((error as Error).message, 'error');
        }
    }

    async deleteConversation(id: string): Promise<void> {
        try {
            const response = await window.electronAPI.invoke(IPCChannels.CONVERSATION_DELETE, {
                id,
            });

            if (response.success) {
                runInAction(() => {
                    this.conversations = this.conversations.filter(c => c.id !== id);
                    if (this.activeConversation?.id === id) {
                        this.activeConversation = null;
                    }
                });
            } else {
                throw new Error(response.error || 'Failed to delete conversation');
            }
        } catch (error) {
            this.rootStore.uiStore.showToast((error as Error).message, 'error');
        }
    }

    async exportConversation(id: string): Promise<void> {
        try {
            const response = await window.electronAPI.invoke(IPCChannels.EXPORT_CONVERSATION, {
                conversationId: id,
            });

            if (response.success) {
                // Create and download file
                const data = JSON.stringify(response.data, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `conversation-${id}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                throw new Error(response.error || 'Failed to export conversation');
            }
        } catch (error) {
            this.rootStore.uiStore.showToast((error as Error).message, 'error');
        }
    }

    setActiveConversation(id: string): void {
        const conversation = this.conversations.find(c => c.id === id);
        if (conversation) {
            this.activeConversation = conversation;
            this.rootStore.messageStore.loadMessages(id);
        }
    }

    handleConversationCreated(conversation: Conversation): void {
        runInAction(() => {
            const existing = this.conversations.find(c => c.id === conversation.id);
            if (!existing) {
                this.conversations.unshift(conversation);
            }
        });
    }

    handleConversationUpdated(conversation: Conversation): void {
        runInAction(() => {
            const index = this.conversations.findIndex(c => c.id === conversation.id);
            if (index !== -1) {
                this.conversations[index] = conversation;
            }
            if (this.activeConversation?.id === conversation.id) {
                this.activeConversation = conversation;
            }
        });
    }

    handleConversationDeleted(id: string): void {
        runInAction(() => {
            this.conversations = this.conversations.filter(c => c.id !== id);
            if (this.activeConversation?.id === id) {
                this.activeConversation = null;
            }
        });
    }
}

// Message Store
export class MessageStore {
    messages: Map<string, Message[]> = new Map();
    isStreaming = false;
    currentStreamingMessageId: string | null = null;
    isLoading = false;
    error: string | null = null;

    constructor(private rootStore: RootStore) {
        makeAutoObservable(this);
    }

    async loadMessages(conversationId: string): Promise<void> {
        this.isLoading = true;
        this.error = null;

        try {
            const response = await window.electronAPI.invoke(IPCChannels.MESSAGE_LIST, {
                conversationId,
            });

            if (response.success) {
                runInAction(() => {
                    this.messages.set(conversationId, response.data || []);
                });
            } else {
                throw new Error(response.error || 'Failed to load messages');
            }
        } catch (error) {
            runInAction(() => {
                this.error = (error as Error).message;
            });
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async sendMessage(conversationId: string, content: string): Promise<void> {
        try {
            this.isStreaming = true;
            
            const response = await window.electronAPI.invoke(IPCChannels.MESSAGE_SEND, {
                conversationId,
                content,
            });

            if (!response.success) {
                throw new Error(response.error || 'Failed to send message');
            }
        } catch (error) {
            runInAction(() => {
                this.isStreaming = false;
            });
            this.rootStore.uiStore.showToast((error as Error).message, 'error');
        }
    }

    stopGeneration(): void {
        if (this.currentStreamingMessageId) {
            window.electronAPI.invoke(IPCChannels.MESSAGE_STOP, {
                messageId: this.currentStreamingMessageId,
            });
        }
        this.isStreaming = false;
        this.currentStreamingMessageId = null;
    }

    getMessagesForConversation(conversationId: string): Message[] {
        return this.messages.get(conversationId) || [];
    }

    handleMessageCreated(message: Message): void {
        runInAction(() => {
            const conversationMessages = this.messages.get(message.conversationId) || [];
            conversationMessages.push(message);
            this.messages.set(message.conversationId, conversationMessages);
        });
    }

    handleMessageUpdated(message: Message): void {
        runInAction(() => {
            const conversationMessages = this.messages.get(message.conversationId) || [];
            const index = conversationMessages.findIndex(m => m.id === message.id);
            if (index !== -1) {
                conversationMessages[index] = message;
                this.messages.set(message.conversationId, conversationMessages);
            }
        });
    }

    handleMessageDeleted(messageId: string): void {
        runInAction(() => {
            for (const [conversationId, messages] of this.messages.entries()) {
                const filtered = messages.filter(m => m.id !== messageId);
                if (filtered.length !== messages.length) {
                    this.messages.set(conversationId, filtered);
                    break;
                }
            }
        });
    }

    handleStreamStart(data: { messageId: string }): void {
        runInAction(() => {
            this.isStreaming = true;
            this.currentStreamingMessageId = data.messageId;
        });
    }

    handleStreamToken(data: { messageId: string; content: string }): void {
        // Token updates are handled by message updates
    }

    handleStreamEnd(data: { messageId: string }): void {
        runInAction(() => {
            this.isStreaming = false;
            this.currentStreamingMessageId = null;
        });
    }

    handleStreamError(data: { messageId: string; error: string }): void {
        runInAction(() => {
            this.isStreaming = false;
            this.currentStreamingMessageId = null;
        });
        this.rootStore.uiStore.showToast(`Stream error: ${data.error}`, 'error');
    }
}

// Settings Store
export class SettingsStore {
    settings: Settings | null = null;
    availableModels: Map<Provider, string[]> = new Map();
    isLoading = false;
    error: string | null = null;

    constructor(private rootStore: RootStore) {
        makeAutoObservable(this);
        this.loadSettings();
    }

    async loadSettings(): Promise<void> {
        this.isLoading = true;
        this.error = null;

        try {
            const response = await window.electronAPI.invoke(IPCChannels.SETTINGS_GET, {});

            if (response.success) {
                runInAction(() => {
                    this.settings = response.data || DEFAULT_SETTINGS;
                });
            } else {
                throw new Error(response.error || 'Failed to load settings');
            }
        } catch (error) {
            runInAction(() => {
                this.error = (error as Error).message;
                this.settings = DEFAULT_SETTINGS;
            });
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async updateSettings(updates: Partial<Settings>): Promise<void> {
        try {
            const response = await window.electronAPI.invoke(IPCChannels.SETTINGS_UPDATE, {
                settings: updates,
            });

            if (response.success) {
                runInAction(() => {
                    this.settings = response.data;
                });
                this.rootStore.uiStore.showToast('Settings updated successfully', 'success');
            } else {
                throw new Error(response.error || 'Failed to update settings');
            }
        } catch (error) {
            this.rootStore.uiStore.showToast((error as Error).message, 'error');
        }
    }

    async testConnection(provider: Provider): Promise<boolean> {
        try {
            const response = await window.electronAPI.invoke(IPCChannels.API_TEST, {
                provider,
            });

            if (response.success) {
                return response.data.success;
            } else {
                throw new Error(response.error || 'Failed to test connection');
            }
        } catch (error) {
            this.rootStore.uiStore.showToast((error as Error).message, 'error');
            return false;
        }
    }

    async loadModels(provider: Provider): Promise<void> {
        try {
            const response = await window.electronAPI.invoke(IPCChannels.API_MODELS, {
                provider,
            });

            if (response.success) {
                runInAction(() => {
                    this.availableModels.set(provider, response.data || []);
                });
            } else {
                throw new Error(response.error || 'Failed to load models');
            }
        } catch (error) {
            this.rootStore.uiStore.showToast((error as Error).message, 'error');
        }
    }

    handleSettingsUpdated(settings: Partial<Settings>): void {
        runInAction(() => {
            if (this.settings) {
                this.settings = { ...this.settings, ...settings };
            }
        });
    }
}

// UI Store
export class UIStore {
    isSettingsOpen = false;
    isRenameDialogOpen = false;
    renameConversationId: string | null = null;
    toasts: ToastItem[] = [];
    isLoading = false;
    error: string | null = null;

    constructor(private rootStore: RootStore) {
        makeAutoObservable(this);
    }

    openSettings(): void {
        this.isSettingsOpen = true;
    }

    closeSettings(): void {
        this.isSettingsOpen = false;
    }

    setRenameDialog(conversation: Conversation): void {
        this.renameConversationId = conversation.id;
        this.isRenameDialogOpen = true;
    }

    hideRenameDialog(): void {
        this.isRenameDialogOpen = false;
        this.renameConversationId = null;
    }

    showToast(
        title: string,
        type: ToastItem['type'] = 'info',
        description?: string,
        duration?: number
    ): void {
        const toast: ToastItem = {
            id: Date.now().toString(),
            title,
            type,
            description,
            duration: duration || (type === 'error' ? 5000 : 3000),
        };

        runInAction(() => {
            this.toasts.push(toast);
        });
    }

    removeToast(id: string): void {
        runInAction(() => {
            this.toasts = this.toasts.filter(toast => toast.id !== id);
        });
    }

    setLoading(loading: boolean): void {
        this.isLoading = loading;
    }

    setError(error: string | null): void {
        this.error = error;
    }

    clearError(): void {
        this.error = null;
    }
}

// Root Store
export class RootStore {
    conversationStore: ConversationStore;
    messageStore: MessageStore;
    settingsStore: SettingsStore;
    uiStore: UIStore;

    constructor() {
        this.conversationStore = new ConversationStore(this);
        this.messageStore = new MessageStore(this);
        this.settingsStore = new SettingsStore(this);
        this.uiStore = new UIStore(this);

        // Setup event listeners when DOM is ready
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Wait for electronAPI to be available
        const setupListeners = () => {
            if (!window.electronAPI) {
                setTimeout(setupListeners, 100);
                return;
            }

            // Conversation events
            window.electronAPI.on('conversation:created', (conversation: Conversation) => {
                this.conversationStore.handleConversationCreated(conversation);
            });

            window.electronAPI.on('conversation:updated', (conversation: Conversation) => {
                this.conversationStore.handleConversationUpdated(conversation);
            });

            window.electronAPI.on('conversation:deleted', (id: string) => {
                this.conversationStore.handleConversationDeleted(id);
            });

            // Message events
            window.electronAPI.on('message:created', (message: Message) => {
                this.messageStore.handleMessageCreated(message);
            });

            window.electronAPI.on('message:updated', (message: Message) => {
                this.messageStore.handleMessageUpdated(message);
            });

            window.electronAPI.on('message:deleted', (id: string) => {
                this.messageStore.handleMessageDeleted(id);
            });

            // Stream events
            window.electronAPI.on(IPCChannels.STREAM_START, (data: any) => {
                this.messageStore.handleStreamStart(data);
            });

            window.electronAPI.on(IPCChannels.STREAM_TOKEN, (data: any) => {
                this.messageStore.handleStreamToken(data);
            });

            window.electronAPI.on(IPCChannels.STREAM_END, (data: any) => {
                this.messageStore.handleStreamEnd(data);
            });

            window.electronAPI.on(IPCChannels.STREAM_ERROR, (data: any) => {
                this.messageStore.handleStreamError(data);
            });

            // Settings events
            window.electronAPI.on('settings:updated', (settings: Partial<Settings>) => {
                this.settingsStore.handleSettingsUpdated(settings);
            });

            // Menu events
            window.electronAPI.on('menu:new-conversation', () => {
                this.conversationStore.createConversation();
            });

            window.electronAPI.on('menu:settings', () => {
                this.uiStore.openSettings();
            });
        };

        setupListeners();
    }
}

// Create and export the root store instance
export const rootStore = new RootStore();