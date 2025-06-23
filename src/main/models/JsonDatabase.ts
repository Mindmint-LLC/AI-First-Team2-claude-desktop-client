/**
 * File: src/main/models/JsonDatabase.ts
 * Module: Model - JSON-based Database Implementation
 * Purpose: Provides a file-based database using JSON for data persistence
 * Usage: Instantiate with optional custom path, used by MainController
 * Contains: Database class with CRUD operations for conversations, messages, and settings
 * Dependencies: fs, path, EventEmitter, uuid, electron
 * Iteration: 2
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { app } from 'electron';
import {
    Conversation,
    Message,
    DatabaseAdapter,
    Settings,
    ConversationExport,
    UsageStatistics,
    DatabaseError,
} from '../../shared/types';

// Default settings
const DEFAULT_SETTINGS: Settings = {
    provider: 'claude',
    model: 'claude-3-opus-20240229',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: '',
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

        console.log('[JsonDatabase] Initializing database at:', this.dataPath);

        // Ensure directory exists
        const dir = path.dirname(this.dataPath);
        if (!fs.existsSync(dir)) {
            console.log('[JsonDatabase] Creating directory:', dir);
            fs.mkdirSync(dir, { recursive: true });
        }

        this.loadData();
    }

    private loadData(): void {
        try {
            console.log('[JsonDatabase] Loading data from:', this.dataPath);

            if (fs.existsSync(this.dataPath)) {
                const stats = fs.statSync(this.dataPath);
                console.log('[JsonDatabase] File exists, size:', stats.size, 'bytes');

                // Check if file is empty
                if (stats.size === 0) {
                    console.warn('[JsonDatabase] File is empty, initializing with defaults');
                    this.data = {
                        conversations: {},
                        messages: {},
                        settings: { ...DEFAULT_SETTINGS }
                    };
                    this.saveData();
                    return;
                }

                const rawData = fs.readFileSync(this.dataPath, 'utf8');
                console.log('[JsonDatabase] Raw data length:', rawData.length);

                // Check if data is empty or just whitespace
                if (!rawData.trim()) {
                    console.warn('[JsonDatabase] File contains only whitespace, initializing with defaults');
                    this.data = {
                        conversations: {},
                        messages: {},
                        settings: { ...DEFAULT_SETTINGS }
                    };
                    this.saveData();
                    return;
                }

                try {
                    const parsedData = JSON.parse(rawData);
                    console.log('[JsonDatabase] Successfully parsed JSON data');

                    // Convert date strings back to Date objects
                    this.data = {
                        conversations: {},
                        messages: {},
                        settings: { ...DEFAULT_SETTINGS, ...(parsedData.settings || {}) }
                    };

                    // Process conversations
                    if (parsedData.conversations) {
                        const conversationCount = Object.keys(parsedData.conversations).length;
                        console.log('[JsonDatabase] Processing', conversationCount, 'conversations');

                        for (const [id, conv] of Object.entries(parsedData.conversations)) {
                            const conversation = conv as any;
                            this.data.conversations[id] = {
                                ...conversation,
                                createdAt: new Date(conversation.createdAt),
                                updatedAt: new Date(conversation.updatedAt)
                            };
                        }
                    }

                    // Process messages
                    if (parsedData.messages) {
                        const messageCount = Object.keys(parsedData.messages).length;
                        console.log('[JsonDatabase] Processing', messageCount, 'messages');

                        for (const [id, msg] of Object.entries(parsedData.messages)) {
                            const message = msg as any;
                            this.data.messages[id] = {
                                ...message,
                                timestamp: new Date(message.timestamp)
                            };
                        }
                    }

                    console.log('[JsonDatabase] Data loaded successfully');
                } catch (parseError) {
                    console.error('[JsonDatabase] JSON parse error:', parseError);
                    console.error('[JsonDatabase] Raw data preview:', rawData.substring(0, 200));

                    // Backup corrupted file
                    const backupPath = this.dataPath + '.backup.' + Date.now();
                    console.log('[JsonDatabase] Backing up corrupted file to:', backupPath);
                    fs.copyFileSync(this.dataPath, backupPath);

                    // Initialize with defaults
                    this.data = {
                        conversations: {},
                        messages: {},
                        settings: { ...DEFAULT_SETTINGS }
                    };
                    this.saveData();
                }
            } else {
                console.log('[JsonDatabase] Database file does not exist, creating new one');
                this.data = {
                    conversations: {},
                    messages: {},
                    settings: { ...DEFAULT_SETTINGS }
                };
                this.saveData();
            }
        } catch (error) {
            console.error('[JsonDatabase] Failed to load database:', error);
            this.data = {
                conversations: {},
                messages: {},
                settings: { ...DEFAULT_SETTINGS }
            };
            // Try to save the default data
            try {
                this.saveData();
            } catch (saveError) {
                console.error('[JsonDatabase] Failed to save default data:', saveError);
            }
        }
    }

    private saveData(): void {
        try {
            const jsonData = JSON.stringify(this.data, null, 2);
            console.log('[JsonDatabase] Saving data, size:', jsonData.length, 'bytes');

            // Write to temporary file first
            const tempPath = this.dataPath + '.tmp';
            fs.writeFileSync(tempPath, jsonData);

            // Rename temp file to actual file (atomic operation)
            fs.renameSync(tempPath, this.dataPath);

            console.log('[JsonDatabase] Data saved successfully');
        } catch (error) {
            console.error('[JsonDatabase] Failed to save database:', error);
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

        console.log('[JsonDatabase] Creating conversation:', id, 'with title:', title);

        this.data.conversations[id] = conversation;
        this.saveData();

        // Emit event
        this.emit('conversation:created', conversation);

        return conversation;
    }

    async getConversation(id: string): Promise<Conversation | null> {
        console.log('[JsonDatabase] Getting conversation:', id);
        return this.data.conversations[id] || null;
    }

    async listConversations(limit: number = 50, offset: number = 0): Promise<Conversation[]> {
        console.log('[JsonDatabase] Listing conversations, limit:', limit, 'offset:', offset);

        const conversations = Object.values(this.data.conversations)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(offset, offset + limit);

        console.log('[JsonDatabase] Returning', conversations.length, 'conversations');
        return conversations;
    }

    async updateConversation(id: string, updates: { title?: string }): Promise<Conversation> {
        console.log('[JsonDatabase] Updating conversation:', id, 'with:', updates);

        const conversation = this.data.conversations[id];
        if (!conversation) {
            throw new DatabaseError('Conversation not found', 'update');
        }

        if (updates.title !== undefined) {
            conversation.title = updates.title;
        }

        conversation.updatedAt = new Date();
        this.saveData();

        // Emit event
        this.emit('conversation:updated', conversation);

        return conversation;
    }

    async deleteConversation(id: string): Promise<void> {
        console.log('[JsonDatabase] Deleting conversation:', id);

        const conversation = this.data.conversations[id];
        if (!conversation) {
            throw new DatabaseError('Conversation not found', 'delete');
        }

        // Delete all messages in the conversation
        for (const messageId of conversation.messageIds) {
            delete this.data.messages[messageId];
        }

        // Delete the conversation
        delete this.data.conversations[id];
        this.saveData();

        // Emit event
        this.emit('conversation:deleted', id);
    }

    // Message methods
    async createMessage(
        conversationId: string,
        role: 'user' | 'assistant',
        content: string,
        metadata?: {
            model?: string;
            temperature?: number;
            maxTokens?: number;
            promptTokens?: number;
            completionTokens?: number;
            totalTokens?: number;
            estimatedCost?: number;
            error?: string;
        }
    ): Promise<Message> {
        console.log('[JsonDatabase] Creating message for conversation:', conversationId, 'role:', role);

        const conversation = this.data.conversations[conversationId];
        if (!conversation) {
            throw new DatabaseError('Conversation not found', 'createMessage');
        }

        const id = uuidv4();
        const message: Message = {
            id,
            conversationId,
            role,
            content,
            timestamp: new Date(),
            ...metadata
        };

        this.data.messages[id] = message;
        conversation.messageIds.push(id);
        conversation.updatedAt = new Date();

        // Update conversation stats
        if (metadata?.totalTokens) {
            conversation.totalTokens += metadata.totalTokens;
        }
        if (metadata?.estimatedCost) {
            conversation.estimatedCost += metadata.estimatedCost;
        }

        this.saveData();

        // Emit event
        this.emit('message:created', message);

        return message;
    }

    async getMessage(id: string): Promise<Message | null> {
        console.log('[JsonDatabase] Getting message:', id);
        return this.data.messages[id] || null;
    }

    async getMessages(conversationId: string): Promise<Message[]> {
        console.log('[JsonDatabase] Getting messages for conversation:', conversationId);

        const conversation = this.data.conversations[conversationId];
        if (!conversation) {
            return [];
        }

        const messages = conversation.messageIds
            .map(id => this.data.messages[id])
            .filter(msg => msg !== undefined)
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        console.log('[JsonDatabase] Returning', messages.length, 'messages');
        return messages;
    }

    async updateMessage(id: string, updates: { content?: string; error?: string }): Promise<Message> {
        console.log('[JsonDatabase] Updating message:', id);

        const message = this.data.messages[id];
        if (!message) {
            throw new DatabaseError('Message not found', 'update');
        }

        if (updates.content !== undefined) {
            message.content = updates.content;
        }
        if (updates.error !== undefined) {
            message.error = updates.error;
        }

        this.saveData();

        // Emit event
        this.emit('message:updated', message);

        return message;
    }

    async deleteMessage(id: string): Promise<void> {
        console.log('[JsonDatabase] Deleting message:', id);

        const message = this.data.messages[id];
        if (!message) {
            throw new DatabaseError('Message not found', 'delete');
        }

        // Remove from conversation
        const conversation = this.data.conversations[message.conversationId];
        if (conversation) {
            conversation.messageIds = conversation.messageIds.filter(msgId => msgId !== id);
            conversation.updatedAt = new Date();
        }

        delete this.data.messages[id];
        this.saveData();

        // Emit event
        this.emit('message:deleted', id);
    }

    // Settings methods
    async getSettings(): Promise<Settings> {
        console.log('[JsonDatabase] Getting settings');
        return { ...this.data.settings };
    }

    async updateSettings(updates: Partial<Settings>): Promise<Settings> {
        console.log('[JsonDatabase] Updating settings:', Object.keys(updates));

        this.data.settings = {
            ...this.data.settings,
            ...updates
        };

        this.saveData();

        // Emit event
        this.emit('settings:updated', this.data.settings);

        return { ...this.data.settings };
    }

    // Search methods
    async searchMessages(query: string): Promise<Message[]> {
        console.log('[JsonDatabase] Searching messages with query:', query);

        const lowerQuery = query.toLowerCase();
        const results = Object.values(this.data.messages)
            .filter(msg => msg.content.toLowerCase().includes(lowerQuery))
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        console.log('[JsonDatabase] Found', results.length, 'matching messages');
        return results;
    }

    async searchConversations(query: string): Promise<Conversation[]> {
        console.log('[JsonDatabase] Searching conversations with query:', query);

        const lowerQuery = query.toLowerCase();
        const results = Object.values(this.data.conversations)
            .filter(conv => conv.title.toLowerCase().includes(lowerQuery))
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

        console.log('[JsonDatabase] Found', results.length, 'matching conversations');
        return results;
    }

    // Import/Export methods
    async exportConversation(id: string): Promise<ConversationExport> {
        console.log('[JsonDatabase] Exporting conversation:', id);

        const conversation = this.data.conversations[id];
        if (!conversation) {
            throw new DatabaseError('Conversation not found', 'export');
        }

        const messages = await this.getMessages(id);

        const exportData: ConversationExport = {
            conversation,
            messages,
            exportedAt: new Date(),
            version: '1.0'
        };

        console.log('[JsonDatabase] Exported conversation with', messages.length, 'messages');
        return exportData;
    }

    async importConversation(data: ConversationExport): Promise<Conversation> {
        console.log('[JsonDatabase] Importing conversation');

        // Create new conversation with new ID
        const newConversation = await this.createConversation(data.conversation.title);

        // Import messages with new IDs
        for (const msg of data.messages) {
            await this.createMessage(
                newConversation.id,
                msg.role,
                msg.content,
                {
                    model: msg.model,
                    temperature: msg.temperature,
                    maxTokens: msg.maxTokens,
                    promptTokens: msg.promptTokens,
                    completionTokens: msg.completionTokens,
                    totalTokens: msg.totalTokens,
                    estimatedCost: msg.estimatedCost,
                }
            );
        }

        console.log('[JsonDatabase] Imported conversation with', data.messages.length, 'messages');
        return newConversation;
    }

    // Statistics methods
    async getUsageStatistics(): Promise<UsageStatistics> {
        console.log('[JsonDatabase] Calculating usage statistics');

        const conversations = Object.values(this.data.conversations);
        const messages = Object.values(this.data.messages);

        const stats: UsageStatistics = {
            totalConversations: conversations.length,
            totalMessages: messages.length,
            totalTokens: conversations.reduce((sum, conv) => sum + conv.totalTokens, 0),
            totalCost: conversations.reduce((sum, conv) => sum + conv.estimatedCost, 0),
            messagesByProvider: {},
            tokensByProvider: {},
            costByProvider: {}
        };

        // Calculate provider statistics
        for (const msg of messages) {
            if (msg.model) {
                const provider = this.getProviderFromModel(msg.model);

                // Messages by provider
                stats.messagesByProvider[provider] = (stats.messagesByProvider[provider] || 0) + 1;

                // Tokens by provider
                if (msg.tokenCount) {
                    stats.tokensByProvider[provider] = (stats.tokensByProvider[provider] || 0) + msg.tokenCount;
                }

                // Cost by provider
                if (msg.cost) {
                    stats.costByProvider[provider] = (stats.costByProvider[provider] || 0) + msg.cost;
                }
            }
        }

        console.log('[JsonDatabase] Statistics calculated:', stats);
        return stats;
    }

    private getProviderFromModel(model: string): string {
        if (model.includes('claude')) return 'claude';
        if (model.includes('gpt')) return 'openai';
        if (model.includes('llama') || model.includes('mistral')) return 'ollama';
        return 'unknown';
    }

    // Cleanup
    close(): void {
        console.log('[JsonDatabase] Closing database');
        this.removeAllListeners();
    }
}