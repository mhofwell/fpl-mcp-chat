'use client';

import { useState, useRef, useEffect } from 'react';
import { handleMcpRequest } from '@/app/actions/mcp';
import { Button } from "@/components/ui/button";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function PublicChatUI() {
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

    // Add user message to UI
    const userMessageObj: Message = {
      role: 'user',
      content: userMessage,
    };
    setMessages((prev) => [...prev, userMessageObj]);

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
      const content = response.result?.content?.[0]?.text || "Sorry, I couldn't find an answer.";

      // Add assistant response to UI
      const assistantMessageObj: Message = {
        role: 'assistant',
        content,
      };
      setMessages((prev) => [...prev, assistantMessageObj]);
    } catch (error) {
      console.error('Error getting response:', error);

      // Add error message to UI
      const errorMessageObj: Message = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessageObj]);
    } finally {
      setIsProcessing(false);
    }
  };

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
            <h3 className="text-xl font-semibold mb-2">Welcome to FPL Chat Assistant!</h3>
            <p className="max-w-md">
              Ask me anything about Fantasy Premier League - players, teams, statistics, 
              strategies, or tips for managing your team.
            </p>
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