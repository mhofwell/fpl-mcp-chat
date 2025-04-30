// lib/mcp-client/index.ts
import {
    initMcpClient,
    isMcpClientInitialized,
    closeMcpClient,
    terminateMcpSession,
} from './transport';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
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
        // Close any existing client first
        await closeMcpClient();

        // Remove any existing session ID
        localStorage.removeItem('mcp-session-id');

        // Initialize a new client (will get a new session ID)
        const client = await initMcpClient();

        // Get the session ID from the transport
        const sessionId = (client.transport as StreamableHTTPClientTransport)
            .sessionId;
        if (!sessionId) {
            throw new McpClientError(
                'No session ID returned from initialization'
            );
        }

        return sessionId;
    } catch (error) {
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
 * Call an MCP tool using direct API request (bypassing validation)
 */
export async function callMcpTool<T = any>(
    options: McpToolCallOptions
): Promise<T> {
    try {
        // Ensure client is initialized
        const client = await initMcpClient();

        // Use the direct request method to avoid schema validation issues
        const result = await client.request(
            {
                method: 'tools/call',
                params: {
                    name: options.name,
                    arguments: options.arguments,
                },
            },
            CallToolResultSchema
        );

        return result as T;
    } catch (error) {
        if (error instanceof McpClientError) {
            throw error;
        }

        // Handle and convert errors
        throw new McpClientError(
            `Error calling MCP tool: ${error instanceof Error ? error.message : String(error)}`
        );
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
        const result = await callMcpTool({
            name: 'answer-fpl-question',
            arguments: {
                question,
                debug_mode: debugMode,
            },
        });

        // Extract text content from the tool result
        if (
            result &&
            Array.isArray(result.content) &&
            result.content.length > 0
        ) {
            return result.content[0].text;
        }

        // Fallback: try different result formats
        if (result && typeof result === 'object') {
            if (typeof result.text === 'string') {
                return result.text;
            }

            if (typeof result.content === 'string') {
                return result.content;
            }

            // Last resort - stringify
            return JSON.stringify(result);
        }

        return "Sorry, I couldn't find an answer.";
    } catch (error) {
        if (error instanceof McpClientError) {
            // Check if this is a session error
            if (error.message.includes('session')) {
                throw new McpClientError(
                    'Your session has expired. Please restart the chat.',
                    401
                );
            }
            throw error;
        }
        throw new McpClientError(
            `Error getting FPL answer: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Get information about a team
 */
export async function getTeamInfo(teamName: string): Promise<any> {
    return callMcpTool({
        name: 'get-team-info',
        arguments: {
            team_name: teamName,
        },
    });
}

/**
 * Get information about a player
 */
export async function getPlayerInfo(playerName: string): Promise<any> {
    return callMcpTool({
        name: 'get-player-info',
        arguments: {
            player_name: playerName,
        },
    });
}

/**
 * Get gameweek information
 */
export async function getGameweekInfo(gameweekId?: number): Promise<any> {
    return callMcpTool({
        name: 'get-gameweek-info',
        arguments: {
            gameweek_id: gameweekId,
        },
    });
}

/**
 * Force refresh FPL data
 */
export async function refreshFplData(
    forceFullUpdate: boolean = false
): Promise<any> {
    return callMcpTool({
        name: 'refresh-fpl-data',
        arguments: {
            force_full_update: forceFullUpdate,
        },
    });
}
