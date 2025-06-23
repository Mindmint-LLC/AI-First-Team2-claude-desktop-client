/**
 * File: src/main/models/JsonDatabase.ts
 * Module: Model - JSON-based Database Implementation
 * Purpose: Provides a file-based database using JSON for data persistence
 * Usage: Instantiate with optional custom path, used by MainController
 * Contains: Database class with CRUD operations for conversations, messages, and settings
 * Dependencies: fs, path, EventEmitter, uuid, electron
 * Iteration: 3
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { app } from 'electron';
import {
    Conversation,
    Message,
    Settings,
    UsageStats,
    DatabaseError,
} from '../../shared/types';
import type { Provider } from '../../shared/settings';

// ConversationExport interface for import/export functionality
interface ConversationExport {
    conversation: Conversation;
    messages: Message[];
    exportedAt: Date;
    version: string;
}

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

interface MessageInput {
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    model: string;
    provider: Provider;
    tokenCount: number;
    cost: number;
    metadata?: Record<string, unknown>;
    streaming?: boolean;
    error?: string;
}

interface MessageUpdate {
    content?: string;
    error?: string;
    tokenCount?: number;
    cost?: number;
    streaming?: boolean;
    metadata?: Record<string, unknown>;
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
                    const backupPath = `${this.dataPath  }.backup.${  Date.now()}`;
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
            const tempPath = `${this.dataPath  }.tmp`;
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
    createConversation(title: string = 'New Conversation'): Conversation {
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

    getConversation(id: string): Conversation | null {
        console.log('[JsonDatabase] Getting conversation:', id);
        return this.data.conversations[id] || null;
    }

    listConversations(limit: number = 50, offset: number = 0): { conversations: Conversation[]; total: number } {
        console.log('[JsonDatabase] Listing conversations, limit:', limit, 'offset:', offset);

        const allConversations = Object.values(this.data.conversations)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

        const conversations = allConversations.slice(offset, offset + limit);

        console.log('[JsonDatabase] Returning', conversations.length, 'of', allConversations.length, 'conversations');
        return {
            conversations,
            total: allConversations.length
        };
    }

    updateConversation(id: string, updates: Partial<Conversation>): Conversation {
        console.log('[JsonDatabase] Updating conversation:', id, 'with:', updates);

        const conversation = this.data.conversations[id];
        if (!conversation) {
            throw new DatabaseError('Conversation not found', 'update');
        }

        // Apply updates
        Object.assign(conversation, updates);
        conversation.updatedAt = new Date();

        this.saveData();

        // Emit event
        this.emit('conversation:updated', conversation);

        return conversation;
    }

    deleteConversation(id: string): void {
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
    createMessage(messageInput: MessageInput): Message {
        console.log('[JsonDatabase] Creating message for conversation:', messageInput.conversationId, 'role:', messageInput.role);

        const conversation = this.data.conversations[messageInput.conversationId];
        if (!conversation) {
            throw new DatabaseError('Conversation not found', 'createMessage');
        }

        const id = uuidv4();
        const message: Message = {
            id,
            conversationId: messageInput.conversationId,
            role: messageInput.role,
            content: messageInput.content,
            timestamp: new Date(),
            model: messageInput.model,
            provider: messageInput.provider,
            tokenCount: messageInput.tokenCount,
            cost: messageInput.cost,
            metadata: messageInput.metadata,
            streaming: messageInput.streaming,
            error: messageInput.error,
        };

        this.data.messages[id] = message;
        conversation.messageIds.push(id);
        conversation.updatedAt = new Date();

        // Update conversation stats
        conversation.totalTokens += messageInput.tokenCount;
        conversation.estimatedCost += messageInput.cost;

        this.saveData();

        // Emit event
        this.emit('message:created', message);

        return message;
    }

    getMessage(id: string): Message | null {
        console.log('[JsonDatabase] Getting message:', id);
        return this.data.messages[id] || null;
    }

    getMessages(conversationId: string): Message[] {
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

    updateMessage(id: string, updates: MessageUpdate): Message {
        console.log('[JsonDatabase] Updating message:', id);

        const message = this.data.messages[id];
        if (!message) {
            throw new DatabaseError('Message not found', 'update');
        }

        // Apply updates
        if (updates.content !== undefined) {
            message.content = updates.content;
        }
        if (updates.error !== undefined) {
            message.error = updates.error;
        }
        if (updates.tokenCount !== undefined) {
            message.tokenCount = updates.tokenCount;
        }
        if (updates.cost !== undefined) {
            message.cost = updates.cost;
        }
        if (updates.streaming !== undefined) {
            message.streaming = updates.streaming;
        }
        if (updates.metadata !== undefined) {
            message.metadata = updates.metadata;
        }

        this.saveData();

        // Emit event
        this.emit('message:updated', message);

        return message;
    }

    deleteMessage(id: string): void {
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
    getSettings(): Settings {
        console.log('[JsonDatabase] Getting settings');
        return { ...this.data.settings };
    }

    updateSettings(updates: Partial<Settings>): Settings {
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
    searchMessages(query: string): Message[] {
        console.log('[JsonDatabase] Searching messages with query:', query);

        const lowerQuery = query.toLowerCase();
        const results = Object.values(this.data.messages)
            .filter(msg => msg.content.toLowerCase().includes(lowerQuery))
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        console.log('[JsonDatabase] Found', results.length, 'matching messages');
        return results;
    }

    searchConversations(query: string, limit: number = 50, offset: number = 0): Conversation[] {
        console.log('[JsonDatabase] Searching conversations with query:', query);

        const lowerQuery = query.toLowerCase();
        const allResults = Object.values(this.data.conversations)
            .filter(conv => conv.title.toLowerCase().includes(lowerQuery))
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

        const results = allResults.slice(offset, offset + limit);

        console.log('[JsonDatabase] Found', results.length, 'of', allResults.length, 'matching conversations');
        return results;
    }

    // Import/Export methods
    exportConversation(id: string): ConversationExport {
        console.log('[JsonDatabase] Exporting conversation:', id);

        const conversation = this.data.conversations[id];
        if (!conversation) {
            throw new DatabaseError('Conversation not found', 'export');
        }

        const messages = this.getMessages(id);

        const exportData: ConversationExport = {
            conversation,
            messages,
            exportedAt: new Date(),
            version: '1.0'
        };

        console.log('[JsonDatabase] Exported conversation with', messages.length, 'messages');
        return exportData;
    }

    importConversation(data: ConversationExport): Conversation {
        console.log('[JsonDatabase] Importing conversation');

        // Create new conversation with new ID
        const newConversation = this.createConversation(data.conversation.title);

        // Import messages with new IDs
        for (const msg of data.messages) {
            this.createMessage({
                conversationId: newConversation.id,
                role: msg.role,
                content: msg.content,
                model: msg.model,
                provider: msg.provider,
                tokenCount: msg.tokenCount,
                cost: msg.cost,
                metadata: msg.metadata,
                streaming: msg.streaming,
                error: msg.error,
            });
        }

        console.log('[JsonDatabase] Imported conversation with', data.messages.length, 'messages');
        return newConversation;
    }

    // Statistics methods
    getUsageStatistics(): UsageStats {
        console.log('[JsonDatabase] Calculating usage statistics');

        const conversations = Object.values(this.data.conversations);
        const messages = Object.values(this.data.messages);

        const totalTokens = conversations.reduce((sum, conv) => sum + conv.totalTokens, 0);
        const totalCost = conversations.reduce((sum, conv) => sum + conv.estimatedCost, 0);

        // Calculate current month stats
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const messagesThisMonth = messages.filter(msg => {
            const msgDate = new Date(msg.timestamp);
            return msgDate.getMonth() === currentMonth && msgDate.getFullYear() === currentYear;
        }).length;

        const costThisMonth = conversations
            .filter(conv => {
                const convDate = new Date(conv.updatedAt);
                return convDate.getMonth() === currentMonth && convDate.getFullYear() === currentYear;
            })
            .reduce((sum, conv) => sum + conv.estimatedCost, 0);

        // Find most used model and provider
        const modelCounts: Record<string, number> = {};
        const providerCounts: Record<string, number> = {};

        messages.forEach(msg => {
            if (msg.model) {
                modelCounts[msg.model] = (modelCounts[msg.model] || 0) + 1;
            }
            if (msg.provider) {
                providerCounts[msg.provider] = (providerCounts[msg.provider] || 0) + 1;
            }
        });

        const mostUsedModel = Object.entries(modelCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';

        const mostUsedProvider = Object.entries(providerCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] as Provider || 'claude';

        const stats: UsageStats = {
            totalConversations: conversations.length,
            totalMessages: messages.length,
            totalTokens,
            totalCost,
            messagesThisMonth,
            costThisMonth,
            averageTokensPerMessage: messages.length > 0 ? totalTokens / messages.length : 0,
            mostUsedModel,
            mostUsedProvider,
        };

        console.log('[JsonDatabase] Statistics calculated:', stats);
        return stats;
    }

    // Cleanup
    close(): void {
        console.log('[JsonDatabase] Closing database');
        this.removeAllListeners();
    }
}