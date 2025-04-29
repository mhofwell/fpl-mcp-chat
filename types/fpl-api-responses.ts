// types/fpl-api-responses.ts
export interface FplTeam {
    id: number;
    name: string;
    short_name: string;
    // Add other properties from API
}

export interface FplElement {
    id: number;
    web_name: string;
    first_name: string;
    second_name: string;
    team: number;
    element_type: number;
    form: string;
    points_per_game: string;
    total_points: number;
    selected_by_percent: string;
    // Add other API properties
}

export interface FplEvent {
    id: number;
    name: string;
    deadline_time: string;
    is_current: boolean;
    is_next: boolean;
    finished: boolean;
    // Add other API properties
}

export interface FplFixture {
    id: number;
    event: number | null;
    team_h: number;
    team_a: number;
    kickoff_time: string | null;
    finished: boolean;
    // Add other API properties
}

export interface BootstrapStaticResponse {
    teams: FplTeam[];
    elements: FplElement[];
    events: FplEvent[];
    // Other bootstrap data
}

export interface PlayerDetailResponse {
    // Player detail structure
    history: any[];
    fixtures: any[];
}

export interface GameweekLiveResponse {
    elements: Record<string, any>;
}
