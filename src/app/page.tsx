import { getServerSession } from "next-auth";
import { Suspense } from "react";
import SignInButton from "@/components/SignInButton";
import PollList from "@/components/PollList";

function LoadingPolls() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white p-6 rounded-lg shadow-md animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function Home() {
  const session = await getServerSession();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dr Gauss - IPL 25 Polls</h1>
          <SignInButton />
        </div>
        
        {session ? (
          <Suspense fallback={<LoadingPolls />}>
            <PollList />
          </Suspense>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-xl">Please sign in to view polls</h2>
          </div>
        )}
      </div>
    </main>
  );
} 