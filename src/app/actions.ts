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

interface Vote {
  match_id: string;
  user_email: string;
  user_name?: string;
  option_voted: string;
  created_timestamp: string;
}

interface VotesByTeam {
  [team: string]: Array<{ name: string; email: string }>;
}

export async function getAllVotes() {
  const session = await getServerSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  const supabase = await getSupabaseClient();

  // First get all matches with their close times
  const { data: matches, error: matchError } = await supabase
    .from('MATCHES')
    .select('Match_ID, Poll_Close_Time');

  if (matchError) throw matchError;

  // Create a map of match IDs to close times
  const closeTimeMap = matches.reduce((acc: { [key: string]: string }, match) => {
    acc[match.Match_ID] = match.Poll_Close_Time;
    return acc;
  }, {});

  // Get all votes
  const { data: votes, error } = await supabase
    .from('VOTES')
    .select('match_id, user_email, user_name, option_voted, created_timestamp')
    .eq('poll_type', 'winner')
    .order('created_timestamp', { ascending: false });

  if (error) throw error;

  // Process votes for each match
  const voteCounts: { [matchId: string]: { [team: string]: number } } = {};
  const userVotes: { [matchId: string]: string } = {};
  const votersByMatch: { [matchId: string]: VotesByTeam } = {};

  votes.forEach((vote: Vote) => {
    const matchCloseTime = closeTimeMap[vote.match_id];
    if (!matchCloseTime || vote.created_timestamp > matchCloseTime) return;

    // Initialize structures if needed
    if (!voteCounts[vote.match_id]) {
      voteCounts[vote.match_id] = {};
    }
    if (!votersByMatch[vote.match_id]) {
      votersByMatch[vote.match_id] = {};
    }
    if (!votersByMatch[vote.match_id][vote.option_voted]) {
      votersByMatch[vote.match_id][vote.option_voted] = [];
    }
    
    // If we haven't recorded this user's vote for this match yet
    if (!userVotes[`${vote.match_id}-${vote.user_email}`]) {
      userVotes[`${vote.match_id}-${vote.user_email}`] = vote.option_voted;
      voteCounts[vote.match_id][vote.option_voted] = (voteCounts[vote.match_id][vote.option_voted] || 0) + 1;

      // Add voter info to the team's voter list
      votersByMatch[vote.match_id][vote.option_voted].push({
        name: vote.user_name || '',
        email: vote.user_email
      });
    }

    // Record the user's own latest vote if it's their email
    if (session.user?.email === vote.user_email && !userVotes[vote.match_id]) {
      userVotes[vote.match_id] = vote.option_voted;
    }
  });

  return {
    voteCounts,
    votersByMatch,
    userVotes: Object.entries(userVotes)
      .filter(([key]) => !key.includes('-'))
      .reduce((acc: { [key: string]: string }, [matchId, team]) => {
        acc[matchId] = team;
        return acc;
      }, {})
  };
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
      user_name: session.user.name || 'Empty',
      poll_type: 'winner',
      option_voted: teamVoted,
      created_timestamp: now
    });

  if (voteError) throw voteError;
  return true;
} 