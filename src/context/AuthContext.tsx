import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerForPush } from '../lib/push';

type AuthContextValue = {
  session: Session | null;
  hasPlayer: boolean | null;
  playerId: string | null;
  isAdmin: boolean;
  loading: boolean;
  refreshPlayer: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hasPlayer, setHasPlayer] = useState<boolean | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refreshPlayer() {
    const { data } = await supabase.auth.getSession();
    const current = data.session;
    if (!current) {
      setHasPlayer(null);
      setPlayerId(null);
      setIsAdmin(false);
      return;
    }
    const { data: player } = await supabase
      .from('players')
      .select('id, is_admin')
      .eq('auth_user_id', current.user.id)
      .maybeSingle();
    setHasPlayer(!!player);
    setPlayerId(player?.id ?? null);
    setIsAdmin(!!player?.is_admin);
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
      setIsAdmin(false);
    }
  }, [session]);

  // El aparato se registra para push cuando ya sabemos QUIÉN es: el token se
  // guarda contra el jugador, no contra la sesión. En web y en Expo Go esto no
  // hace nada — está protegido por plataforma dentro de `registerForPush`.
  useEffect(() => {
    if (playerId) registerForPush(playerId);
  }, [playerId]);

  return (
    <AuthContext.Provider value={{ session, hasPlayer, playerId, isAdmin, loading, refreshPlayer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
