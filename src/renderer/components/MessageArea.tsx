import React, { useRef, useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../stores';
import { Message } from '@shared/types';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { Send, User, Bot, Copy, Check, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface MessageItemProps {
    message: Message;
    isStreaming: boolean;
}

const MessageItem = observer(({ message, isStreaming }: MessageItemProps) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [message.content]);

    return (
        <div className={clsx('message-item', `message-${message.role}`)}>
            <div className="message-avatar">
                {message.role === 'user' ? <User size={20} /> : <Bot size={20} />}
            </div>

            <div className="message-content">
                <div className="message-header">
          <span className="message-role">
            {message.role === 'user' ? 'You' : message.model}
          </span>
                    <span className="message-time">
            {format(message.timestamp, 'HH:mm')}
          </span>
                    {message.tokenCount > 0 && (
                        <span className="message-tokens">
              {message.tokenCount} tokens
            </span>
                    )}
                    {message.error && (
                        <span className="message-error" title={message.error}>
              <AlertCircle size={14} />
            </span>
                    )}
                </div>

                <div className="message-body">
                    {message.role === 'assistant' && isStreaming && !message.content ? (
                        <div className="streaming-indicator">
                            <span className="dot"></span>
                            <span className="dot"></span>
                            <span className="dot"></span>
                        </div>
                    ) : (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                code({ node, inline, className, children, ...props }) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    return !inline && match ? (
                                        <div className="code-block">
                                            <div className="code-header">
                                                <span className="code-language">{match[1]}</span>
                                                <button
                                                    className="btn btn-icon btn-sm"
                                                    onClick={() => navigator.clipboard.writeText(String(children))}
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                            <SyntaxHighlighter
                                                style={oneDark}
                                                language={match[1]}
                                                PreTag="div"
                                                {...props}
                                            >
                                                {String(children).replace(/\n$/, '')}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : (
                                        <code className={className} {...props}>
                                            {children}
                                        </code>
                                    );
                                }
                            }}
                        >
                            {message.content || ''}
                        </ReactMarkdown>
                    )}
                </div>

                {message.content && (
                    <div className="message-actions">
                        <button
                            className="btn btn-icon btn-sm"
                            onClick={handleCopy}
                            title="Copy message"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

export const MessageArea = observer(() => {
    const { conversationStore, messageStore, settingsStore } = rootStore;
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [input, setInput] = useState('');
    const [isComposing, setIsComposing] = useState(false);

    const conversation = conversationStore.activeConversation;
    const messages = messageStore.currentMessages;
    const settings = settingsStore.settings;

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input on conversation change
    useEffect(() => {
        inputRef.current?.focus();
    }, [conversation?.id]);

    const handleSubmit = useCallback(async (e?: React.FormEvent) => {
        e?.preventDefault();

        const trimmedInput = input.trim();
        if (!trimmedInput || messageStore.isSending || !conversation) return;

        setInput('');
        await messageStore.sendMessage(
            trimmedInput,
            settings?.model,
            settings?.provider
        );
    }, [input, conversation, settings]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
            e.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit, isComposing]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);

        // Auto-resize textarea
        const textarea = e.target;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }, []);

    if (!conversation) return null;

    return (
        <div className="message-area">
            <div className="message-header">
                <h2 className="conversation-title">{conversation.title}</h2>
                <div className="conversation-stats">
                    <span>{messages.length} messages</span>
                    <span>•</span>
                    <span>{conversation.totalTokens.toLocaleString()} tokens</span>
                    {conversation.estimatedCost > 0 && (
                        <>
                            <span>•</span>
                            <span>${conversation.estimatedCost.toFixed(4)}</span>
                        </>
                    )}
                </div>
            </div>

            <div className="message-list">
                {messageStore.isLoading ? (
                    <div className="loading-messages">
                        <div className="loading-spinner">Loading messages...</div>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="empty-messages">
                        <p>No messages yet. Start a conversation!</p>
                    </div>
                ) : (
                    <>
                        {messages.map((message) => (
                            <MessageItem
                                key={message.id}
                                message={message}
                                isStreaming={messageStore.streamingMessages.has(message.id)}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            <form className="message-input-container" onSubmit={handleSubmit}>
                <div className="input-wrapper">
          <textarea
              ref={inputRef}
              className="message-input"
              placeholder="Type your message..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              disabled={messageStore.isSending}
              rows={1}
          />
                    <button
                        type="submit"
                        className="btn btn-icon btn-primary send-button"
                        disabled={!input.trim() || messageStore.isSending}
                    >
                        <Send size={20} />
                    </button>
                </div>

                {settings && (
                    <div className="input-info">
            <span className="model-info">
              {settings.provider} • {settings.model}
            </span>
                        <span className="input-length">
              {input.length} characters
            </span>
                    </div>
                )}
            </form>
        </div>
    );
});