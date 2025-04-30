// app/api/mcp/route.ts
import { createMcpServer } from '@/lib/mcp-server';
import { mcpTransport } from '@/lib/mcp-server/transport';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkForUpdates } from '@/lib/fpl-api/fpl-data-sync';
import { fplApiService } from '@/lib/fpl-api/service';
import {
    getServerSessionId,
    initializeServerMcpSession,
} from '@/lib/mcp-server/server-init';

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
        // Ensure FPL service is initialized
        await initializeFplService();

        // Get session ID from cookie or header
        const cookieStore = cookies();
        const sessionId =
            request.headers.get('mcp-session-id') ||
            (await cookieStore).get('mcp-session-id')?.value ||
            null;

        // Parse the request body
        const requestBody = await request.json();

        if (isDevMode) {
            console.log(`[DEV] MCP POST request:`, {
                sessionId,
                requestId: requestBody?.id,
                method: requestBody?.method,
            });
        }

        let transport;

        if (sessionId && mcpTransport.getTransport(sessionId)) {
            // Reuse existing transport
            transport = mcpTransport.getTransport(sessionId);
        } else if (!sessionId && isInitializeRequest(requestBody)) {
            // For initialize requests with no session
            const serverSessionId = getServerSessionId();

            if (serverSessionId && mcpTransport.getTransport(serverSessionId)) {
                transport = mcpTransport.getTransport(serverSessionId);
                console.log('[DEV] Using server-side MCP session');
            } else {
                // Create new transport for initialize request
                const newSessionId = randomUUID();
                transport = mcpTransport.createTransport(newSessionId);

                // Create and connect server
                const server = await createMcpServer();
                await server.connect(transport);

                if (isDevMode) {
                    console.log('[DEV] New MCP server and transport created');
                }
            }
        } else {
            // Try using server session ID as fallback
            const serverSessionId = getServerSessionId();
            if (serverSessionId && mcpTransport.getTransport(serverSessionId)) {
                transport = mcpTransport.getTransport(serverSessionId);
                console.log('[DEV] Using server-side MCP session as fallback');
            } else {
                // Invalid request
                const errorMessage =
                    'Bad Request: No valid session ID provided';
                if (isDevMode) {
                    console.error(`[DEV] MCP Error: ${errorMessage}`);
                }

                return NextResponse.json(
                    {
                        jsonrpc: '2.0',
                        error: {
                            code: -32000,
                            message: errorMessage,
                        },
                        id: null,
                    },
                    { status: 400 }
                );
            }
        }

        // Create a response object that will capture the output
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        // Convert headers to a plain object for the transport
        const headers = Object.fromEntries(request.headers.entries());

        // Extract and ensure proper Accept header before passing to transport
        const acceptHeader = request.headers.get('Accept') || 'application/json, text/event-stream';
        const modifiedHeaders: Record<string, string> = { ...headers, 'Accept': acceptHeader };

        // Fix the mock response object to have proper method chaining
        const mockResponse = {
            writeHead: (status: number, resHeaders: any) => {
                return mockResponse;
            },
            setHeader: (name: string, value: string) => {
                return mockResponse;
            },
            getHeader: (name: string) => modifiedHeaders[name.toLowerCase()] || headers[name.toLowerCase()],
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

        // Pass the request to the MCP transport with a mock response that writes to our stream
        await transport.handleRequest(
            request as any,
            mockResponse as any,
            requestBody
        );

        // Check if this was an initialize request and we need to set a session cookie
        if (isInitializeRequest(requestBody)) {
            // Use the TextDecoder to parse the response stream
            const reader = readable.getReader();
            const decoder = new TextDecoder();
            let responseText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                responseText += decoder.decode(value, { stream: true });
            }

            // Parse the response to get the session ID
            const responseData = JSON.parse(responseText);

            if (responseData?.result?.session_id) {
                // Create a new response with the cookie
                return new NextResponse(responseText, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    status: 200,
                }).cookies.set(
                    'mcp-session-id',
                    responseData.result.session_id,
                    {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: 60 * 60 * 24, // 24 hours
                    }
                );
            }
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

        // Get session ID from cookie or header
        const cookieStore = cookies();
        const sessionId =
            request.headers.get('mcp-session-id') ||
            (await cookieStore).get('mcp-session-id')?.value ||
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

        // Create a response stream
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        // Pass the request to the MCP transport with a mock response that writes to our stream
        await transport.handleRequest(
            request as any,
            {
                writeHead: (status: number, resHeaders: any) => {
                    // Cannot set status and headers dynamically after streaming starts
                    return { statusCode: status, headers: resHeaders };
                },
                setHeader: (name: string, value: string) => {},
                write: async (chunk: string) => {
                    await writer.write(new TextEncoder().encode(chunk));
                },
                end: async (chunk?: string) => {
                    if (chunk) {
                        await writer.write(new TextEncoder().encode(chunk));
                    }
                    await writer.close();
                },
            } as any
        );

        // Return the SSE stream response
        return new NextResponse(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            },
        });
    } catch (error) {
        console.error(`Error handling MCP GET request:`, error);
        // Return error as an SSE event
        return new NextResponse(
            'event: error\ndata: {"error": "Internal server error"}\n\n',
            {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        // Get session ID from cookie or header
        const cookieStore = cookies();
        const sessionId =
            request.headers.get('mcp-session-id') ||
            (await cookieStore).get('mcp-session-id')?.value ||
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
            console.log(`[DEV] MCP DELETE request for session:`, sessionId);
        }

        // Create a response object that will capture the output
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        // Handle the DELETE request with the transport
        await transport.handleRequest(
            request as any,
            {
                writeHead: (status: number, resHeaders: any) => {
                    return { statusCode: status, headers: resHeaders };
                },
                setHeader: (name: string, value: string) => {},
                write: async (chunk: string) => {
                    await writer.write(new TextEncoder().encode(chunk));
                },
                end: async (chunk?: string) => {
                    if (chunk) {
                        await writer.write(new TextEncoder().encode(chunk));
                    }
                    await writer.close();
                },
            } as any
        );

        // Create a response that clears the session cookie
        const response = new NextResponse(readable, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Clear the session cookie
        response.cookies.delete('mcp-session-id');

        return response;
    } catch (error) {
        console.error(`Error handling MCP DELETE request:`, error);
        return NextResponse.json(
            { error: 'Failed to terminate MCP session' },
            { status: 500 }
        );
    }
}
