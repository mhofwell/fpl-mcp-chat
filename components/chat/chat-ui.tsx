// components/chat/chat-ui.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { handleMcpRequest } from '@/app/actions/mcp';
import {
    getUserChats,
    getChatMessages,
    createChat,
    addMessage,
    updateChatTitle,
} from '@/utils/supabase/database';
import ChatSidebar from './chat-sidebar';
import { usePreferences } from '@/providers/preferences-provider';

interface Message {
    id?: string;
    chat_id?: string;
    role: 'user' | 'assistant';
    content: string;
    created_at?: string;
}

export default function ChatUI() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { preferences } = usePreferences();

    // Load user's most recent chat on component mount
    useEffect(() => {
        async function loadInitialChat() {
            try {
                const userChats = await getUserChats();

                if (userChats.length > 0) {
                    // Load the most recent chat
                    await loadChat(userChats[0].id);
                } else {
                    // Create a new chat if user has none
                    handleNewChat();
                }
            } catch (error) {
                console.error('Error loading initial chat:', error);
            }
        }

        loadInitialChat();
    }, []);

    // Scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Load a specific chat
    async function loadChat(chatId: string) {
        setIsLoadingChat(true);
        try {
            const chatMessages = await getChatMessages(chatId);
            setMessages(chatMessages);
            setActiveChatId(chatId);
        } catch (error) {
            console.error('Error loading chat messages:', error);
        } finally {
            setIsLoadingChat(false);
        }
    }

    // Create a new chat
    async function handleNewChat() {
        try {
            const newChat = await createChat();
            setMessages([]);
            setActiveChatId(newChat.id);
        } catch (error) {
            console.error('Error creating new chat:', error);
        }
    }

    // Handle user message submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!input.trim() || isProcessing || !activeChatId) return;

        const userMessage = input.trim();
        setInput('');
        setIsProcessing(true);

        // Add user message to UI first
        const userMessageObj: Message = {
            role: 'user',
            content: userMessage,
        };
        setMessages((prev) => [...prev, userMessageObj]);

        try {
            // Save user message to database
            await addMessage(activeChatId, userMessage, 'user');

            // If this is the first message in a new chat, update the title
            if (messages.length === 0) {
                // Use first few words of the message as chat title
                const title =
                    userMessage.length > 30
                        ? `${userMessage.substring(0, 30)}...`
                        : userMessage;
                await updateChatTitle(activeChatId, title);
            }

            // Call the MCP tool for answering FPL questions
            const requestData = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'answer-fpl-question',
                    arguments: {
                        question: userMessage,
                    },
                },
                id: Date.now(),
            };

            const response = await handleMcpRequest(requestData);

            if (response.error) {
                throw new Error(response.error);
            }

            // Get text content from the MCP response
            const content =
                response.result?.content?.[0]?.text ||
                "Sorry, I couldn't find an answer.";

            // Add assistant response to UI
            const assistantMessageObj: Message = {
                role: 'assistant',
                content,
            };
            setMessages((prev) => [...prev, assistantMessageObj]);

            // Save assistant response to database
            await addMessage(activeChatId, content, 'assistant');
        } catch (error) {
            console.error('Error getting response:', error);

            // Add error message to UI
            const errorMessageObj: Message = {
                role: 'assistant',
                content:
                    'Sorry, there was an error processing your request. Please try again.',
            };
            setMessages((prev) => [...prev, errorMessageObj]);

            // Save error message to database
            if (activeChatId) {
                await addMessage(
                    activeChatId,
                    'Sorry, there was an error processing your request. Please try again.',
                    'assistant'
                );
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const renderChatContent = () => {
        if (isLoadingChat) {
            return (
                <div className="flex flex-col items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-700"></div>
                    <p className="mt-4 text-gray-500">
                        Loading conversation...
                    </p>
                </div>
            );
        }

        if (messages.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <p className="mb-4 text-xl">
                        Welcome to FPL Chat Assistant!
                    </p>
                    <p>Ask me anything about Fantasy Premier League.</p>
                </div>
            );
        }

        return messages.map((msg, index) => (
            <div
                key={msg.id || index}
                className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
            >
                <div
                    className={`inline-block p-3 rounded-lg max-w-[80%] ${
                        msg.role === 'user'
                            ? 'bg-green-500 text-white'
                            : preferences?.dark_mode
                              ? 'bg-gray-700 text-gray-200'
                              : 'bg-gray-200 text-gray-800'
                    }`}
                >
                    {msg.content}
                </div>
            </div>
        ));
    };

    return (
        <div
            className={`flex flex-1 overflow-hidden ${preferences?.dark_mode ? 'bg-gray-900 text-white' : ''}`}
        >
            <ChatSidebar
                activeChatId={activeChatId}
                onSelectChat={loadChat}
                onNewChat={handleNewChat}
            />

            <div className="flex flex-col flex-1 overflow-hidden">
                {/* Messages area */}
                <div
                    className={`flex-1 p-4 overflow-y-auto ${preferences?.dark_mode ? 'bg-gray-800' : ''}`}
                >
                    {renderChatContent()}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="p-4 border-t">
                    <form onSubmit={handleSubmit} className="flex">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask about FPL..."
                            className="flex-1 p-2 mr-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                            disabled={isProcessing || !activeChatId}
                        />
                        <button
                            type="submit"
                            className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                            disabled={
                                !input.trim() || isProcessing || !activeChatId
                            }
                        >
                            {isProcessing ? 'Thinking...' : 'Send'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
