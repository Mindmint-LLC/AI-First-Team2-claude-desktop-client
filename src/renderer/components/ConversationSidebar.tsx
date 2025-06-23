/**
 * File: src/renderer/components/ConversationSidebar.tsx
 * Module: Conversation Sidebar Component (View)
 * Purpose: Display list of conversations with search, create, and management options
 * Usage: Main sidebar for conversation navigation
 * Contains: ConversationList, SearchBar, NewConversationButton
 * Dependencies: MobX stores, Radix UI components
 * Iteration: 1
 */

import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { FixedSizeList as List } from 'react-window';
import { rootStore } from '../stores';
import { Conversation } from '../../shared/types';
import {
    Plus,
    Search,
    MoreHorizontal,
    MessageSquare,
    Calendar,
    DollarSign,
} from 'lucide-react';

export const ConversationSidebar = observer(() => {
    const { conversationStore, uiStore } = rootStore;
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);

    useEffect(() => {
        conversationStore.loadConversations();
    }, []);

    useEffect(() => {
        const filtered = conversationStore.conversations.filter(conv =>
            conv.title.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setFilteredConversations(filtered);
    }, [searchQuery, conversationStore.conversations]);

    const handleCreateConversation = async () => {
        try {
            await conversationStore.createConversation();
        } catch (error) {
            uiStore.showToast('Failed to create conversation', 'error');
        }
    };

    const handleDeleteConversation = async (id: string) => {
        try {
            await conversationStore.deleteConversation(id);
            uiStore.showToast('Conversation deleted', 'success');
        } catch (error) {
            uiStore.showToast('Failed to delete conversation', 'error');
        }
    };



    const formatDate = (date: Date) => {
        const now = new Date();
        const diffInMs = now.getTime() - date.getTime();
        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

        if (diffInDays === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffInDays === 1) {
            return 'Yesterday';
        } else if (diffInDays < 7) {
            return `${diffInDays} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    };

    const formatCost = (cost: number) => {
        if (cost === 0) return 'Free';
        return `$${cost.toFixed(4)}`;
    };

    const ConversationItem = ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const conversation = filteredConversations[index];
        const isActive = conversationStore.activeConversation?.id === conversation.id;

        return (
            <div style={style} className="conversation-item-wrapper">
                <div
                    className={`conversation-item ${isActive ? 'active' : ''}`}
                    onClick={() => conversationStore.setActiveConversation(conversation.id)}
                >
                    <div className="conversation-content">
                        <div className="conversation-header">
                            <h3 className="conversation-title">{conversation.title}</h3>
                            <button
                                className="conversation-menu-trigger"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // For now, just show a simple delete option
                                    if (window.confirm('Delete this conversation?')) {
                                        handleDeleteConversation(conversation.id);
                                    }
                                }}
                                title="Delete conversation"
                            >
                                <MoreHorizontal size={16} />
                            </button>
                        </div>

                        <div className="conversation-meta">
                            <div className="conversation-stat">
                                <MessageSquare size={12} />
                                <span>{conversation.messageIds.length} messages</span>
                            </div>
                            <div className="conversation-stat">
                                <Calendar size={12} />
                                <span>{formatDate(conversation.updatedAt)}</span>
                            </div>
                            <div className="conversation-stat">
                                <DollarSign size={12} />
                                <span>{formatCost(conversation.estimatedCost)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="conversation-sidebar">
            <div className="sidebar-header">
                <button
                    className="btn btn-primary new-conversation-btn"
                    onClick={handleCreateConversation}
                    disabled={conversationStore.isLoading}
                >
                    <Plus size={16} />
                    New Chat
                </button>
            </div>

            <div className="search-container">
                <div className="search-input-wrapper">
                    <Search size={16} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search conversations..."
                        className="search-input"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="conversations-container">
                {conversationStore.isLoading ? (
                    <div className="loading-container">
                        <div className="loading-spinner" />
                        <span>Loading conversations...</span>
                    </div>
                ) : filteredConversations.length === 0 ? (
                    <div className="empty-conversations">
                        {searchQuery ? (
                            <>
                                <Search size={48} />
                                <h3>No conversations found</h3>
                                <p>Try a different search term</p>
                            </>
                        ) : (
                            <>
                                <MessageSquare size={48} />
                                <h3>No conversations yet</h3>
                                <p>Create your first conversation to get started</p>
                            </>
                        )}
                    </div>
                ) : (
                    <List
                        height={600}
                        width="100%"
                        itemCount={filteredConversations.length}
                        itemSize={120}
                        itemData={filteredConversations}
                    >
                        {ConversationItem}
                    </List>
                )}
            </div>

            <div className="sidebar-footer">
                <div className="stats-summary">
                    <div className="stat">
                        <span className="stat-label">Total Conversations:</span>
                        <span className="stat-value">{conversationStore.conversations.length}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Total Cost:</span>
                        <span className="stat-value">
                            {formatCost(
                                conversationStore.conversations.reduce(
                                    (sum, conv) => sum + conv.estimatedCost,
                                    0
                                )
                            )}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});