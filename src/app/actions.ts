'use server';

import { getSupabaseClient } from '@/utils/supabase';
import { getServerSession } from 'next-auth';

export async function getMarginOptions() {
  return {
    A: '0-10 runs / 4 or less balls remaining',
    B: '11-20 runs / 5-9 balls remaining',
    C: '21-35 runs / 10-14 balls remaining',
    D: '36+ runs / 15+ balls remaining'
  } as const;
}

export type PollType = 'winner' | 'victory_margin';

export async function getPollTypes(): Promise<PollType[]> {
  return ['winner', 'victory_margin'];
}

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
  poll_type: PollType;
  created_timestamp: string;
}

interface VotesByTeam {
  [option: string]: Array<{ name: string; email: string }>;
}

interface UserVotes {
  [matchId: string]: {
    [pollType: string]: string;
  };
}

interface AIVote {
  match_id: string;
  reasoning: string;
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
    .select('match_id, user_email, user_name, option_voted, poll_type, created_timestamp')
    .order('created_timestamp', { ascending: false });

  if (error) throw error;

  // Process votes for each match and poll type
  const voteCounts: { [matchId: string]: { [pollType: string]: { [option: string]: number } } } = {};
  const votersByMatch: { [matchId: string]: { [pollType: string]: VotesByTeam } } = {};
  const userVotes: { [key: string]: string } = {};

  // Track the latest vote for each user-match-polltype combination
  const latestVotes = new Map<string, Vote>();

  // First pass: find the latest valid vote for each user-match-polltype combination
  votes.forEach((vote: Vote) => {
    const matchCloseTime = closeTimeMap[vote.match_id];
    if (!matchCloseTime || vote.created_timestamp > matchCloseTime) return;

    const voteKey = `${vote.match_id}-${vote.poll_type}-${vote.user_email}`;
    if (!latestVotes.has(voteKey)) {
      latestVotes.set(voteKey, vote);
    }
  });

  // Second pass: process only the latest valid votes
  latestVotes.forEach((vote: Vote) => {
    // Initialize structures if needed
    if (!voteCounts[vote.match_id]) {
      voteCounts[vote.match_id] = { winner: {}, victory_margin: {} };
    }
    if (!votersByMatch[vote.match_id]) {
      votersByMatch[vote.match_id] = { winner: {}, victory_margin: {} };
    }
    if (!votersByMatch[vote.match_id][vote.poll_type][vote.option_voted]) {
      votersByMatch[vote.match_id][vote.poll_type][vote.option_voted] = [];
    }

    // Count the vote
    if (!voteCounts[vote.match_id][vote.poll_type][vote.option_voted]) {
      voteCounts[vote.match_id][vote.poll_type][vote.option_voted] = 0;
    }
    voteCounts[vote.match_id][vote.poll_type][vote.option_voted]++;

    // Add voter info to the option's voter list
    votersByMatch[vote.match_id][vote.poll_type][vote.option_voted].push({
      name: vote.user_name || '',
      email: vote.user_email
    });

    // Record the user's own latest vote if it's their email
    if (session.user?.email === vote.user_email) {
      const matchVoteKey = `${vote.match_id}-${vote.poll_type}`;
      userVotes[matchVoteKey] = vote.option_voted;
    }
  });

  // Clean up userVotes to match the expected structure
  const cleanUserVotes: UserVotes = {};
  Object.entries(userVotes).forEach(([key, value]) => {
    const [matchId, pollType] = key.split('-');
    if (!cleanUserVotes[matchId]) {
      cleanUserVotes[matchId] = {};
    }
    cleanUserVotes[matchId][pollType] = value;
  });

  return {
    voteCounts,
    votersByMatch,
    userVotes: cleanUserVotes
  };
}

export async function submitVote(matchId: string, option: string, pollType: PollType) {
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

  // Check user's latest vote for this match and poll type

  // Insert new vote record
  const { error: voteError } = await supabase
    .from('VOTES')
    .insert({
      match_id: matchId,
      user_email: session.user.email,
      user_name: session.user.name || 'Empty',
      poll_type: pollType,
      option_voted: option,
      created_timestamp: now
    });

  if (voteError) throw voteError;
  return true;
}

export async function getAIVotes(): Promise<{ [matchId: string]: string }> {
  const supabase = await getSupabaseClient();

  const { data: aiVotes, error } = await supabase
    .from('AI_VOTES')
    .select('match_id, reasoning');

  if (error) throw error;

  return (aiVotes as AIVote[]).reduce((acc, vote) => {
    acc[vote.match_id] = vote.reasoning;
    return acc;
  }, {} as { [matchId: string]: string });
} 
