import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerFplPrompts(server: McpServer) {
    // Prompt for analyzing a player
    server.prompt(
        'analyze-player',
        {
            playerName: z.string(),
        },
        ({ playerName }) => ({
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `Please analyze the Fantasy Premier League player ${playerName}. Consider their recent form, fixtures, and value for money.`,
                    },
                },
            ],
        })
    );

    // Prompt for team building advice
    server.prompt(
        'team-building-advice',
        {
            budget: z.string().optional(),
            currentTeam: z.string().optional(),
        },
        ({ budget, currentTeam }) => {
            let promptText =
                'Please give me advice on building a strong Fantasy Premier League team';

            if (budget) {
                promptText += ` with a budget of £${budget}M`;
            }

            if (currentTeam) {
                promptText += `. Here's my current team: ${currentTeam}`;
            }

            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: promptText,
                        },
                    },
                ],
            };
        }
    );
}
