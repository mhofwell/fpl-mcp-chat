import { NextResponse } from 'next/server';
import { mcpTransport } from '@/lib/mcp-server/transport';
import redis from '@/lib/redis/redis-client';

export async function GET() {
    try {
        const activeSessions = await mcpTransport.getActiveSessions();
        
        // Get additional session details from Redis
        const sessionDetails = [];
        
        for (const sessionId of activeSessions) {
            const data = await redis.hgetall(`mcp:session:${sessionId}`);
            if (data && Object.keys(data).length > 0) {
                sessionDetails.push({
                    sessionId,
                    createdAt: parseInt(data.createdAt || '0'),
                    lastActive: parseInt(data.lastActive || '0'),
                    ttl: await redis.ttl(`mcp:session:${sessionId}`)
                });
            } else {
                sessionDetails.push({
                    sessionId,
                    status: 'missing-details'
                });
            }
        }
        
        return NextResponse.json({
            success: true,
            activeSessions,
            sessionCount: activeSessions.length,
            sessionDetails,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: String(error)
        }, { status: 500 });
    }
}
