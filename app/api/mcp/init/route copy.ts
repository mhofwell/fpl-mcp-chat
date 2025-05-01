// app/api/mcp/init/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { createMcpServer } from '@/lib/mcp-server';
import { mcpTransport } from '@/lib/mcp-server/transport';
import {
    initializeServerMcpSession,
    getServerSessionId,
} from '@/lib/mcp-server/server-init';
import { fplApiService } from '@/lib/fpl-api/service';
import { checkForUpdates } from '@/lib/fpl-api/fpl-data-sync';

// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

// Global variable to track if FPL service has been initialized
let fplServiceInitialized = false;

// Initialize FPL service (runs once per server instance)
async function initializeFplService() {
    if (!fplServiceInitialized) {
        try {
            console.log('Initializing FPL service...');
            await fplApiService.initialize();
            await checkForUpdates();
            fplServiceInitialized = true;
            console.log('FPL service initialized and updates checked');
        } catch (error) {
            console.error('Error initializing FPL service:', error);
            // Still mark as initialized to prevent endless retries
            fplServiceInitialized = true;
            throw error;
        }
    }
}

export async function POST(request: NextRequest) {
    try {
        // Ensure FPL service is initialized first
        await initializeFplService();

        console.log('Starting MCP session initialization...');

        // Check for existing session in cookies
        const cookieStore = await cookies();
        const existingSessionId = cookieStore.get('mcp-session-id')?.value;

        // If there's an existing session ID in cookies, verify it's still valid
        if (existingSessionId) {
            const transport = mcpTransport.getTransport(existingSessionId);
            if (transport) {
                console.log(
                    'Reusing existing session from cookie:',
                    existingSessionId
                );
                return NextResponse.json({
                    success: true,
                    session_id: existingSessionId,
                    message: 'Using existing session',
                });
            }
            console.log(
                'Found expired session in cookie, creating new session'
            );
        }

        // Make sure server MCP is initialized first
        const serverInit = await initializeServerMcpSession();
        if (isDevMode) {
            console.log('Server init result:', serverInit);
        }

        if (!serverInit.success) {
            console.error('Server initialization failed:', serverInit.error);
            return NextResponse.json(
                { error: `Server initialization failed: ${serverInit.error}` },
                { status: 500 }
            );
        }

        // Generate a new session ID
        const newSessionId = randomUUID();

        // Create a new transport for this session
        const transport = mcpTransport.createTransport(newSessionId);

        // Create and connect a new MCP server instance
        const server = await createMcpServer();
        await server.connect(transport);

        if (isDevMode) {
            console.log('Created new MCP session:', newSessionId);
        }

        // Create a response with the session ID
        const response = NextResponse.json({
            success: true,
            session_id: newSessionId,
        });

        // Set session cookie
        response.cookies.set('mcp-session-id', newSessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 24, // 24 hours
        });

        return response;
    } catch (error) {
        console.error('Error during MCP session initialization:', error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error during initialization',
            },
            { status: 500 }
        );
    }
}
