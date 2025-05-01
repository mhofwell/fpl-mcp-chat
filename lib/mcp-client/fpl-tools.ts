// lib/mcp-client/fpl-tools.ts
import { initStandaloneMcpClient } from './index';
import { Gameweek, Team, Player, Fixture } from '../../types/fpl';

// Add this type at the top of the file
type MCPResponse = {
    content?: Array<{
        type?: string;
        text: string;
    }>;
};

/**
 * FPL Tools client wrapper for MCP
 */
export const fplTools = {
    /**
     * Get current gameweek information
     */
    async getCurrentGameweek(): Promise<Gameweek | null> {
        const client = await initStandaloneMcpClient();
        const result = (await client.callTool({
            name: 'get-current-gameweek',
            arguments: {},
        })) as MCPResponse;

        if (result?.content?.[0]?.text) {
            try {
                return JSON.parse(result.content[0].text);
            } catch (error) {
                console.error('Error parsing gameweek JSON:', error);
                return null;
            }
        }

        return null;
    },

    /**
     * Get team information by ID
     */
    async getTeam(teamId: number): Promise<Team | null> {
        const client = await initStandaloneMcpClient();
        const result = (await client.callTool({
            name: 'get-team',
            arguments: { teamId },
        })) as MCPResponse;

        if (result && result.content && result.content[0].text) {
            try {
                return JSON.parse(result.content[0].text);
            } catch (error) {
                console.error('Error parsing team JSON:', error);
                return null;
            }
        }

        return null;
    },

    /**
     * Get player information by ID
     */
    async getPlayer(playerId: number): Promise<Player | null> {
        const client = await initStandaloneMcpClient();
        const result = (await client.callTool({
            name: 'get-player',
            arguments: { playerId },
        })) as MCPResponse;

        if (result?.content?.[0]?.text) {
            try {
                return JSON.parse(result.content[0].text);
            } catch (error) {
                console.error('Error parsing player JSON:', error);
                return null;
            }
        }

        return null;
    },

    /**
     * Get fixtures for a gameweek
     */
    async getGameweekFixtures(gameweekId: number): Promise<Fixture[] | null> {
        const client = await initStandaloneMcpClient();
        const result = (await client.callTool({
            name: 'get-gameweek-fixtures',
            arguments: { gameweekId },
        })) as MCPResponse;

        if (result?.content?.[0]?.text) {
            try {
                return JSON.parse(result.content[0].text);
            } catch (error) {
                console.error('Error parsing fixtures JSON:', error);
                return null;
            }
        }

        return null;
    },
};
