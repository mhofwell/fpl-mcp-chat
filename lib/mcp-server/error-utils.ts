// lib/mcp-server/error-utils.ts
export const createMcpErrorResponse = (error: any, requestId: any = null) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`MCP Error: ${message}`, error);

    return {
        jsonrpc: '2.0',
        error: {
            code: -32603,
            message: message,
        },
        id: requestId,
    };
};
