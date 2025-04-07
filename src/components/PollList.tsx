'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getPolls, getAllVotes, submitVote, getMarginOptions, getAIVotes, getLeaderboardData, getAdhocPolls, type PollType } from '@/app/actions';
import { AgGridReact } from 'ag-grid-react';
import { 
 ModuleRegistry,
 AllCommunityModule,
 ColDef,
 ValueFormatterParams,
} from 'ag-grid-community';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'ag-grid-community/styles/ag-theme-alpine.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

ModuleRegistry.registerModules([AllCommunityModule]);

interface Poll {
  Match_ID: string;
  Team_1: string;
  Team_2: string;
  Date: string;
  Poll_Close_Time: string;
}

interface AdhocPoll {
  match_id: string;
  poll_type: string;
  option: string;
  poll_close_time: string;
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

type TabType = 'active' | 'completed' | 'leaderboard' | 'details';

interface LeaderboardRow {
  user_name: string;
  match_id: string;
  poll_type: string;
  amount: number;
}

export default function PollList() {
  const { data: session } = useSession();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [adhocPolls, setAdhocPolls] = useState<AdhocPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [voteCounts, setVoteCounts] = useState<{ [matchId: string]: { [pollType: string]: VoteCounts } }>({});
  const [userVotes, setUserVotes] = useState<{ [matchId: string]: UserVotes }>({});
  const [votersByMatch, setVotersByMatch] = useState<VotersByMatch>({});
  const [voting, setVoting] = useState<{ [key: string]: boolean }>({});
  const [hiddenVoterLists, setHiddenVoterLists] = useState<{ [key: string]: boolean }>({});
  const [marginOptions, setMarginOptions] = useState<{ [matchId: string]: MarginOptions }>({});
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [nextPollClose, setNextPollClose] = useState<Date | null>(null);
  const [aiPerspectives, setAIPerspectives] = useState<{ [matchId: string]: string }>({});
  const [expandedPerspectives, setExpandedPerspectives] = useState<{ [key: string]: boolean }>({});
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardRow[] | null>(null);
  const [expandedAdhocPolls, setExpandedAdhocPolls] = useState<{ [key: string]: boolean }>({});


  const fetchData = async () => {
    try {
      if (activeTab === 'leaderboard') {
        const data = await getLeaderboardData();
        setLeaderboardData(data);
      } else {
        const [pollsData, votesData, aiVotes, adhocPollsData] = await Promise.all([
          getPolls(),
          getAllVotes(),
          getAIVotes(),
          getAdhocPolls()
        ]);
        
        setPolls(pollsData);
        setAdhocPolls(adhocPollsData);
        setVoteCounts(votesData.voteCounts);
        setUserVotes(votesData.userVotes);
        setVotersByMatch(votesData.votersByMatch);
        setAIPerspectives(aiVotes);

        // Fetch margin options for each match
        const marginOptsMap: { [matchId: string]: MarginOptions } = {};
        for (const poll of pollsData) {
          marginOptsMap[poll.Match_ID] = await getMarginOptions(poll.Match_ID);
        }
        setMarginOptions(marginOptsMap);

        // Find the next poll to close
        const now = new Date();
        const nextClose = [...pollsData, ...adhocPollsData]
          .map(poll => new Date(poll.Poll_Close_Time || poll.poll_close_time))
          .filter(date => date > now)
          .sort((a, b) => a.getTime() - b.getTime())[0] || null;
        setNextPollClose(nextClose);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Effect for initial data fetch
  useEffect(() => {
    if (session) {
      setLoading(true);
      fetchData();
    } else {
      setLoading(false);
    }
  }, [session]);

  // Effect for poll close monitoring
  useEffect(() => {
    if (!nextPollClose || !session) return;

    const now = new Date();
    const timeUntilClose = nextPollClose.getTime() - now.getTime();
    
    if (timeUntilClose <= 0) {
      // If we're past the close time, refresh immediately
      fetchData();
      return;
    }

    // Set up the timer for the next poll close
    const timerId = setTimeout(() => {
      fetchData();
    }, timeUntilClose + 1000); // Add 1 second buffer

    // Clean up timer on unmount or when nextPollClose changes
    return () => clearTimeout(timerId);
  }, [nextPollClose, session]);

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
    if (!marginOptions[poll.Match_ID]) return null;

    const votes = voteCounts[poll.Match_ID]?.victory_margin || {};
    const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0);
    const userVote = userVotes[poll.Match_ID]?.victory_margin;
    const isVoting = voting[`${poll.Match_ID}-victory_margin`];

    const mO = marginOptions[poll.Match_ID];
    return (
      <div>
        <h4 className="text-lg font-semibold mb-3">Victory Margin Poll</h4>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(marginOptions[poll.Match_ID]).map(([key, description]) => (
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
        {userVote && (
          <p className="text-center text-green-600 mt-2">
            Current vote: {mO[userVote as keyof typeof mO]}
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
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === 'leaderboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              Leaderboard
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === 'details'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              Detailed Breakdown
            </button>
          </nav>
        </div>
      </div>
    );
  };

  const toggleAIPerspective = (matchId: string) => {
    setExpandedPerspectives(prev => ({
      ...prev,
      [matchId]: !prev[matchId]
    }));
  };

  const renderAIPerspective = (matchId: string) => {
    const perspective = aiPerspectives[matchId];
    if (!perspective) return null;

    const isExpanded = expandedPerspectives[matchId];

    return (
      <div className="mb-6 border border-blue-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleAIPerspective(matchId)}
          className="w-full px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center justify-between text-left"
        >
          <span className="text-blue-800 font-medium">AI Perspective</span>
          <svg
            className={`w-5 h-5 text-blue-600 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isExpanded && (
          <div className="p-4 bg-white">
            <p className="text-gray-700 text-sm whitespace-pre-line">{perspective}</p>
          </div>
        )}
      </div>
    );
  };

  const renderLeaderboard = () => {
    if (!leaderboardData) fetchData();

    if (!leaderboardData) return null;
    
    // Get all unique poll types
    const pollTypes = Array.from(new Set(leaderboardData.map(row => row.poll_type)));
    
    // Calculate user totals by poll type
    const userTotalsByPollType: { [userName: string]: { [pollType: string]: number } } = {};
    
    // Initialize the structure
    leaderboardData.forEach(row => {
      if (!userTotalsByPollType[row.user_name]) {
        userTotalsByPollType[row.user_name] = {};
        pollTypes.forEach(pollType => {
          userTotalsByPollType[row.user_name][pollType] = 0;
        });
      }
    });
    
    // Calculate totals for each user by poll type
    leaderboardData.forEach(row => {
      userTotalsByPollType[row.user_name][row.poll_type] += row.amount;
    });
    
    // Calculate total amount for each user
    const userTotals = Object.entries(userTotalsByPollType).reduce((acc, [userName, pollTypeTotals]) => {
      acc[userName] = Object.values(pollTypeTotals).reduce((sum, amount) => sum + amount, 0);
      return acc;
    }, {} as { [key: string]: number });

    // Convert to array and sort by total amount
    const summaryData = Object.entries(userTotalsByPollType)
      .map(([user_name, pollTypeTotals]) => {
        const totalAmount = Object.values(pollTypeTotals).reduce((sum, amount) => sum + amount, 0);
        return {
          user_name,
          total: totalAmount,
          ...pollTypeTotals
        };
      })
      .sort((a, b) => b.total - a.total);

    // Calculate cumulative earnings by match for each user
    const matchIds = Array.from(new Set(leaderboardData.map(row => row.match_id)))
      .sort((a, b) => parseInt(a) - parseInt(b));

    const userMatchTotals: { [key: string]: { [key: string]: number } } = {};
    const cumulativeData: { [key: string]: number[] } = {};

    // Initialize user data
    summaryData.forEach(({ user_name }) => {
      userMatchTotals[user_name] = {};
      cumulativeData[user_name] = [];
    });

    // Calculate totals for each user per match
    leaderboardData.forEach(row => {
      if (!userMatchTotals[row.user_name][row.match_id]) {
        userMatchTotals[row.user_name][row.match_id] = 0;
      }
      userMatchTotals[row.user_name][row.match_id] += row.amount;
    });

    // Calculate cumulative totals
    matchIds.forEach(matchId => {
      Object.keys(userMatchTotals).forEach(userName => {
        const previousTotal = cumulativeData[userName].length > 0 
          ? cumulativeData[userName][cumulativeData[userName].length - 1] 
          : 0;
        const matchAmount = userMatchTotals[userName][matchId] || 0;
        cumulativeData[userName].push(previousTotal + matchAmount);
      });
    });

    // Prepare chart data
    const chartData = {
      labels: ['Start', ...matchIds.map(id => `Match ${id}`)],
      datasets: Object.entries(cumulativeData).map(([userName, data], index) => ({
        label: userName,
        data: [0, ...data],
        borderColor: `hsl(${index * (360 / Object.keys(cumulativeData).length)}, 70%, 50%)`,
        backgroundColor: `hsl(${index * (360 / Object.keys(cumulativeData).length)}, 70%, 50%)`,
        tension: 0.1
      }))
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            padding: 20
          }
        },
        title: {
          display: true,
          text: 'Earnings Evolution by Match',
          font: {
            size: 16,
            weight: 'bold' as const
          },
          padding: {
            bottom: 20
          }
        },
      },
      scales: {
        y: {
          title: {
            display: true,
            text: 'Cumulative Earnings'
          }
        }
      }
    };

    const summaryColumns: ColDef[] = [
      { field: 'user_name', headerName: 'User', flex: 1 },
      { 
        field: 'total', 
        headerName: 'Total Amount',
        flex: 1,
        cellStyle: (params: ValueFormatterParams) => ({
          color: params.value > 0 ? 'green' : params.value < 0 ? 'red' : 'black',
          fontWeight: 'bold'
        }),
        valueFormatter: (params: ValueFormatterParams) => params.value.toFixed(2)
      }
    ];
    
    // Add columns for each poll type
    pollTypes.forEach(pollType => {
      summaryColumns.push({
        field: pollType,
        headerName: pollType.charAt(0).toUpperCase() + pollType.slice(1).replace(/_/g, ' '),
        flex: 1,
        cellStyle: (params: ValueFormatterParams) => ({
          color: params.value > 0 ? 'green' : params.value < 0 ? 'red' : 'black',
        }),
        valueFormatter: (params: ValueFormatterParams) => params.value.toFixed(2)
      });
    });

    const detailColumns: ColDef<LeaderboardRow>[] = [
      { field: 'user_name', headerName: 'User', flex: 1 },
      { field: 'match_id', headerName: 'Match', flex: 1 },
      { field: 'poll_type', headerName: 'Poll Type', flex: 1 },
      { 
        field: 'amount', 
        headerName: 'Amount',
        flex: 1,
        cellStyle: (params: ValueFormatterParams) => ({
          color: params.value > 0 ? 'green' : params.value < 0 ? 'red' : 'black',
        }),
        valueFormatter: (params: ValueFormatterParams) => params.value.toFixed(2)
      }
    ];

    // Sort by user_name and then match_id
    const sortedData = [...leaderboardData].sort((a, b) => {
      if (a.user_name !== b.user_name) {
        return a.user_name.localeCompare(b.user_name);
      }
      return parseInt(a.match_id) - parseInt(b.match_id);
    });

    if (activeTab === 'leaderboard') {
      return (
        <div className="space-y-12">
          <div className="ag-theme-alpine" style={{ width: '100%' }}>
            <h2 className="text-xl font-semibold mb-4">Total Earnings</h2>
            <AgGridReact
              rowData={summaryData}
              columnDefs={summaryColumns}
              defaultColDef={{
                sortable: true,
                filter: true,
                resizable: true,
                autoHeight: true,
                minWidth: 100,
              }}
              domLayout="autoHeight"
            />
          </div>
          <div style={{ height: '500px', width: '100%', padding: '2rem 0' }}>
            <h2 className="text-xl font-semibold mb-4">Earnings Evolution</h2>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      );
    } else if (activeTab === 'details') {
      return (
        <div className="ag-theme-alpine" style={{ width: '100%' }}>
          <h2 className="text-xl font-semibold mb-4">User Level Score Breakdown</h2>
          <AgGridReact
            rowData={sortedData}
            columnDefs={detailColumns}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
              autoHeight: true,
              minWidth: 100,
            }}
            domLayout="autoHeight"
          />
        </div>
      );
    }

    return null;
  };

  const renderAdhocPolls = () => {
    if (!adhocPolls.length) return null;

    // Group adhoc polls by match_id
    const pollsByMatch = adhocPolls.reduce((acc, poll) => {
      if (!acc[poll.match_id]) {
        acc[poll.match_id] = [];
      }
      acc[poll.match_id].push(poll);
      return acc;
    }, {} as { [key: string]: AdhocPoll[] });

    // Filter polls based on active tab
    const filteredPollsByMatch = Object.entries(pollsByMatch).reduce((acc, [matchId, matchPolls]) => {
      const isActive = matchPolls.some(poll => isPollActive(poll.poll_close_time));
      if ((activeTab === 'active' && isActive) || (activeTab === 'completed' && !isActive)) {
        acc[matchId] = matchPolls;
      }
      return acc;
    }, {} as { [key: string]: AdhocPoll[] });

    if (Object.keys(filteredPollsByMatch).length === 0) return null;

    return (
      <div className="space-y-8 mb-8">
        {Object.keys(filteredPollsByMatch).length > 0 && (
          <div className="flex items-center justify-between">
            <h2 className={`text-2xl font-bold text-red-600 ${activeTab === 'active' ? 'animate-bounce' : ''}`}>Spotlight Poll</h2>          
          </div>
        )}
        {Object.entries(filteredPollsByMatch).map(([matchId, matchPolls]) => {
          const isActive = matchPolls.some(poll => isPollActive(poll.poll_close_time));
          const closeTime = new Date(Math.max(...matchPolls.map(p => new Date(p.poll_close_time).getTime())))
            .toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
          const pollType = matchPolls[0].poll_type;
          // Keep closed polls minimized by default
          const isExpanded = isActive ? (expandedAdhocPolls[matchId] ?? expandedAdhocPolls.all ?? true) : false;

          return (
            <div key={matchId} className="bg-blue-50 p-4 rounded-lg shadow-md border-2 border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold">{pollType === 'final_ipl_winner' ? 'Who will be the IPL winner?' : pollType}</h3>
                  <p className="text-sm text-gray-600">Poll {isActive ? 'Closes' : 'Closed'}: {closeTime}</p>
                </div>
                <button 
                  onClick={() => setExpandedAdhocPolls(prev => ({ ...prev, [matchId]: !prev[matchId] }))}
                  className="text-blue-600 hover:text-blue-800"
                >
                  {isExpanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {isExpanded && (
                <div className="grid grid-cols-2 gap-2">
                  {matchPolls.map((poll, index) => {
                    const votes = voteCounts[matchId]?.[poll.poll_type]?.[poll.option] || 0;
                    const totalVotes = Object.values(voteCounts[matchId]?.[poll.poll_type] || {}).reduce((sum, count) => sum + count, 0);
                    const userVote = userVotes[matchId]?.[poll.poll_type];
                    const isVoting = voting[`${matchId}-${poll.poll_type}`];

                    return (
                      <div key={index} className="bg-white p-2 rounded-lg">
                        <button
                          onClick={() => handleVote(matchId, poll.option, poll.poll_type as PollType)}
                          disabled={isVoting || !isActive}
                          className={`w-full p-2 text-center border rounded-lg transition-colors text-sm ${
                            userVote === poll.option
                              ? 'bg-green-50 border-green-500'
                              : isActive ? 'hover:bg-blue-50' : 'bg-gray-50'
                          }`}
                        >
                          {poll.option}
                          <div className="text-xs text-gray-600 mt-0.5">
                            {calculatePercentage(votes, totalVotes)}%
                          </div>
                        </button>
                        {renderVoterList(matchId, poll.poll_type, poll.option)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (polls.length === 0) {
    return <div className="text-center py-8">No upcoming matches available.</div>;
  }

  const filteredPolls = polls.filter(poll => {
    const isActive = isPollActive(poll.Poll_Close_Time);
    return activeTab === 'active' ? isActive : !isActive;
  }).sort((a, b) => {
    if (activeTab === 'completed') {
      return parseInt(b.Match_ID) - parseInt(a.Match_ID);
    }
    return parseInt(a.Match_ID) - parseInt(b.Match_ID);
  });

  return (
    <div>
      {renderTabs()}
      {(activeTab === 'leaderboard' || activeTab === 'details') ? (
        renderLeaderboard()
      ) : (
        <div className="space-y-8">
          {renderAdhocPolls()}
          {filteredPolls.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No {activeTab === 'active' ? 'active' : 'completed'} polls available
            </div>
          ) : (
            filteredPolls.map((poll) => {
              const isActive = isPollActive(poll.Poll_Close_Time);
              const matchDate = new Date(poll.Date + 'T00:00:00').toLocaleDateString('en-US', {
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
                  {isActive && renderAIPerspective(poll.Match_ID)}
                  <div className="mb-6">
                    <h3 className="text-xl font-semibold mb-2">Match {poll.Match_ID}: {poll.Team_1} vs {poll.Team_2}</h3>
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
      )}
    </div>
  );
} 