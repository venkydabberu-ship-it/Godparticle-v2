import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Session-safe edge function caller: uses direct fetch, refreshes token on 401, redirects to login if session gone
export async function callEdge(fnName: string, body: Record<string, unknown>): Promise<any> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  const fnUrl = supabaseUrl + '/functions/v1/' + fnName;

  const doFetch = (token: string) => fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'apikey': supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let res = await doFetch(sessionData.session.access_token);

  if (res.status === 401) {
    const { data: refreshed, error: rErr } = await supabase.auth.refreshSession();
    if (rErr || !refreshed.session) {
      window.location.href = '/login';
      throw new Error('Session expired. Please log in again.');
    }
    res = await doFetch(refreshed.session.access_token);
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Edge function error ' + res.status);
  return json;
}

export type UserRole = 'free' | 'basic' | 'premium' | 'admin';

export interface Profile {
  id: string;
  username: string;
  phone: string | null;
  role: UserRole;
  credits: number;
  credits_reset_at: string | null;
  created_at: string;
  is_active: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan: 'basic' | 'premium';
  status: 'active' | 'cancelled' | 'expired';
  payment_order_id: string;
  payment_session_id: string;
  amount: number;
  started_at: string;
  expires_at: string;
  created_at: string;
}

export interface MarketData {
  id: string;
  index_name: string;
  expiry: string;
  trade_date: string;
  strike_data: Record<string, any>;
  uploaded_by: string;
  created_at: string;
}

export interface Analysis {
  id: string;
  user_id: string;
  index_name: string;
  strike: number;
  option_type: 'CE' | 'PE';
  expiry: string;
  credits_used: number;
  result: Record<string, any>;
  created_at: string;
}
