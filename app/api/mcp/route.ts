// app/api/mcp/route.ts
import { createMcpServer } from '@/lib/mcp-server/index';
import { mcpTransport } from '@/lib/mcp-server/transport';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkForUpdates } from '@/lib/fpl-api/fpl-data-sync';
import { fplApiService } from '@/lib/fpl-api/service';
import redis from '@/lib/redis/redis-client';

// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

// Global variable to track if FPL service has been initialized
let fplServiceInitialized = false;

// Initialize FPL service (runs once on server startup)
async function initializeFplService() {
    if (!fplServiceInitialized) {
        await fplApiService.initialize();
        await checkForUpdates();
        fplServiceInitialized = true;
        console.log('FPL service initialized and updates checked');
    }
}

async function recreateTransportFromRedis(sessionId: string) {
    console.log(`Attempting to recreate transport for session ${sessionId}`);

    // Check if session exists in Redis
    const exists = await redis.exists(`mcp:session:${sessionId}`);
    if (!exists) {
        console.log(`Session ${sessionId} not found in Redis`);
        return undefined;
    }

    // Create a new transport with the existing session ID
    console.log(`Recreating transport for existing session ${sessionId}`);
    const transport = await mcpTransport.createTransport(sessionId);

    // Create and connect a new server instance
    const server = await createMcpServer();
    await server.connect(transport);
    console.log(
        `Reconnected server to recreated transport for session ${sessionId}`
    );

    return transport;
}

export async function POST(request: NextRequest) {
    try {
        console.log('==== MCP POST REQUEST START ====');
        // Get session ID from cookie or header
        const cookieStore = await cookies();
        const sessionId =
            request.headers.get('mcp-session-id') ||
            cookieStore.get('mcp-session-id')?.value ||
            null;

        console.log(
            'Request headers:',
            Object.fromEntries(request.headers.entries())
        );
        console.log('Session ID from request:', sessionId);
        console.log(
            'Active sessions before processing:',
            await mcpTransport.getActiveSessions()
        );

        // Parse the request body
        let requestBody;
        try {
            requestBody = await request.json();
        } catch (error) {
            console.error('Error parsing request body:', error);
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    error: {
                        code: -32700,
                        message: 'Parse error: Invalid JSON',
                    },
                    id: requestBody?.id || 'error-' + Date.now(),
                },
                { status: 400 }
            );
        }

        console.log('Request body:', JSON.stringify(requestBody));

        // For non-initialization requests, we check if the session exists
        if (sessionId) {
            // Try to get existing transport
            let transport = await mcpTransport.getTransport(sessionId);

            if (!transport) {
                console.log(
                    `Transport not in memory, attempting to recreate from Redis: ${sessionId}`
                );
                transport = await recreateTransportFromRedis(sessionId);
            }

            if (transport) {
                console.log(
                    'Found or recreated transport for session:',
                    sessionId
                );

                // Create a response stream
                const { readable, writable } = new TransformStream();
                const writer = writable.getWriter();

                // Mock response object to handle streaming
                const mockResponse = {
                    writeHead: () => mockResponse,
                    setHeader: () => mockResponse,
                    getHeader: (name: string) => request.headers.get(name),
                    write: async (chunk: string) => {
                        await writer.write(new TextEncoder().encode(chunk));
                        return mockResponse;
                    },
                    end: async (chunk?: string) => {
                        if (chunk) {
                            await writer.write(new TextEncoder().encode(chunk));
                        }
                        await writer.close();
                        return mockResponse;
                    },
                    // Add necessary properties for the transport handler
                    statusCode: 200,
                    statusMessage: 'OK',
                    headersSent: false,
                };

                // Handle the request with the transport
                await transport.handleRequest(
                    request as any,
                    mockResponse as any,
                    requestBody
                );

                console.log('==== MCP POST REQUEST END ====');
                return new NextResponse(readable, {
                    headers: {
                        'Content-Type': 'application/json',
                        'mcp-session-id': sessionId,
                    },
                });
            } else {
                console.log('Session not found:', sessionId);
                console.log(
                    'Active sessions:',
                    await mcpTransport.getActiveSessions()
                );

                return NextResponse.json(
                    {
                        jsonrpc: '2.0',
                        id: 'error-' + Date.now(),
                        error: {
                            code: -32000,
                            message: 'No session ID found',
                        },
                    },
                    {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );
            }
        }
        // Handle initialize requests
        else if (isInitializeRequest(requestBody)) {
            // Create a new session ID
            const newSessionId = randomUUID();
            console.log(
                'Creating new transport with session ID:',
                newSessionId
            );

            // Create a new transport
            const transport = await mcpTransport.createTransport(newSessionId);

            // Create and connect server
            const server = await createMcpServer();
            await server.connect(transport);

            console.log('Transport connected to server');

            // Create a response stream
            const { readable, writable } = new TransformStream();
            const writer = writable.getWriter();

            // Mock response object
            const mockResponse = {
                writeHead: () => mockResponse,
                setHeader: () => mockResponse,
                getHeader: (name: string) => request.headers.get(name),
                write: async (chunk: string) => {
                    await writer.write(new TextEncoder().encode(chunk));
                    return mockResponse;
                },
                end: async (chunk?: string) => {
                    if (chunk) {
                        await writer.write(new TextEncoder().encode(chunk));
                    }
                    await writer.close();
                    return mockResponse;
                },
                // Add necessary properties
                statusCode: 200,
                statusMessage: 'OK',
                headersSent: false,
            };

            // Handle the request with the transport
            await transport.handleRequest(
                request as any,
                mockResponse as any,
                requestBody
            );

            console.log(
                'Active sessions after initialization:',
                await mcpTransport.getActiveSessions()
            );
            console.log('==== MCP POST REQUEST END ====');

            return new NextResponse(readable, {
                headers: {
                    'Content-Type': 'application/json',
                    'mcp-session-id': newSessionId,
                },
            });
        } else {
            // No session ID provided for a non-initialization request
            console.log(
                'No session ID provided for non-initialization request'
            );
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id: 'error-' + Date.now(),
                    error: {
                        code: -32000,
                        message: 'No session ID found',
                    },
                },
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }
    } catch (error) {
        console.error('Error handling MCP POST request:', error);
        return NextResponse.json(
            {
                jsonrpc: '2.0',
                id: 'error-' + Date.now(),
                error: {
                    code: -32603,
                    message: 'Internal server error',
                    data:
                        process.env.NODE_ENV === 'development'
                            ? String(error)
                            : undefined,
                },
            },
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        // Ensure FPL service is initialized
        await initializeFplService();

        // Get session ID from query param, cookie, or header
        const url = new URL(request.url);
        const sessionIdFromQuery = url.searchParams.get('mcp-session-id');

        const cookieStore = await cookies();
        const sessionId =
            sessionIdFromQuery ||
            request.headers.get('mcp-session-id') ||
            cookieStore.get('mcp-session-id')?.value ||
            null;

        if (!sessionId) {
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id: 'error-' + Date.now(),
                    error: {
                        code: -32000,
                        message: 'No session ID found',
                    },
                },
                { status: 400 }
            );
        }

        const transport = await mcpTransport.getTransport(sessionId);
        if (!transport) {
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id: 'error-' + Date.now(),
                    error: {
                        code: -32001,
                        message: 'Invalid session ID',
                    },
                },
                { status: 400 }
            );
        }

        if (isDevMode) {
            console.log(`[DEV] MCP GET request (SSE) for session:`, sessionId);
        }

        // Create a server-sent events stream
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        // Write SSE headers and keep-alive
        const encoder = new TextEncoder();

        // Initial comment to establish connection
        await writer.write(encoder.encode(': connection established\n\n'));

        // Create ping interval to keep connection alive
        const pingInterval = setInterval(async () => {
            try {
                await writer.write(encoder.encode(': ping\n\n'));
            } catch (e) {
                clearInterval(pingInterval);
            }
        }, 30000);

        // Set up transport to use this writer
        transport.onmessage = async (message) => {
            try {
                // Log the message before sending
                console.log(
                    'SSE message before sending:',
                    JSON.stringify(message)
                );

                // Ensure the message follows JSON-RPC format
                if (message && typeof message === 'object') {
                    // Make sure jsonrpc field is present
                    if (!message.jsonrpc) {
                        message.jsonrpc = '2.0';
                    }

                    // Ensure ID is not null (must be string or number)
                    if (message.id === null) {
                        message.id = 'sse-' + Date.now();
                    }

                    // Check for structure validity
                    if (message.error && !message.id) {
                        message.id = 'error-' + Date.now();
                    }

                    // Check for proper result structure
                    if (!message.error && !message.result && !message.method) {
                        // Add a result field if missing
                        message.result = message.result || {};
                    }
                }

                const data = JSON.stringify(message);
                console.log('SSE message after formatting:', data);
                await writer.write(encoder.encode(`data: ${data}\n\n`));
            } catch (error) {
                console.error('Error writing SSE message:', error);
                clearInterval(pingInterval);
            }
        };

        // Return SSE response
        return new NextResponse(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Error handling MCP GET request:', error);
        return NextResponse.json(
            {
                jsonrpc: '2.0',
                id: 'error-' + Date.now(),
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
            },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        // Get session ID from cookie or header
        const cookieStore = await cookies();
        const sessionId =
            request.headers.get('mcp-session-id') ||
            cookieStore.get('mcp-session-id')?.value ||
            null;

        if (!sessionId) {
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id: 'error-' + Date.now(),
                    error: {
                        code: -32000,
                        message: 'No session ID found',
                    },
                },
                { status: 400 }
            );
        }

        const transport = await mcpTransport.getTransport(sessionId);
        if (!transport) {
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    id: 'error-' + Date.now(),
                    error: {
                        code: -32001,
                        message: 'Invalid session ID',
                    },
                },
                { status: 400 }
            );
        }

        if (isDevMode) {
            console.log(`[DEV] Deleting MCP session:`, sessionId);
        }

        // Disconnect and cleanup
        (transport as any).disconnect();

        // Clear cookie in response
        const response = NextResponse.json({
            jsonrpc: '2.0',
            result: { success: true },
            id: 'delete-' + Date.now(), // Always provide a valid ID
        });
        response.cookies.delete('mcp-session-id');

        return response;
    } catch (error) {
        console.error('Error handling MCP DELETE request:', error);
        return NextResponse.json(
            {
                jsonrpc: '2.0',
                id: 'error-' + Date.now(),
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
            },
            { status: 500 }
        );
    }
}
