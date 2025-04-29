// lib/fpl-api/service.ts
import { fplApi } from './client';
import redis from '../redis/redis-client';
import { Team, Player, Gameweek, Fixture } from '../../types/fpl';

/**
 * Wrapper service for FPL API calls with Redis caching
 */
export const fplApiService = {
    /**
     * Get bootstrap static data (teams, players, gameweeks)
     * This is the main data endpoint for FPL
     */
    async getBootstrapStatic() {
        const cacheKey = 'fpl:bootstrap-static';

        // Try to get from cache first
        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return JSON.parse(cachedData);
            }
        } catch (error) {
            console.warn('Redis cache error for bootstrap static:', error);
            // Continue to fetch from API if cache fails
        }

        // Fetch from API
        try {
            const data = await fplApi.getBootstrapStatic();

            // Store in cache
            try {
                const ttl = calculateTtl('bootstrap-static');
                await redis.set(cacheKey, JSON.stringify(data), 'EX', ttl);
            } catch (cacheError) {
                console.warn(
                    'Failed to cache bootstrap static data:',
                    cacheError
                );
            }

            return data;
        } catch (error) {
            console.error('Error fetching bootstrap static:', error);
            throw error;
        }
    },

    /**
     * Get all teams
     */
    async getTeams(): Promise<Team[]> {
        const data = await this.getBootstrapStatic();
        return data.teams.map((team: any) => ({
            id: team.id,
            name: team.name,
            short_name: team.short_name,
            last_updated: new Date().toISOString(),
        }));
    },

    /**
     * Get all players with optional filtering
     */
    async getPlayers(options?: {
        teamId?: number;
        position?: string;
    }): Promise<Player[]> {
        const data = await this.getBootstrapStatic();

        let players = data.elements.map((player: any) => {
            // Map position ID to string
            let position;
            switch (player.element_type) {
                case 1:
                    position = 'GKP';
                    break;
                case 2:
                    position = 'DEF';
                    break;
                case 3:
                    position = 'MID';
                    break;
                case 4:
                    position = 'FWD';
                    break;
                default:
                    position = 'Unknown';
            }

            return {
                id: player.id,
                web_name: player.web_name,
                full_name: `${player.first_name} ${player.second_name}`,
                team_id: player.team,
                position,
                // Additional properties
                first_name: player.first_name,
                second_name: player.second_name,
                element_type: player.element_type,
                form: player.form,
                points_per_game: player.points_per_game,
                total_points: player.total_points,
                selected_by_percent: player.selected_by_percent,
            };
        });

        // Apply filters if provided
        if (options?.teamId) {
            players = players.filter(
                (player: Player) => player.team_id === options.teamId
            );
        }

        if (options?.position) {
            players = players.filter(
                (player: Player) => player.position === options.position
            );
        }

        return players;
    },

    /**
     * Get all gameweeks
     */
    async getGameweeks(): Promise<Gameweek[]> {
        const data = await this.getBootstrapStatic();

        return data.events.map((gw: any) => ({
            id: gw.id,
            name: `Gameweek ${gw.id}`,
            deadline_time: gw.deadline_time,
            is_current: gw.is_current,
            is_next: gw.is_next,
            finished: gw.finished,
            last_updated: new Date().toISOString(),
        }));
    },

    /**
     * Get current gameweek
     */
    async getCurrentGameweek(): Promise<Gameweek | null> {
        const gameweeks = await this.getGameweeks();
        return gameweeks.find((gw) => gw.is_current) || null;
    },

    /**
     * Get fixtures with Redis caching
     */
    async getFixtures(gameweekId?: number): Promise<Fixture[]> {
        const cacheKey = gameweekId
            ? `fpl:fixtures:gameweek:${gameweekId}`
            : 'fpl:fixtures';

        // Try to get from cache first
        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return JSON.parse(cachedData);
            }
        } catch (error) {
            console.warn(
                `Redis cache error for fixtures (gameweek ${gameweekId}):`,
                error
            );
            // Continue to fetch from API if cache fails
        }

        // Fetch from API
        try {
            const data = await fplApi.getFixtures();

            // Transform data
            let fixtures = data.map((fixture: any) => ({
                id: fixture.id,
                gameweek_id: fixture.event,
                home_team_id: fixture.team_h,
                away_team_id: fixture.team_a,
                kickoff_time: fixture.kickoff_time,
                finished: fixture.finished,
                last_updated: new Date().toISOString(),
            }));

            // Filter by gameweek if specified
            if (gameweekId) {
                fixtures = fixtures.filter(
                    (fixture: Fixture) => fixture.gameweek_id === gameweekId
                );
            }

            // Store in cache
            try {
                const ttl = calculateTtl('fixtures');
                await redis.set(cacheKey, JSON.stringify(fixtures), 'EX', ttl);
            } catch (cacheError) {
                console.warn('Failed to cache fixtures data:', cacheError);
            }

            return fixtures;
        } catch (error) {
            console.error('Error fetching fixtures:', error);
            throw error;
        }
    },

    /**
     * Get detailed player information
     */
    async getPlayerDetail(playerId: number) {
        const cacheKey = `fpl:player:${playerId}`;

        // Try to get from cache first
        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return JSON.parse(cachedData);
            }
        } catch (error) {
            console.warn(`Redis cache error for player ${playerId}:`, error);
        }

        // Fetch from API
        try {
            const data = await fplApi.getPlayerDetail(playerId);

            // Store in cache
            try {
                const ttl = calculateTtl('player-detail');
                await redis.set(cacheKey, JSON.stringify(data), 'EX', ttl);
            } catch (cacheError) {
                console.warn(
                    `Failed to cache player ${playerId} data:`,
                    cacheError
                );
            }

            return data;
        } catch (error) {
            console.error(`Error fetching player ${playerId} details:`, error);
            throw error;
        }
    },

    /**
     * Get live gameweek data
     */
    async getGameweekLive(gameweekId: number) {
        const cacheKey = `fpl:gameweek:${gameweekId}:live`;

        // Try to get from cache first
        try {
            const cachedData = await redis.get(cacheKey);
            if (cachedData) {
                return JSON.parse(cachedData);
            }
        } catch (error) {
            console.warn(
                `Redis cache error for gameweek ${gameweekId} live:`,
                error
            );
        }

        // Fetch from API
        try {
            const data = await fplApi.getGameweekLive(gameweekId);

            // Store in cache
            try {
                const ttl = calculateTtl('live'); // Short TTL for live data
                await redis.set(cacheKey, JSON.stringify(data), 'EX', ttl);
            } catch (cacheError) {
                console.warn(
                    `Failed to cache gameweek ${gameweekId} live data:`,
                    cacheError
                );
            }

            return data;
        } catch (error) {
            console.error(
                `Error fetching gameweek ${gameweekId} live data:`,
                error
            );
            throw error;
        }
    },

    /**
     * Check if any matches are currently in progress
     */
    async isGameweekActive(): Promise<boolean> {
        try {
            const currentGameweek = await this.getCurrentGameweek();
            if (!currentGameweek) return false;

            const fixtures = await this.getFixtures(currentGameweek.id);
            const now = new Date();

            return fixtures.some((fixture) => {
                if (!fixture.kickoff_time) return false;

                const kickoff = new Date(fixture.kickoff_time);
                return kickoff <= now && !fixture.finished;
            });
        } catch (error) {
            console.error('Error checking if gameweek is active:', error);
            return false;
        }
    },

    /**
     * Updates all FPL data in the database
     * This would typically be called by a cron job
     */
    async updateAllData() {
        try {
            // Force fresh data
            const bootstrapData = await this.getBootstrapStatic();

            // Update Redis with fresh data
            const redisPromises = [
                // Store the entire bootstrap response
                redis.set(
                    'fpl:bootstrap-static',
                    JSON.stringify(bootstrapData),
                    'EX',
                    calculateTtl('bootstrap-static')
                ),

                // Store teams separately
                redis.set(
                    'fpl:teams',
                    JSON.stringify(bootstrapData.teams),
                    'EX',
                    calculateTtl('bootstrap-static')
                ),

                // Store gameweeks separately
                redis.set(
                    'fpl:gameweeks',
                    JSON.stringify(bootstrapData.events),
                    'EX',
                    calculateTtl('bootstrap-static')
                ),
            ];

            // Get fresh fixtures data
            const fixturesData = await fplApi.getFixtures();
            redisPromises.push(
                redis.set(
                    'fpl:fixtures',
                    JSON.stringify(fixturesData),
                    'EX',
                    calculateTtl('fixtures')
                )
            );

            // Execute all Redis operations
            await Promise.all(redisPromises);

            console.log('Successfully updated all FPL data');
            return true;
        } catch (error) {
            console.error('Error updating FPL data:', error);
            throw error;
        }
    },
};

/**
 * Calculate appropriate TTL for Redis cache based on the endpoint
 */
function calculateTtl(endpoint: string): number {
    const isGameweekActive = false; // TODO: Implement real check

    if (endpoint.includes('live')) {
        return isGameweekActive ? 60 * 15 : 60 * 60; // 15 minutes during matches, 1 hour otherwise
    } else if (endpoint === 'bootstrap-static') {
        return isGameweekActive ? 60 * 60 * 4 : 60 * 60 * 12; // 4 hours during active gameweeks, 12 hours otherwise
    } else if (endpoint === 'fixtures') {
        return isGameweekActive ? 60 * 60 * 6 : 60 * 60 * 24; // 6 hours during active gameweeks, 24 hours otherwise
    } else if (endpoint === 'player-detail') {
        return isGameweekActive ? 60 * 60 * 6 : 60 * 60 * 12; // 6 hours during active gameweeks, 12 hours otherwise
    } else {
        return 60 * 60 * 12; // 12 hours default
    }
}
