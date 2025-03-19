import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { supabase } from '@/utils/supabase';

export async function GET() {
  const session = await getServerSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: polls, error } = await supabase
      .from('MATCHES')
      .select('Match_ID, Team_1, Team_2, Date, Poll_Close_Time')
      .order('Date', { ascending: true })
      .gte('Date', new Date().toISOString()); // Only fetch upcoming matches

    if (error) throw error;

    return NextResponse.json(polls);
  } catch (error) {
    console.error('Error fetching polls:', error);
    return NextResponse.json({ error: 'Failed to load polls' }, { status: 500 });
  }
} 