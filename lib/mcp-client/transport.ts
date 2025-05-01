// lib/mcp-client/transport.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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
export async function initMcpClient(): Promise<Client> {
  if (client && transport) {
    return client;
  }
  
  client = new Client({
    name: "FPL Chat Client",
    version: "1.0.0"
  });
  
  // Initialize the transport with the API endpoint and session ID
  const sessionId = typeof window !== 'undefined' ? localStorage.getItem('mcp-session-id') : null;
  transport = new StreamableHTTPClientTransport(
    new URL("/api/mcp", window.location.origin),
    { 
      sessionId: sessionId || undefined 
    }
  );
  
  await client.connect(transport);
  
  return client;
}

/**
 * Terminate the MCP session
 */
export async function terminateMcpSession(): Promise<void> {
  if (client && transport) {
    try {
      // Delete session on server
      if (transport.sessionId) {
        await fetch('/api/mcp', {
          method: 'DELETE',
          headers: {
            'mcp-session-id': transport.sessionId
          }
        });
      }
      
      // Close transport and clear client references
      await transport.close();
    } catch (error) {
      console.error('Error terminating session:', error);
    } finally {
      // Clean up client and localStorage regardless of success
      client = null;
      transport = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('mcp-session-id');
      }
    }
  }
}
