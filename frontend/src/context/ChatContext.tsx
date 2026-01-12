import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getApiBase } from '../config/api';

// Types
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    toolsUsed?: string[];
}

interface ChatContextType {
    messages: Message[];
    isLoading: boolean;
    sendMessage: (message: string) => Promise<void>;
    clearChat: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChatContext = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChatContext must be used within ChatProvider');
    }
    return context;
};

interface ChatProviderProps {
    children: ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || isLoading) return;

        // Add user message
        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: content.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        try {
            const response = await fetch(`${getApiBase()}/api/chat/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: content
                })
            });

            const data = await response.json();

            if (data.success) {
                const aiMessage: Message = {
                    id: `ai_${Date.now()}`,
                    role: 'assistant',
                    content: data.message,
                    timestamp: new Date(),
                    toolsUsed: data.toolsUsed
                };

                setMessages(prev => [...prev, aiMessage]);
            } else {
                const errorMessage: Message = {
                    id: `error_${Date.now()}`,
                    role: 'assistant',
                    content: `❌ ${data.message || data.error || 'Unknown error'}`,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, errorMessage]);
            }
        } catch (error) {
            const errorMessage: Message = {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: `❌ ไม่สามารถเชื่อมต่อกับ AI ได้`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [isLoading]);

    const clearChat = useCallback(() => {
        setMessages([]);
    }, []);

    return (
        <ChatContext.Provider value={{ messages, isLoading, sendMessage, clearChat }}>
            {children}
        </ChatContext.Provider>
    );
};
