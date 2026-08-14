-- Onboarding del jugador y avatares
--
-- `players` ya tenía avatar_url, country y birth_date desde 0001, sin usarse.
-- Aquí se agregan los campos que captura el onboarding nuevo.

-- Avatar generado por la app. Se guarda solo la llave (a1..a12), no una imagen:
-- el dibujo vive en el cliente (src/ui/Avatar.tsx). Si el jugador sube foto,
-- se llena avatar_url y esa gana sobre la llave.
alter table players add column if not exists avatar_key text;

-- Nivel declarado por el jugador al entrar. NO es su rango de liga: eso lo
-- determina la escalera de categorías del reglamento, no lo que uno diga de sí
-- mismo. Esto sirve para orientar el matchmaking y la bienvenida.
alter table players add column if not exists experience_level text;

-- Qué tan en serio quiere competir. Alimenta las sugerencias de rival.
alter table players add column if not exists competition_level text;

-- Qué le interesa: batallas 1v1, torneos, bladers cerca, tiendas y venues.
alter table players add column if not exists interests text[] not null default '{}';

alter table players add column if not exists notifications_enabled boolean not null default true;

-- Marca de onboarding terminado. Sin esto no hay forma de distinguir a un
-- jugador que apenas se registró de uno que sí completó su perfil.
alter table players add column if not exists onboarded_at timestamptz;

-- ---------------------------------------------------------------------
-- Storage para las fotos de perfil
-- ---------------------------------------------------------------------
-- Bucket público: son fotos de perfil que se ven en rankings y listas, así que
-- no tiene sentido servirlas con URL firmada.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Cualquiera puede ver los avatares.
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Cada quien escribe SOLO dentro de su propia carpeta, nombrada con su uid.
-- Sin esta condición, cualquier autenticado podría sobrescribir la foto de otro.
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
