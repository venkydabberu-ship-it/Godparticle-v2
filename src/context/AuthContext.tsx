import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode
} from 'react';
import { User, RealtimeChannel } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';
import { getProfile } from '../lib/auth';

const CACHE_KEY = 'gp_profile_v1';

function readCachedProfile(): Profile | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

function profileFromMetadata(user: User): Profile {
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    username: meta.username ?? meta.name ?? user.email ?? 'user',
    phone: null,
    role: (meta.role as Profile['role']) ?? 'free',
    credits: typeof meta.credits === 'number' ? meta.credits : 0,
    credits_reset_at: null,
    created_at: user.created_at ?? new Date().toISOString(),
    is_active: true,
  };
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
  const [loading, setLoading] = useState(!cached);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fetchingRef = useRef(false);

  function subscribeToProfileChanges(userId: string) {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    channelRef.current = supabase
      .channel(`profile-live:${userId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as Profile;
          setProfile(updated);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(updated)); } catch {}
        }
      )
      .subscribe();
  }

  async function fetchProfile(currentUser: User) {
    if (fetchingRef.current) return; // never run two fetches at once
    fetchingRef.current = true;

    // Show metadata-derived profile immediately while DB fetch runs
    const metaProfile = profileFromMetadata(currentUser);
    setProfile(prev => {
      if (!prev || prev.id !== currentUser.id) return metaProfile;
      const rank: Record<string, number> = { free: 0, basic: 1, premium: 2, admin: 3 };
      return (rank[metaProfile.role] ?? 0) > (rank[prev.role] ?? 0)
        ? { ...prev, role: metaProfile.role } : prev;
    });

    // Credits refresh — fire-and-forget, never blocks profile load
    supabase.rpc('refresh_monthly_credits', { p_user_id: currentUser.id }).catch(() => {});

    try {
      // Single attempt, 5s timeout — no 9-second retry loop
      const p = await Promise.race([
        getProfile(currentUser.id),
        new Promise<null>(res => setTimeout(() => res(null), 5000)),
      ]);

      if (p) {
        const rank: Record<string, number> = { free: 0, basic: 1, premium: 2, admin: 3 };
        const merged: Profile = {
          ...(p as Profile),
          role: (rank[metaProfile.role] ?? 0) > (rank[(p as Profile).role] ?? 0)
            ? metaProfile.role : (p as Profile).role,
        };
        setProfile(merged);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
      }
      // If timed out (p === null), metaProfile is already shown — silent background retry
      if (!p) {
        setTimeout(async () => {
          try {
            const retry = await getProfile(currentUser.id);
            if (retry) {
              setProfile(retry as Profile);
              try { localStorage.setItem(CACHE_KEY, JSON.stringify(retry)); } catch {}
            }
          } catch {}
        }, 4000);
      }
    } catch {
      // Keep metaProfile on error
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      subscribeToProfileChanges(currentUser.id);
    }
  }

  async function refreshProfile() {
    if (!user) return;
    fetchingRef.current = false; // allow forced refresh
    await fetchProfile(user);
  }

  useEffect(() => {
    // Hard cap: never show spinner more than 4 seconds
    const safetyTimer = setTimeout(() => setLoading(false), 4000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser);
      } else {
        try { localStorage.removeItem(CACHE_KEY); } catch {}
        setProfile(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            // Real sign-in: clear stale cache and fetch fresh profile
            try { localStorage.removeItem(CACHE_KEY); } catch {}
            fetchingRef.current = false;
            await fetchProfile(currentUser);
          } else if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
            // Token refresh or initial load: NEVER wipe cache — just ensure profile loaded
            if (!readCachedProfile()) await fetchProfile(currentUser);
            else setLoading(false);
          }
        } else {
          // Signed out
          try { localStorage.removeItem(CACHE_KEY); } catch {}
          setProfile(null);
          setLoading(false);
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }
        }
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
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
