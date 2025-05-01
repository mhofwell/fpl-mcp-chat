'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

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
                <form className="flex gap-2">
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
