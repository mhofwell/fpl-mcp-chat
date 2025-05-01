// lib/mcp-server/transport.ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import redis from '@/lib/redis/redis-client';

// Define maximum age for transports
const TRANSPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Create a persistent module-level sessions object
const sessions: Record<string, StreamableHTTPServerTransport> = {};

export const createMcpTransport = () => {
    // Create a new transport with session management
    const createTransport = async (
        sessionId: string
    ): Promise<StreamableHTTPServerTransport> => {
        // Check if session exists in memory
        if (sessions[sessionId]) {
            console.log(`Session ${sessionId} already exists in memory`);
            return sessions[sessionId];
        }

        // Check if session exists in Redis
        try {
            const exists = await redis.exists(`mcp:session:${sessionId}`);
            console.log(`Redis check for session ${sessionId}: ${exists ? 'exists' : 'does not exist'}`);
            
            if (exists && !sessions[sessionId]) {
                // Session exists in Redis but not in memory - create a new transport
                console.log(`Recreating transport for existing session ${sessionId}`);
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => sessionId,
                });
                sessions[sessionId] = transport;
                return transport;
            }
        } catch (redisError) {
            console.error(`Redis error checking session ${sessionId}:`, redisError);
        }

        // Create a new transport
        console.log(`Creating brand new transport for session ${sessionId}`);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
            onsessioninitialized: async (sid) => {
                console.log(`onsessioninitialized called for ${sid}`);
                try {
                    // Store session metadata in Redis
                    console.log(`Storing session ${sid} in Redis...`);
                    const result = await redis.hset(
                        `mcp:session:${sid}`,
                        'createdAt',
                        Date.now().toString()
                    );
                    console.log(`Redis HSET result: ${result}`);
                    
                    const expireResult = await redis.expire(
                        `mcp:session:${sid}`,
                        TRANSPORT_MAX_AGE_MS / 1000
                    );
                    console.log(`Redis EXPIRE result: ${expireResult}`);
                    
                    // Verify the session was stored
                    const verify = await redis.exists(`mcp:session:${sid}`);
                    console.log(`Session verification after storage: ${verify ? 'exists' : 'does not exist'}`);
                    
                    // Log the session creation
                    console.log(`Session ${sid} successfully initialized in transport`);
                } catch (error) {
                    console.error(`Error storing session ${sid} in Redis:`, error);
                }
            },
        });

        // Store session in the shared sessions object
        sessions[sessionId] = transport;
        
        // Log active sessions after adding new one
        console.log('Active sessions in memory:', Object.keys(sessions));

        return transport;
    };

    // Get a transport by session ID
    const getTransport = async (sessionId: string) => {
        // First check if it exists in memory
        if (sessions[sessionId]) {
            console.log(`Session ${sessionId} found in memory`);
            return sessions[sessionId];
        }
        
        // Check if session exists in Redis
        const exists = await redis.exists(`mcp:session:${sessionId}`);
        if (!exists) {
            console.log(`Session ${sessionId} not found in Redis`);
            return undefined;
        }
        
        // Session exists in Redis but not in memory - recreate it
        console.log(`Session ${sessionId} found in Redis but not in memory - recreating transport`);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
        });
        
        // Store in memory
        sessions[sessionId] = transport;
        console.log(`Recreated transport for session ${sessionId}`);
        
        return transport;
    };

    // List all active sessions
    const getActiveSessions = async () => {
        // Get all session keys from Redis
        const sessionKeys = await redis.keys('mcp:session:*');
        const redisSessionIds = sessionKeys.map((key) => key.replace('mcp:session:', ''));
        
        // Get all session keys from memory
        const memorySessionIds = Object.keys(sessions);
        
        // Log both for debugging
        console.log('Redis sessions:', redisSessionIds);
        console.log('Memory sessions:', memorySessionIds);
        
        // Return the Redis sessions (should be the source of truth)
        return redisSessionIds;
    };

    // Remove a transport session
    const removeTransport = async (sessionId: string) => {
        // Remove from Redis
        const removed = await redis.del(`mcp:session:${sessionId}`);

        // Also remove from persistent sessions object
        if (sessions[sessionId]) {
            sessions[sessionId].close();
            delete sessions[sessionId];
        }

        return removed > 0;
    };

    // Function to clean up old sessions
    const cleanupOldSessions = async (maxAge?: number) => {
        const actualMaxAge = maxAge || TRANSPORT_MAX_AGE_MS;
        const now = Date.now();
        let count = 0;
        
        // Get all session keys
        const sessionKeys = await redis.keys('mcp:session:*');
        
        for (const key of sessionKeys) {
            const sessionId = key.replace('mcp:session:', '');
            const createdAtStr = await redis.hget(key, 'createdAt');
            
            if (createdAtStr) {
                const createdAt = parseInt(createdAtStr);
                
                // Check if session has expired based on provided maxAge
                if (now - createdAt > actualMaxAge) {
                    // Remove from Redis
                    await redis.del(key);
                    
                    // Also close and remove from persistent sessions object if exists
                    if (sessions[sessionId]) {
                        sessions[sessionId].close();
                        delete sessions[sessionId];
                    }
                    
                    count++;
                }
            }
        }
        
        console.log(`Cleaned up ${count} expired sessions`);
        return count;
    };

    // Set up periodic cleanup (every hour)
    if (typeof setInterval !== 'undefined') {
        setInterval(cleanupOldSessions, 60 * 60 * 1000);
    }

    return {
        createTransport,
        getTransport,
        getActiveSessions,
        removeTransport,
        cleanupOldSessions,
    };
};

// Export a singleton instance
export const mcpTransport = createMcpTransport();
