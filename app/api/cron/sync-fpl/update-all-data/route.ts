// app/api/cron/sync-fpl/update-all-data/route.ts
import { syncFplData } from '@/lib/fpl-api/fpl-data-sync';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // Verify authentication token for cron service
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('Starting scheduled FPL data sync from Next.js cron job');
        
        // Use syncFplData() for a full data refresh
        const result = await syncFplData();
        
        console.log('Completed FPL data sync from Next.js cron job');
        return NextResponse.json({
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in FPL data sync from Next.js cron job:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}

// Also allow GET requests for manual triggering (with proper authentication)
export async function GET(request: Request) {
    return POST(request);
}