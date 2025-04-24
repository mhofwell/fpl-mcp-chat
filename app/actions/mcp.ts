'use server';

import { createMcpServer } from '@/lib/mcp-server';
import { mcpTransport } from '@/lib/mcp-server/transport';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Helper to generate HTTP response from transport
const createResponseFromTransport = async (
    sessionId: string | null,
    request: Request,
    requestBody?: any
) => {
    try {
        let transport;

        if (sessionId && mcpTransport.getTransport(sessionId)) {
            // Reuse existing transport
            transport = mcpTransport.getTransport(sessionId);
        } else if (
            !sessionId &&
            requestBody &&
            isInitializeRequest(requestBody)
        ) {
            // Create new transport for initialize request
            transport = mcpTransport.createTransport();

            // Create and connect server
            const server = await createMcpServer();
            await server.connect(transport);
        } else {
            // Invalid request
            return new Response(
                JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Bad Request: No valid session ID provided',
                    },
                    id: null,
                }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        // Let transport handle the request
        const res = new Response();
        await transport.handleRequest(request as any, res as any, requestBody);

        return res;
    } catch (error) {
        console.error('Error handling MCP request:', error);
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
    const requestBody = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
            client: {
                name: 'FPL-Chat-App',
                version: '1.0.0',
            },
        },
        id: 1,
    };

    const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    const response = await createResponseFromTransport(
        null,
        request,
        requestBody
    );

    if (response.ok) {
        const responseData = await response.json();

        if (responseData?.result?.session_id) {
            // Store session ID in a cookie
            (await cookies()).set('mcp-session-id', responseData.result.session_id, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 24, // 24 hours
            });

            // Redirect to chat page
            redirect('/chat');
        }
    }

    // If we get here, there was an error
    return { error: 'Failed to initialize MCP session' };
}

// Handle MCP request
export async function handleMcpRequest(requestData: any) {
    'use server';

    const sessionId = (await cookies()).get('mcp-session-id')?.value || null;

    if (!sessionId) {
        return { error: 'No session ID found' };
    }

    const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
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
