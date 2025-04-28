// scripts/seed-database.ts
import { createClient } from '@supabase/supabase-js';
import { fplApiService } from '../lib/fpl-api/service';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

// Create Supabase client with service role key for admin access
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedDatabase() {
    console.log('Starting database seed process...');
    try {
        // Step 1: Get all data from FPL API
        console.log('Fetching data from FPL API...');
        const teams = await fplApiService.getTeams();
        const players = await fplApiService.getPlayers();
        const gameweeks = await fplApiService.getGameweeks();
        const fixtures = await fplApiService.getFixtures();
        console.log(
            `Fetched ${teams.length} teams, ${players.length} players, ${gameweeks.length} gameweeks, and ${fixtures.length} fixtures.`
        );

        // Step 2: Insert or update teams
        console.log('Seeding teams table...');
        for (const team of teams) {
            const { error } = await supabase.from('teams').upsert({
                id: team.id,
                name: team.name,
                short_name: team.short_name,
                last_updated: new Date().toISOString(),
            });
            if (error) {
                console.error(`Error inserting team ${team.name}:`, error);
            }
        }

        // Step 3: Insert or update gameweeks
        console.log('Seeding gameweeks table...');
        for (const gameweek of gameweeks) {
            const { error } = await supabase.from('gameweeks').upsert({
                id: gameweek.id,
                name: gameweek.name,
                deadline_time: gameweek.deadline_time,
                is_current: gameweek.is_current,
                is_next: gameweek.is_next,
                finished: gameweek.finished,
                last_updated: new Date().toISOString(),
            });
            if (error) {
                console.error(
                    `Error inserting gameweek ${gameweek.name}:`,
                    error
                );
            }
        }

        // Step 4: Insert or update players (in batches to avoid rate limits)
        console.log('Seeding players table...');
        const BATCH_SIZE = 50;
        for (let i = 0; i < players.length; i += BATCH_SIZE) {
            const batch = players.slice(i, i + BATCH_SIZE).map((player) => ({
                id: player.id,
                web_name: player.web_name,
                full_name: player.full_name,
                team_id: player.team_id,
                position: player.position,
                last_updated: new Date().toISOString(),
            }));
            const { error } = await supabase.from('players').upsert(batch);
            if (error) {
                console.error(
                    `Error inserting player batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
                    error
                );
            } else {
                console.log(
                    `Inserted player batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(players.length / BATCH_SIZE)}`
                );
            }
            // Add a small delay to avoid overwhelming the database
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Step 5: Insert or update fixtures (in batches)
        console.log('Seeding fixtures table...');
        for (let i = 0; i < fixtures.length; i += BATCH_SIZE) {
            const batch = fixtures.slice(i, i + BATCH_SIZE).map((fixture) => ({
                id: fixture.id,
                gameweek_id: fixture.gameweek_id,
                home_team_id: fixture.home_team_id,
                away_team_id: fixture.away_team_id,
                kickoff_time: fixture.kickoff_time,
                finished: fixture.finished,
                last_updated: new Date().toISOString(),
            }));
            const { error } = await supabase.from('fixtures').upsert(batch);
            if (error) {
                console.error(
                    `Error inserting fixture batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
                    error
                );
            } else {
                console.log(
                    `Inserted fixture batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(fixtures.length / BATCH_SIZE)}`
                );
            }
            // Add a small delay to avoid overwhelming the database
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Step 6: Create default profiles and preferences for existing users
        console.log('Setting up user profiles and preferences...');
        const { data: users, error: usersError } =
            await supabase.auth.admin.listUsers();

        if (usersError) {
            console.error('Error fetching users:', usersError);
        } else if (users && users.users) {
            for (const user of users.users) {
                // Create profile if it doesn't exist
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('id', user.id)
                    .single();

                if (!existingProfile) {
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert({
                            id: user.id,
                            username: user.email?.split('@')[0] || null,
                            full_name: user.user_metadata?.full_name || null,
                            avatar_url: null,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        });

                    if (profileError) {
                        console.error(
                            `Error creating profile for user ${user.id}:`,
                            profileError
                        );
                    } else {
                        console.log(`Created profile for user ${user.id}`);
                    }
                }

                // Create user preferences if they don't exist
                const { data: existingPreferences } = await supabase
                    .from('user_preferences')
                    .select('id')
                    .eq('id', user.id)
                    .single();

                if (!existingPreferences) {
                    const { error: prefError } = await supabase
                        .from('user_preferences')
                        .insert({
                            id: user.id,
                            favorite_team_id: null,
                            dark_mode: false,
                            email_notifications: true,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        });

                    if (prefError) {
                        console.error(
                            `Error creating preferences for user ${user.id}:`,
                            prefError
                        );
                    } else {
                        console.log(`Created preferences for user ${user.id}`);
                    }
                }
            }
        }

        // Step 7: Initialize some default chats for each user (optional)
        if (users && users.users) {
            console.log('Creating default chats for users...');
            for (const user of users.users) {
                // Check if user already has chats
                const { data: existingChats } = await supabase
                    .from('chats')
                    .select('id')
                    .eq('user_id', user.id)
                    .limit(1);

                if (!existingChats || existingChats.length === 0) {
                    // Create a welcome chat
                    const { data: chat, error: chatError } = await supabase
                        .from('chats')
                        .insert({
                            user_id: user.id,
                            title: 'Welcome to FPL Chat',
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        })
                        .select()
                        .single();

                    if (chatError) {
                        console.error(
                            `Error creating default chat for user ${user.id}:`,
                            chatError
                        );
                    } else if (chat) {
                        // Add a welcome message
                        const { error: msgError } = await supabase
                            .from('messages')
                            .insert({
                                chat_id: chat.id,
                                content:
                                    'Welcome to FPL Chat! Ask me anything about Fantasy Premier League.',
                                role: 'assistant',
                                created_at: new Date().toISOString(),
                            });

                        if (msgError) {
                            console.error(
                                `Error creating welcome message for user ${user.id}:`,
                                msgError
                            );
                        } else {
                            console.log(
                                `Created default chat for user ${user.id}`
                            );
                        }
                    }
                }
            }
        }

        console.log('Database seed completed successfully!');
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

// Run the seed function
seedDatabase()
    .then(() => {
        console.log('Seed process complete');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Seed process failed:', error);
        process.exit(1);
    });
