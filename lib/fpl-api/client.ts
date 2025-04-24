// Primary endpoints
const BOOTSTRAP_STATIC =
    'https://fantasy.premierleague.com/api/bootstrap-static/';
const FIXTURES = 'https://fantasy.premierleague.com/api/fixtures/';
const PLAYER_DETAIL = 'https://fantasy.premierleague.com/api/element-summary/';
const GAMEWEEK_LIVE = 'https://fantasy.premierleague.com/api/event/';

// Calculate appropriate TTL based on the endpoint
export function calculateTtl(endpoint: string): number {
    if (endpoint.includes('live')) {
        return 60 * 15; // 15 minutes
    } else if (endpoint === 'bootstrap-static') {
        return 60 * 60 * 4; // 4 hours
    } else if (endpoint === 'fixtures') {
        return 60 * 60 * 24; // 24 hours
    } else {
        return 60 * 60 * 12; // 12 hours default
    }
}

// Basic FPL API client
export const fplApi = {
    getBootstrapStatic: async () => {
        const response = await fetch(BOOTSTRAP_STATIC);
        if (!response.ok)
            throw new Error(
                `Failed to fetch bootstrap static: ${response.statusText}`
            );
        return response.json();
    },

    getFixtures: async () => {
        const response = await fetch(FIXTURES);
        if (!response.ok)
            throw new Error(`Failed to fetch fixtures: ${response.statusText}`);
        return response.json();
    },

    getPlayerDetail: async (playerId: number) => {
        const response = await fetch(`${PLAYER_DETAIL}${playerId}/`);
        if (!response.ok)
            throw new Error(
                `Failed to fetch player detail: ${response.statusText}`
            );
        return response.json();
    },

    getGameweekLive: async (gameweekId: number) => {
        const response = await fetch(`${GAMEWEEK_LIVE}${gameweekId}/live/`);
        if (!response.ok)
            throw new Error(
                `Failed to fetch gameweek live: ${response.statusText}`
            );
        return response.json();
    },
};
