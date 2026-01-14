import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Trash2, Sparkles, Zap, BarChart3, Bell, Download, ChevronDown, Bot, Cpu } from 'lucide-react';
import { useChatContext } from '../context/ChatContext';
import { useLanguage } from '../context/LanguageContext';
import { getApiBase } from '../config/api';

const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
    const { messages, isLoading, selectedModel, setSelectedModel, sendMessage, clearChat } = useChatContext();
    const { t } = useLanguage();

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null);

    // Quick action buttons with translations
    const quickActions = [
        { id: 'daily', textKey: 'chat.quickActions.daily', icon: Zap },
        { id: 'compare', textKey: 'chat.quickActions.compare', icon: BarChart3 },
        { id: 'alerts', textKey: 'chat.quickActions.alerts', icon: Bell },
        { id: 'export', textKey: 'chat.quickActions.export', icon: Download },
    ];

    // Model options
    const modelOptions = [
        { id: 'gemini' as const, name: 'Gemini', icon: Sparkles },
        { id: 'gpt' as const, name: 'ChatGPT', icon: Bot },
    ];

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
                setModelDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSend = () => {
        if (inputValue.trim() && !isLoading) {
            sendMessage(inputValue);
            setInputValue('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleQuickAction = (textKey: string) => {
        sendMessage(t(textKey));
    };

    const handleModelSelect = (modelId: 'gemini' | 'gpt') => {
        setSelectedModel(modelId);
        setModelDropdownOpen(false);
    };

    // Format message content (handle markdown-like formatting)
    const formatContent = (content: string) => {
        // Handle CSV download links
        const csvLinkRegex = /\/api\/chat\/csv\/[\w\-\.]+\.csv/g;
        if (csvLinkRegex.test(content)) {
            return content.replace(csvLinkRegex, (match) => {
                const filename = match.split('/').pop();
                return `<a href="${getApiBase()}${match}" target="_blank" class="csv-link">📥 ${t('common.download')} ${filename}</a>`;
            });
        }
        return content;
    };

    const currentModel = modelOptions.find(m => m.id === selectedModel) || modelOptions[0];
    const CurrentModelIcon = currentModel.icon;

    return (
        <>
            {/* Floating Action Button */}
            <button
                className={`chat-fab ${isOpen ? 'hidden' : ''}`}
                onClick={() => setIsOpen(true)}
                aria-label="Open AI Chat"
            >
                <MessageCircle size={28} />
                <span className="fab-pulse"></span>
            </button>

            {/* Chat Panel */}
            <div className={`chat-panel ${isOpen ? 'open' : ''}`}>
                {/* Header */}
                <div className="chat-header">
                    <div className="chat-header-left">
                        <div className="chat-avatar">
                            <CurrentModelIcon size={20} />
                        </div>
                        <div>
                            <h3>{t('chat.title')}</h3>
                            <span className="chat-status">
                                {isLoading ? t('chat.thinking') : t('chat.ready')}
                            </span>
                        </div>
                    </div>
                    <div className="chat-header-actions">
                        {/* Model Selector Dropdown */}
                        <div className="model-selector" ref={modelDropdownRef}>
                            <button
                                className="model-selector-btn"
                                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                                title={t('chat.model')}
                            >
                                <CurrentModelIcon size={16} />
                                <span>{currentModel.name}</span>
                                <ChevronDown size={14} className={modelDropdownOpen ? 'rotated' : ''} />
                            </button>
                            {modelDropdownOpen && (
                                <div className="model-dropdown">
                                    {modelOptions.map(model => (
                                        <button
                                            key={model.id}
                                            className={`model-option ${selectedModel === model.id ? 'active' : ''}`}
                                            onClick={() => handleModelSelect(model.id)}
                                        >
                                            <model.icon size={16} />
                                            <span>{model.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={clearChat} title={t('chat.clearChat')}>
                            <Trash2 size={18} />
                        </button>
                        <button onClick={() => setIsOpen(false)} title={t('chat.close')}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="chat-messages">
                    {messages.length === 0 ? (
                        <div className="chat-welcome">
                            <Sparkles size={40} className="welcome-icon" />
                            <h4>{t('chat.welcome')}</h4>
                            <p>{t('chat.welcomeMessage')}</p>

                            <div className="quick-actions">
                                {quickActions.map(action => (
                                    <button
                                        key={action.id}
                                        className="quick-action-btn"
                                        onClick={() => handleQuickAction(action.textKey)}
                                    >
                                        <action.icon size={16} />
                                        <span>{t(action.textKey)}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map(msg => (
                            <div key={msg.id} className={`chat-message ${msg.role}`}>
                                <div
                                    className="message-content"
                                    dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                                />
                                {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                                    <div className="tools-used">
                                        🔧 {t('chat.usedTools')}: {msg.toolsUsed.join(', ')}
                                    </div>
                                )}
                                {msg.model && msg.role === 'assistant' && (
                                    <div className="message-model">
                                        {msg.model === 'gpt' ? <Bot size={12} /> : <Sparkles size={12} />}
                                        <span>{msg.model === 'gpt' ? 'ChatGPT' : 'Gemini'}</span>
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {isLoading && (
                        <div className="chat-message assistant loading">
                            <div className="typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="chat-input-container">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={t('chat.placeholder')}
                        disabled={isLoading}
                    />
                    <button
                        className="send-btn"
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </>
    );
};

export default ChatWidget;

