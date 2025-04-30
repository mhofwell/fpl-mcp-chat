// app/api/mcp/init/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { createMcpServer } from '@/lib/mcp-server';
import { mcpTransport } from '@/lib/mcp-server/transport';
import {
    initializeServerMcpSession,
    getServerSessionId,
} from '@/lib/mcp-server/server-init';

// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

export async function POST(request: NextRequest) {
    try {
        console.log('Starting MCP session initialization...');

        // Make sure server MCP is initialized first
        const serverInit = await initializeServerMcpSession();
        console.log('Server init result:', serverInit);

        if (!serverInit.success) {
            console.error('Server initialization failed:', serverInit.error);
            return NextResponse.json(
                { error: `Server initialization failed: ${serverInit.error}` },
                { status: 500 }
            );
        }

        const serverSessionId = getServerSessionId();
        console.log('Retrieved server session ID:', serverSessionId);

        if (!serverSessionId) {
            console.error(
                'No valid server session ID available after initialization'
            );
            return NextResponse.json(
                { error: 'Server session initialization failed' },
                { status: 500 }
            );
        }

        // Create initialize request body
        const requestBody = {
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                client: {
                    name: 'FPL-Chat-App',
                    version: '1.0.0',
                },
                streamMode: 'json',
            },
            id: 1,
        };

        // Call the MCP API with the request body
        const mcpRequest = new Request(
            new URL('/api/mcp', request.url).toString(),
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream'
                },
                body: JSON.stringify(requestBody),
            }
        );

        // Call our own MCP API endpoint
        const response = await fetch(mcpRequest);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            return NextResponse.json(
                {
                    error: `Failed with status ${response.status}: ${errorText}`,
                },
                { status: response.status }
            );
        }

        // Get the response data
        const responseData = await response.json();

        // Check for successful initialization
        if (responseData?.result?.session_id) {
            const session_id = responseData.result.session_id;

            // Create a response with the session ID
            return NextResponse.json({
                success: true,
                session_id: session_id,
            });
        } else {
            console.error('Response missing session_id:', responseData);
            return NextResponse.json(
                { error: 'Missing session ID in response' },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Error during MCP session initialization:', error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error during initialization',
            },
            { status: 500 }
        );
    }
}
