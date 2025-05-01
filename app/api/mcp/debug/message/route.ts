import { NextRequest, NextResponse } from 'next/server';

// Save recent messages for debugging
const recentMessages: Array<{timestamp: string, direction: 'sent' | 'received', message: any}> = [];

// Export a function to log messages
export function logMessage(direction: 'sent' | 'received', message: any) {
    const entry = {
        timestamp: new Date().toISOString(),
        direction,
        message
    };
    
    recentMessages.push(entry);
    
    // Keep only the most recent 20 messages
    if (recentMessages.length > 20) {
        recentMessages.shift();
    }
}

export async function GET() {
    return NextResponse.json({
        messages: recentMessages
    });
}

export async function POST(request: NextRequest) {
    try {
        const message = await request.json();
        logMessage('received', message);
        
        // Echo back a properly formatted JSON-RPC response
        return NextResponse.json({
            jsonrpc: '2.0',
            id: message.id || null,
            result: {
                echo: true,
                message
            }
        });
    } catch (error) {
        return NextResponse.json({
            jsonrpc: '2.0',
            id: null,
            error: {
                code: -32700,
                message: 'Parse error',
                data: String(error)
            }
        }, { status: 400 });
    }
}
