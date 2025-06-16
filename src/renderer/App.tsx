import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from './stores';
import { ConversationSidebar } from './components/ConversationSidebar';
import { MessageArea } from './components/MessageArea';
import { SettingsDialog } from './components/SettingsDialog';
import { ToastManager } from './components/ToastManager';
import { RenameDialog } from './components/RenameDialog';
import './styles/app.css';

export const App = observer(() => {
    const { conversationStore, uiStore } = rootStore;

    return (
        <div className="app-container">
            <div className="app-sidebar">
                <ConversationSidebar />
            </div>

            <div className="app-main">
                {conversationStore.activeConversation ? (
                    <MessageArea />
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-content">
                            <h2>Welcome to Claude Desktop Client</h2>
                            <p>Select a conversation or create a new one to get started</p>
                            <button
                                className="btn btn-primary"
                                onClick={() => conversationStore.createConversation()}
                            >
                                New Conversation
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {uiStore.isSettingsOpen && <SettingsDialog />}
            {uiStore.isRenameDialogOpen && <RenameDialog />}
            <ToastManager />
        </div>
    );
});