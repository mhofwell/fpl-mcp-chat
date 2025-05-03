import { NextResponse } from 'next/server';
import { fplApiService } from '@/lib/fpl-api/service';

export async function GET() {
    const isActive = await fplApiService.isGameweekActive();
    const fixtures = await fplApiService.getFixtures();

    // Get next 24hr matches
    const next24hrs = fixtures.filter((f) => {
        const kickoff = new Date(f.kickoff_time);
        return (
            kickoff > new Date() &&
            kickoff < new Date(Date.now() + 24 * 60 * 60 * 1000)
        );
    });

    return NextResponse.json({
        hasActiveMatches: isActive,
        hasUpcomingMatches: next24hrs.length > 0,
        nextMatch: next24hrs[0]?.kickoff_time || null,
    });
}
