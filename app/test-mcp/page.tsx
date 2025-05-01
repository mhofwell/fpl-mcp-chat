// fpl-nextjs-app/app/test-mcp/page.tsx
'use client';

import { useState } from 'react';
import {
    initStandaloneMcpClient,
    testStandaloneMcpEcho,
} from '@/lib/mcp-client/index';

export default function TestMcpPage() {
    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState('Hello from Next.js!');
    const [response, setResponse] = useState<string | null>(null);

    const connectToMcp = async () => {
        setLoading(true);
        setError(null);
        try {
            await initStandaloneMcpClient({ forceNew: true });
            setConnected(true);
        } catch (err) {
            setError(
                `Connection error: ${err instanceof Error ? err.message : String(err)}`
            );
            setConnected(false);
        } finally {
            setLoading(false);
        }
    };

    const testEcho = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await testStandaloneMcpEcho(message);
            setResponse(result);
        } catch (err) {
            setError(
                `Echo error: ${err instanceof Error ? err.message : String(err)}`
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-lg mx-auto">
            <h1 className="text-2xl font-bold mb-6">
                Test Standalone MCP Server
            </h1>

            <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">
                    Connection Status:
                </h2>
                <div className="flex items-center gap-2 mb-4">
                    <div
                        className={`w-4 h-4 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    <span>{connected ? 'Connected' : 'Disconnected'}</span>
                </div>
                <button
                    onClick={connectToMcp}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                    {loading ? 'Connecting...' : 'Connect to MCP Server'}
                </button>
            </div>

            {connected && (
                <div className="mb-6">
                    <h2 className="text-xl font-semibold mb-2">
                        Test Echo Tool:
                    </h2>
                    <div className="flex flex-col gap-2">
                        <input
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="px-3 py-2 border rounded"
                            placeholder="Enter message to echo"
                        />
                        <button
                            onClick={testEcho}
                            disabled={loading}
                            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                        >
                            {loading ? 'Sending...' : 'Send Echo Request'}
                        </button>
                    </div>
                </div>
            )}

            {response && (
                <div className="mb-6">
                    <h2 className="text-xl font-semibold mb-2">Response:</h2>
                    <div className="p-4 bg-gray-100 rounded whitespace-pre-wrap">
                        {response}
                    </div>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-100 text-red-800 rounded">
                    {error}
                </div>
            )}
        </div>
    );
}
