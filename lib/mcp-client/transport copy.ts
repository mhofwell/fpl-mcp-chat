// lib/mcp-client/transport.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Keep track of client and transport
let mcpClient: Client | null = null;
let mcpTransport: StreamableHTTPClientTransport | null = null;

/**
 * Initialize MCP client and transport
 */
export async function initMcpClient(forceNew = false): Promise<Client> {
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
    name: 'NextJS-MCP-Client',
    version: '1.0.0'
  });
  
  // Get existing session ID from localStorage
  const sessionId = typeof window !== 'undefined' ? 
                   localStorage.getItem('mcp-session-id') : null;
  
  // Create new transport
  mcpTransport = new StreamableHTTPClientTransport(
    new URL('/api/mcp', window.location.origin),
    {
      sessionId: sessionId || undefined,
      reconnectionOptions: {
        maxReconnectionDelay: 30000,
        initialReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 3
      },
      requestInit: {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        }
      }
    }
  );
  
  // Set up error handler with proper JSON-RPC validation
  mcpTransport.onerror = (error) => {
    console.error('MCP transport error:', error);
    
    if (error.name === 'ZodError' && error.message) {
      console.error('JSON-RPC validation error:', error.message);
      
      // Log last message for debugging
      if (mcpTransport && (mcpTransport as any)._lastMessage) {
        console.error('Last message received:', 
          JSON.stringify((mcpTransport as any)._lastMessage, null, 2));
      }
    }
  };
  
  // Connect client to transport
  try {
    await mcpClient.connect(mcpTransport);
    console.log('MCP client connected successfully');
    
    // Store session ID
    if (mcpTransport.sessionId && typeof window !== 'undefined') {
      localStorage.setItem('mcp-session-id', mcpTransport.sessionId);
    }
    
    return mcpClient;
  } catch (error) {
    console.error('Error connecting MCP client:', error);
    mcpClient = null;
    mcpTransport = null;
    throw error;
  }
}

/**
 * Check if client is initialized
 */
export function isMcpClientInitialized(): boolean {
  return !!mcpClient && !!mcpTransport;
}

/**
 * Get the active client
 */
export function getMcpClient(): Client | null {
  return mcpClient;
}

/**
 * Close the client
 */
export async function closeMcpClient(): Promise<void> {
  if (mcpTransport) {
    await mcpTransport.close();
    mcpTransport = null;
  }
  mcpClient = null;
}

/**
 * Terminate the MCP session
 */
export async function terminateMcpSession(): Promise<void> {
  if (mcpTransport) {
    try {
      await mcpTransport.terminateSession();
    } catch (error) {
      console.error('Error terminating MCP session:', error);
    }
    
    await closeMcpClient();
  }
  
  if (typeof window !== 'undefined') {
    localStorage.removeItem('mcp-session-id');
  }
}
