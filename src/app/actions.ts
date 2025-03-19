'use server';

import { getSupabaseClient } from '@/utils/supabase';
import { getServerSession } from 'next-auth';

export async function getPolls() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('MATCHES')
    .select('*')
    .order('Date', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getVotesForMatch(matchId: string) {
  const session = await getServerSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  const supabase = await getSupabaseClient();

  // Get the poll close time
  const { data: matchData, error: matchError } = await supabase
    .from('MATCHES')
    .select('Poll_Close_Time')
    .eq('Match_ID', matchId)
    .single();

  if (matchError) throw matchError;

  // Get the latest vote for each user before poll close time
  const { data: votes, error } = await supabase
    .from('VOTES')
    .select('user_email, option_voted, created_timestamp')
    .eq('match_id', matchId)
    .eq('poll_type', 'winner')
    .lte('created_timestamp', matchData.Poll_Close_Time)
    .order('created_timestamp', { ascending: false });

  if (error) throw error;

  // Get only the latest vote for each user
  const latestVotes = votes.reduce((acc: { [email: string]: string }, vote) => {
    if (!acc[vote.user_email]) {
      acc[vote.user_email] = vote.option_voted;
    }
    return acc;
  }, {});

  // Count votes for each team
  const voteCounts = Object.values(latestVotes).reduce((acc: { [key: string]: number }, team) => {
    acc[team] = (acc[team] || 0) + 1;
    return acc;
  }, {});

  return voteCounts;
}

export async function getUserVoteForMatch(matchId: string) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const supabase = await getSupabaseClient();

  // Get the poll close time
  const { data: matchData, error: matchError } = await supabase
    .from('MATCHES')
    .select('Poll_Close_Time')
    .eq('Match_ID', matchId)
    .single();

  if (matchError) throw matchError;

  // Get user's latest vote before poll close time
  const { data: votes, error } = await supabase
    .from('VOTES')
    .select('option_voted, created_timestamp')
    .eq('match_id', matchId)
    .eq('user_email', session.user.email)
    .eq('poll_type', 'winner')
    .lte('created_timestamp', matchData.Poll_Close_Time)
    .order('created_timestamp', { ascending: false })
    .limit(1);

  if (error) throw error;
  return votes[0] || null;
}

export async function submitVote(matchId: string, teamVoted: string) {
  const session = await getServerSession();

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  const now = new Date().toISOString();
  const supabase = await getSupabaseClient();

  // Check if poll is still open
  const { data: matchData, error: matchError } = await supabase
    .from('MATCHES')
    .select('Poll_Close_Time')
    .eq('Match_ID', matchId)
    .single();

  if (matchError) throw matchError;

  if (now > matchData.Poll_Close_Time) {
    throw new Error('Poll has closed');
  }

  // Insert new vote record
  const { error: voteError } = await supabase
    .from('VOTES')
    .insert({
      match_id: matchId,
      user_email: session.user.email,
      poll_type: 'winner',
      option_voted: teamVoted,
      created_timestamp: now
    });

  if (voteError) throw voteError;
  return true;
} 