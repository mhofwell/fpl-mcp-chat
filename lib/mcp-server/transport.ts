import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

// Get environment
const appEnv = process.env.APP_ENV || 'development';

// Create and configure transport
export const createMcpTransport = () => {
    // Store active transport sessions
    const sessions: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Create a new transport with session management
    const createTransport = (sessionId: string): StreamableHTTPServerTransport => {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
            onsessioninitialized: (sessionId) => {
                sessions[sessionId] = transport;
            }
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

    return {
        createTransport,
        getTransport,
        getActiveSessions,
    };
};

// Export a singleton instance
export const mcpTransport = createMcpTransport();
