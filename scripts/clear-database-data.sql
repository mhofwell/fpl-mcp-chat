-- reset-database.sql
-- Function to clear all data but keep schema intact

CREATE OR REPLACE FUNCTION public.clear_database_data()
RETURNS VOID AS $$
BEGIN
    -- Clear data in reverse dependency order with WHERE TRUE
    DELETE FROM messages WHERE TRUE;
    DELETE FROM chats WHERE TRUE;
    DELETE FROM user_preferences WHERE TRUE;
    DELETE FROM profiles WHERE TRUE;
    DELETE FROM fixtures WHERE TRUE;
    DELETE FROM players WHERE TRUE;
    DELETE FROM gameweeks WHERE TRUE;
    DELETE FROM teams WHERE TRUE;
    
    -- Clean the auth.users table (only if you want to remove all users)
    DELETE FROM auth.users WHERE TRUE;
    
    -- Output success message
    RAISE NOTICE 'Database data has been cleared successfully!';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the function
-- SELECT public.clear_database_data();