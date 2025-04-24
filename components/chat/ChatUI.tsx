'use client';

import { useState, useEffect, useRef } from 'react';
import { initializeMcpSession, handleMcpRequest } from '@/app/actions/mcp';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function ChatUI() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle user message submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!input.trim() || isProcessing) return;

        const userMessage = input.trim();
        setInput('');
        setIsProcessing(true);

        // Add user message to chat
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: userMessage },
        ]);

        try {
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

            // Add assistant response to chat
            setMessages((prev) => [...prev, { role: 'assistant', content }]);
        } catch (error) {
            console.error('Error getting response:', error);

            // Add error message
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content:
                        'Sorry, there was an error processing your request. Please try again.',
                },
            ]);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Messages area */}
            <div className="flex-1 p-4 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <p className="mb-4 text-xl">
                            Welcome to FPL Chat Assistant!
                        </p>
                        <p>Ask me anything about Fantasy Premier League.</p>
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                        >
                            <div
                                className={`inline-block p-3 rounded-lg max-w-[80%] ${
                                    msg.role === 'user'
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-200 text-gray-800'
                                }`}
                            >
                                {msg.content}
                            </div>
                        </div>
                    ))
                )}
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
                        disabled={isProcessing}
                    />
                    <button
                        type="submit"
                        className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        disabled={!input.trim() || isProcessing}
                    >
                        {isProcessing ? 'Thinking...' : 'Send'}
                    </button>
                </form>
            </div>
        </div>
    );
}
