'use server';

import { createMcpServer } from '@/lib/mcp-server';
import { mcpTransport } from '@/lib/mcp-server/transport';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkForUpdates } from '@/lib/fpl-api/fpl-data-sync';
import { fplApiService } from '@/lib/fpl-api/service';
import {
    getServerSessionId,
    initializeServerMcpSession,
} from '@/lib/mcp-server/server-init';
import { randomUUID } from 'crypto';

// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

// Global variable to track if FPL service has been initialized
let fplServiceInitialized = false;

// Helper to generate HTTP response from transport
const createResponseFromTransport = async (
    sessionId: string | null,
    request: Request,
    requestBody?: any
) => {
    try {
        // Initialize FPL service if not already done (only once per server instance)
        if (!fplServiceInitialized) {
            await fplApiService.initialize();
            // Also check for any updates (especially during active gameweeks)
            await checkForUpdates();
            fplServiceInitialized = true;
            console.log('FPL service initialized and updates checked');
        }

        // Log request in development mode
        if (isDevMode) {
            console.log(`[DEV] MCP ${request.method} request:`, {
                sessionId,
                requestId: requestBody?.id,
                method: requestBody?.method,
            });
        }

        let transport;

        if (sessionId && mcpTransport.getTransport(sessionId)) {
            // Reuse existing transport
            transport = mcpTransport.getTransport(sessionId);
        } else if (
            !sessionId &&
            requestBody &&
            isInitializeRequest(requestBody)
        ) {
            // For initialize requests with no session, either get the server session
            // or create a new transport
            const serverSessionId = getServerSessionId();

            if (serverSessionId && mcpTransport.getTransport(serverSessionId)) {
                transport = mcpTransport.getTransport(serverSessionId);
                console.log('[DEV] Using server-side MCP session');
            } else {
                // Create new transport for initialize request
                transport = mcpTransport.createTransport(randomUUID());

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

                return new Response(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        error: {
                            code: -32000,
                            message: errorMessage,
                        },
                        id: null,
                    }),
                    {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );
            }
        }

        // Instead of creating a Response directly, create a response wrapper
        let responseBody = '';
        let responseStatus = 200;
        let responseHeaders: { [key: string]: string } = {};

        const mockResponse = {
            writeHead: (status: number, headers: any) => {
                responseStatus = status;
                responseHeaders = { ...responseHeaders, ...headers };
                return mockResponse;
            },
            setHeader: (name: string, value: string) => {
                responseHeaders[name] = value;
                return mockResponse;
            },
            getHeader: (name: string) => responseHeaders[name],
            write: (chunk: string) => {
                responseBody += chunk;
                return mockResponse;
            },
            end: (chunk?: string) => {
                if (chunk) responseBody += chunk;
                return mockResponse;
            },
        };

        // Create a new request object with all the right headers
        const headers = Object.fromEntries(request.headers.entries());
        // Only add Accept header if it doesn't exist
        if (!headers['accept'] && !headers['Accept']) {
            headers['Accept'] = 'application/json, text/event-stream';
        }

        const modifiedRequest = new Request(request.url, {
            method: request.method,
            headers,
            body: request.body,
            duplex: 'half',
        } as RequestInit);

        // Log the modified request headers
        console.log('Modified request headers:', {
            contentType: modifiedRequest.headers.get('Content-Type'),
            accept: modifiedRequest.headers.get('Accept'),
        });

        // Let transport handle the request with our mock response
        await transport.handleRequest(
            modifiedRequest as any,
            mockResponse as any,
            requestBody
        );

        // Return a proper Response object from our collected data
        return new Response(responseBody, {
            status: responseStatus,
            headers: responseHeaders,
        });
    } catch (error) {
        console.error(`Error handling MCP request (${appEnv}):`, error);
        return new Response(
            JSON.stringify({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
};

// Initialize MCP session
export async function initializeMcpSession(formData: FormData) {
    try {
        // Add debug info
        console.log('Starting MCP session initialization...');

        // Ensure server is initialized first - this is a critical step
        const serverInit = await initializeServerMcpSession();
        console.log('Server init result:', serverInit);

        if (!serverInit.success) {
            console.error('Server initialization failed:', serverInit.error);
            return {
                error: `Server initialization failed: ${serverInit.error}`,
            };
        }

        const serverSessionId = getServerSessionId();
        console.log('Retrieved server session ID:', serverSessionId);

        if (!serverSessionId) {
            console.error(
                'No valid server session ID available after initialization'
            );
            return { error: 'Server session initialization failed' };
        }

        // Continue with client session initialization using the server session
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

        const request = new Request('http://localhost/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify(requestBody),
        });

        // Let's log the request headers to verify they're set
        console.log('Request headers:', {
            contentType: request.headers.get('Content-Type'),
            accept: request.headers.get('Accept'),
        });

        console.log(
            'Sending MCP initialize request with server session ID:',
            serverSessionId
        );
        const response = await createResponseFromTransport(
            serverSessionId,
            request,
            requestBody
        );
        console.log(
            'MCP response status:',
            response.status,
            response.statusText
        );

        if (response.ok) {
            const responseData = await response.json();
            console.log('MCP response data:', responseData);

            if (responseData?.result?.session_id) {
                // Store session ID in a cookie
                const cookiesStore = await cookies();
                cookiesStore.set(
                    'mcp-session-id',
                    responseData.result.session_id,
                    {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: 60 * 60 * 24, // 24 hours
                    }
                );
                console.log(
                    'Set MCP session cookie:',
                    responseData.result.session_id
                );

                // If noRedirect is true, return success instead of redirecting
                const noRedirect = formData.get('no_redirect') === 'true';
                if (noRedirect) {
                    return {
                        success: true,
                        session_id: responseData.result.session_id,
                    };
                }

                // Otherwise redirect to chat page
                redirect('/chat');
            } else {
                console.error('Response missing session_id:', responseData);
                return { error: 'Missing session ID in response' };
            }
        } else {
            // Try to parse error response
            try {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                return {
                    error: `Failed with status ${response.status}: ${errorText}`,
                };
            } catch (e) {
                console.error('Could not parse error response');
                return { error: `Failed with status ${response.status}` };
            }
        }

        // If we get here, there was an error with the response
        return { error: 'Failed to initialize MCP session' };
    } catch (error) {
        console.error('Error during MCP session initialization:', error);
        return {
            error:
                error instanceof Error
                    ? error.message
                    : 'Unknown error during initialization',
        };
    }
}

// Handle MCP request
export async function handleMcpRequest(requestData: any) {
    'use server';

    const sessionId = (await cookies()).get('mcp-session-id')?.value || null;

    console.log('sessionId', sessionId);

    if (!sessionId) {
        return { error: 'No session ID found' };
    }

    const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'mcp-session-id': sessionId,
        },
        body: JSON.stringify(requestData),
    });

    const response = await createResponseFromTransport(
        sessionId,
        request,
        requestData
    );

    if (response.ok) {
        const responseData = await response.json();
        return responseData;
    }

    return { error: 'Failed to process MCP request' };
}

// Get MCP events (for Server-Sent Events)
export async function getMcpEvents() {
    'use server';

    const sessionId = (await cookies()).get('mcp-session-id')?.value || null;

    if (!sessionId) {
        return new Response(
            'event: error\ndata: {"error": "No session ID found"}\n\n',
            {
                headers: { 'Content-Type': 'text/event-stream' },
            }
        );
    }

    const request = new Request('http://localhost/mcp', {
        method: 'GET',
        headers: {
            Accept: 'text/event-stream',
            'mcp-session-id': sessionId,
        },
    });

    return await createResponseFromTransport(sessionId, request);
}

// End MCP session
export async function endMcpSession() {
    'use server';

    const sessionId = (await cookies()).get('mcp-session-id')?.value || null;

    if (!sessionId) {
        return { error: 'No session ID found' };
    }

    const request = new Request('http://localhost/mcp', {
        method: 'DELETE',
        headers: {
            'mcp-session-id': sessionId,
        },
    });

    await createResponseFromTransport(sessionId, request);

    // Remove session cookie
    (await cookies()).delete('mcp-session-id');

    // Redirect to home page
    redirect('/');
}
