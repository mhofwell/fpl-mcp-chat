// lib/mcp-client/index.ts
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
    requestId?: number | string;
}

/**
 * Standard error response for MCP client errors
 */
class McpClientError extends Error {
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
    // If we don't have a stored session ID, don't even try to check
    const sessionId = localStorage.getItem('mcp-session-id');
    if (!sessionId) {
        return false;
    }
    try {
        const testRequest = {
            jsonrpc: '2.0',
            method: 'tools/list',
            id: Date.now(),
        };

        const response = await fetch('/api/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'mcp-session-id': localStorage.getItem('mcp-session-id') || '',
            },
            body: JSON.stringify(testRequest),
        });

        if (!response.ok) {
            return false;
        }

        const result = await response.json();
        return !result.error;
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
        const response = await fetch('/api/mcp/init', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new McpClientError(
                `Failed to initialize session: ${errorText}`
            );
        }

        const result = await response.json();

        if (result.error) {
            throw new McpClientError(result.error);
        }

        if (!result.session_id) {
            throw new McpClientError(
                'No session ID returned from initialization'
            );
        }

        // Store the session ID for future use
        localStorage.setItem('mcp-session-id', result.session_id);

        return result.session_id;
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
 * Call an MCP tool
 */
export async function callMcpTool<T = any>(
    options: McpToolCallOptions
): Promise<T> {
    const { name, arguments: args, requestId } = options;

    return sendMcpRequest({
        method: 'tools/call',
        params: {
            name,
            arguments: args,
        },
        requestId,
    });
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
