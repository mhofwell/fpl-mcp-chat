// lib/mcp-client/index.ts
import {
    initMcpClient,
    isMcpClientInitialized,
    terminateMcpSession,
} from './transport';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Client utilities for interacting with MCP server
 */

/**
 * MCP Request options
 */
interface McpRequestOptions {
    method: string;
    params?: any;
    requestId?: number | string;
}

/**
 * MCP Tool call options
 */
interface McpToolCallOptions {
    name: string;
    arguments: any;
}

/**
 * Standard error response for MCP client errors
 */
export class McpClientError extends Error {
    code: number;
    requestId: string | number | null;

    constructor(
        message: string,
        code: number = -32603,
        requestId: string | number | null = null
    ) {
        super(message);
        this.name = 'McpClientError';
        this.code = code;
        this.requestId = requestId;
    }
}

/**
 * Error indicating MCP session has expired or is invalid
 */
export class McpSessionError extends McpClientError {
    constructor(
        message: string = 'Session expired or invalid',
        requestId: string | number | null = null
    ) {
        super(message, -32000, requestId);
        this.name = 'McpSessionError';
    }
}

/**
 * Error indicating network or connection issues
 */
export class McpConnectionError extends McpClientError {
    constructor(
        message: string = 'Connection error',
        requestId: string | number | null = null
    ) {
        super(message, -32001, requestId);
        this.name = 'McpConnectionError';
    }
}

/**
 * Check if the session is currently valid
 */
export async function checkMcpSession(): Promise<boolean> {
    try {
        if (!isMcpClientInitialized()) {
            // Try to initialize with existing session ID
            const sessionId = localStorage.getItem('mcp-session-id');
            if (!sessionId) {
                return false;
            }

            // This will try to use the existing session ID and connect
            await initMcpClient();
            return true;
        }
        return true;
    } catch (error) {
        console.error('Error checking MCP session:', error);
        return false;
    }
}

/**
 * Initialize a new MCP session
 */
export async function initializeMcpSession(): Promise<string> {
    try {
        console.log('Initializing new MCP session...');

        // Close any existing client first
        await closeMcpClient();

        // Remove any existing session ID
        if (typeof window !== 'undefined') {
            localStorage.removeItem('mcp-session-id');
        }

        console.log('Sending initialization request...');

        // Send explicit initialization request with JSON-RPC format
        const initResponse = await fetch('/api/mcp/init', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'initialize',
                params: {},
            }),
        });

        if (!initResponse.ok) {
            throw new Error(
                `Failed to initialize session: ${initResponse.status} ${initResponse.statusText}`
            );
        }

        // Get session ID from response
        const sessionId = initResponse.headers.get('mcp-session-id');
        if (sessionId) {
            console.log('Session ID from response headers:', sessionId);
            localStorage.setItem('mcp-session-id', sessionId);

            // Initialize MCP client after getting the session ID
            await initMcpClient();

            return sessionId;
        }

        // If no session ID in header, check response body
        try {
            const data = await initResponse.json();
            if (data.result && data.result.sessionId) {
                console.log(
                    'Session ID from response body:',
                    data.result.sessionId
                );
                localStorage.setItem('mcp-session-id', data.result.sessionId);

                // Initialize MCP client after getting the session ID
                await initMcpClient();

                return data.result.sessionId;
            }

            throw new Error('No session ID returned from initialization');
        } catch (error) {
            throw new Error(
                `Invalid response from initialization endpoint: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    } catch (error) {
        console.error('Error initializing session:', error);
        if (error instanceof McpClientError) {
            throw error;
        }
        throw new McpClientError(
            `Unexpected error initializing session: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Make a generic MCP request
 */
export async function sendMcpRequest<T = any>(
    options: McpRequestOptions
): Promise<T> {
    const { method, params, requestId = Date.now() } = options;

    try {
        const requestData = {
            jsonrpc: '2.0',
            method,
            params,
            id: requestId,
        };

        // exists
        console.log('mcp-session-id', localStorage.getItem('mcp-session-id'));

        const response = await fetch('/api/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                // Use the stored session ID
                'mcp-session-id': localStorage.getItem('mcp-session-id') || '',
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new McpClientError(
                `MCP request failed with status ${response.status}: ${errorText}`,
                -32603,
                requestId
            );
        }

        const result = await response.json();

        if (result.error) {
            throw new McpClientError(
                result.error.message,
                result.error.code,
                requestId
            );
        }

        return result.result;
    } catch (error) {
        if (error instanceof McpClientError) {
            throw error;
        }
        throw new McpClientError(
            `Error in MCP request: ${error instanceof Error ? error.message : String(error)}`,
            -32603,
            requestId
        );
    }
}

/**
 * Call an MCP tool
 */
export async function callMcpTool(toolName: string, args: any = {}) {
    try {
        // Create a custom request with proper JSON-RPC format
        const requestId = `call-${Date.now()}-${Math.random().toString(36).substring(2)}`;

        // Create the request object manually following JSON-RPC format
        const request = {
            jsonrpc: '2.0',
            method: 'callTool', // The method is "callTool" not the tool name
            params: {
                // Tool details go in params
                name: toolName,
                arguments: args,
            },
            id: requestId,
        };

        // Log the formatted request for debugging
        console.log(
            'Sending formatted JSON-RPC request:',
            JSON.stringify(request)
        );

        // Send the request directly to avoid SDK's internal formatting
        const response = await fetch('/api/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                'mcp-session-id': localStorage.getItem('mcp-session-id') || '',
            },
            body: JSON.stringify(request),
        });

        const result = await response.json();

        // Check for errors in the response
        if (result.error) {
            throw new Error(`Error calling tool: ${result.error.message}`);
        }

        return result.result;
    } catch (error) {
        console.error(`Error calling MCP tool:`, error);
        throw error;
    }
}

/**
 * Get FPL assistant response using the answer-fpl-question tool
 */
export async function getFplAnswer(
    question: string,
    debugMode: boolean = false
): Promise<string> {
    try {
        // Make sure client is initialized - with retry logic for session issues
        if (!isMcpClientInitialized()) {
            try {
                await initMcpClient();
            } catch (error) {
                // If initialization fails due to session issues, try once more with a clean state
                console.log('Init failed, retrying with fresh session');
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('mcp-session-id');
                }
                await initMcpClient();
            }
        }

        const result = await callMcpTool('answer-fpl-question', {
            question,
            debug_mode: debugMode,
        });

        // Extract text content from the tool result
        if (
            result &&
            Array.isArray(result.content) &&
            result.content.length > 0
        ) {
            return result.content[0].text;
        }

        // Fallback for different result formats
        if (result && typeof result === 'object') {
            if (typeof result.text === 'string') {
                return result.text;
            }

            if (typeof result.content === 'string') {
                return result.content;
            }

            return JSON.stringify(result);
        }

        return "Sorry, I couldn't find an answer.";
    } catch (error) {
        console.error('Error getting FPL answer:', error);

        const errorMessage =
            error instanceof Error ? error.message : String(error);

        // Check if this is a session-related error
        if (
            errorMessage.includes('Session not found') ||
            errorMessage.includes('404') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('401')
        ) {
            // Handle session expiration
            if (typeof window !== 'undefined') {
                localStorage.removeItem('mcp-session-id');
            }
            throw new McpClientError(
                'Your session has expired. Please restart the chat.',
                -32000
            );
        }

        // Rethrow other errors
        if (error instanceof McpClientError) {
            throw error;
        }

        throw new McpClientError(`Error getting answer: ${errorMessage}`);
    }
}

/**
 * Get information about a team
 */
export async function getTeamInfo(teamName: string): Promise<any> {
    return callMcpTool('get-team-info', {
        team_name: teamName,
    });
}

/**
 * Get information about a player
 */
export async function getPlayerInfo(playerName: string): Promise<any> {
    return callMcpTool('get-player-info', {
        player_name: playerName,
    });
}

/**
 * Get gameweek information
 */
export async function getGameweekInfo(gameweekId?: number): Promise<any> {
    return callMcpTool('get-gameweek-info', {
        gameweek_id: gameweekId,
    });
}

/**
 * Force refresh FPL data
 */
export async function refreshFplData(
    forceFullUpdate: boolean = false
): Promise<any> {
    return callMcpTool('refresh-fpl-data', {
        force_full_update: forceFullUpdate,
    });
}

let client: Client | null = null;
let transport: StreamableHTTPClientTransport | null = null;

export async function getMcpClient() {
    if (!client) {
        client = new Client({
            name: 'FPL Chat Client',
            version: '1.0.0',
        });

        // Initialize the transport with the API endpoint
        transport = new StreamableHTTPClientTransport(
            new URL('/api/mcp', window.location.origin)
        );

        await client.connect(transport);
    }

    return client;
}

export async function closeMcpClient() {
    if (client && transport) {
        await transport.close();
        client = null;
        transport = null;
    }
}

// Helper function to get player stats
export async function getPlayerStats(playerName: string) {
    const client = await getMcpClient();
    return client.callTool({
        name: 'get-player-stats',
        arguments: {
            playerName,
        },
    });
}

// Helper function to get team suggestions
export async function getTeamSuggestions(options: {
    budget?: number;
    position?: 'GKP' | 'DEF' | 'MID' | 'FWD';
    maxPlayers?: number;
}) {
    const client = await getMcpClient();
    return client.callTool({
        name: 'get-team-suggestions',
        arguments: options,
    });
}

// Helper function to get FPL team data
export async function getFplTeams() {
    const client = await getMcpClient();
    return client.readResource({
        uri: 'fpl://teams',
    });
}

// Helper function to get player data
export async function getPlayerData(playerId: string) {
    const client = await getMcpClient();
    return client.readResource({
        uri: `fpl://players/${playerId}`,
    });
}

// Export all functions
export {
    initMcpClient,
    isMcpClientInitialized,
    terminateMcpSession
};
