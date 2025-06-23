import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { app } from 'electron';
import { EventEmitter } from 'events';
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

interface Usage {
    input: number;
    output: number;
    total: number;
    cost?: {
        input: number;
        output: number;
        total: number;
    };
}

class DatabaseError extends Error {
    constructor(
        message: string,
        public operation: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'DatabaseError';
    }
}

// Default settings
const DEFAULT_SETTINGS: Settings = {
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

interface DatabaseData {
    conversations: Record<string, Conversation>;
    messages: Record<string, Message>;
    settings: Settings;
}

export class Database extends EventEmitter {
    private dataPath: string;
    private data: DatabaseData = {
        conversations: {},
        messages: {},
        settings: { ...DEFAULT_SETTINGS }
    };

    constructor(dbPath?: string) {
        super();
        
        // Use provided path or default to app data directory
        const defaultPath = path.join(app.getPath('userData'), 'conversations.json');
        this.dataPath = dbPath || defaultPath;
        
        // Ensure directory exists
        const dir = path.dirname(this.dataPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.loadData();
    }

    private loadData(): void {
        try {
            if (fs.existsSync(this.dataPath)) {
                const rawData = fs.readFileSync(this.dataPath, 'utf8');
                const parsedData = JSON.parse(rawData);
                
                // Convert date strings back to Date objects
                this.data = {
                    conversations: {},
                    messages: {},
                    settings: { ...DEFAULT_SETTINGS, ...parsedData.settings }
                };

                // Process conversations
                for (const [id, conv] of Object.entries(parsedData.conversations || {})) {
                    const conversation = conv as any;
                    this.data.conversations[id] = {
                        ...conversation,
                        createdAt: new Date(conversation.createdAt),
                        updatedAt: new Date(conversation.updatedAt)
                    };
                }

                // Process messages
                for (const [id, msg] of Object.entries(parsedData.messages || {})) {
                    const message = msg as any;
                    this.data.messages[id] = {
                        ...message,
                        timestamp: new Date(message.timestamp)
                    };
                }
            } else {
                this.data = {
                    conversations: {},
                    messages: {},
                    settings: { ...DEFAULT_SETTINGS }
                };
                this.saveData();
            }
        } catch (error) {
            console.error('Failed to load database:', error);
            this.data = {
                conversations: {},
                messages: {},
                settings: { ...DEFAULT_SETTINGS }
            };
        }
    }

    private saveData(): void {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Failed to save database:', error);
            throw new DatabaseError('Failed to save data', 'save', error as Error);
        }
    }

    // Conversation methods
    async createConversation(title: string = 'New Conversation'): Promise<Conversation> {
        const id = uuidv4();
        const now = new Date();
        
        const conversation: Conversation = {
            id,
            title,
            createdAt: now,
            updatedAt: now,
            messageIds: [],
            totalTokens: 0,
            estimatedCost: 0
        };

        this.data.conversations[id] = conversation;
        this.saveData();
        
        // Emit event
        this.emit('conversation:created', conversation);
        
        return conversation;
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.data.conversations[id] || null;
    }

    async listConversations(limit: number = 50, offset: number = 0): Promise<Conversation[]> {
        const conversations = Object.values(this.data.conversations)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(offset, offset + limit);
        
        return conversations;
    }

    async updateConversation(id: string, updates: { title?: string }): Promise<void> {
        const conversation = this.data.conversations[id];
        if (!conversation) {
            throw new DatabaseError('Conversation not found', 'update');
        }

        if (updates.title !== undefined) {
            conversation.title = updates.title;
        }
        conversation.updatedAt = new Date();

        this.saveData();
        this.emit('conversation:updated', conversation);
    }

    async deleteConversation(id: string): Promise<void> {
        const conversation = this.data.conversations[id];
        if (!conversation) {
            return; // Already deleted
        }

        // Delete associated messages
        for (const messageId of conversation.messageIds) {
            delete this.data.messages[messageId];
        }

        delete this.data.conversations[id];
        this.saveData();
        
        this.emit('conversation:deleted', { id });
    }

    // Message methods
    createMessage(messageData: {
        conversationId: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        model: string;
        provider: Provider;
        tokenCount: number;
        cost: number;
        streaming?: boolean;
    }): Message {
        const id = uuidv4();
        const now = new Date();
        
        const newMessage: Message = {
            id,
            conversationId: messageData.conversationId,
            role: messageData.role,
            content: messageData.content,
            timestamp: now,
            model: messageData.model,
            provider: messageData.provider,
            tokenCount: messageData.tokenCount,
            cost: messageData.cost,
            streaming: messageData.streaming,
        };

        this.data.messages[id] = newMessage;

        // Update conversation
        const conversation = this.data.conversations[messageData.conversationId];
        if (conversation) {
            conversation.messageIds.push(id);
            conversation.updatedAt = now;
            conversation.totalTokens += messageData.tokenCount;
            conversation.estimatedCost += messageData.cost;
        }

        this.saveData();
        
        // Emit event
        this.emit('message:created', newMessage);
        
        return newMessage;
    }

    getMessages(conversationId: string): Message[] {
        const conversation = this.data.conversations[conversationId];
        if (!conversation) {
            return [];
        }

        return conversation.messageIds
            .map(id => this.data.messages[id])
            .filter(Boolean)
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }

    getMessage(id: string): Message | null {
        return this.data.messages[id] || null;
    }

    updateMessage(messageId: string, updates: { 
        content?: string; 
        streaming?: boolean; 
        tokenCount?: number; 
        cost?: number; 
        error?: string 
    }): void {
        const message = this.data.messages[messageId];
        if (!message) {
            throw new DatabaseError('Message not found', 'update');
        }

        if (updates.content !== undefined) message.content = updates.content;
        if (updates.streaming !== undefined) message.streaming = updates.streaming;
        if (updates.tokenCount !== undefined) message.tokenCount = updates.tokenCount;
        if (updates.cost !== undefined) message.cost = updates.cost;
        if (updates.error !== undefined) message.error = updates.error;

        this.saveData();
        this.emit('message:updated', message);
    }

    // Settings methods
    getSettings(): Settings {
        return { ...this.data.settings };
    }

    updateSettings(updates: Partial<Settings>): void {
        this.data.settings = { ...this.data.settings, ...updates };
        this.saveData();
        this.emit('settings:updated', this.data.settings);
    }

    // Utility methods
    close(): void {
        this.saveData();
    }

    vacuum(): void {
        // No-op for JSON database
    }

    // Search methods
    searchMessages(query: string, limit: number = 50): Message[] {
        const messages = Object.values(this.data.messages)
            .filter(message =>
                message.content.toLowerCase().includes(query.toLowerCase())
            )
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);

        return messages;
    }

    searchConversations(query: string, limit: number = 50, offset: number = 0): Conversation[] {
        const conversations = Object.values(this.data.conversations)
            .filter(conversation =>
                conversation.title.toLowerCase().includes(query.toLowerCase())
            )
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(offset, offset + limit);

        return conversations;
    }

    deleteMessage(messageId: string): void {
        const message = this.data.messages[messageId];
        if (!message) {
            return; // Already deleted
        }

        // Remove from conversation
        const conversation = this.data.conversations[message.conversationId];
        if (conversation) {
            conversation.messageIds = conversation.messageIds.filter(id => id !== messageId);
            conversation.totalTokens -= message.tokenCount;
            conversation.estimatedCost -= message.cost;
            conversation.updatedAt = new Date();
        }

        delete this.data.messages[messageId];
        this.saveData();

        this.emit('message:deleted', { id: messageId });
    }

    getUsageStats(): any {
        const messages = Object.values(this.data.messages);
        const conversations = Object.values(this.data.conversations);

        const totalMessages = messages.length;
        const totalConversations = conversations.length;
        const totalTokens = messages.reduce((sum, msg) => sum + msg.tokenCount, 0);
        const totalCost = messages.reduce((sum, msg) => sum + msg.cost, 0);

        // Get current month stats
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const thisMonthMessages = messages.filter(msg => {
            const msgDate = new Date(msg.timestamp);
            return msgDate.getMonth() === currentMonth && msgDate.getFullYear() === currentYear;
        });

        const messagesThisMonth = thisMonthMessages.length;
        const costThisMonth = thisMonthMessages.reduce((sum, msg) => sum + msg.cost, 0);

        // Most used model and provider
        const modelCounts: Record<string, number> = {};
        const providerCounts: Record<string, number> = {};

        messages.forEach(msg => {
            modelCounts[msg.model] = (modelCounts[msg.model] || 0) + 1;
            providerCounts[msg.provider] = (providerCounts[msg.provider] || 0) + 1;
        });

        const mostUsedModel = Object.entries(modelCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || '';
        const mostUsedProvider = Object.entries(providerCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'claude';

        return {
            totalConversations,
            totalMessages,
            totalTokens,
            totalCost,
            messagesThisMonth,
            costThisMonth,
            averageTokensPerMessage: totalMessages > 0 ? totalTokens / totalMessages : 0,
            mostUsedModel,
            mostUsedProvider
        };
    }
}
