// lib/mcp-client/index.ts
'use client';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';

// Client singleton
let client: Client | null = null;
let transport: StreamableHTTPClientTransport | null = null;

/**
 * Check if the MCP client is initialized
 */
export function isMcpClientInitialized(): boolean {
    return client !== null && transport !== null;
}

/**
 * Initialize the MCP client
 */
export async function initMcpClient(forceNew = false): Promise<Client> {
    // Return existing client if available and not forcing new
    if (client && transport && !forceNew) {
        return client;
    }

    // Close existing client if forcing new
    if (forceNew && client && transport) {
        await closeMcpClient();
    }

    // Create new client
    client = new Client({
        name: 'FPL Chat Client',
        version: '1.0.0',
    });

    // Get existing session ID from localStorage
    const sessionId =
        typeof window !== 'undefined'
            ? localStorage.getItem('mcp-session-id')
            : null;

    // Create new transport
    transport = new StreamableHTTPClientTransport(
        new URL('/api/mcp', window.location.origin),
        {
            sessionId: sessionId || undefined,
            reconnectionOptions: {
                maxReconnectionDelay: 10000,
                initialReconnectionDelay: 1000,
                reconnectionDelayGrowFactor: 1.5,
                maxRetries: 3,
            },
        }
    );

    // Set up error handler
    transport.onerror = (error) => {
        console.error('MCP transport error:', error);
    };

    // Connect client to transport
    try {
        await client.connect(transport);
        console.log('MCP client connected successfully');

        // Store session ID
        if (transport.sessionId && typeof window !== 'undefined') {
            localStorage.setItem('mcp-session-id', transport.sessionId);
        }

        return client;
    } catch (error) {
        console.error('Error connecting MCP client:', error);
        client = null;
        transport = null;
        throw error;
    }
}

/**
 * Close the MCP client and clean up
 */
export async function closeMcpClient(): Promise<void> {
    if (transport) {
        await transport.close();
        transport = null;
    }

    client = null;

    if (typeof window !== 'undefined') {
        localStorage.removeItem('mcp-session-id');
    }
}

/**
 * Call an MCP tool
 */
export async function callMcpTool(
    toolName: string,
    args: any = {}
): Promise<any> {
    if (!isMcpClientInitialized()) {
        await initMcpClient();
    }

    if (!client) {
        throw new Error('MCP client not initialized');
    }

    try {
        const result = await client.callTool({
            name: toolName,
            arguments: args,
        });

        return result;
    } catch (error) {
        console.error(`Error calling MCP tool "${toolName}":`, error);

        // Check if error is related to session
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        if (
            errorMessage.includes('session') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('401')
        ) {
            // Try to reinitialize with a new session
            await closeMcpClient();
            await initMcpClient(true);

            // Retry the tool call once
            return client!.callTool({
                name: toolName,
                arguments: args,
            });
        }

        throw error;
    }
}

/**
 * Get FPL answer using the answer-fpl-question tool
 */
export async function getFplAnswer(
    question: string,
    debugMode = false
): Promise<string> {
    const result = await callMcpTool('answer-fpl-question', {
        question,
        debug_mode: debugMode,
    });

    // Extract text content from the result
    if (result && Array.isArray(result.content) && result.content.length > 0) {
        return result.content[0].text;
    }

    return "Sorry, I couldn't find an answer to your question.";
}

// Other utility functions
export async function getTeamInfo(teamName: string): Promise<any> {
    return callMcpTool('get-team-info', { team_name: teamName });
}

export async function getPlayerInfo(playerName: string): Promise<any> {
    return callMcpTool('get-player-info', { player_name: playerName });
}

export async function getGameweekInfo(gameweekId?: number): Promise<any> {
    return callMcpTool('get-gameweek-info', { gameweek_id: gameweekId });
}
