import { supabase } from './supabase';

// Temática del torneo, decidida por votación de la comunidad.
//
// El reglamento la ubica en la modalidad casual: el torneo puede restringirse a
// un tipo de pieza ("solo tipo Ataque") y eso se vota la semana previa.
//
// El cierre no lo dispara un proceso agendado —este proyecto no tiene uno—: la
// app llama a `close_theme_vote` al abrir el torneo y la función se niega a
// cerrar antes de la fecha. El primero que entre después del plazo lo consuma,
// y llamarla de más no hace nada.

export type ThemeOption = {
  id: string;
  label: string;
  approved: boolean;
  votes: number;
  mine: boolean;
};

export type ThemeVote = {
  theme: string | null;
  closesAt: string | null;
  options: ThemeOption[];
  myVote: string | null;
};

export async function loadThemeVote(tournamentId: string, playerId: string): Promise<ThemeVote> {
  // Se cierra primero y se lee después: si el plazo ya pasó, lo que se muestra
  // tiene que ser el resultado, no una votación abierta que ya no acepta votos.
  await supabase.rpc('close_theme_vote', { p_tournament_id: tournamentId }).then(
    () => undefined,
    () => undefined
  );

  const [{ data: t }, { data: opts }, { data: votes }] = await Promise.all([
    supabase.from('tournaments').select('theme, theme_vote_closes_at').eq('id', tournamentId).single(),
    supabase
      .from('tournament_theme_options')
      .select('id, label, approved')
      .eq('tournament_id', tournamentId)
      .order('created_at'),
    supabase
      .from('tournament_theme_votes')
      .select('option_id, player_id')
      .eq('tournament_id', tournamentId),
  ]);

  const allVotes = ((votes as any[]) ?? []);
  const myVote = allVotes.find((v) => v.player_id === playerId)?.option_id ?? null;

  return {
    theme: (t as any)?.theme ?? null,
    closesAt: (t as any)?.theme_vote_closes_at ?? null,
    myVote,
    options: (((opts as any[]) ?? []) as any[]).map((o) => ({
      id: o.id,
      label: o.label,
      approved: !!o.approved,
      votes: allVotes.filter((v) => v.option_id === o.id).length,
      mine: myVote === o.id,
    })),
  };
}

export async function suggestTheme(tournamentId: string, label: string): Promise<void> {
  const { error } = await supabase.rpc('suggest_theme_option', {
    p_tournament_id: tournamentId,
    p_label: label,
  });
  if (error) throw error;
}

export async function approveTheme(optionId: string, approved = true): Promise<void> {
  const { error } = await supabase.rpc('approve_theme_option', {
    p_option_id: optionId,
    p_approved: approved,
  });
  if (error) throw error;
}

export async function voteTheme(optionId: string): Promise<void> {
  const { error } = await supabase.rpc('vote_theme_option', { p_option_id: optionId });
  if (error) throw error;
}

/**
 * Abrir la votación es fijarle fecha de cierre. Por defecto, **una semana antes
 * del torneo**, que es lo que dice el reglamento; si el torneo todavía no tiene
 * fecha, una semana a partir de hoy.
 */
export async function openThemeVote(tournamentId: string, startsAt?: string | null): Promise<void> {
  const base = startsAt ? new Date(startsAt).getTime() - 7 * 86400000 : Date.now() + 7 * 86400000;
  // Si el torneo es en menos de una semana, el plazo no puede quedar en el
  // pasado: se le da un día.
  const closes = new Date(Math.max(base, Date.now() + 86400000)).toISOString();
  const { error } = await supabase
    .from('tournaments')
    .update({ theme_vote_closes_at: closes })
    .eq('id', tournamentId);
  if (error) throw error;
}
