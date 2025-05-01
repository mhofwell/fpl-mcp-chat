import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createClient } from '../../../../../utils/supabase/client';
import redis from '../../../../redis/redis-client';

export function registerFplTools(server: McpServer) {
    // Tool for getting player stats

    const supabase = createClient();

    server.tool(
        'get-player-stats',
        {
            playerId: z.string().optional(),
            playerName: z.string().optional(),
        },
        async ({ playerId, playerName }) => {
            let playerData;

            if (playerId) {
                playerData = await getPlayerById(playerId);
            } else if (playerName) {
                playerData = await getPlayerByName(playerName);
            } else {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Error: Either playerId or playerName must be provided',
                        },
                    ],
                    isError: true,
                };
            }

            if (!playerData) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Player not found',
                        },
                    ],
                    isError: true,
                };
            }

            // Get the player's stats
            const stats = await getPlayerStats(playerData.id);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(stats, null, 2),
                    },
                ],
            };
        }
    );

    // Tool for getting team suggestions
    server.tool(
        'get-team-suggestions',
        {
            budget: z.number().optional(),
            position: z.enum(['GKP', 'DEF', 'MID', 'FWD']).optional(),
            maxPlayers: z.number().default(5),
        },
        async ({ budget, position, maxPlayers }) => {
            // Query parameters for best value players
            const query = supabase
                .from('players')
                .select('*')
                .order('points_per_game', { ascending: false })
                .limit(maxPlayers);

            // Apply filters if provided
            if (budget) {
                query.lte('now_cost', budget * 10); // FPL costs are in tenths
            }

            if (position) {
                query.eq('element_type', getPositionId(position));
            }

            const { data, error } = await query;

            if (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(data, null, 2),
                    },
                ],
            };
        }
    );
}

// Helper functions
async function getPlayerById(id: string) {
    const supabase = createClient();
    // Try Redis cache first
    const cached = await redis.get(`fpl:player:${id}`);
    if (cached) return JSON.parse(cached);

    // Fallback to database
    const { data } = await supabase
        .from('players')
        .select('*')
        .eq('id', id)
        .single();

    return data;
}

async function getPlayerByName(name: string) {
    const supabase = createClient();
    const { data } = await supabase
        .from('players')
        .select('*')
        .ilike('web_name', `%${name}%`)
        .limit(1)
        .single();

    return data;
}

async function getPlayerStats(playerId: string) {
    const supabase = createClient();
    const { data } = await supabase
        .from('player_stats')
        .select('*')
        .eq('player_id', playerId)
        .single();

    return data;
}

function getPositionId(position: string): number {
    switch (position) {
        case 'GKP':
            return 1;
        case 'DEF':
            return 2;
        case 'MID':
            return 3;
        case 'FWD':
            return 4;
        default:
            throw new Error(`Unknown position: ${position}`);
    }
}
