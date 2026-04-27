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

  function subscribeToProfileChanges(userId: string) {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    // When admin updates this user's role/credits, reflect it live
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
    const metaProfile = profileFromMetadata(currentUser);
    setProfile(prev => {
      if (!prev || prev.id !== currentUser.id) return metaProfile;
      const roleRank: Record<string, number> = { free: 0, basic: 1, premium: 2, admin: 3 };
      const prevRank = roleRank[prev.role] ?? 0;
      const metaRank = roleRank[metaProfile.role] ?? 0;
      return metaRank > prevRank ? { ...prev, role: metaProfile.role } : prev;
    });

    supabase.rpc('refresh_monthly_credits', { p_user_id: currentUser.id }).catch(() => {});

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const p = await getProfile(currentUser.id);
        if (p) {
          const roleRank: Record<string, number> = { free: 0, basic: 1, premium: 2, admin: 3 };
          const dbRank = roleRank[(p as Profile).role] ?? 0;
          const metaRank = roleRank[metaProfile.role] ?? 0;
          const merged: Profile = {
            ...(p as Profile),
            role: metaRank > dbRank ? metaProfile.role : (p as Profile).role,
          };
          setProfile(merged);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
          setLoading(false);
          subscribeToProfileChanges(currentUser.id);
          return;
        }
      } catch {}
      if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }

    setProfile(metaProfile);
    setLoading(false);
    subscribeToProfileChanges(currentUser.id);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user);
  }

  useEffect(() => {
    const safetyTimer = setTimeout(() => setLoading(false), 8000);

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
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          try { localStorage.removeItem(CACHE_KEY); } catch {}
          await fetchProfile(currentUser);
        } else {
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
