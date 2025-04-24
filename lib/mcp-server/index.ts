import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fplApi } from '../fpl-api/client';
import redis from '../redis/redis-client';
import { claudeApi } from '../claude-api/client';

// Create MCP server instance
export const createMcpServer = async () => {
    const server = new McpServer({
        name: 'FPL-Chat-Server',
        version: '1.0.0',
    });

    // Add a basic tool to get team information
    server.tool(
        'get-team-info',
        { team_name: z.string().describe('Name of the Premier League team') },
        async ({ team_name }) => {
            try {
                // Fetch teams data from bootstrap-static (with Redis caching)
                const cacheKey = 'fpl:bootstrap-static';
                let bootstrapData;

                const cachedData = await redis.get(cacheKey);
                if (cachedData) {
                    bootstrapData = JSON.parse(cachedData);
                } else {
                    bootstrapData = await fplApi.getBootstrapStatic();

                    // Cache the data
                    await redis.set(
                        cacheKey,
                        JSON.stringify(bootstrapData),
                        'EX',
                        4 * 60 * 60
                    ); // 4 hours
                }

                // Find the team by name (case insensitive)
                const team = bootstrapData.teams.find(
                    (t: any) =>
                        t.name.toLowerCase() === team_name.toLowerCase() ||
                        t.short_name.toLowerCase() === team_name.toLowerCase()
                );

                if (!team) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Team "${team_name}" not found.`,
                            },
                        ],
                        isError: true,
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(team, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('Error fetching team info:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );
    // Add a tool to answer FPL questions using Claude
    server.tool(
        'answer-fpl-question',
        {
            question: z
                .string()
                .describe("User's question about Fantasy Premier League"),
        },
        async ({ question }) => {
            try {
                // Extract entities and create context
                // For now, we'll use a simplified approach - we'll enhance this later
                const context =
                    'Current gameweek: 34\nTop scorer: Erling Haaland (26 goals)';

                // Get response from Claude
                const answer = await claudeApi.getResponse(question, context);

                return {
                    content: [{ type: 'text', text: answer }],
                };
            } catch (error) {
                console.error('Error answering FPL question:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );

    return server;
};
