import { NextRequest, NextResponse } from 'next/server';
import { mcpTransport } from '@/lib/mcp-server/transport';

// Cleanup endpoint that can be called by a cron job or manually
export async function POST(request: NextRequest) {
    try {
        // Default to 24 hours (in milliseconds)
        const maxAge = 24 * 60 * 60 * 1000;
        
        // Allow specifying a custom max age in request
        let customMaxAge;
        try {
            const body = await request.json();
            customMaxAge = body.maxAge; 
        } catch (error) {
            // No body or invalid body, use default
        }
        
        const removedCount = await mcpTransport.cleanupOldSessions(customMaxAge || undefined);
        
        return NextResponse.json({
            success: true,
            removedCount,
            message: `Cleaned up ${removedCount} expired sessions`
        });
    } catch (error) {
        console.error('Error cleaning up sessions:', error);
        return NextResponse.json({
            success: false,
            error: String(error)
        }, { status: 500 });
    }
}
