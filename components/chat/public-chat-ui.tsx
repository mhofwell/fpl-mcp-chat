'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { initMcpClient, getFplAnswer } from '@/lib/mcp-client';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function ChatUI() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initialize MCP client on component mount
    useEffect(() => {
        async function setupMcpClient() {
            try {
                setIsConnecting(true);
                setConnectionError(null);

                // Initialize client with a fresh session
                await initMcpClient(true);

                // Successful connection
                setIsConnecting(false);
            } catch (error) {
                console.error('Failed to initialize MCP client:', error);
                setConnectionError(
                    error instanceof Error
                        ? error.message
                        : 'Unknown connection error'
                );
                setIsConnecting(false);
            }
        }

        setupMcpClient();

        // Clean up on unmount
        return () => {
            // No need for explicit cleanup as the MCP client is a singleton
        };
    }, []);

    // Scroll to bottom of messages on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle message submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!input.trim() || isProcessing) return;

        const userMessage = input.trim();
        setInput('');
        setIsProcessing(true);

        // Add user message
        const userMessageObj: Message = {
            role: 'user',
            content: userMessage,
        };
        setMessages((prev) => [...prev, userMessageObj]);

        try {
            // Get response from MCP server
            const response = await getFplAnswer(userMessage);

            // Add assistant message
            const assistantMessageObj: Message = {
                role: 'assistant',
                content: response,
            };
            setMessages((prev) => [...prev, assistantMessageObj]);
        } catch (error) {
            console.error('Error getting response:', error);

            // Add error message
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : 'Unknown error occurred. Please try again.';

            const errorMessageObj: Message = {
                role: 'assistant',
                content: `Sorry, there was an error: ${errorMessage}`,
            };
            setMessages((prev) => [...prev, errorMessageObj]);

            // If it was a connection error, show reconnect button
            if (
                errorMessage.includes('session') ||
                errorMessage.includes('connection')
            ) {
                setConnectionError(
                    'Connection lost. Please reload the page to reconnect.'
                );
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle retry connection
    const handleRetryConnection = async () => {
        setIsConnecting(true);
        setConnectionError(null);

        try {
            await initMcpClient(true);
            setIsConnecting(false);
        } catch (error) {
            console.error('Failed to reconnect:', error);
            setConnectionError(
                error instanceof Error ? error.message : 'Failed to reconnect'
            );
            setIsConnecting(false);
        }
    };

    // Show loading state
    if (isConnecting) {
        return (
            <div className="flex flex-col h-[600px] w-full max-w-3xl mx-auto rounded-lg border bg-background shadow-sm">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h3 className="text-lg font-medium mb-2">
                            Connecting to FPL Chat Assistant...
                        </h3>
                        <p className="text-muted-foreground">
                            Please wait while we establish a connection.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Show error state
    if (connectionError) {
        return (
            <div className="flex flex-col h-[600px] w-full max-w-3xl mx-auto rounded-lg border bg-background shadow-sm">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h3 className="text-lg font-medium mb-2 text-red-500">
                            Connection Error
                        </h3>
                        <p className="text-muted-foreground mb-4">
                            {connectionError}
                        </p>
                        <Button
                            onClick={handleRetryConnection}
                            disabled={isConnecting}
                        >
                            {isConnecting
                                ? 'Reconnecting...'
                                : 'Retry Connection'}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[600px] w-full max-w-3xl mx-auto rounded-lg border bg-background shadow-sm">
            {/* Chat header */}
            <div className="border-b p-3">
                <h3 className="font-semibold">FPL Chat Assistant</h3>
                <p className="text-sm text-muted-foreground">
                    Ask any question about Fantasy Premier League
                </p>
            </div>

            {/* Messages area */}
            <div className="flex-1 p-4 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                        <h3 className="text-xl font-semibold mb-2">
                            Welcome to FPL Chat Assistant!
                        </h3>
                        <p className="max-w-md">
                            Ask me anything about Fantasy Premier League -
                            players, teams, statistics, strategies, or tips for
                            managing your team.
                        </p>
                        <div className="mt-6 text-sm">
                            <strong>Try questions like:</strong>
                            <ul className="mt-2 list-disc pl-5 text-left">
                                <li>
                                    "Which players have the best form over the
                                    last 5 gameweeks?"
                                </li>
                                <li>"Who should I captain this week?"</li>
                                <li>"What games are coming up next?"</li>
                                <li>"How's Liverpool's form this year?"</li>
                            </ul>
                        </div>
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
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-foreground'
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
            <div className="p-3 border-t">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about FPL..."
                        className="flex-1 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        disabled={isProcessing}
                    />
                    <Button
                        type="submit"
                        disabled={!input.trim() || isProcessing}
                    >
                        {isProcessing ? 'Thinking...' : 'Send'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
