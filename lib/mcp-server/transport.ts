// lib/mcp-server/transport.ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

export const createMcpTransport = () => {
    // Store active transport sessions
    const sessions: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Create a new transport with session management
    const createTransport = (
        sessionId: string
    ): StreamableHTTPServerTransport => {
        if (sessions[sessionId]) {
            return sessions[sessionId];
        }

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
            onsessioninitialized: (sessionId) => {
                sessions[sessionId] = transport;
            },
        });

        // Register immediately rather than waiting for the callback
        sessions[sessionId] = transport;

        return transport;
    };

    // Get a transport by session ID
    const getTransport = (sessionId: string) => {
        return sessions[sessionId];
    };

    // List of all active sessions
    const getActiveSessions = () => {
        return Object.keys(sessions);
    };

    // Clean up a transport session
    const removeTransport = (sessionId: string) => {
        if (sessions[sessionId]) {
            sessions[sessionId].close();
            delete sessions[sessionId];
            return true;
        }
        return false;
    };

    return {
        createTransport,
        getTransport,
        getActiveSessions,
        removeTransport,
    };
};

// Export a singleton instance
export const mcpTransport = createMcpTransport();
