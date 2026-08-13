-- Capa social: seguir jugadores (4.2, módulo M11)
--
-- La tabla `follows` existe desde 0001 (con su check de no seguirse a uno mismo)
-- pero tenía RLS activado sin políticas.

-- Lectura abierta: los contadores de seguidores son públicos, igual que el ranking.
create policy "follows_select_authenticated"
  on follows for select
  to authenticated
  using (true);

-- Uno solo puede seguir EN SU PROPIO NOMBRE. Sin este with check, cualquiera
-- podría insertar follows ajenos e inflar seguidores de quien quisiera.
create policy "follows_insert_self"
  on follows for insert
  to authenticated
  with check (follower_id in (select id from players where auth_user_id = auth.uid()));

-- Dejar de seguir es cosa de quien sigue. También se permite al seguido
-- borrar la fila, que es el equivalente a bloquear/quitarse un seguidor.
create policy "follows_delete_self_or_followee"
  on follows for delete
  to authenticated
  using (
    follower_id in (select id from players where auth_user_id = auth.uid())
    or followee_id in (select id from players where auth_user_id = auth.uid())
  );

-- El feed (4.3) consulta "a quién sigo" en cada carga; la PK ya cubre follower_id,
-- pero falta el índice del lado contrario para contar seguidores rápido.
create index if not exists follows_followee_idx on follows (followee_id);
