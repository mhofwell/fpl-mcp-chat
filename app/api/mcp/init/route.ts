// app/api/mcp/init/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createMcpServer } from '@/lib/mcp-server/index';
import { mcpTransport } from '@/lib/mcp-server/transport';
import redis from '@/lib/redis/redis-client';

// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

export async function POST(request: NextRequest) {
    try {
        // Create a new session ID
        const newSessionId = randomUUID();
        console.log(
            'Creating new session through init endpoint:',
            newSessionId
        );

        // Create a new transport using the mcpTransport manager
        const transport = await mcpTransport.createTransport(newSessionId);

        // Manually trigger session initialization if needed
        try {
            const exists = await redis.exists(`mcp:session:${newSessionId}`);
            if (exists) {
                console.log('Session already exists in Redis');
            } else {
                console.log('Manually initializing session in Redis');
                await redis.hset(
                    `mcp:session:${newSessionId}`,
                    'createdAt',
                    Date.now().toString()
                );
                await redis.expire(
                    `mcp:session:${newSessionId}`,
                    24 * 60 * 60 // 24 hours in seconds
                );
                console.log('Session manually stored in Redis');
            }
        } catch (redisError) {
            console.error('Error managing session in Redis:', redisError);
        }

        // Create and connect server
        console.log('Creating MCP server instance...');
        const server = await createMcpServer();
        await server.connect(transport);

        // Check Redis after server connection
        try {
            const exists = await redis.exists(`mcp:session:${newSessionId}`);
            console.log(
                `Session exists in Redis after server connection: ${exists}`
            );

            // If it still doesn't exist, try to store it again
            if (!exists) {
                await redis.hset(
                    `mcp:session:${newSessionId}`,
                    'createdAt',
                    Date.now().toString()
                );
                await redis.expire(
                    `mcp:session:${newSessionId}`,
                    24 * 60 * 60 // 24 hours in seconds
                );
                console.log('Session stored in Redis after failure');
            }
        } catch (redisError) {
            console.error(
                'Error checking/storing session in Redis:',
                redisError
            );
        }

        console.log(
            'Session initialized through direct endpoint:',
            newSessionId
        );
        console.log('Active sessions:', await mcpTransport.getActiveSessions());

        // Return success response with the session ID
        return NextResponse.json(
            { success: true, sessionId: newSessionId },
            {
                status: 200,
                headers: { 'mcp-session-id': newSessionId },
            }
        );
    } catch (error) {
        console.error('Error initializing session:', error);
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500 }
        );
    }
}
