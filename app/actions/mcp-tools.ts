// app/actions/mcp-tools.ts
'use server';

import { initStandaloneMcpClient } from '@/lib/mcp-client';

// Configure internal URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';

export async function callMcpTool(toolName: string, args: Record<string, any>) {
    try {
        const client = await initStandaloneMcpClient({
            baseUrl: `${MCP_SERVER_URL}/mcp`,
        });

        const result = await client.callTool({
            name: toolName,
            arguments: args,
        });

        return { success: true, result };
    } catch (error) {
        console.error('Error calling MCP tool:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
