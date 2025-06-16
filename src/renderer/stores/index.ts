import { makeAutoObservable, runInAction } from 'mobx';
import {
    Conversation,
    Message,
    Settings,
    Provider,
    ModelInfo,
    UsageStats
} from '@shared/types';

// Declare the electronAPI interface if not already declared globally
declare global {
    interface Window {
        electronAPI: {
            invoke: (channel: string, data?: any) => Promise<any>;
            on: (channel: string, callback: Function) => void;
            off: (channel: string, callback: Function) => void;
            channels: {
                CONVERSATION_LIST: string;
                CONVERSATION_CREATE: string;
                CONVERSATION_UPDATE: string;
                CONVERSATION_DELETE: string;
                MESSAGE_LIST: string;
                MESSAGE_SEND: string;
                MESSAGE_DELETE: string;
                SETTINGS_GET: string;
                SETTINGS_UPDATE: string;
                API_MODELS: string;
                API_TEST: string;
                USAGE_STATS: string;
            };
        };
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
        window.electronAPI.on('message:stream:start', (data: { messageId: string }) => {
            this.messageStore.handleStreamStart(data.messageId);
        });

        window.electronAPI.on('message:stream:token', (data: { messageId: string; token: string; fullContent: string }) => {
            this.messageStore.handleStreamToken(data.messageId, data.token, data.fullContent);
        });

        window.electronAPI.on('message:stream:complete', (data: { messageId: string; fullContent: string; tokenCount: number; cost: number }) => {
            this.messageStore.handleStreamComplete(data.messageId, data.fullContent, data.tokenCount, data.cost);
        });

        window.electronAPI.on('message:stream:error', (data: { messageId: string; error: string }) => {
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
            const result = await window.electronAPI.invoke(window.electronAPI.channels.CONVERSATION_LIST, {
                limit: this.pageSize,
                offset: 0,
            });

            runInAction(() => {
                this.conversations.clear();
                result.conversations.forEach((conv: Conversation) => {
                    this.conversations.set(conv.id, {
                        ...conv,
                        createdAt: new Date(conv.createdAt),
                        updatedAt: new Date(conv.updatedAt),
                    });
                });

                this.totalConversations = result.total;
                this.loadedCount = result.conversations.length;
                this.hasMore = this.loadedCount < this.totalConversations;

                // Select first conversation if none selected
                if (!this.activeConversationId && result.conversations.length > 0) {
                    this.selectConversation(result.conversations[0].id);
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
            const result = await window.electronAPI.invoke(window.electronAPI.channels.CONVERSATION_LIST, {
                limit: this.pageSize,
                offset: this.loadedCount,
            });

            runInAction(() => {
                result.conversations.forEach((conv: Conversation) => {
                    this.conversations.set(conv.id, {
                        ...conv,
                        createdAt: new Date(conv.createdAt),
                        updatedAt: new Date(conv.updatedAt),
                    });
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
            const conversation = await window.electronAPI.invoke(window.electronAPI.channels.CONVERSATION_CREATE, { title });

            runInAction(() => {
                this.conversations.set(conversation.id, {
                    ...conversation,
                    createdAt: new Date(conversation.createdAt),
                    updatedAt: new Date(conversation.updatedAt),
                });
                this.selectConversation(conversation.id);
                this.totalConversations++;
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to create conversation');
        }
    }

    selectConversation(id: string): void {
        this.activeConversationId = id;
        this.rootStore.messageStore.loadMessages(id);
    }

    async renameConversation(id: string, title: string): Promise<void> {
        try {
            const updated = await window.electronAPI.invoke(window.electronAPI.channels.CONVERSATION_UPDATE, {
                id,
                updates: { title },
            });

            runInAction(() => {
                this.conversations.set(id, {
                    ...updated,
                    createdAt: new Date(updated.createdAt),
                    updatedAt: new Date(updated.updatedAt),
                });
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to rename conversation');
        }
    }

    async deleteConversation(id: string): Promise<void> {
        try {
            await window.electronAPI.invoke(window.electronAPI.channels.CONVERSATION_DELETE, { id });

            runInAction(() => {
                this.conversations.delete(id);
                this.totalConversations--;

                if (this.activeConversationId === id) {
                    const remaining = this.conversationList;
                    if (remaining.length > 0) {
                        this.selectConversation(remaining[0].id);
                    } else {
                        this.activeConversationId = null;
                    }
                }
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to delete conversation');
        }
    }

    setSearchQuery(query: string): void {
        this.searchQuery = query;
    }

    // Event handlers
    handleConversationCreated(conversation: Conversation): void {
        this.conversations.set(conversation.id, {
            ...conversation,
            createdAt: new Date(conversation.createdAt),
            updatedAt: new Date(conversation.updatedAt),
        });
    }

    handleConversationUpdated(conversation: Conversation): void {
        this.conversations.set(conversation.id, {
            ...conversation,
            createdAt: new Date(conversation.createdAt),
            updatedAt: new Date(conversation.updatedAt),
        });
    }

    handleConversationDeleted(id: string): void {
        this.conversations.delete(id);
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

    get currentMessages(): Message[] {
        const conversationId = this.rootStore.conversationStore.activeConversationId;
        if (!conversationId) return [];

        return this.messages.get(conversationId) || [];
    }

    async loadMessages(conversationId: string): Promise<void> {
        this.isLoading = true;

        try {
            const messages = await window.electronAPI.invoke(window.electronAPI.channels.MESSAGE_LIST, { conversationId });

            runInAction(() => {
                this.messages.set(conversationId, messages.map((msg: Message) => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp),
                })));
            });
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to load messages');
        } finally {
            runInAction(() => {
                this.isLoading = false;
            });
        }
    }

    async sendMessage(content: string, model?: string, provider?: Provider): Promise<void> {
        const conversationId = this.rootStore.conversationStore.activeConversationId;
        if (!conversationId || this.isSending) return;

        this.isSending = true;

        try {
            const result = await window.electronAPI.invoke(window.electronAPI.channels.MESSAGE_SEND, {
                conversationId,
                content,
                model,
                provider,
            });

            runInAction(() => {
                const messages = this.messages.get(conversationId) || [];
                messages.push(
                    {
                        ...result.userMessage,
                        timestamp: new Date(result.userMessage.timestamp),
                    },
                    {
                        ...result.assistantMessage,
                        timestamp: new Date(result.assistantMessage.timestamp),
                    }
                );
                this.messages.set(conversationId, messages);
                this.streamingMessages.add(result.assistantMessage.id);
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
            await window.electronAPI.invoke(window.electronAPI.channels.MESSAGE_DELETE, { id });

            // Will be handled by event
        } catch (error) {
            this.rootStore.uiStore.showError('Failed to delete message');
        }
    }

    // Event handlers
    handleMessageCreated(message: Message): void {
        const messages = this.messages.get(message.conversationId) || [];
        messages.push({
            ...message,
            timestamp: new Date(message.timestamp),
        });
        this.messages.set(message.conversationId, messages);
    }

    handleMessageUpdated(message: Message): void {
        const messages = this.messages.get(message.conversationId) || [];
        const index = messages.findIndex(m => m.id === message.id);

        if (index >= 0) {
            messages[index] = {
                ...message,
                timestamp: new Date(message.timestamp),
            };
            this.messages.set(message.conversationId, [...messages]);
        }
    }

    handleStreamStart(messageId: string): void {
        this.streamingMessages.add(messageId);
    }

    handleStreamToken(messageId: string, _token: string, fullContent: string): void {
        // Find and update message
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

        // Update message with final data
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
            const settings = await window.electronAPI.invoke(window.electronAPI.channels.SETTINGS_GET, {});

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
            const settings = await window.electronAPI.invoke(window.electronAPI.channels.SETTINGS_UPDATE, updates);

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
            const models = await window.electronAPI.invoke(window.electronAPI.channels.API_MODELS, { provider });

            runInAction(() => {
                this.availableModels.set(provider, models);
            });
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    }

    async testConnection(provider: Provider): Promise<boolean> {
        try {
            const result = await window.electronAPI.invoke(window.electronAPI.channels.API_TEST, { provider });

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
    isExportDialogOpen = false;
    isImportDialogOpen = false;
    usageStats: UsageStats | null = null;

    private rootStore: RootStore;
    private toastIdCounter = 0;

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore;
        makeAutoObservable(this);
    }

    showToast(type: 'success' | 'error' | 'info', message: string): void {
        const id = `toast-${this.toastIdCounter++}`;
        this.toasts.push({ id, type, message });

        // Auto remove after 5 seconds
        setTimeout(() => {
            this.dismissToast(id);
        }, 5000);
    }

    dismissToast(id: string): void {
        this.toasts = this.toasts.filter(t => t.id !== id);
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

    async loadUsageStats(): Promise<void> {
        try {
            const stats = await window.electronAPI.invoke(window.electronAPI.channels.USAGE_STATS, {});

            runInAction(() => {
                this.usageStats = stats;
            });
        } catch (error) {
            this.showError('Failed to load usage statistics');
        }
    }
}

// Create singleton instance
export const rootStore = new RootStore();