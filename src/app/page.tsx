import { getServerSession } from "next-auth";
import SignInButton from "@/components/SignInButton";
import PollList from "@/components/PollList";
import { authOptions } from "./api/auth/[...nextauth]/route";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dr Gauss - IPL 25 Polls</h1>
          <SignInButton />
        </div>
        
        {session ? (
          <PollList />
        ) : (
          <div className="text-center py-12">
            <h2 className="text-xl">Please sign in to view polls</h2>
          </div>
        )}
      </div>
    </main>
  );
} 