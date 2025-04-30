// lib/mcp-client/transport.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Keep track of the client and transport instances
let mcpClient: Client | null = null;
let mcpTransport: StreamableHTTPClientTransport | null = null;

/**
 * Initialize the MCP client and transport
 */
export async function initMcpClient(): Promise<Client> {
    // If we already have an initialized client, return it
    if (mcpClient && mcpTransport) {
        return mcpClient;
    }

    // Create a new client
    mcpClient = new Client({
        name: 'fpl-mcp-client',
        version: '1.0.0'
    });

    // Get session ID if it exists in localStorage
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('mcp-session-id') : null;

    // Create a new transport with proper handling of errors
    mcpTransport = new StreamableHTTPClientTransport(
        new URL('/api/mcp', window.location.origin),
        {
            sessionId: sessionId || undefined
        }
    );

    // Set up client error handler
    mcpClient.onerror = (error) => {
        console.error('MCP client error:', error);
    };

    // Connect the client to the transport
    await mcpClient.connect(mcpTransport);

    // Store the new session ID in localStorage if one was generated
    if (mcpTransport.sessionId && (!sessionId || mcpTransport.sessionId !== sessionId)) {
        localStorage.setItem('mcp-session-id', mcpTransport.sessionId);
    }

    return mcpClient;
}

/**
 * Check if the client is initialized and connected
 */
export function isMcpClientInitialized(): boolean {
    return !!mcpClient && !!mcpTransport;
}

/**
 * Get the active client instance
 */
export function getMcpClient(): Client | null {
    return mcpClient;
}

/**
 * Get the active transport instance
 */
export function getMcpTransport(): StreamableHTTPClientTransport | null {
    return mcpTransport;
}

/**
 * Close the client connection and clean up
 */
export async function closeMcpClient(): Promise<void> {
    if (mcpTransport) {
        await mcpTransport.close();
        mcpTransport = null;
    }
    mcpClient = null;
}

/**
 * Terminate the MCP session on the server
 */
export async function terminateMcpSession(): Promise<void> {
    if (mcpTransport) {
        try {
            // This will make a DELETE request to the MCP endpoint with the session ID
            await mcpTransport.terminateSession();
        } catch (error) {
            console.error('Error terminating MCP session:', error);
        }
        
        // Clean up client resources
        await closeMcpClient();
    }
    
    // Remove the session ID from localStorage
    if (typeof window !== 'undefined') {
        localStorage.removeItem('mcp-session-id');
    }
}
