import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getMcpServer, storeSession } from '@/lib/mcp-server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Dedicated endpoint for MCP initialization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Create a new session ID
    const sessionId = randomUUID();
    
    // Store session in Redis
    await storeSession(sessionId);
    
    // Return the initialization response with session ID
    return Response.json(
      {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          sessionId: sessionId
        }
      },
      {
        headers: {
          'mcp-session-id': sessionId
        }
      }
    );
  } catch (error) {
    console.error('Error in MCP initialization:', error);
    
    return Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error during initialization',
        },
        id: null,
      },
      { status: 500 }
    );
  }
}
