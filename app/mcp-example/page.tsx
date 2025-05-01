'use client'

import { useState, useEffect } from 'react';
import { initMcpClient, callMcpTool } from '@/lib/mcp-client';

export default function McpExamplePage() {
  const [name, setName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize MCP client on component mount
  useEffect(() => {
    initMcpClient().catch(error => {
      console.error('Failed to initialize MCP client:', error);
      setError('Failed to connect to MCP server');
    });
  }, []);
  
  const handleGreet = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await callMcpTool('greet', { name });
      
      // Extract text from result content
      if (result?.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join(' ');
        
        setGreeting(textContent);
      } else {
        setGreeting('Received empty response');
      }
    } catch (err) {
      console.error('Error calling greet tool:', err);
      setError('Failed to get greeting from server');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">MCP Example</h1>
      
      <form onSubmit={handleGreet} className="space-y-4">
        <div>
          <label htmlFor="name" className="block mb-1">Your Name:</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border rounded"
            required
          />
        </div>
        
        <button 
          type="submit" 
          className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Get Greeting'}
        </button>
      </form>
      
      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded text-red-700">
          {error}
        </div>
      )}
      
      {greeting && (
        <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded">
          <h2 className="text-lg font-semibold mb-2">Response:</h2>
          <p>{greeting}</p>
        </div>
      )}
    </div>
  );
}
