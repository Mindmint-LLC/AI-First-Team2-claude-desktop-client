/**
 * File: src/renderer/components/MessageArea.tsx
 * Module: Message Area Component (View)
 * Purpose: Main chat interface for displaying messages and input
 * Usage: Primary chat view with message history and input form
 * Contains: MessageList, MessageInput, MessageItem
 * Dependencies: MobX stores, React Markdown, Syntax Highlighter
 * Iteration: 1
 */

import React, { useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { FixedSizeList as List } from 'react-window';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { rootStore } from '../stores';
import { Message } from '@shared/types';
import {
    Send,
    Square,
    Copy,
    Check,
    User,
    Bot,
    Clock,
    DollarSign,
    Hash,
    AlertCircle,
} from 'lucide-react';

export const MessageArea = observer(() => {
    const { conversationStore, messageStore, settingsStore, uiStore } = rootStore;
    const [input, setInput] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const listRef = useRef<List>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const messages = messageStore.getMessagesForConversation(
        conversationStore.activeConversation?.id || ''
    );

    useEffect(() => {
        if (listRef.current && messages.length > 0) {
            listRef.current.scrollToItem(messages.length - 1, 'end');
        }
    }, [messages.length]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && messageStore.isStreaming) {
                handleStopGeneration();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [messageStore.isStreaming]);

    const handleSendMessage = async () => {
        if (!input.trim() || !conversationStore.activeConversation || messageStore.isStreaming) {
            return;
        }

        const messageContent = input.trim();
        setInput('');

        try {
            await messageStore.sendMessage(
                conversationStore.activeConversation.id,
                messageContent
            );
        } catch (error: any) {
            uiStore.showToast(error.message || 'Failed to send message', 'error');
        }
    };

    const handleStopGeneration = () => {
        messageStore.stopGeneration();
        uiStore.showToast('Generation stopped', 'info');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleCopyMessage = async (content: string, messageId: string) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedMessageId(messageId);
            setTimeout(() => setCopiedMessageId(null), 2000);
            uiStore.showToast('Message copied to clipboard', 'success');
        } catch (error) {
            uiStore.showToast('Failed to copy message', 'error');
        }
    };

    const formatTimestamp = (timestamp: Date) => {
        return timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatCost = (cost: number) => {
        if (cost === 0) return 'Free';
        return `$${cost.toFixed(4)}`;
    };

    const MessageItem = ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const message = messages[index];
        const isUser = message.role === 'user';
        const isStreaming = messageStore.isStreaming && index === messages.length - 1 && !isUser;

        return (
            <div style={style} className="message-item-wrapper">
                <div className={`message-item ${isUser ? 'user' : 'assistant'}`}>
                    <div className="message-avatar">
                        {isUser ? <User size={20} /> : <Bot size={20} />}
                    </div>

                    <div className="message-content">
                        <div className="message-header">
                            <span className="message-role">
                                {isUser ? 'You' : settingsStore.settings?.model || 'Assistant'}
                            </span>
                            <div className="message-meta">
                                <div className="meta-item">
                                    <Clock size={12} />
                                    <span>{formatTimestamp(message.timestamp)}</span>
                                </div>
                                {!isUser && (
                                    <>
                                        <div className="meta-item">
                                            <Hash size={12} />
                                            <span>{message.tokenCount} tokens</span>
                                        </div>
                                        <div className="meta-item">
                                            <DollarSign size={12} />
                                            <span>{formatCost(message.cost)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="message-body">
                            {message.error ? (
                                <div className="message-error">
                                    <AlertCircle size={16} />
                                    <span>Error: {message.error}</span>
                                </div>
                            ) : (
                                <div className="message-text">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ node, inline, className, children, ...props }) {
                                                const match = /language-(\w+)/.exec(className || '');
                                                return !inline && match ? (
                                                    <SyntaxHighlighter
                                                        style={vscDarkPlus}
                                                        language={match[1]}
                                                        PreTag="div"
                                                        {...props}
                                                    >
                                                        {String(children).replace(/\n$/, '')}
                                                    </SyntaxHighlighter>
                                                ) : (
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            },
                                        }}
                                    >
                                        {message.content}
                                    </ReactMarkdown>
                                    {isStreaming && (
                                        <span className="streaming-cursor">▊</span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="message-actions">
                            <button
                                className="message-action-btn"
                                onClick={() => handleCopyMessage(message.content, message.id)}
                                title="Copy message"
                            >
                                {copiedMessageId === message.id ? (
                                    <Check size={14} />
                                ) : (
                                    <Copy size={14} />
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (!conversationStore.activeConversation) {
        return (
            <div className="message-area empty">
                <div className="empty-state">
                    <Bot size={64} />
                    <h2>Select a conversation</h2>
                    <p>Choose a conversation from the sidebar or create a new one</p>
                </div>
            </div>
        );
    }

    return (
        <div className="message-area">
            <div className="conversation-header">
                <h2>{conversationStore.activeConversation.title}</h2>
                <div className="conversation-info">
                    <span>{messages.length} messages</span>
                    <span>{formatCost(conversationStore.activeConversation.estimatedCost)}</span>
                </div>
            </div>

            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="empty-messages">
                        <Bot size={48} />
                        <h3>Start a conversation</h3>
                        <p>Type a message below to begin chatting</p>
                    </div>
                ) : (
                    <List
                        ref={listRef}
                        height={600}
                        itemCount={messages.length}
                        itemSize={120}
                        itemData={messages}
                    >
                        {MessageItem}
                    </List>
                )}
            </div>

            <div className="input-container">
                <div className="input-wrapper">
                    <textarea
                        ref={inputRef}
                        className="message-input"
                        placeholder={
                            messageStore.isStreaming
                                ? 'Generating response...'
                                : 'Type your message... (Shift+Enter for new line)'
                        }
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={() => setIsComposing(false)}
                        disabled={messageStore.isStreaming}
                        rows={Math.min(input.split('\n').length, 10)}
                    />

                    <div className="input-actions">
                        {messageStore.isStreaming ? (
                            <button
                                className="btn btn-secondary stop-btn"
                                onClick={handleStopGeneration}
                                title="Stop generation (Esc)"
                            >
                                <Square size={16} />
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary send-btn"
                                onClick={handleSendMessage}
                                disabled={!input.trim() || !conversationStore.activeConversation}
                                title="Send message (Enter)"
                            >
                                <Send size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="input-footer">
                    <div className="model-info">
                        Using: {settingsStore.settings?.provider} • {settingsStore.settings?.model}
                    </div>
                    <div className="token-count">
                        {input.length} characters
                    </div>
                </div>
            </div>
        </div>
    );
});