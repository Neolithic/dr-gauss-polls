'use server';

import { getSupabaseClient } from '@/utils/supabase';
import { getServerSession } from 'next-auth';

export async function getMarginOptions(matchId?: string) {
  // For match IDs 21 and onwards
  if (matchId && parseInt(matchId) >= 21) {
    return {
      A: '0-12 runs / 6 or less balls remaining',
      B: '13-25 runs / 7-12 balls remaining',
      C: '26-40 runs / 13-22 balls remaining',
      D: '41+ runs / 23+ balls remaining'
    } as const;
  }

  // Default options for matches before ID 21
  return {
    A: '0-10 runs / 4 or less balls remaining',
    B: '11-20 runs / 5-9 balls remaining',
    C: '21-35 runs / 10-14 balls remaining',
    D: '36+ runs / 15+ balls remaining'
  } as const;
}

export type PollType = 'winner' | 'victory_margin' | 'final_ipl_winner';

export async function getPollTypes(): Promise<PollType[]> {
  return ['winner', 'victory_margin', 'final_ipl_winner'];
}

export async function checkLoggedIn() {
  const session = await getServerSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  if (!session.user?.email) {
    throw new Error('Unauthorized');
  }

}

export async function getPolls() {
  await checkLoggedIn();
  
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('MATCHES')
    .select('*')
    .order('Date', { ascending: true });

  if (error) throw error;
  
  // Get margin options for each match
  const pollsWithMarginOptions = await Promise.all(
    data.map(async (poll) => {
      const marginOptions = await getMarginOptions(poll.Match_ID);
      return {
        ...poll,
        marginOptions
      };
    })
  );
  
  return pollsWithMarginOptions;
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
  const closeTimeMap_regular = matches.reduce((acc: { [key: string]: string }, match) => {
    acc[match.Match_ID + "-winner"] = match.Poll_Close_Time;
    acc[match.Match_ID + "-victory_margin"] = match.Poll_Close_Time;    
    return acc;
  }, {});

  //now add adhoc polls
  const { data: adhocPolls, error: adhocError } = await supabase
    .from('ADHOC_POLLS')
    .select('match_id, poll_type,poll_close_time')  

  if (adhocError) throw adhocError;
  
  const closeTimeMap_adhoc = adhocPolls.reduce((acc: { [key: string]: string }, poll) => {
    acc[poll.match_id + "-" + poll.poll_type] = poll.poll_close_time;
    return acc;
  }, {});

  const closeTimeMap = { ...closeTimeMap_regular, ...closeTimeMap_adhoc };

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
    const matchCloseTime = closeTimeMap[vote.match_id + "-" + vote.poll_type];
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
      voteCounts[vote.match_id] = {};
    }
    if (!voteCounts[vote.match_id][vote.poll_type]) {
      voteCounts[vote.match_id][vote.poll_type] = {};
    }
    if (!votersByMatch[vote.match_id]) {
      votersByMatch[vote.match_id] = {};
    }
    if (!votersByMatch[vote.match_id][vote.poll_type]) {
      votersByMatch[vote.match_id][vote.poll_type] = {};
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

  // First check if this is an adhoc poll
  const { data: adhocData, error: adhocError } = await supabase
    .from('ADHOC_POLLS')
    .select('poll_close_time')
    .eq('match_id', matchId)
    .eq('poll_type', pollType)
    .eq('option', option)
    .single();

  if (adhocError && adhocError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    throw adhocError;
  }

  // If this is an adhoc poll, use its closing time
  if (adhocData) {
    if (now > adhocData.poll_close_time) {
      throw new Error('Adhoc poll has closed');
    }
  } else {
    // If not an adhoc poll, check regular match poll
    const { data: matchData, error: matchError } = await supabase
      .from('MATCHES')
      .select('Poll_Close_Time')
      .eq('Match_ID', matchId)
      .single();

    if (matchError) throw matchError;

    if (now > matchData.Poll_Close_Time) {
      throw new Error('Poll has closed');
    }
  }

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

export async function getLeaderboardData() {
  await checkLoggedIn();
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('VOTING_RESULTS')
    .select(`
      amount,
      match_id,
      poll_type,
      user_email,
      users:USERS!VOTING_RESULTS_user_email_fkey(user_name)
    `)
    .order('match_id', { ascending: true });

  if (error) throw error;

  // Transform the data to flatten the structure
  const results = data.map(record => {
    let uname = 'Unknown';
    if (record.users && typeof record.users === 'object' && 'user_name' in record.users)
      uname = record.users.user_name as string;
    else
      uname = record.users[0]?.user_name || 'Unknown';

    return {
      user_name: uname,
      match_id: record.match_id,
      poll_type: record.poll_type,
      amount: record.amount
    };
  });

  return results;
}

export async function getAdhocPolls() {
  await checkLoggedIn();
  
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('ADHOC_POLLS')
    .select('*')
    .order('poll_close_time', { ascending: true });

  if (error) throw error;
  return data;
} 
