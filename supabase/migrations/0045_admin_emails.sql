-- Quién es administrador de la plataforma, por correo.
--
-- Hasta hoy el admin era una bandera puesta a mano sobre una fila de `players`
-- (0008, y después 0032 para que convivieran dos). Eso tiene dos problemas que
-- ya se notaron:
--
--   1. **El cliente todavía no tiene cuenta.** `dmlbeybladereynosa@gmail.com` no
--      existe en `auth.users`: no se le puede poner la bandera a una fila que no
--      existe, y por eso la 0032 quedó como "volver a correrla cuando se
--      registre" — o sea, dependiendo de que alguien se acuerde.
--   2. Cambiar de administrador exigía una migración, cuando es una decisión de
--      operación, no de esquema.
--
-- Se invierte: la lista de correos es el dato, y la bandera se deriva. Un correo
-- de la lista que todavía no se ha registrado queda esperando, y **el día que
-- esa persona cree su cuenta entra ya como administrador**, sin que nadie corra
-- nada.

create table if not exists admin_emails (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);

alter table admin_emails enable row level security;

-- Sin políticas: ni lectura. La lista de quién manda no le interesa a la app —
-- la app solo lee `players.is_admin`, que es lo que ya usaba. Se administra
-- desde el panel de Supabase.

insert into admin_emails (email, note) values
  ('farid.zeqvil89@gmail.com', 'Cuenta de Farid (desarrollo y operación)'),
  ('dmlbeybladereynosa@gmail.com', 'Cuenta oficial de la liga (cliente)')
on conflict (email) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sincronizar la bandera con la lista
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Otorga Y quita: la lista es la verdad. Si alguien deja de estar, deja de ser
-- administrador — que es justo lo que hace falta al entregarle el proyecto al
-- cliente.
--
-- **No se otorga EXECUTE a `authenticated` a propósito.** Es la única función de
-- este esquema que puede repartir permisos, así que se queda fuera del alcance
-- de la app: se corre desde el panel de Supabase o con la service key. Una
-- función así, expuesta con la anon key, es una escalada de privilegios en
-- espera de que alguien encuentre un hueco.

create or replace function apply_admin_emails()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cambios int;
begin
  update players p
  set is_admin = deberia.es_admin
  from (
    select p2.id,
           exists (
             select 1 from admin_emails a
             join auth.users u on lower(u.email) = lower(a.email)
             where u.id = p2.auth_user_id
           ) as es_admin
    from players p2
  ) deberia
  where deberia.id = p.id
    and p.is_admin is distinct from deberia.es_admin;

  get diagnostics v_cambios = row_count;
  return v_cambios;
end;
$$;

revoke execute on function apply_admin_emails() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Y que aplique sola a quien se registre después
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Es el caso del cliente: se registra la semana que viene y su perfil tiene que
-- nacer con la bandera puesta. El trigger solo OTORGA — quitar es una decisión
-- deliberada y pasa por `apply_admin_emails`.

create or replace function grant_admin_if_listed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null and new.is_admin is not true then
    if exists (
      select 1 from admin_emails a
      join auth.users u on lower(u.email) = lower(a.email)
      where u.id = new.auth_user_id
    ) then
      new.is_admin := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists players_grant_admin_if_listed on players;
create trigger players_grant_admin_if_listed
  before insert or update of auth_user_id on players
  for each row execute function grant_admin_if_listed();

-- Aplicar ahora sobre lo que ya existe.
select apply_admin_emails();
