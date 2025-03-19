'use client';

import { useEffect, useState } from 'react';

interface Poll {
  Match_ID: string;
  Team_1: string;
  Team_2: string;
  Date: string;
  Poll_Close_Time: string;
}

export default function PollList() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPolls = async () => {
      try {
        const response = await fetch('/api/polls');
        const data = await response.json();
        setPolls(data);
      } catch (error) {
        console.error('Error fetching polls:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPolls();
  }, []);

  const isPollActive = (closeTime: string) => {
    return new Date(closeTime) > new Date();
  };

  if (loading) {
    return <div className="text-center py-8">Loading matches...</div>;
  }

  if (polls.length === 0) {
    return <div className="text-center py-8">No upcoming matches available.</div>;
  }

  return (
    <div className="space-y-6">
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
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-2">{poll.Team_1} vs {poll.Team_2}</h3>
              <p className="text-gray-600">Match Date: {matchDate}</p>
              <p className="text-gray-600">Poll Closes: {closeTime}</p>
            </div>
            {isActive ? (
              <div className="grid grid-cols-2 gap-4">
                <button className="p-4 text-center border rounded-lg hover:bg-blue-50 transition-colors">
                  {poll.Team_1} will win
                </button>
                <button className="p-4 text-center border rounded-lg hover:bg-blue-50 transition-colors">
                  {poll.Team_2} will win
                </button>
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