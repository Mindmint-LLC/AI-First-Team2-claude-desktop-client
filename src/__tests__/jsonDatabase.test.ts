import { Database } from '../main/models/JsonDatabase';
import path from 'path';
import fs from 'fs';

// Mock electron
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn(() => '/tmp/test-electron'),
    },
}));

describe('JsonDatabase', () => {
    let db: Database;
    const testDbPath = path.join('/tmp/test-electron', 'claude-desktop-test.json');

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

        db = new Database(testDbPath);
    });

    afterEach(() => {
        db.close();
        // Clean up test database
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('Conversation Operations', () => {
        test('should create a new conversation', async () => {
            const conversation = await db.createConversation('Test Conversation');

            expect(conversation).toBeDefined();
            expect(conversation.id).toBeTruthy();
            expect(conversation.title).toBe('Test Conversation');
            expect(conversation.messageIds).toEqual([]);
            expect(conversation.totalTokens).toBe(0);
            expect(conversation.estimatedCost).toBe(0);
        });

        test('should create conversation with default title', async () => {
            const conversation = await db.createConversation();
            expect(conversation.title).toBe('New Conversation');
        });

        test('should retrieve a conversation by id', async () => {
            const created = await db.createConversation('Test');
            const retrieved = await db.getConversation(created.id);

            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(created.id);
            expect(retrieved?.title).toBe('Test');
        });

        test('should return null for non-existent conversation', async () => {
            const retrieved = await db.getConversation('non-existent-id');
            expect(retrieved).toBeNull();
        });

        test('should list conversations', async () => {
            await db.createConversation('First');
            await db.createConversation('Second');

            const conversations = await db.listConversations(10, 0);
            expect(conversations.length).toBe(2);
        });

        test('should update conversation', async () => {
            const conversation = await db.createConversation('Original Title');
            
            await db.updateConversation(conversation.id, { title: 'Updated Title' });
            
            const updated = await db.getConversation(conversation.id);
            expect(updated?.title).toBe('Updated Title');
        });

        test('should delete conversation', async () => {
            const conversation = await db.createConversation('To Delete');
            
            await db.deleteConversation(conversation.id);
            
            const retrieved = await db.getConversation(conversation.id);
            expect(retrieved).toBeNull();
        });
    });

    describe('Message Operations', () => {
        let conversation: any;

        beforeEach(async () => {
            conversation = await db.createConversation('Test Conversation');
        });

        test('should create a message', () => {
            const messageData = {
                conversationId: conversation.id,
                role: 'user' as const,
                content: 'Hello, Claude!',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude' as const,
                tokenCount: 5,
                cost: 0.001,
            };

            const message = db.createMessage(messageData);

            expect(message.id).toBeTruthy();
            expect(message.content).toBe('Hello, Claude!');
            expect(message.role).toBe('user');
        });

        test('should retrieve messages for a conversation', () => {
            db.createMessage({
                conversationId: conversation.id,
                role: 'user',
                content: 'First message',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.createMessage({
                conversationId: conversation.id,
                role: 'assistant',
                content: 'Response message',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 20,
                cost: 0.02,
            });

            const messages = db.getMessages(conversation.id);
            expect(messages.length).toBe(2);
        });

        test('should get single message by id', () => {
            const created = db.createMessage({
                conversationId: conversation.id,
                role: 'user',
                content: 'Test',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 5,
                cost: 0.001,
            });

            const retrieved = db.getMessage(created.id);
            expect(retrieved?.id).toBe(created.id);
            expect(retrieved?.content).toBe('Test');
        });

        test('should update message', () => {
            const message = db.createMessage({
                conversationId: conversation.id,
                role: 'assistant',
                content: '',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 0,
                cost: 0,
            });

            db.updateMessage(message.id, {
                content: 'Updated response',
                tokenCount: 15,
                cost: 0.015,
            });

            const updated = db.getMessage(message.id);
            expect(updated?.content).toBe('Updated response');
            expect(updated?.tokenCount).toBe(15);
            expect(updated?.cost).toBe(0.015);
        });

        test('should delete message', () => {
            const message = db.createMessage({
                conversationId: conversation.id,
                role: 'user',
                content: 'To delete',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.deleteMessage(message.id);

            const retrieved = db.getMessage(message.id);
            expect(retrieved).toBeNull();
        });
    });

    describe('Settings Operations', () => {
        test('should get default settings', () => {
            const settings = db.getSettings();

            expect(settings).toBeDefined();
            expect(settings.provider).toBe('claude');
            expect(settings.model).toBe('claude-3-sonnet-20240229');
            expect(settings.temperature).toBe(0.7);
        });

        test('should update settings', () => {
            db.updateSettings({
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.5,
            });

            const settings = db.getSettings();
            expect(settings.provider).toBe('openai');
            expect(settings.model).toBe('gpt-4');
            expect(settings.temperature).toBe(0.5);
        });
    });

    describe('Search Operations', () => {
        beforeEach(async () => {
            const conv = await db.createConversation('Search Test');

            db.createMessage({
                conversationId: conv.id,
                role: 'user',
                content: 'Tell me about quantum computing',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.createMessage({
                conversationId: conv.id,
                role: 'assistant',
                content: 'Quantum computing is revolutionary',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 50,
                cost: 0.05,
            });
        });

        test('should search messages by content', () => {
            const results = db.searchMessages('quantum');
            expect(results.length).toBe(2);
            expect(results.every(r => r.content.toLowerCase().includes('quantum'))).toBe(true);
        });

        test('should search conversations by title', () => {
            const results = db.searchConversations('Search');
            expect(results.length).toBe(1);
            expect(results[0].title).toBe('Search Test');
        });
    });

    describe('Usage Statistics', () => {
        test('should calculate usage statistics', async () => {
            const conv1 = await db.createConversation('Conv 1');
            const conv2 = await db.createConversation('Conv 2');

            db.createMessage({
                conversationId: conv1.id,
                role: 'user',
                content: 'Test',
                model: 'claude-3-sonnet-20240229',
                provider: 'claude',
                tokenCount: 10,
                cost: 0.01,
            });

            db.createMessage({
                conversationId: conv2.id,
                role: 'user',
                content: 'Test',
                model: 'gpt-4',
                provider: 'openai',
                tokenCount: 15,
                cost: 0.015,
            });

            const stats = db.getUsageStats();

            expect(stats.totalConversations).toBe(2);
            expect(stats.totalMessages).toBe(2);
            expect(stats.totalTokens).toBe(25);
            expect(stats.totalCost).toBeCloseTo(0.025, 3);
        });
    });
});
