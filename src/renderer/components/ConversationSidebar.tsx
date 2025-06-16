import React, { useRef, useCallback, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { FixedSizeList as List } from 'react-window';
import { rootStore } from '../stores';
import { Conversation } from '@shared/types';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Search, MessageSquare, Trash2, Edit2 } from 'lucide-react';
import clsx from 'clsx';

interface ConversationItemProps {
    conversation: Conversation;
    isActive: boolean;
    onSelect: () => void;
    onRename: () => void;
    onDelete: () => void;
}

const ConversationItem = observer(({
                                       conversation,
                                       isActive,
                                       onSelect,
                                       onRename,
                                       onDelete
                                   }: ConversationItemProps) => {
    const [showActions, setShowActions] = React.useState(false);

    return (
        <div
            className={clsx('conversation-item', { active: isActive })}
            onClick={onSelect}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
        >
            <div className="conversation-item-content">
                <div className="conversation-icon">
                    <MessageSquare size={18} />
                </div>

                <div className="conversation-info">
                    <div className="conversation-title">{conversation.title}</div>
                    <div className="conversation-meta">
            <span className="conversation-time">
              {formatDistanceToNow(conversation.updatedAt, { addSuffix: true })}
            </span>
                        {conversation.totalTokens > 0 && (
                            <>
                                <span className="meta-separator">•</span>
                                <span className="conversation-tokens">
                  {conversation.totalTokens.toLocaleString()} tokens
                </span>
                            </>
                        )}
                    </div>
                </div>

                {showActions && (
                    <div className="conversation-actions">
                        <button
                            className="action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRename();
                            }}
                            title="Rename"
                        >
                            <Edit2 size={14} />
                        </button>
                        <button
                            className="action-btn action-btn-danger"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            title="Delete"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

export const ConversationSidebar = observer(() => {
    const { conversationStore, uiStore } = rootStore;
    const listRef = useRef<List>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Virtual scrolling row renderer
    const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
        const conversation = conversationStore.conversationList[index];
        if (!conversation) return null;

        return (
            <div style={style}>
                <ConversationItem
                    conversation={conversation}
                    isActive={conversation.id === conversationStore.activeConversationId}
                    onSelect={() => conversationStore.selectConversation(conversation.id)}
                    onRename={() => uiStore.showRenameDialog(conversation.id)}
                    onDelete={() => {
                        if (confirm('Are you sure you want to delete this conversation?')) {
                            conversationStore.deleteConversation(conversation.id);
                        }
                    }}
                />
            </div>
        );
    }, [conversationStore.conversationList, conversationStore.activeConversationId]);

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && conversationStore.hasMore && !conversationStore.isLoading) {
                    conversationStore.loadMoreConversations();
                }
            },
            { threshold: 0.1 }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [conversationStore.hasMore, conversationStore.isLoading]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        conversationStore.setSearchQuery(e.target.value);
    };

    const handleNewConversation = () => {
        conversationStore.createConversation();
    };

    return (
        <div className="conversation-sidebar">
            <div className="sidebar-header">
                <h1 className="sidebar-title">Conversations</h1>
                <button
                    className="btn btn-icon btn-primary"
                    onClick={handleNewConversation}
                    title="New Conversation"
                >
                    <Plus size={20} />
                </button>
            </div>

            <div className="sidebar-search">
                <Search className="search-icon" size={18} />
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search conversations..."
                    value={conversationStore.searchQuery}
                    onChange={handleSearch}
                />
            </div>

            <div className="conversation-list">
                {conversationStore.conversationList.length > 0 ? (
                    <>
                        <List
                            ref={listRef}
                            height={window.innerHeight - 140} // Adjust based on header/search height
                            itemCount={conversationStore.conversationList.length}
                            itemSize={72}
                            width="100%"
                        >
                            {Row}
                        </List>

                        {conversationStore.hasMore && (
                            <div ref={loadMoreRef} className="load-more">
                                {conversationStore.isLoading && (
                                    <div className="loading-spinner">Loading...</div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="empty-conversations">
                        {conversationStore.searchQuery ? (
                            <p>No conversations found</p>
                        ) : (
                            <>
                                <p>No conversations yet</p>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={handleNewConversation}
                                >
                                    Create your first conversation
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="sidebar-footer">
                <div className="stats-summary">
                    <div className="stat-item">
                        <span className="stat-label">Total:</span>
                        <span className="stat-value">{conversationStore.totalConversations}</span>
                    </div>
                </div>
            </div>
        </div>
    );
});