import { checkForUpdates, syncFplData } from '@/lib/fpl-api/fpl-data-sync';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    // Verify authentication token for cron service
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Use syncFplData() for a full data refresh
        const result = await syncFplData();
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in FPL data sync:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// Also allow GET requests for manual triggering (with proper authentication)
export async function GET(request: Request) {
    return POST(request);
}
