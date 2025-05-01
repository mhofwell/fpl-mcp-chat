import redis from '@/lib/redis/redis-client';

// Define our session interface
export interface McpSession {
    id: string;
    createdAt: number;
    lastActivityAt: number;
    userId?: string;
}

// Session management functions
export async function storeSession(
    sessionId: string,
    userId?: string
): Promise<McpSession> {
    const now = Date.now();
    const session: McpSession = {
        id: sessionId,
        createdAt: now,
        lastActivityAt: now,
        userId,
    };

    // Store in Redis with a 24-hour expiration
    await redis.set(
        `mcp:session:${sessionId}`,
        JSON.stringify(session),
        'EX',
        86400
    );

    return session;
}

export async function getSession(
    sessionId: string
): Promise<McpSession | null> {
    const sessionData = await redis.get(`mcp:session:${sessionId}`);

    if (!sessionData) {
        return null;
    }

    return JSON.parse(sessionData);
}

export async function updateSessionActivity(sessionId: string): Promise<void> {
    const session = await getSession(sessionId);

    if (session) {
        session.lastActivityAt = Date.now();
        await redis.set(
            `mcp:session:${sessionId}`,
            JSON.stringify(session),
            'EX',
            86400
        );
    }
}

export async function deleteSession(sessionId: string): Promise<void> {
    await redis.del(`mcp:session:${sessionId}`);
}
