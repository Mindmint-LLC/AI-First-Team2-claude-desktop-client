/**
 * File: src/renderer/components/SettingsDialog.tsx
 * Module: Settings Dialog Component (View)
 * Purpose: Modal dialog for configuring application settings
 * Usage: Popup form for API keys, model selection, and preferences
 * Contains: SettingsDialog with provider/model configuration
 * Dependencies: Radix UI Dialog, MobX stores
 * Iteration: 2
 */

import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Slider from '@radix-ui/react-slider';
import * as Separator from '@radix-ui/react-separator';
import { rootStore } from '../stores';
import { Provider, Settings } from '@shared/types';
import { 
    X, 
    ChevronDown, 
    Eye, 
    EyeOff, 
    TestTube, 
    BarChart3, 
    Check,
    ChevronUp,
    Settings as SettingsIcon,
    Key,
    Brain,
    Sliders,
} from 'lucide-react';

export const SettingsDialog = observer(() => {
    const { settingsStore, uiStore } = rootStore;
    const [localSettings, setLocalSettings] = useState<Settings | null>(null);
    const [showApiKeys, setShowApiKeys] = useState<Record<Provider, boolean>>({
        claude: false,
        openai: false,
        ollama: false,
    });
    const [isTesting, setIsTesting] = useState<Provider | null>(null);
    const [testResults, setTestResults] = useState<Record<Provider, boolean | null>>({
        claude: null,
        openai: null,
        ollama: null,
    });

    useEffect(() => {
        if (settingsStore.settings) {
            setLocalSettings({ ...settingsStore.settings });
        }
    }, [settingsStore.settings]);

    useEffect(() => {
        if (localSettings?.provider) {
            const models = settingsStore.availableModels.get(localSettings.provider);
            if (!models) {
                settingsStore.loadModels(localSettings.provider);
            }
        }
    }, [localSettings?.provider]);

    const handleProviderChange = (provider: Provider) => {
        if (!localSettings) return;

        setLocalSettings({
            ...localSettings,
            provider,
            model: '', // Reset model when provider changes
        });

        // Load models for new provider
        settingsStore.loadModels(provider);
    };

    const handleModelChange = (model: string) => {
        if (!localSettings) return;

        setLocalSettings({
            ...localSettings,
            model,
        });
    };

    const handleApiKeyChange = (provider: Provider, value: string) => {
        if (!localSettings) return;

        setLocalSettings({
            ...localSettings,
            apiKeys: {
                ...localSettings.apiKeys,
                [provider]: value,
            },
        });
    };

    const handleTestConnection = async (provider: Provider) => {
        setIsTesting(provider);
        const success = await settingsStore.testConnection(provider);
        
        setTestResults(prev => ({
            ...prev,
            [provider]: success,
        }));
        
        setIsTesting(null);
        
        if (success) {
            uiStore.showToast(`${provider} connection successful`, 'success');
        } else {
            uiStore.showToast(`${provider} connection failed`, 'error');
        }
    };

    const handleSave = async () => {
        if (!localSettings) return;

        await settingsStore.updateSettings(localSettings);
        uiStore.closeSettings();
    };

    const handleCancel = () => {
        // Reset local settings
        if (settingsStore.settings) {
            setLocalSettings({ ...settingsStore.settings });
        }
        uiStore.closeSettings();
    };

    const toggleApiKeyVisibility = (provider: Provider) => {
        setShowApiKeys(prev => ({
            ...prev,
            [provider]: !prev[provider],
        }));
    };

    const getProviderDisplayName = (provider: Provider) => {
        switch (provider) {
            case 'claude':
                return 'Anthropic Claude';
            case 'openai':
                return 'OpenAI';
            case 'ollama':
                return 'Ollama (Local)';
            default:
                return provider;
        }
    };

    const getModelDisplayName = (model: string) => {
        const modelNames: Record<string, string> = {
            'claude-3-opus-20240229': 'Claude 3 Opus',
            'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
            'claude-3-haiku-20240307': 'Claude 3 Haiku',
            'claude-2.1': 'Claude 2.1',
            'claude-2.0': 'Claude 2.0',
            'gpt-4-turbo-preview': 'GPT-4 Turbo',
            'gpt-4': 'GPT-4',
            'gpt-3.5-turbo': 'GPT-3.5 Turbo',
            'llama2': 'Llama 2',
            'mistral': 'Mistral',
            'codellama': 'Code Llama',
        };
        return modelNames[model] || model;
    };

    if (!localSettings) {
        return null;
    }

    const availableModels = settingsStore.availableModels.get(localSettings.provider) || [];

    return (
        <Dialog.Root open={uiStore.isSettingsOpen} onOpenChange={uiStore.closeSettings}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="dialog-content settings-dialog">
                    <div className="dialog-header">
                        <div className="dialog-title-section">
                            <SettingsIcon size={20} />
                            <Dialog.Title className="dialog-title">
                                Settings
                            </Dialog.Title>
                        </div>
                        <Dialog.Close className="dialog-close">
                            <X size={20} />
                        </Dialog.Close>
                    </div>

                    <div className="settings-content">
                        {/* Provider Section */}
                        <div className="settings-section">
                            <h3 className="section-title">
                                <Brain size={16} />
                                AI Provider
                            </h3>

                            <div className="form-group">
                                <label htmlFor="provider">Provider</label>
                                <Select.Root
                                    value={localSettings.provider}
                                    onValueChange={(value) => handleProviderChange(value as Provider)}
                                >
                                    <Select.Trigger className="select-trigger">
                                        <Select.Value />
                                        <ChevronDown size={16} />
                                    </Select.Trigger>
                                    <Select.Portal>
                                        <Select.Content className="select-content">
                                            <Select.Viewport>
                                                <Select.Item value="claude" className="select-item">
                                                    <Select.ItemText>Anthropic Claude</Select.ItemText>
                                                    <Select.ItemIndicator>
                                                        <Check size={14} />
                                                    </Select.ItemIndicator>
                                                </Select.Item>
                                                <Select.Item value="openai" className="select-item">
                                                    <Select.ItemText>OpenAI</Select.ItemText>
                                                    <Select.ItemIndicator>
                                                        <Check size={14} />
                                                    </Select.ItemIndicator>
                                                </Select.Item>
                                                <Select.Item value="ollama" className="select-item">
                                                    <Select.ItemText>Ollama (Local)</Select.ItemText>
                                                    <Select.ItemIndicator>
                                                        <Check size={14} />
                                                    </Select.ItemIndicator>
                                                </Select.Item>
                                            </Select.Viewport>
                                        </Select.Content>
                                    </Select.Portal>
                                </Select.Root>
                            </div>

                            <div className="form-group">
                                <label htmlFor="model">Model</label>
                                <Select.Root
                                    value={localSettings.model}
                                    onValueChange={handleModelChange}
                                >
                                    <Select.Trigger className="select-trigger">
                                        <Select.Value placeholder="Select a model..." />
                                        <ChevronDown size={16} />
                                    </Select.Trigger>
                                    <Select.Portal>
                                        <Select.Content className="select-content">
                                            <Select.Viewport>
                                                {availableModels.map((model) => (
                                                    <Select.Item key={model} value={model} className="select-item">
                                                        <Select.ItemText>
                                                            {getModelDisplayName(model)}
                                                        </Select.ItemText>
                                                        <Select.ItemIndicator>
                                                            <Check size={14} />
                                                        </Select.ItemIndicator>
                                                    </Select.Item>
                                                ))}
                                            </Select.Viewport>
                                        </Select.Content>
                                    </Select.Portal>
                                </Select.Root>
                            </div>
                        </div>

                        <Separator.Root className="settings-separator" />

                        {/* API Keys Section */}
                        <div className="settings-section">
                            <h3 className="section-title">
                                <Key size={16} />
                                API Keys
                            </h3>

                            {(['claude', 'openai', 'ollama'] as Provider[]).map((provider) => (
                                <div key={provider} className="api-key-group">
                                    <div className="api-key-header">
                                        <label htmlFor={`api-key-${provider}`}>
                                            {getProviderDisplayName(provider)}
                                        </label>
                                        <div className="api-key-actions">
                                            {provider !== 'ollama' && (
                                                <button
                                                    type="button"
                                                    className="btn-icon"
                                                    onClick={() => handleTestConnection(provider)}
                                                    disabled={isTesting === provider || !localSettings.apiKeys[provider]}
                                                    title="Test connection"
                                                >
                                                    {isTesting === provider ? (
                                                        <div className="loading-spinner small" />
                                                    ) : (
                                                        <TestTube size={14} />
                                                    )}
                                                </button>
                                            )}
                                            {testResults[provider] !== null && (
                                                <div className={`test-result ${testResults[provider] ? 'success' : 'error'}`}>
                                                    {testResults[provider] ? '✓' : '✗'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="input-with-toggle">
                                        <input
                                            id={`api-key-${provider}`}
                                            type={showApiKeys[provider] ? 'text' : 'password'}
                                            className="form-input"
                                            value={localSettings.apiKeys[provider]}
                                            onChange={(e) => handleApiKeyChange(provider, e.target.value)}
                                            placeholder={
                                                provider === 'ollama' 
                                                    ? 'Not required for local Ollama'
                                                    : `Enter your ${getProviderDisplayName(provider)} API key...`
                                            }
                                            disabled={provider === 'ollama'}
                                        />
                                        {provider !== 'ollama' && (
                                            <button
                                                type="button"
                                                className="toggle-visibility-btn"
                                                onClick={() => toggleApiKeyVisibility(provider)}
                                            >
                                                {showApiKeys[provider] ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Separator.Root className="settings-separator" />

                        {/* Model Parameters Section */}
                        <div className="settings-section">
                            <h3 className="section-title">
                                <Sliders size={16} />
                                Model Parameters
                            </h3>

                            <div className="form-group">
                                <label htmlFor="temperature">
                                    Temperature: {localSettings.temperature.toFixed(2)}
                                </label>
                                <Slider.Root
                                    className="slider-root"
                                    value={[localSettings.temperature]}
                                    onValueChange={([value]) => setLocalSettings({ ...localSettings, temperature: value })}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                >
                                    <Slider.Track className="slider-track">
                                        <Slider.Range className="slider-range" />
                                    </Slider.Track>
                                    <Slider.Thumb className="slider-thumb" />
                                </Slider.Root>
                                <div className="slider-labels">
                                    <span>Focused</span>
                                    <span>Creative</span>
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="max-tokens">Max Tokens</label>
                                <input
                                    id="max-tokens"
                                    type="number"
                                    className="form-input"
                                    value={localSettings.maxTokens}
                                    onChange={(e) => setLocalSettings({ ...localSettings, maxTokens: parseInt(e.target.value) || 0 })}
                                    min={1}
                                    max={128000}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="system-prompt">System Prompt</label>
                                <textarea
                                    id="system-prompt"
                                    className="form-textarea"
                                    value={localSettings.systemPrompt}
                                    onChange={(e) => setLocalSettings({ ...localSettings, systemPrompt: e.target.value })}
                                    placeholder="Enter system prompt..."
                                    rows={4}
                                />
                            </div>
                        </div>

                        <Separator.Root className="settings-separator" />

                        {/* Advanced Section */}
                        <div className="settings-section">
                            <h3 className="section-title">
                                <BarChart3 size={16} />
                                Advanced
                            </h3>

                            <div className="form-group">
                                <label htmlFor="retry-attempts">Retry Attempts</label>
                                <input
                                    id="retry-attempts"
                                    type="number"
                                    className="form-input"
                                    value={localSettings.retryAttempts}
                                    onChange={(e) => setLocalSettings({ ...localSettings, retryAttempts: parseInt(e.target.value) || 0 })}
                                    min={0}
                                    max={10}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="stream-rate-limit">Stream Rate Limit (ms)</label>
                                <input
                                    id="stream-rate-limit"
                                    type="number"
                                    className="form-input"
                                    value={localSettings.streamRateLimit}
                                    onChange={(e) => setLocalSettings({ ...localSettings, streamRateLimit: parseInt(e.target.value) || 0 })}
                                    min={10}
                                    max={1000}
                                />
                            </div>

                            {localSettings.provider === 'ollama' && (
                                <div className="form-group">
                                    <label htmlFor="ollama-endpoint">Ollama Endpoint</label>
                                    <input
                                        id="ollama-endpoint"
                                        type="url"
                                        className="form-input"
                                        value={localSettings.ollamaEndpoint || ''}
                                        onChange={(e) => setLocalSettings({ ...localSettings, ollamaEndpoint: e.target.value })}
                                        placeholder="http://localhost:11434/api"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="dialog-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleCancel}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSave}
                        >
                            Save Settings
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
});