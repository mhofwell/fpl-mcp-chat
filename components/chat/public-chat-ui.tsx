'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    checkMcpSession,
    initializeMcpSession,
    getFplAnswer,
} from '@/lib/mcp-client';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function ImprovedChatUI() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [sessionInitialized, setSessionInitialized] = useState(false);
    const [initError, setInitError] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const autoInitAttempted = useRef(false);

    // Check session and auto-init on mount
useEffect(() => {
    const initializeSession = async () => {
        try {
            // Don't even try to check for a session if we don't have a session ID in localStorage
            const sessionId = localStorage.getItem('mcp-session-id');
            let hasValidSession = false;
            
            if (sessionId) {
                console.log('Found session ID in localStorage, checking validity...');
                hasValidSession = await checkMcpSession();
            }

            if (hasValidSession) {
                console.log('Found existing valid session');
                setSessionInitialized(true);
                setIsInitializing(false);
                return;
            }

            // Only attempt auto-init once
            if (autoInitAttempted.current) {
                setIsInitializing(false);
                return;
            }

            autoInitAttempted.current = true;
            console.log('Starting auto-initialization...');

            // Auto-initialize the session
            await initializeMcpSession();
            console.log('Session initialized successfully');
            setSessionInitialized(true);
        } catch (error) {
            console.error('Error during session initialization:', error);
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            setInitError(
                `Failed to initialize chat session: ${errorMessage}`
            );
        } finally {
            setIsInitializing(false);
        }
    };

    initializeSession();
}, []);

    // Initialize MCP session (manual fallback)
    const handleInitSession = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInitializing(true);
        setInitError('');

        try {
            await initializeMcpSession();
            setSessionInitialized(true);
        } catch (error) {
            console.error('Error initializing session:', error);
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            setInitError(`Failed to initialize chat session: ${errorMessage}`);
        } finally {
            setIsInitializing(false);
        }
    };

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

        // Add user message to UI
        const userMessageObj: Message = {
            role: 'user',
            content: userMessage,
        };
        setMessages((prev) => [...prev, userMessageObj]);

        try {
            // Get response from the FPL assistant
            const content = await getFplAnswer(userMessage);

            // Add assistant response to UI
            const assistantMessageObj: Message = {
                role: 'assistant',
                content,
            };
            setMessages((prev) => [...prev, assistantMessageObj]);
        } catch (error) {
            console.error('Error getting response:', error);

            // Check if this is a session error
            if (error instanceof Error && error.message.includes('session')) {
                setSessionInitialized(false);
                setInitError(
                    'Your session has expired. Please restart the chat.'
                );
            } else {
                // Add error message to UI
                const errorMessageObj: Message = {
                    role: 'assistant',
                    content:
                        'Sorry, there was an error processing your request. Please try again.',
                };
                setMessages((prev) => [...prev, errorMessageObj]);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // Show session initialization UI if session is not initialized
    if (!sessionInitialized) {
        return (
            <div className="flex flex-col h-[600px] w-full max-w-3xl mx-auto rounded-lg border bg-background shadow-sm">
                <div className="border-b p-3">
                    <h3 className="font-semibold">FPL Chat Assistant</h3>
                    <p className="text-sm text-muted-foreground">
                        Initialize a chat session to begin
                    </p>
                </div>

                <div className="flex-1 p-4 flex flex-col items-center justify-center">
                    <h2 className="text-xl font-semibold mb-4">
                        Start a New Chat Session
                    </h2>
                    <p className="text-muted-foreground mb-8 text-center max-w-md">
                        Click the button below to start a new chat session with
                        the FPL Assistant
                    </p>

                    {initError && (
                        <div className="p-3 mb-4 text-red-500 bg-red-50 rounded-md border border-red-200">
                            {initError}
                        </div>
                    )}

                    <form onSubmit={handleInitSession}>
                        <Button
                            type="submit"
                            disabled={isInitializing}
                            className="px-6 py-2"
                        >
                            {isInitializing
                                ? 'Initializing...'
                                : 'Start Chat Session'}
                        </Button>
                    </form>
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
                        className="shrink-0"
                    >
                        {isProcessing ? 'Thinking...' : 'Send'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
