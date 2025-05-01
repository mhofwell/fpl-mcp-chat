// lib/mcp-server/server-init.ts
import { randomUUID } from 'crypto';
import { getMcpServer } from './index';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import redis from '@/lib/redis/redis-client';

// In-memory storage for active server-side transports
const serverTransports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Initialize a server-side MCP session
 * This is used when we need to call MCP tools from server-side code
 */
export async function initializeServerMcpSession(): Promise<string> {
    // Create a new session ID for server-side use
    const sessionId = `server-${randomUUID()}`;

    // Create a transport with this session ID
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
    });

    // Store the transport
    serverTransports[sessionId] = transport;

    // Set up cleanup when transport is closed
    transport.onclose = () => {
        delete serverTransports[sessionId];

        // Also clean up from Redis
        try {
            redis.del(`mcp:session:${sessionId}`);
        } catch (error) {
            console.error(
                'Error cleaning up server session from Redis:',
                error
            );
        }
    };

    // Store session in Redis with 1-hour expiry
    try {
        await redis.set(
            `mcp:session:${sessionId}`,
            Date.now().toString(),
            'EX',
            3600 // 1 hour
        );
    } catch (error) {
        console.error('Error storing server session in Redis:', error);
    }

    // Connect to MCP server
    const server = getMcpServer();
    await server.connect(transport);

    return sessionId;
}

/**
 * Get an existing server transport by session ID
 */
export function getServerTransport(
    sessionId: string
): StreamableHTTPServerTransport | undefined {
    return serverTransports[sessionId];
}

/**
 * Call an MCP tool from server-side code
 */
export async function callServerMcpTool(
    sessionId: string,
    toolName: string,
    args: any = {}
): Promise<any> {
    // Get the transport
    const transport = getServerTransport(sessionId);
    if (!transport) {
        throw new Error(
            `No server transport found for session ID: ${sessionId}`
        );
    }

    // Create a request ID
    const requestId = `server-call-${Date.now()}`;

    // Prepare request
    const request = {
        jsonrpc: '2.0',
        method: 'callTool',
        params: {
            name: toolName,
            arguments: args,
        },
        id: requestId,
    };

    // Create a promise to wait for the response
    return new Promise((resolve, reject) => {
        // Create mock request and response objects
        const mockReq = {
            method: 'POST',
            headers: {},
            body: request,
        };

        let responseData = '';

        const mockRes = {
            writeHead: () => {},
            write: (data: string) => {
                responseData += data;
            },
            end: () => {
                try {
                    // Parse the response
                    const response = JSON.parse(responseData);

                    if (response.error) {
                        reject(new Error(response.error.message));
                    } else {
                        resolve(response.result);
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${error}`));
                }
            },
        };

        // Handle the request
        transport
            .handleRequest(mockReq as any, mockRes as any, request)
            .catch(reject);
    });
}

/**
 * Close a server-side MCP session
 */
export async function closeServerMcpSession(sessionId: string): Promise<void> {
    const transport = serverTransports[sessionId];
    if (transport) {
        await transport.close();
        delete serverTransports[sessionId];
    }

    // Also clean up from Redis
    try {
        await redis.del(`mcp:session:${sessionId}`);
    } catch (error) {
        console.error('Error cleaning up server session from Redis:', error);
    }
}
