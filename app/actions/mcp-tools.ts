'use server'

import { initStandaloneMcpClient } from '@/lib/mcp-client';

// Configure internal URL
const MCP_SERVER_INTERNAL_URL = process.env.EXPRESS_MCP_SERVER_PRIVATE || 'http://localhost:3001';

export async function callMcpTool(toolName: string, args: Record<string, any>) {
  const client = await initStandaloneMcpClient({
    baseUrl: `${MCP_SERVER_INTERNAL_URL}/mcp`
  });
  
  return client.callTool({
    name: toolName,
    arguments: args
  });
}
