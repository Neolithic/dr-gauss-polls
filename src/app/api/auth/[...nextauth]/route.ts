'use server';

import NextAuth from "next-auth/next";
import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}

const getAllowedEmails = () => {
  const emailsString = process.env.ALLOWED_EMAILS;
  if (!emailsString) {
    console.warn('ALLOWED_EMAILS environment variable is not set');
    return new Set<string>();
  }
  return new Set(emailsString.split(',').map(email => email.trim().toLowerCase()));
};

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, account }: { token: JWT; account: any }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token, user }: { session: any; token: JWT; user: any }) {
      session.accessToken = token.accessToken;
      session.user = {
        ...session.user,
        name: token.name,
        email: token.email,
        image: token.picture
      };
      return session;
    },
    async signIn({ user, account, profile }) {
      try {
        if (!user.email) {
          console.error('No email provided by user');
          return false;
        }

        const allowedEmails = getAllowedEmails();
        
        if (allowedEmails.size === 0) {
          console.error('No allowed emails configured');
          return false;
        }

        const isAllowed = allowedEmails.has(user.email.toLowerCase());
        
        if (!isAllowed) {
          console.log(`Access denied for email: ${user.email}`);
          return false;
        }

        console.log(`Access granted for email: ${user.email}`);
        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
    },
  },
  pages: {
    error: '/auth/error',
  },
  debug: true,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST }; 