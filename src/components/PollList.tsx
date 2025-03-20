'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getPolls, getAllVotes, submitVote, getMarginOptions, type PollType } from '@/app/actions';

interface Poll {
  Match_ID: string;
  Team_1: string;
  Team_2: string;
  Date: string;
  Poll_Close_Time: string;
}

interface VoteCounts {
  [option: string]: number;
}

interface Voter {
  name: string;
  email: string;
}

interface VotesByTeam {
  [option: string]: Voter[];
}

interface VotersByMatch {
  [matchId: string]: {
    [pollType: string]: VotesByTeam;
  };
}

interface UserVotes {
  [pollType: string]: string;
}

type MarginOptions = Awaited<ReturnType<typeof getMarginOptions>>;

export default function PollList() {
  const { data: session } = useSession();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [voteCounts, setVoteCounts] = useState<{ [matchId: string]: { [pollType: string]: VoteCounts } }>({});
  const [userVotes, setUserVotes] = useState<{ [matchId: string]: UserVotes }>({});
  const [votersByMatch, setVotersByMatch] = useState<VotersByMatch>({});
  const [voting, setVoting] = useState<{ [key: string]: boolean }>({});
  const [expandedTeams, setExpandedTeams] = useState<{ [key: string]: boolean }>({});
  const [marginOptions, setMarginOptions] = useState<MarginOptions | null>(null);

  const fetchData = async () => {
    try {
      const [pollsData, votesData, marginOpts] = await Promise.all([
        getPolls(),
        getAllVotes(),
        getMarginOptions()
      ]);
      
      setPolls(pollsData);
      setVoteCounts(votesData.voteCounts);
      setUserVotes(votesData.userVotes);
      setVotersByMatch(votesData.votersByMatch);
      setMarginOptions(marginOpts);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [session]);

  const handleVote = async (matchId: string, option: string, pollType: PollType) => {
    if (!session?.user?.email) return;
    
    if (userVotes[matchId]?.[pollType] === option) {
      alert(`You have already voted for ${option}`);
      return;
    }
    
    const voteKey = `${matchId}-${pollType}`;
    setVoting(prev => ({ ...prev, [voteKey]: true }));
    try {
      await submitVote(matchId, option, pollType);
      await fetchData();
    } catch (error: any) {
      console.error('Error voting:', error);
      alert(error.message || 'Failed to vote');
    } finally {
      setVoting(prev => ({ ...prev, [voteKey]: false }));
    }
  };

  const toggleVoterList = (matchId: string, pollType: string, option: string) => {
    const key = `${matchId}-${pollType}-${option}`;
    setExpandedTeams(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const renderVoterList = (matchId: string, pollType: string, option: string) => {
    const voters = votersByMatch[matchId]?.[pollType]?.[option] || [];
    const key = `${matchId}-${pollType}-${option}`;
    const isExpanded = expandedTeams[key];

    if (voters.length === 0) return null;

    return (
      <div className="mt-2">
        <button
          onClick={() => toggleVoterList(matchId, pollType, option)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {isExpanded ? 'Hide voters' : 'Show voters'}
        </button>
        {isExpanded && (
          <ul className="mt-1 text-sm text-gray-600 space-y-1">
            {voters.map((voter, index) => (
              <li key={index}>
                {voter.name || voter.email}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const renderWinnerPoll = (poll: Poll, isActive: boolean) => {
    const votes = voteCounts[poll.Match_ID]?.winner || {};
    const team1Votes = votes[poll.Team_1] || 0;
    const team2Votes = votes[poll.Team_2] || 0;
    const totalVotes = team1Votes + team2Votes;
    const userVote = userVotes[poll.Match_ID]?.winner;
    const isVoting = voting[`${poll.Match_ID}-winner`];

    return (
      <div className="mb-6">
        <h4 className="text-lg font-semibold mb-3">Winner Poll</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <button
              onClick={() => handleVote(poll.Match_ID, poll.Team_1, 'winner')}
              disabled={isVoting || !isActive}
              className={`w-full p-4 text-center border rounded-lg transition-colors ${
                userVote === poll.Team_1
                  ? 'bg-green-50 border-green-500'
                  : isActive ? 'hover:bg-blue-50' : 'bg-gray-50'
              }`}
            >
              {poll.Team_1} will win
              <div className="text-sm text-gray-600 mt-1">
                {calculatePercentage(team1Votes, totalVotes)}%
              </div>
            </button>
            {renderVoterList(poll.Match_ID, 'winner', poll.Team_1)}
          </div>
          <div>
            <button
              onClick={() => handleVote(poll.Match_ID, poll.Team_2, 'winner')}
              disabled={isVoting || !isActive}
              className={`w-full p-4 text-center border rounded-lg transition-colors ${
                userVote === poll.Team_2
                  ? 'bg-green-50 border-green-500'
                  : isActive ? 'hover:bg-blue-50' : 'bg-gray-50'
              }`}
            >
              {poll.Team_2} will win
              <div className="text-sm text-gray-600 mt-1">
                {calculatePercentage(team2Votes, totalVotes)}%
              </div>
            </button>
            {renderVoterList(poll.Match_ID, 'winner', poll.Team_2)}
          </div>
        </div>
        {userVote && (
          <p className="text-center text-green-600 mt-2">
            Current vote: {userVote}
          </p>
        )}
      </div>
    );
  };

  const renderMarginPoll = (poll: Poll, isActive: boolean) => {
    if (!marginOptions) return null;

    const votes = voteCounts[poll.Match_ID]?.victory_margin || {};
    const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0);
    const userVote = userVotes[poll.Match_ID]?.victory_margin;
    const isVoting = voting[`${poll.Match_ID}-victory_margin`];

    return (
      <div>
        <h4 className="text-lg font-semibold mb-3">Victory Margin Poll</h4>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(marginOptions).map(([key, description]) => (
            <div key={key}>
              <button
                onClick={() => handleVote(poll.Match_ID, key, 'victory_margin')}
                disabled={isVoting || !isActive}
                className={`w-full p-4 text-center border rounded-lg transition-colors ${
                  userVote === key
                    ? 'bg-green-50 border-green-500'
                    : isActive ? 'hover:bg-blue-50' : 'bg-gray-50'
                }`}
              >
                {description}
                <div className="text-sm text-gray-600 mt-1">
                  {calculatePercentage(votes[key] || 0, totalVotes)}%
                </div>
              </button>
              {renderVoterList(poll.Match_ID, 'victory_margin', key)}
            </div>
          ))}
        </div>
        {userVote && marginOptions[userVote as keyof typeof marginOptions] && (
          <p className="text-center text-green-600 mt-2">
            Current vote: {marginOptions[userVote as keyof typeof marginOptions]}
          </p>
        )}
      </div>
    );
  };

  const isPollActive = (closeTime: string) => {
    return new Date(closeTime) > new Date();
  };

  const calculatePercentage = (votes: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((votes / total) * 100);
  };

  if (loading) {
    return <div className="text-center py-8">Loading matches...</div>;
  }

  if (polls.length === 0) {
    return <div className="text-center py-8">No upcoming matches available.</div>;
  }

  return (
    <div className="space-y-8">
      {polls.map((poll) => {
        const isActive = isPollActive(poll.Poll_Close_Time);
        const matchDate = new Date(poll.Date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const closeTime = new Date(poll.Poll_Close_Time).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        return (
          <div key={poll.Match_ID} className="bg-white p-6 rounded-lg shadow-md">
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-2">{poll.Team_1} vs {poll.Team_2}</h3>
              <p className="text-gray-600">Match Date: {matchDate}</p>
              <p className="text-gray-600">Poll Closes: {closeTime}</p>
            </div>
            {isActive ? (
              <div className="space-y-8">
                {renderWinnerPoll(poll, isActive)}
                {renderMarginPoll(poll, isActive)}
              </div>
            ) : (
              <div className="text-center p-4 bg-gray-50 rounded-lg text-gray-500">
                Poll closed
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
} 