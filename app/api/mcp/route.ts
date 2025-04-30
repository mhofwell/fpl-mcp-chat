// app/api/mcp/route.ts
import { createMcpServer } from '@/lib/mcp-server';
import { mcpTransport } from '@/lib/mcp-server/transport';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkForUpdates } from '@/lib/fpl-api/fpl-data-sync';
import { fplApiService } from '@/lib/fpl-api/service';

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

export async function POST(request: NextRequest) {
    try {
        // Get session ID from cookie or header
        const cookieStore = await cookies();
        const sessionId =
            request.headers.get('mcp-session-id') ||
            cookieStore.get('mcp-session-id')?.value ||
            null;

        // Parse the request body
        const requestBody = await request.json();

        let transport;

        if (sessionId && mcpTransport.getTransport(sessionId)) {
            // Reuse existing transport
            transport = mcpTransport.getTransport(sessionId);
        } else if (!sessionId && isInitializeRequest(requestBody)) {
            // For initialize requests with no session
            // Create new transport for initialize request
            const newSessionId = randomUUID();
            transport = mcpTransport.createTransport(newSessionId);

            // Create and connect server
            const server = await createMcpServer();
            await server.connect(transport);
        } else {
            // Invalid request
            return NextResponse.json(
                {
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Bad Request: No valid session ID provided',
                    },
                    id: null,
                },
                { status: 400 }
            );
        }

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
        };

        // Handle the request with the transport
        await transport.handleRequest(
            request as any,
            mockResponse as any,
            requestBody
        );

        // Check if this was an initialize request and set a session cookie if needed
        if (isInitializeRequest(requestBody)) {
            // Handle initialization response with cookies
            // (implementation details)
        }

        // Return the response stream
        return new NextResponse(readable, {
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        console.error(`Error handling MCP POST request:`, error);
        return NextResponse.json(
            {
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            },
            { status: 500 }
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
                { error: 'No session ID found' },
                { status: 400 }
            );
        }

        const transport = mcpTransport.getTransport(sessionId);
        if (!transport) {
            return NextResponse.json(
                { error: 'Invalid session ID' },
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
                const data = JSON.stringify(message);
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
            { error: 'Internal server error' },
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
                { error: 'No session ID found' },
                { status: 400 }
            );
        }

        const transport = mcpTransport.getTransport(sessionId);
        if (!transport) {
            return NextResponse.json(
                { error: 'Invalid session ID' },
                { status: 400 }
            );
        }

        if (isDevMode) {
            console.log(`[DEV] Deleting MCP session:`, sessionId);
        }

        // Disconnect and cleanup
        (transport as any).disconnect();

        // Clear cookie in response
        const response = NextResponse.json({ success: true });
        response.cookies.delete('mcp-session-id');

        return response;
    } catch (error) {
        console.error('Error handling MCP DELETE request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Helper: Create mock response object
function createMockResponse(
    headers: Headers,
    writer: WritableStreamDefaultWriter<Uint8Array>
) {
    const headersObject = Object.fromEntries(headers.entries());
    const acceptHeader = 'application/json, text/event-stream';

    const mockResponse = {
        writeHead: function (status: number, resHeaders: any) {
            return mockResponse;
        },
        setHeader: function (name: string, value: string) {
            return mockResponse;
        },
        getHeader: function (name: string) {
            return headersObject[name.toLowerCase()] || acceptHeader;
        },
        write: async function (chunk: string) {
            await writer.write(new TextEncoder().encode(chunk));
            return mockResponse;
        },
        end: async function (chunk?: string) {
            if (chunk) {
                await writer.write(new TextEncoder().encode(chunk));
            }
            await writer.close();
            return mockResponse;
        },
    };

    return mockResponse;
}

// Helper: Read and parse response stream
async function readResponseStream(readable: ReadableStream): Promise<any> {
    const reader = readable.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    const responseText = new TextDecoder().decode(
        chunks.reduce((acc, chunk) => {
            const newBuffer = new Uint8Array(acc.length + chunk.length);
            newBuffer.set(acc);
            newBuffer.set(chunk, acc.length);
            return newBuffer;
        }, new Uint8Array(0))
    );

    try {
        return JSON.parse(responseText);
    } catch (err) {
        console.error('Failed to parse response:', err);
        console.log('Raw response text:', responseText);
        throw new Error('Failed to parse response');
    }
}
