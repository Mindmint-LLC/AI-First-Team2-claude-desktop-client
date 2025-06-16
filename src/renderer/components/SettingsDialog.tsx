import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import * as Slider from '@radix-ui/react-slider';
import * as Separator from '@radix-ui/react-separator';
import { rootStore } from '../stores';
import { Provider, Settings } from '@shared/types';
import { X, ChevronDown, Eye, EyeOff, TestTube, BarChart3 } from 'lucide-react';

export const SettingsDialog = observer(() => {
    const { settingsStore, uiStore } = rootStore;
    const [localSettings, setLocalSettings] = useState<Settings | null>(null);
    const [showApiKeys, setShowApiKeys] = useState<Record<Provider, boolean>>({
        claude: false,
        openai: false,
        ollama: false,
    });
    const [isTesting, setIsTesting] = useState<Provider | null>(null);

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

        // Save current settings first
        if (localSettings) {
            await settingsStore.updateSettings(localSettings);
        }

        // Test connection
        await settingsStore.testConnection(provider);

        setIsTesting(null);
    };

    const handleSave = async () => {
        if (!localSettings) return;

        await settingsStore.updateSettings(localSettings);
        uiStore.hideSettings();
    };

    const handleShowStats = () => {
        uiStore.loadUsageStats();
    };

    if (!localSettings) return null;

    const currentModels = settingsStore.availableModels.get(localSettings.provider) || [];

    return (
        <Dialog.Root open={uiStore.isSettingsOpen} onOpenChange={(open) => !open && uiStore.hideSettings()}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="dialog-content settings-dialog">
                    <Dialog.Title className="dialog-title">Settings</Dialog.Title>

                    <button
                        className="dialog-close"
                        onClick={() => uiStore.hideSettings()}
                    >
                        <X size={20} />
                    </button>

                    <div className="settings-content">
                        {/* Provider Selection */}
                        <div className="settings-section">
                            <h3 className="section-title">AI Provider</h3>

                            <div className="form-group">
                                <label htmlFor="provider">Provider</label>
                                <Select.Root value={localSettings.provider} onValueChange={handleProviderChange}>
                                    <Select.Trigger className="select-trigger" id="provider">
                                        <Select.Value />
                                        <Select.Icon>
                                            <ChevronDown size={16} />
                                        </Select.Icon>
                                    </Select.Trigger>

                                    <Select.Portal>
                                        <Select.Content className="select-content">
                                            <Select.Viewport>
                                                <Select.Item value="claude" className="select-item">
                                                    <Select.ItemText>Claude (Anthropic)</Select.ItemText>
                                                </Select.Item>
                                                <Select.Item value="openai" className="select-item">
                                                    <Select.ItemText>OpenAI</Select.ItemText>
                                                </Select.Item>
                                                <Select.Item value="ollama" className="select-item">
                                                    <Select.ItemText>Ollama (Local)</Select.ItemText>
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
                                    disabled={currentModels.length === 0}
                                >
                                    <Select.Trigger className="select-trigger" id="model">
                                        <Select.Value placeholder="Select a model..." />
                                        <Select.Icon>
                                            <ChevronDown size={16} />
                                        </Select.Icon>
                                    </Select.Trigger>

                                    <Select.Portal>
                                        <Select.Content className="select-content">
                                            <Select.Viewport>
                                                {currentModels.map((model) => (
                                                    <Select.Item key={model.id} value={model.id} className="select-item">
                                                        <Select.ItemText>{model.name}</Select.ItemText>
                                                    </Select.Item>
                                                ))}
                                            </Select.Viewport>
                                        </Select.Content>
                                    </Select.Portal>
                                </Select.Root>
                            </div>
                        </div>

                        <Separator.Root className="separator" />

                        {/* API Configuration */}
                        <div className="settings-section">
                            <h3 className="section-title">API Configuration</h3>

                            {/* Claude API Key */}
                            {localSettings.provider === 'claude' && (
                                <div className="form-group">
                                    <label htmlFor="claude-key">Claude API Key</label>
                                    <div className="input-with-action">
                                        <input
                                            id="claude-key"
                                            type={showApiKeys.claude ? 'text' : 'password'}
                                            className="form-input"
                                            value={localSettings.apiKeys.claude}
                                            onChange={(e) => handleApiKeyChange('claude', e.target.value)}
                                            placeholder="sk-ant-..."
                                        />
                                        <button
                                            className="btn btn-icon"
                                            onClick={() => setShowApiKeys({ ...showApiKeys, claude: !showApiKeys.claude })}
                                        >
                                            {showApiKeys.claude ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                        <button
                                            className="btn btn-icon"
                                            onClick={() => handleTestConnection('claude')}
                                            disabled={!localSettings.apiKeys.claude || isTesting === 'claude'}
                                        >
                                            <TestTube size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* OpenAI API Key */}
                            {localSettings.provider === 'openai' && (
                                <div className="form-group">
                                    <label htmlFor="openai-key">OpenAI API Key</label>
                                    <div className="input-with-action">
                                        <input
                                            id="openai-key"
                                            type={showApiKeys.openai ? 'text' : 'password'}
                                            className="form-input"
                                            value={localSettings.apiKeys.openai}
                                            onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                                            placeholder="sk-..."
                                        />
                                        <button
                                            className="btn btn-icon"
                                            onClick={() => setShowApiKeys({ ...showApiKeys, openai: !showApiKeys.openai })}
                                        >
                                            {showApiKeys.openai ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                        <button
                                            className="btn btn-icon"
                                            onClick={() => handleTestConnection('openai')}
                                            disabled={!localSettings.apiKeys.openai || isTesting === 'openai'}
                                        >
                                            <TestTube size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Ollama Endpoint */}
                            {localSettings.provider === 'ollama' && (
                                <div className="form-group">
                                    <label htmlFor="ollama-endpoint">Ollama Endpoint</label>
                                    <div className="input-with-action">
                                        <input
                                            id="ollama-endpoint"
                                            type="text"
                                            className="form-input"
                                            value={localSettings.ollamaEndpoint || 'http://localhost:11434/api/chat'}
                                            onChange={(e) => setLocalSettings({ ...localSettings, ollamaEndpoint: e.target.value })}
                                            placeholder="http://localhost:11434/api/chat"
                                        />
                                        <button
                                            className="btn btn-icon"
                                            onClick={() => handleTestConnection('ollama')}
                                            disabled={isTesting === 'ollama'}
                                        >
                                            <TestTube size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Separator.Root className="separator" />

                        {/* Model Parameters */}
                        <div className="settings-section">
                            <h3 className="section-title">Model Parameters</h3>

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
                                    placeholder="You are a helpful AI assistant..."
                                    rows={4}
                                />
                            </div>
                        </div>

                        <Separator.Root className="separator" />

                        {/* Advanced Settings */}
                        <div className="settings-section">
                            <h3 className="section-title">Advanced</h3>

                            <div className="form-group">
                                <label htmlFor="retry-attempts">Retry Attempts</label>
                                <input
                                    id="retry-attempts"
                                    type="number"
                                    className="form-input"
                                    value={localSettings.retryAttempts}
                                    onChange={(e) => setLocalSettings({ ...localSettings, retryAttempts: parseInt(e.target.value) || 0 })}
                                    min={0}
                                    max={5}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="stream-rate">
                                    Stream Rate Limit: {localSettings.streamRateLimit}ms
                                </label>
                                <Slider.Root
                                    className="slider-root"
                                    value={[localSettings.streamRateLimit]}
                                    onValueChange={([value]) => setLocalSettings({ ...localSettings, streamRateLimit: value })}
                                    min={10}
                                    max={100}
                                    step={5}
                                >
                                    <Slider.Track className="slider-track">
                                        <Slider.Range className="slider-range" />
                                    </Slider.Track>
                                    <Slider.Thumb className="slider-thumb" />
                                </Slider.Root>
                                <div className="slider-labels">
                                    <span>Fast</span>
                                    <span>Smooth</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="dialog-footer">
                        <button
                            className="btn btn-secondary"
                            onClick={handleShowStats}
                        >
                            <BarChart3 size={16} />
                            Usage Stats
                        </button>

                        <div className="footer-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => uiStore.hideSettings()}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                            >
                                Save Settings
                            </button>
                        </div>
                    </div>

                    {/* Usage Stats Modal */}
                    {uiStore.usageStats && (
                        <div className="stats-overlay">
                            <div className="stats-modal">
                                <h3>Usage Statistics</h3>
                                <button
                                    className="stats-close"
                                    onClick={() => uiStore.usageStats = null}
                                >
                                    <X size={16} />
                                </button>

                                <div className="stats-content">
                                    <div className="stat-card">
                                        <h4>Total Usage</h4>
                                        <div className="stat-row">
                                            <span>Conversations:</span>
                                            <span>{uiStore.usageStats.totalConversations}</span>
                                        </div>
                                        <div className="stat-row">
                                            <span>Messages:</span>
                                            <span>{uiStore.usageStats.totalMessages}</span>
                                        </div>
                                        <div className="stat-row">
                                            <span>Tokens:</span>
                                            <span>{uiStore.usageStats.totalTokens.toLocaleString()}</span>
                                        </div>
                                        <div className="stat-row">
                                            <span>Cost:</span>
                                            <span>${uiStore.usageStats.totalCost.toFixed(4)}</span>
                                        </div>
                                    </div>

                                    <div className="stat-card">
                                        <h4>By Provider</h4>
                                        {Object.entries(uiStore.usageStats.byProvider).map(([provider, stats]) => (
                                            <div key={provider} className="provider-stats">
                                                <h5>{provider}</h5>
                                                <div className="stat-row">
                                                    <span>Messages:</span>
                                                    <span>{stats.messages}</span>
                                                </div>
                                                <div className="stat-row">
                                                    <span>Cost:</span>
                                                    <span>${stats.cost.toFixed(4)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
});