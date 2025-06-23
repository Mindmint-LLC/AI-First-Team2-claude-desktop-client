import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationSidebar } from '../renderer/components/ConversationSidebar';
import { MessageArea } from '../renderer/components/MessageArea';
import { SettingsDialog } from '../renderer/components/SettingsDialog';
import { ToastManager } from '../renderer/components/ToastManager';
import { rootStore } from '../renderer/stores';
import { Conversation, Message } from '../shared/types';
import '@testing-library/jest-dom';

// Mock react-markdown and related ES modules
jest.mock('react-markdown', () => {
    return function ReactMarkdown({ children }: { children: string }) {
        return React.createElement('div', { 'data-testid': 'markdown-content' }, children);
    };
});

jest.mock('remark-gfm', () => () => {});

jest.mock('react-syntax-highlighter', () => ({
    Prism: function SyntaxHighlighter({ children }: { children: string }) {
        return React.createElement('pre', { 'data-testid': 'syntax-highlighter' }, children);
    }
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
    vscDarkPlus: {}
}));

// Mock electron API
global.electronAPI = {
    invoke: jest.fn(),
    on: jest.fn(() => jest.fn()),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    platform: {
        os: 'darwin',
        arch: 'x64',
        version: '28.0.0',
    },
    channels: {
        CONVERSATION_CREATE: 'conversation:create',
        CONVERSATION_LIST: 'conversation:list',
        CONVERSATION_GET: 'conversation:get',
        CONVERSATION_UPDATE: 'conversation:update',
        CONVERSATION_DELETE: 'conversation:delete',
        MESSAGE_SEND: 'message:send',
        MESSAGE_LIST: 'message:list',
        SETTINGS_GET: 'settings:get',
        SETTINGS_UPDATE: 'settings:update',
        API_TEST: 'api:test',
        API_MODELS: 'api:models',
    },
};

// Mock data
const mockConversation: Conversation = {
    id: 'conv-1',
    title: 'Test Conversation',
    createdAt: new Date(),
    updatedAt: new Date(),
    messageIds: ['msg-1', 'msg-2'],
    totalTokens: 100,
    estimatedCost: 0.01,
};

const mockMessages: Message[] = [
    {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello, Claude!',
        timestamp: new Date(),
        model: 'claude-3-opus-20240229',
        provider: 'claude',
        tokenCount: 10,
        cost: 0.001,
    },
    {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Hello! How can I help you today?',
        timestamp: new Date(),
        model: 'claude-3-opus-20240229',
        provider: 'claude',
        tokenCount: 15,
        cost: 0.002,
    },
];

describe('ConversationSidebar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        rootStore.conversationStore.conversations.clear();
        rootStore.conversationStore.activeConversationId = null;
    });

    test('renders empty state when no conversations', () => {
        render(<ConversationSidebar />);

        expect(screen.getByText('No conversations yet')).toBeInTheDocument();
        expect(screen.getByText('Create your first conversation')).toBeInTheDocument();
    });

    test('renders conversation list', () => {
        // Add conversations to store
        rootStore.conversationStore.conversations.set(mockConversation.id, mockConversation);

        render(<ConversationSidebar />);

        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
        expect(screen.getByText('100 tokens')).toBeInTheDocument();
    });

    test('creates new conversation on button click', async () => {
        (global.electronAPI.invoke as jest.Mock).mockResolvedValue({
            ...mockConversation,
            id: 'new-conv',
            title: 'New Conversation',
        });

        render(<ConversationSidebar />);

        const newButton = screen.getByTitle('New Conversation');
        fireEvent.click(newButton);

        await waitFor(() => {
            expect(global.electronAPI.invoke).toHaveBeenCalledWith(
                'conversation:create',
                expect.any(Object)
            );
        });
    });

    test('filters conversations on search', () => {
        // Add multiple conversations
        rootStore.conversationStore.conversations.set('conv-1', {
            ...mockConversation,
            title: 'Claude Chat',
        });

        rootStore.conversationStore.conversations.set('conv-2', {
            ...mockConversation,
            id: 'conv-2',
            title: 'OpenAI Discussion',
        });

        render(<ConversationSidebar />);

        const searchInput = screen.getByPlaceholderText('Search conversations...');
        fireEvent.change(searchInput, { target: { value: 'claude' } });

        expect(screen.getByText('Claude Chat')).toBeInTheDocument();
        expect(screen.queryByText('OpenAI Discussion')).not.toBeInTheDocument();
    });

    test('selects conversation on click', () => {
        rootStore.conversationStore.conversations.set(mockConversation.id, mockConversation);

        render(<ConversationSidebar />);

        const conversationItem = screen.getByText('Test Conversation');
        fireEvent.click(conversationItem);

        expect(rootStore.conversationStore.activeConversationId).toBe(mockConversation.id);
    });
});

describe('MessageArea', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        rootStore.conversationStore.conversations.set(mockConversation.id, mockConversation);
        rootStore.conversationStore.activeConversationId = mockConversation.id;
        rootStore.messageStore.messages.set(mockConversation.id, mockMessages);
        rootStore.settingsStore.settings = {
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
    });

    test('renders conversation header', () => {
        render(<MessageArea />);

        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
        expect(screen.getByText('2 messages')).toBeInTheDocument();
        expect(screen.getByText('100 tokens')).toBeInTheDocument();
        expect(screen.getByText('$0.0100')).toBeInTheDocument();
    });

    test('renders messages', () => {
        render(<MessageArea />);

        expect(screen.getByText('Hello, Claude!')).toBeInTheDocument();
        expect(screen.getByText('Hello! How can I help you today?')).toBeInTheDocument();
        expect(screen.getByText('You')).toBeInTheDocument();
        expect(screen.getByText('claude-3-opus-20240229')).toBeInTheDocument();
    });

    test('sends message on form submit', async () => {
        (global.electronAPI.invoke as jest.Mock).mockResolvedValue({
            userMessage: { ...mockMessages[0], id: 'new-user-msg' },
            assistantMessage: { ...mockMessages[1], id: 'new-assistant-msg', content: '' },
        });

        render(<MessageArea />);

        const input = screen.getByPlaceholderText('Type your message...');
        const sendButton = screen.getByRole('button', { name: /send/i });

        fireEvent.change(input, { target: { value: 'Test message' } });
        fireEvent.click(sendButton);

        await waitFor(() => {
            expect(global.electronAPI.invoke).toHaveBeenCalledWith(
                'message:send',
                expect.objectContaining({
                    content: 'Test message',
                    conversationId: mockConversation.id,
                })
            );
        });

        expect(input).toHaveValue('');
    });

    test('handles enter key to send message', async () => {
        render(<MessageArea />);

        const input = screen.getByPlaceholderText('Type your message...');

        fireEvent.change(input, { target: { value: 'Test message' } });
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

        await waitFor(() => {
            expect(global.electronAPI.invoke).toHaveBeenCalled();
        });
    });

    test('allows multiline with shift+enter', () => {
        render(<MessageArea />);

        const input = screen.getByPlaceholderText('Type your message...');

        fireEvent.change(input, { target: { value: 'Line 1' } });
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

        expect(global.electronAPI.invoke).not.toHaveBeenCalled();
    });

    test('shows streaming indicator', () => {
        const streamingMessage: Message = {
            ...mockMessages[1],
            id: 'streaming-msg',
            content: '',
            streaming: true,
        };

        rootStore.messageStore.messages.set(mockConversation.id, [...mockMessages, streamingMessage]);
        rootStore.messageStore.streamingMessages.add('streaming-msg');

        render(<MessageArea />);

        expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument();
    });
});

describe('SettingsDialog', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        rootStore.uiStore.isSettingsOpen = true;
        rootStore.settingsStore.settings = {
            provider: 'claude',
            model: 'claude-3-opus-20240229',
            temperature: 0.7,
            maxTokens: 2048,
            systemPrompt: '',
            apiKeys: { claude: 'test-key', openai: '', ollama: '' },
            retryAttempts: 3,
            streamRateLimit: 30,
            theme: 'dark',
        };
    });

    test('renders settings form', () => {
        render(<SettingsDialog />);

        expect(screen.getByText('Settings')).toBeInTheDocument();
        expect(screen.getByLabelText('Provider')).toBeInTheDocument();
        expect(screen.getByLabelText('Model')).toBeInTheDocument();
        expect(screen.getByLabelText(/Temperature/)).toBeInTheDocument();
    });

    test('changes provider selection', async () => {
        (global.electronAPI.invoke as jest.Mock).mockResolvedValue([
            { id: 'gpt-4', name: 'GPT-4', maxTokens: 8192, costPer1kInput: 0.03, costPer1kOutput: 0.06 },
        ]);

        render(<SettingsDialog />);

        const providerSelect = screen.getByLabelText('Provider');
        fireEvent.click(providerSelect);

        const openaiOption = await screen.findByText('OpenAI');
        fireEvent.click(openaiOption);

        await waitFor(() => {
            expect(global.electronAPI.invoke).toHaveBeenCalledWith(
                'api:models',
                expect.objectContaining({ provider: 'openai' })
            );
        });
    });

    test('tests API connection', async () => {
        (global.electronAPI.invoke as jest.Mock).mockResolvedValue({ success: true });

        render(<SettingsDialog />);

        const testButton = screen.getAllByRole('button').find(btn =>
            btn.querySelector('[data-testid="test-icon"]')
        );

        if (testButton) {
            fireEvent.click(testButton);

            await waitFor(() => {
                expect(global.electronAPI.invoke).toHaveBeenCalledWith(
                    'api:test',
                    expect.objectContaining({ provider: 'claude' })
                );
            });
        }
    });

    test('saves settings', async () => {
        (global.electronAPI.invoke as jest.Mock).mockResolvedValue({
            ...rootStore.settingsStore.settings,
            temperature: 0.5,
        });

        render(<SettingsDialog />);

        // Change temperature
        const temperatureSlider = screen.getByRole('slider');
        fireEvent.change(temperatureSlider, { target: { value: 0.5 } });

        // Save
        const saveButton = screen.getByText('Save Settings');
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(global.electronAPI.invoke).toHaveBeenCalledWith(
                'settings:update',
                expect.objectContaining({
                    temperature: 0.5,
                })
            );
        });
    });

    test('closes dialog on cancel', () => {
        render(<SettingsDialog />);

        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);

        expect(rootStore.uiStore.isSettingsOpen).toBe(false);
    });
});

describe('ToastManager', () => {
    beforeEach(() => {
        rootStore.uiStore.toasts = [];
    });

    test('renders success toast', () => {
        rootStore.uiStore.showSuccess('Operation successful!');

        render(<ToastManager />);

        expect(screen.getByText('Operation successful!')).toBeInTheDocument();
        const toast = screen.getByText('Operation successful!').closest('.toast');
        expect(toast).toHaveClass('toast-success');
    });

    test('renders error toast', () => {
        rootStore.uiStore.showError('Something went wrong!');

        render(<ToastManager />);

        expect(screen.getByText('Something went wrong!')).toBeInTheDocument();
        const toast = screen.getByText('Something went wrong!').closest('.toast');
        expect(toast).toHaveClass('toast-error');
    });

    test('dismisses toast on close button click', () => {
        rootStore.uiStore.showInfo('Information message');

        render(<ToastManager />);

        const closeButton = screen.getByRole('button', { name: /dismiss/i });
        fireEvent.click(closeButton);

        expect(rootStore.uiStore.toasts).toHaveLength(0);
    });

    test('renders multiple toasts', () => {
        rootStore.uiStore.showSuccess('Success 1');
        rootStore.uiStore.showError('Error 1');
        rootStore.uiStore.showInfo('Info 1');

        render(<ToastManager />);

        expect(screen.getByText('Success 1')).toBeInTheDocument();
        expect(screen.getByText('Error 1')).toBeInTheDocument();
        expect(screen.getByText('Info 1')).toBeInTheDocument();
    });
});