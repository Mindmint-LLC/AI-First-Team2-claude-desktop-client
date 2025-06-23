import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import * as Dialog from '@radix-ui/react-dialog';
import { rootStore } from '../stores';
import { X } from 'lucide-react';

export const RenameDialog = observer(() => {
    const { conversationStore, uiStore } = rootStore;
    const [title, setTitle] = useState('');

    const conversation = uiStore.renameConversationId
        ? conversationStore.conversations.find(c => c.id === uiStore.renameConversationId)
        : null;

    useEffect(() => {
        if (conversation) {
            setTitle(conversation.title);
        }
    }, [conversation]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!conversation || !title.trim()) return;

        await conversationStore.updateConversation(conversation.id, { title: title.trim() });
        uiStore.hideRenameDialog();
    };

    const handleCancel = () => {
        uiStore.hideRenameDialog();
    };

    return (
        <Dialog.Root open={uiStore.isRenameDialogOpen} onOpenChange={(open) => !open && handleCancel()}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="dialog-content rename-dialog">
                    <Dialog.Title className="dialog-title">Rename Conversation</Dialog.Title>

                    <button
                        className="dialog-close"
                        onClick={handleCancel}
                    >
                        <X size={20} />
                    </button>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="conversation-title">Title</label>
                            <input
                                id="conversation-title"
                                type="text"
                                className="form-input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter conversation title..."
                                autoFocus
                            />
                        </div>

                        <div className="dialog-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleCancel}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={!title.trim()}
                            >
                                Rename
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
});