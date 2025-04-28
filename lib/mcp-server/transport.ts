import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';

// Get environment
const appEnv = process.env.APP_ENV || 'development';

// Create and configure transport
export const createMcpTransport = () => {
    // Store active transport sessions
    const sessions: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // Create a new transport with session management
    const createTransport = () => {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
                // Store the transport session
                if (sessionId) {
                    sessions[sessionId] = transport;
                    console.log(
                        `Session ${sessionId} initialized in ${appEnv} environment`
                    );
                }
            },
        });

        // Set up cleanup on close
        transport.onclose = () => {
            if (transport.sessionId) {
                delete sessions[transport.sessionId];
                console.log(
                    `Session ${transport.sessionId} closed in ${appEnv} environment`
                );
            }
        };

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
