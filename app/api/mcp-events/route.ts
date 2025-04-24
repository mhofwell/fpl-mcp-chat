import { NextRequest } from 'next/server';
import { mcpTransport } from '@/lib/mcp-server/transport';

// Handle GET requests for SSE
export async function GET(request: NextRequest) {
    const sessionId = request.cookies.get('mcp-session-id')?.value;

    if (!sessionId || !mcpTransport.getTransport(sessionId)) {
        return new Response(
            'event: error\ndata: {"error": "Invalid or missing session ID"}\n\n',
            {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            }
        );
    }

    const transport = mcpTransport.getTransport(sessionId);

    try {
        const res = new Response();

        await transport.handleRequest(request as any, res as any);

        return res;
    } catch (error) {
        console.error('Error handling MCP events:', error);
        return new Response(
            'event: error\ndata: {"error": "Internal server error"}\n\n',
            {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            }
        );
    }
}
