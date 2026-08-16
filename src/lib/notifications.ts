import { supabase } from './supabase';

// La bandeja de notificaciones.
//
// Sale de `push_outbox`, la misma tabla que alimenta las push: un aviso se
// genera una vez y se lee por los dos lados. Si el envío falla —un teléfono
// desinstalado, por ejemplo— el aviso **igual está aquí**, que es justo lo que
// faltó el día que un token muerto hizo invisible una notificación real.
//
// No hace falta filtrar por jugador: la política de la 0049 solo deja ver lo
// propio. Filtrar aquí además sería creer que la seguridad vive en el cliente.

export type Notificacion = {
  id: string;
  title: string;
  body: string;
  data: Record<string, any> | null;
  created_at: string;
  read_at: string | null;
};

export async function loadNotifications(limite = 40): Promise<Notificacion[]> {
  const { data, error } = await supabase
    .from('push_outbox')
    .select('id, title, body, data, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data as any) ?? [];
}

/** Cuántas sin leer: es el número de la campana. */
export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('push_outbox')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}

export async function markRead(ids?: string[]): Promise<void> {
  await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null });
}

/** Hace cuánto, en corto: la hora exacta no le importa a nadie aquí. */
export function haceCuanto(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

/**
 * El ícono sale del título. Podría venir del servidor, pero entonces agregar un
 * aviso nuevo obligaría a decidir su ícono en la base — y el título ya dice de
 * qué se trata.
 */
export function iconoDe(n: Notificacion): string {
  const t = n.title.toLowerCase();
  if (t.includes('retaron')) return '⚔️';
  if (t.includes('marcar')) return '✍️';
  if (t.includes('ganaste')) return '🏆';
  if (t.includes('aprobado')) return '✅';
  if (t.includes('combate')) return '🥊';
  return '🔔';
}
