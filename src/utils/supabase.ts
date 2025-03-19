'use server';

import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

// This ensures the code only runs on the server
if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server side');
}

const supabaseUrl = process.env.NEXT_SUPABASE_URL;
const supabaseKey = process.env.NEXT_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create a function to get the Supabase client
export async function getSupabaseClient() {
  // We can safely assert these as strings since we check for undefined above
  return createClient(supabaseUrl as string, supabaseKey as string, {
    auth: {
      persistSession: false // Disable session persistence since this is server-side only
    },
    global: {
      headers: {
        'x-next-server': '1' // Add a custom header to identify server-side requests
      }
    }
  });
} 