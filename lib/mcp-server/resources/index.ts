import {
    McpServer,
    ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { createClient } from '../../../utils/supabase/client';
import redis from '@/lib/redis/redis-client';

export function registerFplResources(server: McpServer) {
    // Resource for getting FPL teams
    const supabase = createClient();
    server.resource('fpl-teams', 'fpl://teams', async (uri) => {
        // Try to get from Redis cache first
        let teams = await redis.get('fpl:teams');

        if (!teams) {
            // If not in cache, get from database
            const { data, error } = await supabase.from('teams').select('*');

            if (error)
                throw new Error(`Failed to fetch teams: ${error.message}`);

            teams = JSON.stringify(data);

            // Cache in Redis for 1 hour
            await redis.set('fpl:teams', teams, 'EX', 3600);
        }

        return {
            contents: [
                {
                    uri: uri.href,
                    text: teams,
                },
            ],
        };
    });

    // Resource for getting specific FPL player details
    server.resource(
        'fpl-player',
        new ResourceTemplate('fpl://players/{playerId}', {
            list: 'fpl://players',
        }),
        async (uri, { playerId }) => {
            // Try to get from Redis cache first
            let player = await redis.get(`fpl:player:${playerId}`);

            if (!player) {
                // If not in cache, get from database
                const { data, error } = await supabase
                    .from('players')
                    .select('*')
                    .eq('id', playerId)
                    .single();

                if (error)
                    throw new Error(`Failed to fetch player: ${error.message}`);

                player = JSON.stringify(data);

                // Cache in Redis for 1 hour
                await redis.set(`fpl:player:${playerId}`, player, 'EX', 3600);
            }

            return {
                contents: [
                    {
                        uri: uri.href,
                        text: player,
                    },
                ],
            };
        }
    );
}
