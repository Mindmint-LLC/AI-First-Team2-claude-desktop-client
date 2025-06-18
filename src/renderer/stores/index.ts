/**
 * File: src/renderer/stores/index.ts
 * Module: Renderer State Management (View/Controller)
 * Purpose: MobX stores for managing application state in renderer process
 * Usage: Import RootStore and use in React components with observer
 * Contains: RootStore, ConversationStore, MessageStore, SettingsStore, UIStore
 * Dependencies: mobx, electron API types
 * Iteration: 2
 */

import { makeAutoObservable, runInAction } from 'mobx';
import {
    Conversation,
    Message,
    Settings,
    Provider,
    ModelInfo,
    UsageStats
} from '@shared/types';
import { IPCChannels } from '@shared/constants';
// Import the shared ElectronAPI type instead of declaring it here
import type { ElectronAPI } from '@shared/electron-api';

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

        // Setup event listeners - defer to ensure electronAPI is available
        if (typeof window !== 'undefined' && window.electronAPI) {
            this.setupEventListeners();
        } else {
            // Wait for DOM to be ready
            if (typeof window !== 'undefined') {
                window.addEventListener('DOMContentLoaded', () => {
                    if (window.electronAPI) {
                        this.setupEventListeners();
                    } else {
                        console.error('electronAPI not found on window object');
                    }
                });
            }
        }
    }

    private setupEventListeners(): void {
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

        // Stream events
        window.electronAPI.on('stream:start', (data: { messageId: string }) => {
            this.messageStore.handleStreamStart(data.messageId);
        });

        window.electronAPI.on('stream:token', (data: { messageId: string; token: string; fullContent: string }) => {
            this.messageStore.handleStreamToken(data.messageId, data.token, data.fullContent);
        });

        window.electronAPI.on('stream:end', (data: { messageId: string; fullContent: string; tokenCount: number; cost: number }) => {
            this.messageStore.handleStreamComplete(data.messageId, data.fullContent, data.tokenCount, data.cost);
        });

        window.electronAPI.on('stream:error', (data: { messageId: string; error: string }) => {
            this.messageStore.handleStreamError(data.messageId, data.error);
        });

        // Settings events
        window.electronAPI.on('settings:updated', (settings: Settings) => {
            this.settingsStore.handleSettingsUpdated(settings);
        });

        // Menu events
        window.electronAPI.on('menu:new-conversation', () => {
            this.conversationStore.createConversation();
        });

        window.electronAPI.on('menu:settings', () => {
            this.uiStore.showSettings();
        });

        window.electronAPI.on('menu:rename-conversation', () => {
            if (this.conversationStore.activeConversation) {
                this.uiStore.showRenameDialog(this.conversationStore.activeConversation.id);
            }
        });

        window.electronAPI.on('menu:delete-conversation', () => {
            if (this.conversationStore.activeConversation) {
                this.conversationStore.deleteConversation(this.conversationStore.activeConversation.id);
            }
        });
    }
}

// Conversation Store
export class ConversationStore {
    conversations: Map<string, Conversation> = new Map();
    activeConversationId: string | null = null;
    isLoading = false;
    hasMore = true;
    searchQuery = '';
    totalConversations = 0;

    private rootStore: RootStore;
    private loadedCount = 0;
    private pageSize = 50;

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore;
        makeAutoObservable(this);

        // Only load if electronAPI is available
        if (typeof window !== 'undefined' && window.electronAPI) {
            this.loadInitialConversations();
        } else if (typeof window !== 'undefined') {
            window.addEventListener('DOMContentLoaded', () => {
                if (window.electronAPI) {
                    this.loadInitialConversations();
                }
            });
        }
    }

    get conversationList(): Conversation[] {
        const list = Array.from(this.conversations.values());

        if (this.searchQuery) {
            return list.filter(conv =>
                conv.title.toLowerCase().includes(this.searchQuery.toLowerCase())
            );
        }

        return list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    get activeConversation(): Conversation | null {
        if (!this.activeConversationId) return null;
        return this.conversations.get(this.activeConversationId) || null;
    }

    async loadInitialConversations(): Promise<void> {
        this.isLoading = true;

        try {
            const result = await window.electronAPI.invoke(IPCChannels.GET_CONVERSATIONS, {
                limit: this.pageSize,
                offset: 0,
            });

            runInAction(() => {
                this.conversations.clear();
                result.conversations.forEach((conv: Conversation) => {
                    this.conversations.set(conv.id, conv);
                });
                this.totalConversations = result.total;
                this.loadedCount = result.conversations.length;
                this.hasMore = this.loadedCount < this.totalConversations;

                // Set active conversation to the most recent
                if (result.conversations.length > 0 && !this.activeConversationId) {
                    this.activeConversationId = result.conversations[0].id;
                }
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to load conversations');
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async loadMoreConversations(): Promise<void> {
        if (this.isLoading || !this.hasMore) return;

        this.isLoading = true;

        try {
            const result = await window.electronAPI.invoke(IPCChannels.GET_CONVERSATIONS, {
                limit: this.pageSize,
                offset: this.loadedCount,
            });

            runInAction(() => {
                result.conversations.forEach((conv: Conversation) => {
                    this.conversations.set(conv.id, conv);
                });
                this.loadedCount += result.conversations.length;
                this.hasMore = this.loadedCount < this.totalConversations;
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to load more conversations');
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async createConversation(title?: string): Promise<void> {
        try {
            const conversation = await window.electronAPI.invoke(IPCChannels.CREATE_CONVERSATION, { title });

            runInAction(() => {
                this.conversations.set(conversation.id, conversation);
                this.activeConversationId = conversation.id;
                this.totalConversations++;
            });

            this.rootStore.uiStore.showSuccess('Conversation created');
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to create conversation');
        }
    }

    async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
        try {
            const conversation = await window.electronAPI.invoke(IPCChannels.UPDATE_CONVERSATION, { id, updates });

            runInAction(() => {
                this.conversations.set(id, conversation);
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to update conversation');
        }
    }

    async deleteConversation(id: string): Promise<void> {
        try {
            await window.electronAPI.invoke(IPCChannels.DELETE_CONVERSATION, { id });

            runInAction(() => {
                this.conversations.delete(id);
                this.totalConversations--;

                if (this.activeConversationId === id) {
                    const remaining = this.conversationList;
                    this.activeConversationId = remaining.length > 0 ? remaining[0].id : null;
                }
            });

            this.rootStore.uiStore.showSuccess('Conversation deleted');
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to delete conversation');
        }
    }

    setActiveConversation(id: string): void {
        if (this.conversations.has(id)) {
            this.activeConversationId = id;
            // Load messages for the conversation
            this.rootStore.messageStore.loadMessages(id);
        }
    }

    setSearchQuery(query: string): void {
        this.searchQuery = query;
    }

    handleConversationCreated(conversation: Conversation): void {
        this.conversations.set(conversation.id, conversation);
        this.totalConversations++;
    }

    handleConversationUpdated(conversation: Conversation): void {
        this.conversations.set(conversation.id, conversation);
    }

    handleConversationDeleted(id: string): void {
        this.conversations.delete(id);
        this.totalConversations--;

        if (this.activeConversationId === id) {
            const remaining = this.conversationList;
            this.activeConversationId = remaining.length > 0 ? remaining[0].id : null;
        }
    }
}

// Message Store
export class MessageStore {
    messages: Map<string, Message[]> = new Map();
    streamingMessages: Set<string> = new Set();
    isLoading = false;
    isSending = false;

    private rootStore: RootStore;

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore;
        makeAutoObservable(this);
    }

    getMessages(conversationId: string): Message[] {
        return this.messages.get(conversationId) || [];
    }

    async loadMessages(conversationId: string): Promise<void> {
        if (this.messages.has(conversationId)) return;

        this.isLoading = true;

        try {
            const messages = await window.electronAPI.invoke(IPCChannels.GET_MESSAGES, { conversationId });

            runInAction(() => {
                this.messages.set(conversationId, messages);
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to load messages');
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async sendMessage(content: string): Promise<void> {
        const conversationId = this.rootStore.conversationStore.activeConversationId;
        if (!conversationId || this.isSending) return;

        this.isSending = true;

        try {
            const response = await window.electronAPI.invoke(IPCChannels.SEND_MESSAGE, {
                conversationId,
                content,
            });

            runInAction(() => {
                // Messages will be added via event handlers
                this.streamingMessages.add(response.assistantMessage.id);
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to send message');
        } finally {
            runInAction(() => {
                this.isSending = false;
            });
        }
    }

    async deleteMessage(id: string): Promise<void> {
        try {
            await window.electronAPI.invoke(IPCChannels.DELETE_MESSAGE, { id });

            // Remove from local state
            for (const [conversationId, messages] of this.messages.entries()) {
                const filtered = messages.filter(m => m.id !== id);
                if (filtered.length !== messages.length) {
                    runInAction(() => {
                        this.messages.set(conversationId, filtered);
                    });
                    break;
                }
            }
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to delete message');
        }
    }

    handleMessageCreated(message: Message): void {
        const messages = this.messages.get(message.conversationId) || [];
        this.messages.set(message.conversationId, [...messages, message]);
    }

    handleMessageUpdated(message: Message): void {
        const messages = this.messages.get(message.conversationId) || [];
        const index = messages.findIndex(m => m.id === message.id);

        if (index !== -1) {
            const updated = [...messages];
            updated[index] = message;
            this.messages.set(message.conversationId, updated);
        }
    }

    handleStreamStart(messageId: string): void {
        this.streamingMessages.add(messageId);
    }

    handleStreamToken(messageId: string, _token: string, fullContent: string): void {
        // Find and update the message
        for (const [conversationId, messages] of this.messages.entries()) {
            const message = messages.find(m => m.id === messageId);
            if (message) {
                message.content = fullContent;
                this.messages.set(conversationId, [...messages]);
                break;
            }
        }
    }

    handleStreamComplete(messageId: string, fullContent: string, tokenCount: number, cost: number): void {
        this.streamingMessages.delete(messageId);

        // Update message with final content
        for (const [conversationId, messages] of this.messages.entries()) {
            const message = messages.find(m => m.id === messageId);
            if (message) {
                message.content = fullContent;
                message.tokenCount = tokenCount;
                message.cost = cost;
                message.streaming = false;
                this.messages.set(conversationId, [...messages]);
                break;
            }
        }
    }

    handleStreamError(messageId: string, error: string): void {
        this.streamingMessages.delete(messageId);

        // Update message with error
        for (const [conversationId, messages] of this.messages.entries()) {
            const message = messages.find(m => m.id === messageId);
            if (message) {
                message.error = error;
                message.streaming = false;
                this.messages.set(conversationId, [...messages]);
                break;
            }
        }

        this.rootStore.uiStore.showError(`Message failed: ${error}`);
    }
}

// Settings Store
export class SettingsStore {
    settings: Settings | null = null;
    availableModels: Map<Provider, ModelInfo[]> = new Map();
    isLoading = false;

    private rootStore: RootStore;

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore;
        makeAutoObservable(this);

        // Only load if electronAPI is available
        if (typeof window !== 'undefined' && window.electronAPI) {
            this.loadSettings();
        } else if (typeof window !== 'undefined') {
            window.addEventListener('DOMContentLoaded', () => {
                if (window.electronAPI) {
                    this.loadSettings();
                }
            });
        }
    }

    async loadSettings(): Promise<void> {
        this.isLoading = true;

        try {
            const settings = await window.electronAPI.invoke(IPCChannels.GET_SETTINGS, {});

            runInAction(() => {
                this.settings = settings;
            });

            // Load available models for current provider
            if (settings.provider) {
                this.loadModels(settings.provider);
            }
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to load settings');
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async updateSettings(updates: Partial<Settings>): Promise<void> {
        try {
            const settings = await window.electronAPI.invoke(IPCChannels.UPDATE_SETTINGS, updates);

            runInAction(() => {
                this.settings = settings;
            });

            this.rootStore.uiStore.showSuccess('Settings updated');
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to update settings');
        }
    }

    async loadModels(provider: Provider): Promise<void> {
        try {
            const models = await window.electronAPI.invoke(IPCChannels.GET_MODELS, { provider });

            runInAction(() => {
                this.availableModels.set(provider, models);
            });
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    }

    async testConnection(provider: Provider): Promise<boolean> {
        try {
            const result = await window.electronAPI.invoke(IPCChannels.TEST_CONNECTION, { provider });

            if (result.success) {
                this.rootStore.uiStore.showSuccess(`${provider} connection successful`);
            } else {
                this.rootStore.uiStore.showError(`${provider} connection failed`);
            }

            return result.success;
        } catch (error) {
            this.rootStore.uiStore.showError(`Failed to test ${provider} connection`);
            return false;
        }
    }

    handleSettingsUpdated(settings: Settings): void {
        this.settings = settings;
    }
}

// UI Store
export class UIStore {
    toasts: Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }> = [];
    isSettingsOpen = false;
    isRenameDialogOpen = false;
    renameConversationId: string | null = null;

    private rootStore: RootStore;

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore;
        makeAutoObservable(this);
    }

    showToast(type: 'success' | 'error' | 'info', message: string): void {
        const id = Date.now().toString();
        this.toasts.push({ id, type, message });

        // Auto-remove after 5 seconds
        setTimeout(() => {
            runInAction(() => {
                this.toasts = this.toasts.filter(t => t.id !== id);
            });
        }, 5000);
    }

    showSuccess(message: string): void {
        this.showToast('success', message);
    }

    showError(message: string): void {
        this.showToast('error', message);
    }

    showInfo(message: string): void {
        this.showToast('info', message);
    }

    removeToast(id: string): void {
        this.toasts = this.toasts.filter(t => t.id !== id);
    }

    showSettings(): void {
        this.isSettingsOpen = true;
    }

    hideSettings(): void {
        this.isSettingsOpen = false;
    }

    showRenameDialog(conversationId: string): void {
        this.renameConversationId = conversationId;
        this.isRenameDialogOpen = true;
    }

    hideRenameDialog(): void {
        this.isRenameDialogOpen = false;
        this.renameConversationId = null;
    }
}

// Export singleton instance
export const rootStore = new RootStore();