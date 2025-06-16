import React from 'react';
import { observer } from 'mobx-react-lite';
import * as Toast from '@radix-ui/react-toast';
import { rootStore } from '../stores';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import clsx from 'clsx';

export const ToastManager = observer(() => {
    const { uiStore } = rootStore;

    return (
        <Toast.Provider swipeDirection="right" duration={5000}>
            {uiStore.toasts.map((toast) => (
                <Toast.Root
                    key={toast.id}
                    className={clsx('toast', `toast-${toast.type}`)}
                    open={true}
                    onOpenChange={(open) => {
                        if (!open) uiStore.dismissToast(toast.id);
                    }}
                >
                    <div className="toast-content">
                        <div className="toast-icon">
                            {toast.type === 'success' && <CheckCircle size={20} />}
                            {toast.type === 'error' && <AlertCircle size={20} />}
                            {toast.type === 'info' && <Info size={20} />}
                        </div>
                        <Toast.Description className="toast-message">
                            {toast.message}
                        </Toast.Description>
                    </div>

                    <Toast.Action asChild altText="Dismiss">
                        <button className="toast-close" onClick={() => uiStore.dismissToast(toast.id)}>
                            <X size={16} />
                        </button>
                    </Toast.Action>
                </Toast.Root>
            ))}

            <Toast.Viewport className="toast-viewport" />
        </Toast.Provider>
    );
});