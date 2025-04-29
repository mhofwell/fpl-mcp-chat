# Database Setup Instructions

This README explains how to set up the database for the Fantasy Premier League Chat Assistant.

## Prerequisites

1. A Supabase project created at [https://supabase.com](https://supabase.com)
2. Node.js version 18 or higher
3. `.env.local` file configured with your Supabase credentials:
    ```
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
    ```

## Step 1: Create an Exec SQL Function

Before you can run the database setup, you need to create a PostgreSQL function in your Supabase project that allows executing SQL statements.

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Create a new query
4. Copy the contents of `scripts/exec_sql_function.sql` into the editor
5. Run the query

## Step 2: Set Up the Database Schema

Run the following command to set up the database schema:

```bash
npm run db:setup
```

This will:

- Create all required tables: teams, players, gameweeks, fixtures, profiles, user_preferences, chats, messages
- Set up RLS policies to secure the data
- Create triggers and functions for user management

## Step 3: Seed the Database with Fantasy Premier League Data

Run the following command to populate the database with data from the Fantasy Premier League API:

```bash
npm run db:seed
```

This will:

- Fetch teams, players, gameweeks, and fixtures from the FPL API
- Insert or update the records in the database

## Step 4: Complete Reset (Optional)

If you want to reset the database and reseed it with fresh data:

```bash
npm run db:reset
```

## Verifying Setup

After setup, you should see the following tables in your Supabase dashboard:

- teams
- players
- gameweeks
- fixtures
- profiles
- user_preferences
- chats
- messages

## Troubleshooting

If you encounter issues:

1. Check your environment variables are correctly set
2. Verify you have the required permissions in your Supabase project
3. Look at the console output for error messages
4. Check that your database doesn't have conflicting table structures

## Notes for Railway Deployment

When deploying to Railway:

- Make sure to add all required environment variables to your Railway project
- The database setup scripts can be run as part of your deployment process
