// fpl-nextjs-app/lib/mcp-client/index.ts
'use client';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Keep track of client and transport
let mcpClient: Client | null = null;
let mcpTransport: StreamableHTTPClientTransport | null = null;

/**
 * Initialize MCP client to connect to standalone server
 */
export async function initStandaloneMcpClient(
    options: {
        forceNew?: boolean;
        baseUrl?: string;
    } = {}
): Promise<Client> {
    // Use environment variable for the server URL
    const defaultBaseUrl =
        typeof window !== 'undefined'
            ? process.env.NEXT_PUBLIC_EXPRESS_MCP_SERVER_PUBLIC ||
              'http://localhost:3001'
            : process.env.EXPRESS_MCP_SERVER_PRIVATE || 'http://localhost:3001';

    const { forceNew = false, baseUrl = `${defaultBaseUrl}/mcp` } = options;

    // Return existing client if available and not forcing new
    if (mcpClient && mcpTransport && !forceNew) {
        return mcpClient;
    }

    // Close existing client if forcing new
    if (forceNew && mcpClient && mcpTransport) {
        await closeStandaloneMcpClient();
    }

    // Create new client
    mcpClient = new Client({
        name: 'NextJS-Standalone-MCP-Client',
        version: '1.0.0',
    });

    // Get existing session ID from localStorage
    const sessionId =
        typeof window !== 'undefined'
            ? localStorage.getItem('standalone-mcp-session-id')
            : null;

    // Create new transport
    mcpTransport = new StreamableHTTPClientTransport(new URL(baseUrl), {
        sessionId: sessionId || undefined,
        reconnectionOptions: {
            maxReconnectionDelay: 30000,
            initialReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1.5,
            maxRetries: 5,
        },
    });

    // Set up error handler
    mcpTransport.onerror = (error) => {
        console.error('Standalone MCP transport error:', error);
    };

    // Connect client to transport
    try {
        await mcpClient.connect(mcpTransport);
        console.log('Connected to standalone MCP server successfully');

        // Store session ID
        if (mcpTransport.sessionId && typeof window !== 'undefined') {
            localStorage.setItem(
                'standalone-mcp-session-id',
                mcpTransport.sessionId
            );
        }

        return mcpClient;
    } catch (error) {
        console.error('Error connecting to standalone MCP server:', error);
        mcpClient = null;
        mcpTransport = null;
        throw error;
    }
}

/**
 * Close the standalone MCP client
 */
export async function closeStandaloneMcpClient(): Promise<void> {
    if (mcpTransport) {
        await mcpTransport.close();
        mcpTransport = null;
    }
    mcpClient = null;

    if (typeof window !== 'undefined') {
        localStorage.removeItem('standalone-mcp-session-id');
    }
}

/**
 * Call an echo tool on the standalone MCP server for testing
 */
export async function testStandaloneMcpEcho(message: string): Promise<string> {
    if (!mcpClient) {
        await initStandaloneMcpClient();
    }

    try {
        const result = await mcpClient!.callTool({
            name: 'echo',
            arguments: { message },
        });

        if (
            result &&
            Array.isArray(result.content) &&
            result.content.length > 0
        ) {
            return result.content[0].text;
        }

        return 'No response from server';
    } catch (error) {
        console.error('Error calling echo tool:', error);
        throw error;
    }
}
