// lib/mcp-server/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fplApiService } from '@/lib/fpl-api/service';
import { claudeApi } from '@/lib/claude-api/client';
import { checkForUpdates } from '@/lib/fpl-api/fpl-data-sync';
import { Fixture } from '@/types/fpl';

// Create MCP server instance
export const createMcpServer = async () => {
    console.log('Creating MCP server instance...');

    const server = new McpServer({
        name: 'FPL-Chat-Server',
        version: '1.0.0',
    });

    // Add a tool to get information about a team
    server.tool(
        'get-team-info',
        {
            team_name: z.string().describe('Name of the Premier League team'),
        },
        async ({ team_name }) => {
            try {
                // Get all teams
                const teams = await fplApiService.getTeams();

                // Find the team by name (case insensitive)
                const team = teams.find(
                    (t) =>
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

                // Get players for this team
                const players = await fplApiService.getPlayers({
                    teamId: team.id,
                });

                // Get current gameweek
                const currentGameweek =
                    await fplApiService.getCurrentGameweek();

                // Get upcoming fixtures
                let fixtures: Fixture[] = [];
                if (currentGameweek) {
                    const allFixtures = await fplApiService.getFixtures();

                    // Get this team's fixtures for next 5 gameweeks
                    fixtures = allFixtures
                        .filter(
                            (f) =>
                                f.gameweek_id >= currentGameweek.id &&
                                f.gameweek_id < currentGameweek.id + 5 &&
                                (f.home_team_id === team.id ||
                                    f.away_team_id === team.id)
                        )
                        .slice(0, 5);
                }

                // Format the response
                const response = {
                    team: team,
                    players: players.map((p) => ({
                        name: p.web_name,
                        position: p.position,
                    })),
                    upcoming_fixtures: fixtures.map((f) => {
                        const isHome = f.home_team_id === team.id;
                        const opponentId = isHome
                            ? f.away_team_id
                            : f.home_team_id;
                        const opponent = teams.find((t) => t.id === opponentId);

                        return {
                            gameweek: f.gameweek_id,
                            opponent_id: opponentId,
                            opponent_name: opponent?.name || 'Unknown',
                            is_home: isHome,
                            kickoff_time: f.kickoff_time,
                        };
                    }),
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(response, null, 2),
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

    // Add a tool to get information about a player
    server.tool(
        'get-player-info',
        {
            player_name: z.string().describe('Name of the FPL player'),
        },
        async ({ player_name }) => {
            try {
                // Get all players
                const players = await fplApiService.getPlayers();

                // Find the player by name (case insensitive)
                const player = players.find(
                    (p) =>
                        p.web_name.toLowerCase() ===
                            player_name.toLowerCase() ||
                        p.full_name
                            .toLowerCase()
                            .includes(player_name.toLowerCase())
                );

                if (!player) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Player "${player_name}" not found.`,
                            },
                        ],
                        isError: true,
                    };
                }

                // Get player details
                const playerDetails = await fplApiService.getPlayerDetail(
                    player.id
                );

                // Get team info
                const teams = await fplApiService.getTeams();
                const team = teams.find((t) => t.id === player.team_id);

                // Format the response
                const response = {
                    player: {
                        ...player,
                        team: team?.name || 'Unknown',
                    },
                    details: playerDetails,
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(response, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('Error fetching player info:', error);
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

    // Add a tool to get current gameweek information
    server.tool(
        'get-gameweek-info',
        {
            gameweek_id: z
                .number()
                .optional()
                .describe(
                    'ID of the gameweek (leave empty for current gameweek)'
                ),
        },
        async ({ gameweek_id }) => {
            try {
                let gameweek;

                if (gameweek_id) {
                    // Get all gameweeks and find the requested one
                    const gameweeks = await fplApiService.getGameweeks();
                    gameweek = gameweeks.find((gw) => gw.id === gameweek_id);

                    if (!gameweek) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `Gameweek ${gameweek_id} not found.`,
                                },
                            ],
                            isError: true,
                        };
                    }
                } else {
                    // Get current gameweek
                    gameweek = await fplApiService.getCurrentGameweek();

                    if (!gameweek) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `Current gameweek information not available.`,
                                },
                            ],
                            isError: true,
                        };
                    }
                }

                // Get fixtures for this gameweek
                const fixtures = await fplApiService.getFixtures(gameweek.id);

                // Get teams to map IDs to names
                const teams = await fplApiService.getTeams();

                // Format fixtures with team names
                const formattedFixtures = fixtures.map((fixture) => {
                    const homeTeam = teams.find(
                        (t) => t.id === fixture.home_team_id
                    );
                    const awayTeam = teams.find(
                        (t) => t.id === fixture.away_team_id
                    );

                    return {
                        home_team:
                            homeTeam?.name || `Team ID ${fixture.home_team_id}`,
                        away_team:
                            awayTeam?.name || `Team ID ${fixture.away_team_id}`,
                        kickoff_time: fixture.kickoff_time,
                        finished: fixture.finished,
                    };
                });

                // Format the response
                const response = {
                    gameweek: gameweek,
                    fixtures: formattedFixtures,
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(response, null, 2),
                        },
                    ],
                };
            } catch (error) {
                console.error('Error fetching gameweek info:', error);
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

    // Add a tool to answer FPL questions using Claude with our enhanced context engine
    server.tool(
        'answer-fpl-question',
        {
            question: z
                .string()
                .describe("User's question about Fantasy Premier League"),
            debug_mode: z
                .boolean()
                .optional()
                .default(false)
                .describe(
                    'Enable debug mode to see extracted entities and context'
                ),
        },
        async ({ question, debug_mode }) => {
            try {
                console.log(`Processing FPL question: "${question}"`);

                // Check for updates (especially important during active gameweeks)
                await checkForUpdates();

                // Get detailed response including context and entities
                const { answer, context, entities } =
                    await claudeApi.getResponseWithDetails(question);

                // If debug mode is enabled, include the extracted entities and context
                if (debug_mode) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `ANSWER:\n${answer}\n\n---\n\nDEBUG INFO:\nExtracted entities: ${JSON.stringify(entities, null, 2)}\n\nContext provided to Claude:\n${context}`,
                            },
                        ],
                    };
                }

                // Otherwise, just return the answer
                return {
                    content: [{ type: 'text', text: answer }],
                };
            } catch (error) {
                console.error('Error answering FPL question:', error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again later.`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    );

    // Add a tool to force update FPL data (for admin use)
    server.tool(
        'refresh-fpl-data',
        {
            force_full_update: z
                .boolean()
                .optional()
                .default(false)
                .describe('Force a full data update including database sync'),
        },
        async ({ force_full_update }) => {
            try {
                console.log(
                    `Refreshing FPL data (force_full_update: ${force_full_update})`
                );

                if (force_full_update) {
                    // Import here to avoid circular dependency
                    const { syncFplData } = await import(
                        '../../../fpl-api/fpl-data-sync'
                    );

                    // This will update both Redis cache and database
                    const result = await syncFplData();
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Full data sync completed: ${JSON.stringify(result, null, 2)}`,
                            },
                        ],
                    };
                } else {
                    // Just update Redis cache
                    await fplApiService.updateAllData();
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'FPL data refreshed successfully in Redis cache.',
                            },
                        ],
                    };
                }
            } catch (error) {
                console.error('Error refreshing FPL data:', error);
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

    // Add resource for current FPL data overview
    server.resource('fpl-overview', 'fpl-data://overview', async () => {
        try {
            const [currentGameweek, teams, fixtures] = await Promise.all([
                fplApiService.getCurrentGameweek(),
                fplApiService.getTeams(),
                fplApiService.getFixtures(),
            ]);

            // Only include current/next gameweek fixtures
            const relevantFixtures: Fixture[] = fixtures.filter(
                (f) =>
                    f.gameweek_id === currentGameweek?.id ||
                    f.gameweek_id === (currentGameweek?.id ?? 0) + 1
            );

            // Format fixtures with team names
            const formattedFixtures = relevantFixtures.map((fixture) => {
                const homeTeam = teams.find(
                    (t) => t.id === fixture.home_team_id
                );
                const awayTeam = teams.find(
                    (t) => t.id === fixture.away_team_id
                );

                return {
                    gameweek: fixture.gameweek_id,
                    home_team:
                        homeTeam?.name || `Team ID ${fixture.home_team_id}`,
                    away_team:
                        awayTeam?.name || `Team ID ${fixture.away_team_id}`,
                    kickoff_time: fixture.kickoff_time,
                    finished: fixture.finished,
                };
            });

            // Create overview text
            const overviewText = `
# Fantasy Premier League Overview

## Current Gameweek: ${currentGameweek?.name || 'Unknown'}
Deadline: ${currentGameweek?.deadline_time || 'Unknown'}

## Upcoming Fixtures
${formattedFixtures
    .map(
        (f) =>
            `- GW${f.gameweek}: ${f.home_team} vs ${f.away_team} (${new Date(f.kickoff_time).toLocaleString()})`
    )
    .join('\n')}

## Available Teams
${teams.map((t) => `- ${t.name} (${t.short_name})`).join('\n')}
                `.trim();

            return {
                contents: [
                    {
                        uri: 'fpl-data://overview',
                        mimeType: 'text/markdown',
                        text: overviewText,
                    },
                ],
            };
        } catch (error) {
            console.error('Error fetching FPL overview:', error);
            return {
                contents: [
                    {
                        uri: 'fpl-data://overview',
                        mimeType: 'text/plain',
                        text: `Error fetching FPL data: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    },
                ],
            };
        }
    });

    console.log('MCP server created successfully');
    return server;
};
