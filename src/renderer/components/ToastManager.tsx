/**
 * File: src/renderer/components/ToastManager.tsx
 * Module: Toast Manager Component (View)
 * Purpose: Global toast notification system for user feedback
 * Usage: Display success, error, info, and warning messages
 * Contains: ToastManager, Toast, ToastProvider
 * Dependencies: Radix UI Toast, MobX stores
 * Iteration: 1
 */

import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import * as Toast from '@radix-ui/react-toast';
import { rootStore } from '../stores';
import {
    CheckCircle,
    XCircle,
    AlertCircle,
    Info,
    X,
} from 'lucide-react';

export interface ToastItem {
    id: string;
    title: string;
    description?: string;
    type: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
}

export const ToastManager = observer(() => {
    const { uiStore } = rootStore;

    useEffect(() => {
        // Auto-remove toasts after their duration
        const timers: NodeJS.Timeout[] = [];

        uiStore.toasts.forEach((toast) => {
            const duration = toast.duration || 5000;
            const timer = setTimeout(() => {
                uiStore.removeToast(toast.id);
            }, duration);
            timers.push(timer);
        });

        return () => {
            timers.forEach(clearTimeout);
        };
    }, [uiStore.toasts]);

    const getToastIcon = (type: ToastItem['type']) => {
        switch (type) {
            case 'success':
                return <CheckCircle size={20} />;
            case 'error':
                return <XCircle size={20} />;
            case 'warning':
                return <AlertCircle size={20} />;
            case 'info':
            default:
                return <Info size={20} />;
        }
    };

    const getToastClass = (type: ToastItem['type']) => {
        return `toast toast-${type}`;
    };

    return (
        <Toast.Provider swipeDirection="right">
            {uiStore.toasts.map((toast) => (
                <Toast.Root
                    key={toast.id}
                    className={getToastClass(toast.type)}
                    duration={toast.duration || 5000}
                    onOpenChange={(open) => {
                        if (!open) {
                            uiStore.removeToast(toast.id);
                        }
                    }}
                >
                    <div className="toast-content">
                        <div className="toast-icon">
                            {getToastIcon(toast.type)}
                        </div>

                        <div className="toast-text">
                            <Toast.Title className="toast-title">
                                {toast.title}
                            </Toast.Title>
                            {toast.description && (
                                <Toast.Description className="toast-description">
                                    {toast.description}
                                </Toast.Description>
                            )}
                        </div>

                        <Toast.Close className="toast-close">
                            <X size={16} />
                        </Toast.Close>
                    </div>
                </Toast.Root>
            ))}

            <Toast.Viewport className="toast-viewport" />
        </Toast.Provider>
    );
});