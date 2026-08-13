import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  session: Session | null;
  hasPlayer: boolean | null;
  playerId: string | null;
  loading: boolean;
  refreshPlayer: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hasPlayer, setHasPlayer] = useState<boolean | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshPlayer() {
    const { data } = await supabase.auth.getSession();
    const current = data.session;
    if (!current) {
      setHasPlayer(null);
      setPlayerId(null);
      return;
    }
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('auth_user_id', current.user.id)
      .maybeSingle();
    setHasPlayer(!!player);
    setPlayerId(player?.id ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      refreshPlayer();
    } else {
      setHasPlayer(null);
      setPlayerId(null);
    }
  }, [session]);

  return (
    <AuthContext.Provider value={{ session, hasPlayer, playerId, loading, refreshPlayer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
