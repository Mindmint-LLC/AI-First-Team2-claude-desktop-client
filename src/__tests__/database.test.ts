import { DatabaseManager } from '../main/models/Database';
import { Conversation, Message, Settings } from '../shared/types';
import path from 'path';
import fs from 'fs';

// Mock electron
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn(() => '/tmp/test-electron'),
    },
}));

// Mock crypto module
jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'),
    randomUUID: jest.fn(() => `test-uuid-${Date.now()}-${Math.random()}`),
}));

describe('DatabaseManager', () => {
    let db: DatabaseManager;
    const testDbPath = path.join('/tmp/test-electron', 'claude-desktop-test.db');

    beforeEach(() => {
        // Ensure test directory exists
        const dir = path.dirname(testDbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Remove existing test database
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        db = new DatabaseManager();
    });

    afterEach(() => {
        db.close();
        // Clean up test database
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('Conversation Operations', () => {
        test('should create a new conversation', () => {
            const conversation = db.createConversation('Test Conversation');

            expect(conversation).toBeDefined();
            expect(conversation.id).toBeTruthy();
            expect(conversation.title).toBe('Test Conversation');
            expect(conversation.messageIds).toEqual([]);
            expect(conversation.totalTokens).toBe(0);
            expect(conversation.estimatedCost).toBe(0);
        });

        test('should create conversation with default title', () => {
            const conversation = db.createConversation();

            expect(conversation.title).toBe('New Conversation');
        });

        test('should retrieve a conversation by id', () => {
            const created = db.createConversation('Test');
            const retrieved = db.getConversation(created.id);

            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(created.id);
            expect(retrieved?.title).toBe('Test');
        });

        test('should return null for non-existent conversation', () => {
            const retrieved = db.getConversation('non-existent-id');
            expect(retrieved).toBeNull();
        });

        test('should list conversations with pagination', () => {
            // Create multiple conversations
            for (let i = 0; i < 10; i++) {
                db.createConversation(`Conversation ${i}`);
            }

            const page1 = db.listConversations(5, 0);
            expect(page1.conversations.length).toBe(5);
            expect(page1.total).toBe(10);

            const page2 = db.listConversations(5, 5);
            expect(page2.conversations.length).toBe(5);
            expect(page2.total).toBe(10);
        });

        test('should list conversations in descending order by update time', () => {
            const conv1 = db.createConversation('First');
            // Add small delay to ensure different timestamps
            const conv2 = db.createConversation('Second');

            const result = db.listConversations(10, 0);
            expect(result.conversations[0].id).toBe(conv2.id);
            expect(result.conversations[1].id).toBe(conv1.id);
        });

        test('should update conversation', () => {
            const conversation = db.createConversation('Original Title');
            const originalUpdatedAt = conversation.updatedAt;

            // Add small delay to ensure different timestamp
            jest.advanceTimersByTime(100);

            const updated = db.updateConversation(conversation.id, {
                title: 'Updated Title',
                totalTokens: 100,
                estimatedCost: 0.05,
            });

            expect(updated.title).toBe('Updated Title');
            expect(updated.totalTokens).toBe(100);
            expect(updated.estimatedCost).toBe(0.05);
            expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
        });

        test('should throw error when updating non-existent conversation', () => {
            expect(() => {
                db.updateConversation('non-existent', { title: 'New Title' });
            }).toThrow('Conversation non-existent not found');
        });

        test('should delete conversation and associated messages', () => {
            const conversation = db.createConversation('To Delete');

            // Add some messages
            db.createMessage({
                conversationId: conversation.id,
                role: 'user',
                content: 'Test message',
                timestamp: new Date(),
                model: 'test-model',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.deleteConversation(conversation.id);

            const retrieved = db.getConversation(conversation.id);
            expect(retrieved).toBeNull();

            const messages = db.getMessages(conversation.id);
            expect(messages.length).toBe(0);
        });
    });

    describe('Message Operations', () => {
        let conversation: Conversation;

        beforeEach(() => {
            conversation = db.createConversation('Test Conversation');
        });

        test('should create a message', () => {
            const messageData = {
                conversationId: conversation.id,
                role: 'user' as const,
                content: 'Hello, Claude!',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude' as const,
                tokenCount: 5,
                cost: 0.001,
            };

            const message = db.createMessage(messageData);

            expect(message.id).toBeTruthy();
            expect(message.content).toBe('Hello, Claude!');
            expect(message.role).toBe('user');

            // Check conversation was updated
            const updatedConv = db.getConversation(conversation.id);
            expect(updatedConv?.messageIds).toContain(message.id);
            expect(updatedConv?.totalTokens).toBe(5);
            expect(updatedConv?.estimatedCost).toBe(0.001);
        });

        test('should retrieve messages for a conversation', () => {
            // Create multiple messages
            const msg1 = db.createMessage({
                conversationId: conversation.id,
                role: 'user',
                content: 'First message',
                timestamp: new Date(2024, 0, 1),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            const msg2 = db.createMessage({
                conversationId: conversation.id,
                role: 'assistant',
                content: 'Response message',
                timestamp: new Date(2024, 0, 2),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 20,
                cost: 0.02,
            });

            const messages = db.getMessages(conversation.id);
            expect(messages.length).toBe(2);
            // Should be ordered by timestamp ascending
            expect(messages[0].id).toBe(msg1.id);
            expect(messages[1].id).toBe(msg2.id);
        });

        test('should get single message by id', () => {
            const created = db.createMessage({
                conversationId: conversation.id,
                role: 'user',
                content: 'Test',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 5,
                cost: 0.001,
            });

            const retrieved = db.getMessage(created.id);
            expect(retrieved?.id).toBe(created.id);
            expect(retrieved?.content).toBe('Test');
        });

        test('should return null for non-existent message', () => {
            const retrieved = db.getMessage('non-existent-id');
            expect(retrieved).toBeNull();
        });

        test('should update message content and tokens', () => {
            const message = db.createMessage({
                conversationId: conversation.id,
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 0,
                cost: 0,
            });

            const updated = db.updateMessage(message.id, {
                content: 'Updated response',
                tokenCount: 15,
                cost: 0.015,
            });

            expect(updated.content).toBe('Updated response');
            expect(updated.tokenCount).toBe(15);
            expect(updated.cost).toBe(0.015);

            // Check conversation totals were updated
            const conv = db.getConversation(conversation.id);
            expect(conv?.totalTokens).toBe(15);
            expect(conv?.estimatedCost).toBe(0.015);
        });

        test('should throw error when updating non-existent message', () => {
            expect(() => {
                db.updateMessage('non-existent', { content: 'New content' });
            }).toThrow('Message non-existent not found');
        });

        test('should delete message and update conversation', () => {
            const message = db.createMessage({
                conversationId: conversation.id,
                role: 'user',
                content: 'To delete',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.deleteMessage(message.id);

            const retrieved = db.getMessage(message.id);
            expect(retrieved).toBeNull();

            const conv = db.getConversation(conversation.id);
            expect(conv?.messageIds).not.toContain(message.id);
            expect(conv?.totalTokens).toBe(0);
            expect(conv?.estimatedCost).toBe(0);
        });

        test('should handle deleting non-existent message gracefully', () => {
            expect(() => {
                db.deleteMessage('non-existent-id');
            }).not.toThrow();
        });
    });

    describe('Settings Operations', () => {
        test('should initialize default settings', () => {
            const settings = db.getSettings();

            expect(settings).toBeDefined();
            expect(settings.provider).toBe('claude');
            expect(settings.model).toBe('claude-3-opus-20240229');
            expect(settings.temperature).toBe(0.7);
            expect(settings.maxTokens).toBe(2048);
            expect(settings.theme).toBe('dark');
        });

        test('should update settings', () => {
            const updated = db.updateSettings({
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.5,
                maxTokens: 4096,
            });

            expect(updated.provider).toBe('openai');
            expect(updated.model).toBe('gpt-4');
            expect(updated.temperature).toBe(0.5);
            expect(updated.maxTokens).toBe(4096);

            // Verify persistence
            const retrieved = db.getSettings();
            expect(retrieved.provider).toBe('openai');
        });

        test('should merge partial settings updates', () => {
            const original = db.getSettings();

            const updated = db.updateSettings({
                temperature: 0.9,
            });

            expect(updated.temperature).toBe(0.9);
            expect(updated.provider).toBe(original.provider);
            expect(updated.model).toBe(original.model);
        });
    });

    describe('Search Operations', () => {
        beforeEach(() => {
            const conv = db.createConversation('Search Test');

            db.createMessage({
                conversationId: conv.id,
                role: 'user',
                content: 'Tell me about quantum computing',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.createMessage({
                conversationId: conv.id,
                role: 'assistant',
                content: 'Quantum computing is a revolutionary technology...',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 50,
                cost: 0.05,
            });

            // Add another conversation to ensure search is scoped correctly
            const conv2 = db.createConversation('Other');
            db.createMessage({
                conversationId: conv2.id,
                role: 'user',
                content: 'Different topic entirely',
                timestamp: new Date(),
                model: 'gpt-4',
                provider: 'openai',
                tokenCount: 10,
                cost: 0.01,
            });
        });

        test('should search messages by content', () => {
            const results = db.searchMessages('quantum');

            expect(results.length).toBe(2);
            expect(results.every(r => r.content.toLowerCase().includes('quantum'))).toBe(true);
        });

        test('should return empty array for no matches', () => {
            const results = db.searchMessages('nonexistent-term-xyz');

            expect(results).toEqual([]);
        });

        test('should limit search results', () => {
            // Create many messages with the search term
            const conv = db.createConversation('Many Messages');
            for (let i = 0; i < 10; i++) {
                db.createMessage({
                    conversationId: conv.id,
                    role: 'user',
                    content: `Message ${i} about quantum`,
                    timestamp: new Date(),
                    model: 'claude-3-opus-20240229',
                    provider: 'claude',
                    tokenCount: 10,
                    cost: 0.01,
                });
            }

            const results = db.searchMessages('quantum', 5);
            expect(results.length).toBe(5);
        });
    });

    describe('Usage Statistics', () => {
        test('should calculate usage statistics', () => {
            // Create test data
            const conv1 = db.createConversation('Conv 1');
            const conv2 = db.createConversation('Conv 2');

            db.createMessage({
                conversationId: conv1.id,
                role: 'user',
                content: 'Test',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.createMessage({
                conversationId: conv1.id,
                role: 'assistant',
                content: 'Response',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 20,
                cost: 0.02,
            });

            db.createMessage({
                conversationId: conv2.id,
                role: 'user',
                content: 'Test',
                timestamp: new Date(),
                model: 'gpt-4',
                provider: 'openai',
                tokenCount: 15,
                cost: 0.015,
            });

            const stats = db.getUsageStats();

            expect(stats.totalConversations).toBe(2);
            expect(stats.totalMessages).toBe(3);
            expect(stats.totalTokens).toBe(45); // 30 + 15
            expect(stats.totalCost).toBeCloseTo(0.045, 3); // 0.03 + 0.015

            expect(stats.byProvider.claude).toBeDefined();
            expect(stats.byProvider.claude.messages).toBe(2);
            expect(stats.byProvider.claude.tokens).toBe(30);
            expect(stats.byProvider.claude.cost).toBeCloseTo(0.03, 3);

            expect(stats.byProvider.openai).toBeDefined();
            expect(stats.byProvider.openai.messages).toBe(1);
            expect(stats.byProvider.openai.tokens).toBe(15);

            expect(stats.byModel['claude-3-opus-20240229']).toBeDefined();
            expect(stats.byModel['claude-3-opus-20240229'].messages).toBe(2);
            expect(stats.byModel['gpt-4']).toBeDefined();
            expect(stats.byModel['gpt-4'].messages).toBe(1);
        });

        test('should handle empty statistics', () => {
            const stats = db.getUsageStats();

            expect(stats.totalConversations).toBe(0);
            expect(stats.totalMessages).toBe(0);
            expect(stats.totalTokens).toBe(0);
            expect(stats.totalCost).toBe(0);
            expect(Object.keys(stats.byProvider).length).toBe(0);
            expect(Object.keys(stats.byModel).length).toBe(0);
        });
    });

    describe('Import/Export Operations', () => {
        test('should export conversation with messages', () => {
            const conv = db.createConversation('Export Test');

            const msg1 = db.createMessage({
                conversationId: conv.id,
                role: 'user',
                content: 'Export me!',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 5,
                cost: 0.005,
            });

            const msg2 = db.createMessage({
                conversationId: conv.id,
                role: 'assistant',
                content: 'Exported!',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            const exported = db.exportConversation(conv.id);

            expect(exported.conversation.title).toBe('Export Test');
            expect(exported.messages.length).toBe(2);
            expect(exported.messages[0].content).toBe('Export me!');
            expect(exported.messages[1].content).toBe('Exported!');
        });

        test('should throw error when exporting non-existent conversation', () => {
            expect(() => {
                db.exportConversation('non-existent');
            }).toThrow('Conversation non-existent not found');
        });

        test('should import conversation with new IDs', () => {
            const original = db.createConversation('Original');

            const originalMessage = db.createMessage({
                conversationId: original.id,
                role: 'user',
                content: 'Original message',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            const exported = db.exportConversation(original.id);

            // Import as new conversation
            const imported = db.importConversation(exported);

            expect(imported.id).not.toBe(original.id);
            expect(imported.title).toBe('Original');

            const importedMessages = db.getMessages(imported.id);
            expect(importedMessages.length).toBe(1);
            expect(importedMessages[0].id).not.toBe(originalMessage.id);
            expect(importedMessages[0].content).toBe('Original message');
            expect(importedMessages[0].conversationId).toBe(imported.id);
        });

        test('should preserve message order during import', () => {
            const original = db.createConversation('Original');

            // Create messages with specific timestamps
            const timestamps = [
                new Date(2024, 0, 1),
                new Date(2024, 0, 2),
                new Date(2024, 0, 3),
            ];

            timestamps.forEach((timestamp, i) => {
                db.createMessage({
                    conversationId: original.id,
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Message ${i}`,
                    timestamp,
                    model: 'claude-3-opus-20240229',
                    provider: 'claude',
                    tokenCount: 10,
                    cost: 0.01,
                });
            });

            const exported = db.exportConversation(original.id);
            const imported = db.importConversation(exported);

            const importedMessages = db.getMessages(imported.id);
            expect(importedMessages.length).toBe(3);
            expect(importedMessages[0].content).toBe('Message 0');
            expect(importedMessages[1].content).toBe('Message 1');
            expect(importedMessages[2].content).toBe('Message 2');
        });
    });

    describe('Event Emissions', () => {
        test('should emit events on operations', (done) => {
            let eventCount = 0;
            const expectedEvents = 5; // created, updated, message created, message updated, deleted

            const checkDone = () => {
                eventCount++;
                if (eventCount === expectedEvents) {
                    done();
                }
            };

            db.on('conversation:created', (conv) => {
                expect(conv.title).toBe('Event Test');
                checkDone();
            });

            db.on('conversation:updated', (conv) => {
                expect(conv.title).toBe('Updated Event Test');
                checkDone();
            });

            db.on('message:created', (message) => {
                expect(message.content).toBe('Test message');
                checkDone();
            });

            db.on('message:updated', (message) => {
                expect(message.content).toBe('Updated message');
                checkDone();
            });

            db.on('conversation:deleted', (id) => {
                expect(id).toBeTruthy();
                checkDone();
            });

            const conv = db.createConversation('Event Test');
            db.updateConversation(conv.id, { title: 'Updated Event Test' });

            const msg = db.createMessage({
                conversationId: conv.id,
                role: 'user',
                content: 'Test message',
                timestamp: new Date(),
                model: 'claude-3-opus-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.updateMessage(msg.id, { content: 'Updated message' });
            db.deleteConversation(conv.id);
        });
    });

    describe('Database Lifecycle', () => {
        test('should handle vacuum operation', () => {
            expect(() => {
                db.vacuum();
            }).not.toThrow();
        });

        test('should handle close operation', () => {
            expect(() => {
                db.close();
            }).not.toThrow();
        });
    });
});