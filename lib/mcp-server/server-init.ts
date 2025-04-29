// lib/mcp-server/server-init.ts
import { mcpTransport } from './transport';
import { createMcpServer } from './index';
import { randomUUID } from 'crypto';

let serverInitialized = false;
let serverSessionId: string | null = null;

/**
 * Initialize MCP server with a default session
 * Useful for background tasks and console operations
 */
export async function initializeServerMcpSession() {
    if (serverInitialized && serverSessionId) {
        return { success: true, sessionId: serverSessionId, message: 'MCP server already initialized' };
    }

    try {
        // Generate a session ID manually first
        serverSessionId = randomUUID();
        
        // Create a new transport with the explicit session ID
        const transport = mcpTransport.createTransport(serverSessionId);
        
        // Create and connect MCP server
        const server = await createMcpServer();
        await server.connect(transport);
        
        // Verify that session was initialized
        if (!mcpTransport.getTransport(serverSessionId)) {
            throw new Error('Transport session was not properly registered');
        }
        
        // Set global flag
        serverInitialized = true;
        
        console.log(`Server-side MCP session initialized with ID: ${serverSessionId}`);
        
        return {
            success: true,
            sessionId: serverSessionId,
            message: 'MCP server initialized successfully'
        };
    } catch (error) {
        console.error('Error initializing server MCP session:', error);
        serverSessionId = null;
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get the active server session ID if available
 */
export function getServerSessionId() {
    return serverSessionId || null;
}
