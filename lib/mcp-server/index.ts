import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFplResources } from "./resources";
import { registerFplTools } from "./tools";
import { registerFplPrompts } from "./prompts";
import { getSession, storeSession, updateSessionActivity } from "./session";

// Singleton pattern for the MCP server
let server: McpServer | null = null;

export function getMcpServer() {
  if (!server) {
    // Create a new MCP server instance
    server = new McpServer({
      name: "FPL Chat Assistant",
      version: "1.0.0",
    });
    
    // Register all our resources, tools and prompts
    registerFplResources(server);
    registerFplTools(server);
    registerFplPrompts(server);
    
    // Add a basic ping tool for health checking
    server.tool(
      "ping",
      {},
      async () => ({
        content: [{ type: "text", text: "pong" }]
      })
    );
  }
  
  return server;
}

// Export session utilities for easy access
export { getSession, storeSession, updateSessionActivity };
