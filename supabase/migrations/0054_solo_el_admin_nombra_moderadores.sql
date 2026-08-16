-- Nombrar moderador es cosa del administrador, y ahora también en el servidor.
--
-- La app solo le enseña el botón "Nombrar" al administrador, pero la política de
-- la 0004 dejaba que **cualquier moderador de una liga ascendiera a quien
-- quisiera** dentro de ella. Bastaba con escribir directo contra la API con la
-- clave pública: la interfaz era más estricta que la regla, y la que manda es la
-- regla.
--
-- Decisión del cliente (2026-08-16): **solo el admin nombra**. La liga no se
-- autogestiona el rol; cada moderador nuevo pasa por la administración.
--
-- Se toca ÚNICAMENTE el update. El borrado sigue como estaba —un moderador
-- puede sacar a alguien de su liga, y cada quien puede salirse— porque esa es
-- otra facultad y nadie pidió cambiarla.

drop policy if exists "league_members_update_organizer" on league_members;

create policy "league_members_update_admin"
  on league_members for update
  to authenticated
  using (exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true));
