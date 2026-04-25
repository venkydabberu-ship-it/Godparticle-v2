import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode
} from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';
import { getProfile } from '../lib/auth';

const CACHE_KEY = 'gp_profile_v1';

function readCachedProfile(): Profile | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const cached = readCachedProfile();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(cached);
  // If we have a cached profile, start as not-loading so app renders instantly
  const [loading, setLoading] = useState(!cached);

  async function fetchProfile(userId: string) {
    try {
      // For premium users, refresh monthly credits before loading profile
      // Fire-and-forget — don't block profile load on this
      supabase.rpc('refresh_monthly_credits', { p_user_id: userId }).catch(() => {});

      const result = await Promise.race([
        getProfile(userId),
        new Promise<null>(r => setTimeout(() => r(null), 5000))
      ]);
      if (result) {
        const p = result as Profile;
        setProfile(p);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch {}
      }
    } catch (e) {
      console.error('fetchProfile error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  useEffect(() => {
    // Absolute safety net — never leave user on loading screen
    const safetyTimer = setTimeout(() => setLoading(false), 8000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id);
      } else {
        // No active session — clear stale cache and stop loading
        try { localStorage.removeItem(CACHE_KEY); } catch {}
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          await fetchProfile(currentUser.id);
        } else {
          // Logout — clear cache
          try { localStorage.removeItem(CACHE_KEY); } catch {}
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
