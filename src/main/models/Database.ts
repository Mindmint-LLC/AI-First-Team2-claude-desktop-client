import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { EventEmitter } from 'events';
import { Conversation, Message, Settings, DatabaseError, SettingsSchema } from '@shared/types';
import { v4 as uuidv4 } from 'uuid';

export class DatabaseManager extends EventEmitter {
    private db: Database.Database;
    private readonly dbPath: string;
    private cache: Map<string, Conversation> = new Map();

    constructor() {
        super();
        this.dbPath = path.join(app.getPath('userData'), 'claude-desktop.db');
        this.db = new Database(this.dbPath);
        this.initialize();
    }

    private initialize(): void {
        try {
            // Enable foreign keys and WAL mode
            this.db.pragma('foreign_keys = ON');
            this.db.pragma('journal_mode = WAL');

            // Create tables
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          message_ids TEXT NOT NULL DEFAULT '[]',
          total_tokens INTEGER NOT NULL DEFAULT 0,
          estimated_cost REAL NOT NULL DEFAULT 0,
          metadata TEXT
        );
        
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          model TEXT NOT NULL,
          provider TEXT NOT NULL,
          token_count INTEGER NOT NULL DEFAULT 0,
          cost REAL NOT NULL DEFAULT 0,
          metadata TEXT,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
        
        -- FTS5 for search
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          content,
          content=messages,
          content_rowid=rowid
        );
        
        -- Triggers for FTS
        CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(content) VALUES (new.content);
        END;
        
        CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
          UPDATE messages_fts SET content = new.content WHERE rowid = new.rowid;
        END;
        
        CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid;
        END;
      `);

            // Initialize default settings if not exists
            this.initializeSettings();
        } catch (error) {
            throw new DatabaseError('Failed to initialize database', 'initialize', error as Error);
        }
    }

    private initializeSettings(): void {
        const defaultSettings: Settings = {
            provider: 'claude',
            model: 'claude-3-opus-20240229',
            temperature: 0.7,
            maxTokens: 2048,
            systemPrompt: '',
            apiKeys: { claude: '', openai: '', ollama: '' },
            retryAttempts: 3,
            streamRateLimit: 30,
            theme: 'dark',
        };

        const existing = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('config');
        if (!existing) {
            this.updateSettings(defaultSettings);
        }
    }

    // Conversation Operations
    createConversation(title: string = 'New Conversation'): Conversation {
        try {
            const conversation: Conversation = {
                id: uuidv4(),
                title,
                createdAt: new Date(),
                updatedAt: new Date(),
                messageIds: [],
                totalTokens: 0,
                estimatedCost: 0,
            };

            const stmt = this.db.prepare(`
        INSERT INTO conversations (id, title, created_at, updated_at, message_ids, total_tokens, estimated_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

            stmt.run(
                conversation.id,
                conversation.title,
                conversation.createdAt.getTime(),
                conversation.updatedAt.getTime(),
                JSON.stringify(conversation.messageIds),
                conversation.totalTokens,
                conversation.estimatedCost
            );

            this.cache.set(conversation.id, conversation);
            this.emit('conversation:created', conversation);

            return conversation;
        } catch (error) {
            throw new DatabaseError('Failed to create conversation', 'createConversation', error as Error);
        }
    }

    getConversation(id: string): Conversation | null {
        if (this.cache.has(id)) {
            return this.cache.get(id)!;
        }

        try {
            const row = this.db.prepare(`
        SELECT * FROM conversations WHERE id = ?
      `).get(id);

            if (!row) return null;

            const conversation = this.rowToConversation(row);
            this.cache.set(id, conversation);

            return conversation;
        } catch (error) {
            throw new DatabaseError('Failed to get conversation', 'getConversation', error as Error);
        }
    }

    listConversations(limit: number = 50, offset: number = 0): { conversations: Conversation[]; total: number } {
        try {
            const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM conversations');
            const total = (countStmt.get() as any).count;

            const stmt = this.db.prepare(`
        SELECT * FROM conversations
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `);

            const rows = stmt.all(limit, offset);
            const conversations = rows.map(row => this.rowToConversation(row));

            // Update cache
            conversations.forEach(conv => this.cache.set(conv.id, conv));

            return { conversations, total };
        } catch (error) {
            throw new DatabaseError('Failed to list conversations', 'listConversations', error as Error);
        }
    }

    updateConversation(id: string, updates: Partial<Conversation>): Conversation {
        try {
            const conversation = this.getConversation(id);
            if (!conversation) {
                throw new Error(`Conversation ${id} not found`);
            }

            const updated = { ...conversation, ...updates, updatedAt: new Date() };

            const stmt = this.db.prepare(`
        UPDATE conversations
        SET title = ?, updated_at = ?, message_ids = ?, total_tokens = ?, estimated_cost = ?
        WHERE id = ?
      `);

            stmt.run(
                updated.title,
                updated.updatedAt.getTime(),
                JSON.stringify(updated.messageIds),
                updated.totalTokens,
                updated.estimatedCost,
                id
            );

            this.cache.set(id, updated);
            this.emit('conversation:updated', updated);

            return updated;
        } catch (error) {
            throw new DatabaseError('Failed to update conversation', 'updateConversation', error as Error);
        }
    }

    deleteConversation(id: string): void {
        try {
            this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
            this.cache.delete(id);
            this.emit('conversation:deleted', id);
        } catch (error) {
            throw new DatabaseError('Failed to delete conversation', 'deleteConversation', error as Error);
        }
    }

    // Message Operations
    createMessage(message: Omit<Message, 'id'>): Message {
        try {
            const newMessage: Message = {
                ...message,
                id: uuidv4(),
            };

            const stmt = this.db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, timestamp, model, provider, token_count, cost, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

            this.db.transaction(() => {
                stmt.run(
                    newMessage.id,
                    newMessage.conversationId,
                    newMessage.role,
                    newMessage.content,
                    newMessage.timestamp.getTime(),
                    newMessage.model,
                    newMessage.provider,
                    newMessage.tokenCount,
                    newMessage.cost,
                    JSON.stringify(newMessage.metadata || {})
                );

                // Update conversation
                const conversation = this.getConversation(newMessage.conversationId);
                if (conversation) {
                    conversation.messageIds.push(newMessage.id);
                    conversation.totalTokens += newMessage.tokenCount;
                    conversation.estimatedCost += newMessage.cost;
                    this.updateConversation(conversation.id, conversation);
                }
            })();

            this.emit('message:created', newMessage);
            return newMessage;
        } catch (error) {
            throw new DatabaseError('Failed to create message', 'createMessage', error as Error);
        }
    }

    getMessage(id: string): Message | null {
        try {
            const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
            return row ? this.rowToMessage(row) : null;
        } catch (error) {
            throw new DatabaseError('Failed to get message', 'getMessage', error as Error);
        }
    }

    getMessages(conversationId: string): Message[] {
        try {
            const stmt = this.db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY timestamp ASC
      `);

            const rows = stmt.all(conversationId);
            return rows.map(row => this.rowToMessage(row));
        } catch (error) {
            throw new DatabaseError('Failed to get messages', 'getMessages', error as Error);
        }
    }

    updateMessage(id: string, updates: Partial<Message>): Message {
        try {
            const message = this.getMessage(id);
            if (!message) {
                throw new Error(`Message ${id} not found`);
            }

            const updated = { ...message, ...updates };

            const stmt = this.db.prepare(`
        UPDATE messages
        SET content = ?, token_count = ?, cost = ?, metadata = ?
        WHERE id = ?
      `);

            this.db.transaction(() => {
                stmt.run(
                    updated.content,
                    updated.tokenCount,
                    updated.cost,
                    JSON.stringify(updated.metadata || {}),
                    id
                );

                // Update conversation tokens/cost if changed
                if (updated.tokenCount !== message.tokenCount || updated.cost !== message.cost) {
                    const conversation = this.getConversation(message.conversationId);
                    if (conversation) {
                        conversation.totalTokens += (updated.tokenCount - message.tokenCount);
                        conversation.estimatedCost += (updated.cost - message.cost);
                        this.updateConversation(conversation.id, conversation);
                    }
                }
            })();

            this.emit('message:updated', updated);
            return updated;
        } catch (error) {
            throw new DatabaseError('Failed to update message', 'updateMessage', error as Error);
        }
    }

    deleteMessage(id: string): void {
        try {
            const message = this.getMessage(id);
            if (!message) return;

            this.db.transaction(() => {
                this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);

                // Update conversation
                const conversation = this.getConversation(message.conversationId);
                if (conversation) {
                    conversation.messageIds = conversation.messageIds.filter(mid => mid !== id);
                    conversation.totalTokens -= message.tokenCount;
                    conversation.estimatedCost -= message.cost;
                    this.updateConversation(conversation.id, conversation);
                }
            })();

            this.emit('message:deleted', id);
        } catch (error) {
            throw new DatabaseError('Failed to delete message', 'deleteMessage', error as Error);
        }
    }

    // Settings Operations
    getSettings(): Settings {
        try {
            const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('config');
            if (!row) {
                this.initializeSettings();
                return this.getSettings();
            }

            const settings = JSON.parse((row as any).value);
            return <Settings>SettingsSchema.parse(settings);
        } catch (error) {
            throw new DatabaseError('Failed to get settings', 'getSettings', error as Error);
        }
    }

    updateSettings(settings: Partial<Settings>): Settings {
        try {
            const current = this.getSettings();
            const updated = { ...current, ...settings };

            const validated = SettingsSchema.parse(updated);

            const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `);

            stmt.run('config', JSON.stringify(validated), Date.now());

            this.emit('settings:updated', validated);
            return <Settings>validated;
        } catch (error) {
            throw new DatabaseError('Failed to update settings', 'updateSettings', error as Error);
        }
    }

    // Search Operations
    searchMessages(query: string, limit: number = 50): Message[] {
        try {
            const stmt = this.db.prepare(`
        SELECT m.* FROM messages m
        JOIN messages_fts ON m.rowid = messages_fts.rowid
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

            const rows = stmt.all(query, limit);
            return rows.map(row => this.rowToMessage(row));
        } catch (error) {
            throw new DatabaseError('Failed to search messages', 'searchMessages', error as Error);
        }
    }

    // Usage Statistics
    getUsageStats(): any {
        try {
            const stats = {
                totalConversations: (this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as any).count,
                totalMessages: (this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as any).count,
                totalTokens: (this.db.prepare('SELECT SUM(total_tokens) as sum FROM conversations').get() as any).sum || 0,
                totalCost: (this.db.prepare('SELECT SUM(estimated_cost) as sum FROM conversations').get() as any).sum || 0,
                byProvider: {} as Record<string, any>,
                byModel: {} as Record<string, any>,
                dailyUsage: [] as any[],
            };

            // By provider
            const providerStats = this.db.prepare(`
        SELECT provider, COUNT(*) as messages, SUM(token_count) as tokens, SUM(cost) as cost
        FROM messages
        GROUP BY provider
      `).all();

            providerStats.forEach((row: any) => {
                stats.byProvider[row.provider] = {
                    messages: row.messages,
                    tokens: row.tokens || 0,
                    cost: row.cost || 0,
                };
            });

            // By model
            const modelStats = this.db.prepare(`
        SELECT model, COUNT(*) as messages, SUM(token_count) as tokens, SUM(cost) as cost
        FROM messages
        GROUP BY model
      `).all();

            modelStats.forEach((row: any) => {
                stats.byModel[row.model] = {
                    messages: row.messages,
                    tokens: row.tokens || 0,
                    cost: row.cost || 0,
                };
            });

            // Daily usage (last 30 days)
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const dailyStats = this.db.prepare(`
        SELECT 
          DATE(timestamp / 1000, 'unixepoch') as date,
          SUM(token_count) as tokens,
          SUM(cost) as cost
        FROM messages
        WHERE timestamp > ?
        GROUP BY date
        ORDER BY date DESC
      `).all(thirtyDaysAgo);

            stats.dailyUsage = dailyStats.map((row: any) => ({
                date: row.date,
                tokens: row.tokens || 0,
                cost: row.cost || 0,
            }));

            return stats;
        } catch (error) {
            throw new DatabaseError('Failed to get usage stats', 'getUsageStats', error as Error);
        }
    }

    // Utility methods
    private rowToConversation(row: any): Conversation {
        return {
            id: row.id,
            title: row.title,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            messageIds: JSON.parse(row.message_ids),
            totalTokens: row.total_tokens,
            estimatedCost: row.estimated_cost,
        };
    }

    private rowToMessage(row: any): Message {
        return {
            id: row.id,
            conversationId: row.conversation_id,
            role: row.role,
            content: row.content,
            timestamp: new Date(row.timestamp),
            model: row.model,
            provider: row.provider,
            tokenCount: row.token_count,
            cost: row.cost,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        };
    }

    // Backup and export
    exportConversation(conversationId: string): { conversation: Conversation; messages: Message[] } {
        const conversation = this.getConversation(conversationId);
        if (!conversation) {
            throw new Error(`Conversation ${conversationId} not found`);
        }

        const messages = this.getMessages(conversationId);
        return { conversation, messages };
    }

    importConversation(data: { conversation: Conversation; messages: Message[] }): Conversation {
        return this.db.transaction(() => {
            // Create new IDs to avoid conflicts
            // const oldId = data.conversation.id;
            data.conversation.id = uuidv4();
            data.conversation.createdAt = new Date();
            data.conversation.updatedAt = new Date();
            data.conversation.messageIds = [];

            // Create conversation
            const conversation = this.createConversation(data.conversation.title);

            // Create messages with new IDs
            data.messages.forEach(msg => {
                const newMsg = {
                    ...msg,
                    conversationId: conversation.id,
                    timestamp: new Date(msg.timestamp),
                };
                delete (newMsg as any).id;
                this.createMessage(newMsg);
            });

            return this.getConversation(conversation.id)!;
        })();
    }

    // Cleanup
    vacuum(): void {
        this.db.pragma('vacuum');
    }

    close(): void {
        this.cache.clear();
        this.db.close();
    }
}