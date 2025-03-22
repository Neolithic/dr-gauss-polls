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

type TabType = 'active' | 'completed';

export default function PollList() {
  const { data: session } = useSession();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [voteCounts, setVoteCounts] = useState<{ [matchId: string]: { [pollType: string]: VoteCounts } }>({});
  const [userVotes, setUserVotes] = useState<{ [matchId: string]: UserVotes }>({});
  const [votersByMatch, setVotersByMatch] = useState<VotersByMatch>({});
  const [voting, setVoting] = useState<{ [key: string]: boolean }>({});
  const [hiddenVoterLists, setHiddenVoterLists] = useState<{ [key: string]: boolean }>({});
  const [marginOptions, setMarginOptions] = useState<MarginOptions | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('active');

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
      setLoading(true);
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
    setHiddenVoterLists(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const renderVoterList = (matchId: string, pollType: string, option: string) => {
    const voters = votersByMatch[matchId]?.[pollType]?.[option] || [];
    const key = `${matchId}-${pollType}-${option}`;
    const isHidden = hiddenVoterLists[key];

    if (voters.length === 0) return null;

    return (
      <div className="mt-2">
        {!isHidden && (
          <ul className="mb-1 text-sm text-gray-600 space-y-1">
            {voters.map((voter, index) => (
              <li key={index}>
                {voter.name || voter.email}
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={() => toggleVoterList(matchId, pollType, option)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {isHidden ? 'Show voters' : 'Hide voters'} ({voters.length})
        </button>
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

  const renderTabs = () => {
    const activePollsCount = polls.filter(poll => isPollActive(poll.Poll_Close_Time)).length;
    const completedPollsCount = polls.length - activePollsCount;

    return (
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('active')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === 'active'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              Active Polls
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                activeTab === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {activePollsCount}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === 'completed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              Completed Polls
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                activeTab === 'completed' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {completedPollsCount}
              </span>
            </button>
          </nav>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading matches...</div>;
  }

  if (polls.length === 0) {
    return <div className="text-center py-8">No upcoming matches available.</div>;
  }

  const filteredPolls = polls.filter(poll => {
    const isActive = isPollActive(poll.Poll_Close_Time);
    return activeTab === 'active' ? isActive : !isActive;
  });

  return (
    <div>
      {renderTabs()}
      <div className="space-y-8">
        {filteredPolls.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No {activeTab === 'active' ? 'active' : 'completed'} polls available
          </div>
        ) : (
          filteredPolls.map((poll) => {
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
                  <p className="text-gray-600">Poll {isActive ? 'Closes' : 'Closed'}: {closeTime}</p>
                </div>
                <div className="space-y-8">
                  {renderWinnerPoll(poll, isActive)}
                  {renderMarginPoll(poll, isActive)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
} 