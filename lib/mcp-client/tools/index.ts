// In fpl-nextjs-app/lib/mcp-client/tools/index.ts
import { initStandaloneMcpClient } from '../index';
import { fplTools } from '../fpl-tools';

// Add this type
type MCPResponse = {
    content?: Array<{
        type?: string;
        text: string;
    }>;
};

export const toolRegistry = {
    echo: async (message: string) => {
        const client = await initStandaloneMcpClient();
        const result = (await client.callTool({
            name: 'echo',
            arguments: { message },
        })) as MCPResponse;

        return result?.content?.[0]?.text || null;
    },

    fpl: fplTools,
};
