// app/api/mcp/route.ts
import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getMcpServer, storeSession, updateSessionActivity, getSession } from '@/lib/mcp-server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// Map to store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Handle GET requests for SSE
export async function GET(request: NextRequest) {
  const sessionId = request.headers.get('mcp-session-id');
  
  if (!sessionId || !transports[sessionId]) {
    return new Response('Invalid or missing session ID', { status: 400 });
  }
  
  // Update session activity
  await updateSessionActivity(sessionId);
  
  const transport = transports[sessionId];
  
  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Store the controller for later use by the transport
      (transport as any).controller = controller;
      
      // Set up close handler
      transport.onclose = () => {
        controller.close();
        // Clean up on connection close
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };
    }
  });
  
  // Return a streaming response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// Handle POST requests for client-to-server communication
export async function POST(request: NextRequest) {
  const sessionId = request.headers.get('mcp-session-id');
  const body = await request.json();
  
  let transport: StreamableHTTPServerTransport;
  let server;
  
  // If we have a valid session ID, use its transport
  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
    
    // Update session activity
    await updateSessionActivity(sessionId);
  } 
  // If this is an initialization request, create a new session
  else if (!sessionId && body.method === 'initialize') {
    const newSessionId = randomUUID();
    
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: async (sessionId) => {
        transports[sessionId] = transport;
        
        // Store session in Redis
        await storeSession(sessionId);
      }
    });
    
    // Clean up when the connection is closed
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    
    // Get our MCP server and connect it to this transport
    server = getMcpServer();
    await server.connect(transport);
  } 
  else {
    // Invalid request
    return Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      },
      { status: 400 }
    );
  }
  
  // Create a response transformer
  const transformStream = new TransformStream();
  const writer = transformStream.writable.getWriter();
  
  // Store headers and status for the response
  const responseData = {
    headers: {} as Record<string, string>,
    status: 200
  };
  
  try {
    // Handle the request with our transport
    await transport.handleRequest(
      { 
        method: 'POST', 
        headers: Object.fromEntries(request.headers.entries()),
        body: body
      } as any,
      {
        writeHead: (status: number, headers?: Record<string, string>) => {
          responseData.status = status;
          responseData.headers = headers || {};
        },
        write: (data: string) => {
          writer.write(new TextEncoder().encode(data));
        },
        end: () => {
          writer.close();
        }
      } as any,
      body
    );
    
    // Return the response with the appropriate headers
    return new Response(transformStream.readable, {
      status: responseData.status,
      headers: {
        ...responseData.headers,
        'mcp-session-id': transport.sessionId || ''
      }
    });
  } catch (error) {
    console.error('Error handling MCP request:', error);
    writer.close();
    
    return Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      },
      { status: 500 }
    );
  }
}

// Handle DELETE requests for session termination
export async function DELETE(request: NextRequest) {
  const sessionId = request.headers.get('mcp-session-id');
  
  if (!sessionId) {
    return new Response('Missing session ID', { status: 400 });
  }
  
  // Check if we have a transport for this session
  if (transports[sessionId]) {
    const transport = transports[sessionId];
    await transport.close();
    delete transports[sessionId];
  }
  
  // Also clean up session from Redis
  try {
    await import('@/lib/mcp-server').then(({ deleteSession }) => {
      deleteSession(sessionId);
    });
  } catch (error) {
    console.error('Error deleting session:', error);
  }
  
  return new Response(null, { status: 204 });
}
