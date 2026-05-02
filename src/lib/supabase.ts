import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Session-safe edge function caller: refreshes token on 401, redirects to login if session gone
export async function callEdge(fnName: string, body: Record<string, unknown>): Promise<any> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  const { data, error } = await supabase.functions.invoke(fnName, { body });

  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('non-2xx')) {
      const { data: refreshed, error: rErr } = await supabase.auth.refreshSession();
      if (rErr || !refreshed.session) {
        window.location.href = '/login';
        throw new Error('Session expired. Please log in again.');
      }
      const { data: retryData, error: retryErr } = await supabase.functions.invoke(fnName, { body });
      if (retryErr) throw new Error(retryErr.message);
      return retryData;
    }
    throw new Error(error.message);
  }

  return data;
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