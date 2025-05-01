// lib/mcp-client/transport.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Define types for better type safety
export interface McpTransportOptions {
    forceNew?: boolean;
    baseUrl?: string;
    sessionId?: string;
}

// Keep track of client and transport instances
let mcpClient: Client | null = null;
let mcpTransport: StreamableHTTPClientTransport | null = null;

/**
 * Initialize MCP client and transport
 * @param options Configuration options for the MCP client
 * @returns Initialized MCP client instance
 */
export async function initMcpClient(
    options: McpTransportOptions = {}
): Promise<Client> {
    const { forceNew = false, baseUrl, sessionId: providedSessionId } = options;

    // Return existing client if available and not forcing new
    if (mcpClient && mcpTransport && !forceNew) {
        return mcpClient;
    }

    // Close existing client if forcing new
    if (forceNew && mcpClient && mcpTransport) {
        await closeMcpClient();
    }

    // Create new client
    mcpClient = new Client({
        name: 'FPL-Chat-Client',
        version: '1.0.0',
    });

    // Get session ID from options, localStorage, or null
    const storedSessionId =
        typeof window !== 'undefined'
            ? localStorage.getItem('mcp-session-id')
            : null;
    const sessionId = providedSessionId || storedSessionId || undefined;

    // Determine base URL
    const apiUrl =
        baseUrl ||
        (typeof window !== 'undefined'
            ? new URL('/api/mcp', window.location.origin).toString()
            : '/api/mcp');

    // Create new transport with improved configuration
    mcpTransport = new StreamableHTTPClientTransport(new URL(apiUrl), {
        sessionId: sessionId,
        reconnectionOptions: {
            maxReconnectionDelay: 30000, // Maximum delay between reconnections (30 seconds)
            initialReconnectionDelay: 1000, // Initial delay before first reconnection attempt (1 second)
            reconnectionDelayGrowFactor: 1.5, // Exponential backoff factor
            maxRetries: 5, // Increased from 3 to 5 for more resilience
            randomizationFactor: 0.5, // Add some randomization to prevent reconnection storms
        },
        requestInit: {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            // Ensure credentials are included for session cookie handling if needed
            credentials: 'include',
        },
    });

    // Enhanced error handling
    mcpTransport.onerror = (error) => {
        console.error('MCP transport error:', error);

        // Handle specific error types
        if (error.name === 'ZodError') {
            console.error('JSON-RPC validation error:', error.message);

            // Log last message for debugging
            if (mcpTransport && (mcpTransport as any)._lastMessage) {
                console.error(
                    'Last message received:',
                    JSON.stringify((mcpTransport as any)._lastMessage, null, 2)
                );
            }
        } else if (error.message?.includes('session')) {
            // Session-related errors
            console.error('Session error - may need to re-initialize');
            if (typeof window !== 'undefined') {
                localStorage.removeItem('mcp-session-id');
            }
        }
    };

    // Add close handler to clean up resources
    mcpTransport.onclose = () => {
        console.log('MCP transport closed');
        // We don't remove session ID on normal close as it may be reused
    };

    // Connect client to transport
    try {
        await mcpClient.connect(mcpTransport);
        console.log('MCP client connected successfully');

        // Store the new session ID if provided by the server
        if (mcpTransport.sessionId && typeof window !== 'undefined') {
            localStorage.setItem('mcp-session-id', mcpTransport.sessionId);
        }

        return mcpClient;
    } catch (error) {
        console.error('Error connecting MCP client:', error);

        // Handle specific connection errors
        if (error instanceof Error) {
            if (
                error.message.includes('401') ||
                error.message.includes('403')
            ) {
                // Handle authentication errors
                console.error('Authentication failed with the MCP server');
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('mcp-session-id');
                }
            } else if (error.message.includes('404')) {
                console.error('MCP server endpoint not found');
            } else if (error.message.includes('timeout')) {
                console.error('Connection to MCP server timed out');
            }
        }

        // Clean up on connection failure
        mcpClient = null;
        mcpTransport = null;
        throw error;
    }
}

/**
 * Check if client is initialized and connected
 * @returns Boolean indicating if client is ready
 */
export function isMcpClientInitialized(): boolean {
    return !!mcpClient && !!mcpTransport && !!(mcpTransport as any).isConnected;
}

/**
 * Get the active client
 * @returns The current MCP client or null if not initialized
 */
export function getMcpClient(): Client | null {
    return mcpClient;
}

/**
 * Get the active transport
 * @returns The current transport or null if not initialized
 */
export function getMcpTransport(): StreamableHTTPClientTransport | null {
    return mcpTransport;
}

/**
 * Get the current session ID if available
 * @returns The current session ID or undefined
 */
export function getCurrentSessionId(): string | undefined {
    return mcpTransport?.sessionId;
}

/**
 * Close the client and transport
 */
export async function closeMcpClient(): Promise<void> {
    if (mcpTransport) {
        // Proper cleanup
        try {
            await mcpTransport.close();
        } catch (error) {
            console.error('Error closing MCP transport:', error);
        } finally {
            mcpTransport = null;
        }
    }

    mcpClient = null;
}

/**
 * Terminate the MCP session
 * This will explicitly tell the server to clean up the session
 */
export async function terminateMcpSession(): Promise<void> {
    if (!mcpTransport || !mcpTransport.sessionId) {
        // Nothing to terminate
        await closeMcpClient();
        return;
    }

    try {
        // First try to terminate via transport method
        await mcpTransport.terminateSession();
    } catch (error) {
        console.error('Error terminating session via transport:', error);

        // Fallback to direct fetch API if transport method fails
        try {
            const sessionId = mcpTransport.sessionId;
            const baseUrl = (mcpTransport as any).baseUrl || '/api/mcp';

            await fetch(baseUrl, {
                method: 'DELETE',
                headers: {
                    'mcp-session-id': sessionId,
                },
            });

            console.log('Session terminated via direct API call');
        } catch (secondError) {
            console.error(
                'Failed to terminate session via direct API:',
                secondError
            );
        }
    }

    // Clean up client and localStorage regardless of success
    await closeMcpClient();

    if (typeof window !== 'undefined') {
        localStorage.removeItem('mcp-session-id');
    }
}

/**
 * Attempt to reconnect to the MCP server
 * Useful when connection was lost or session expired
 */
export async function reconnectMcpClient(): Promise<Client> {
    await closeMcpClient();

    // Force using a new session
    if (typeof window !== 'undefined') {
        localStorage.removeItem('mcp-session-id');
    }

    return initMcpClient({ forceNew: true });
}

/**
 * Check if the current session is valid
 * @returns Promise resolving to boolean indicating session validity
 */
export async function checkSessionValidity(): Promise<boolean> {
    if (!mcpTransport || !mcpTransport.sessionId) {
        return false;
    }

    try {
        // We can use a simple MCP method call to test session validity
        // Using getCapabilities as it's a lightweight method that all MCP servers support
        if (mcpClient) {
            await mcpClient.getServerCapabilities();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Session validity check failed:', error);
        return false;
    }
}
