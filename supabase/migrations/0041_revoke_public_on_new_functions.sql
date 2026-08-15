-- Las funciones de 0039 y 0040 nacieron ejecutables por CUALQUIERA.
--
-- Es exactamente lo que documenta la 0023, y volvió a pasar: en Postgres una
-- función nueva le da EXECUTE a PUBLIC por defecto, y el `alter default
-- privileges` que dejó la 0023 no cubrió estas (se crearon por la Management
-- API, con otro camino de rol). Comprobado con `proacl`: las cinco traían
-- `=X/postgres`, que es PUBLIC.
--
-- De las cinco, cuatro se defienden solas —piden `auth.uid()` y revientan con
-- "No autorizado" o "Torneo no encontrado"—, pero **`tournament_category_groups`
-- no**: es un SELECT `security definer` sin comprobación, así que un anónimo con
-- la anon key podía leer los grupos por categoría de cualquier torneo. El resto
-- de las tablas sí rechazan lectura anónima, así que era el único hueco.
--
-- La regla, otra vez, para lo que venga: toda función nueva necesita su
-- `revoke ... from public, anon` explícito ADEMÁS del `grant ... to
-- authenticated`. Revocarle a PUBLIC no basta si alguien ya tenía grant directo,
-- y grantear a `authenticated` no quita el de PUBLIC.

revoke execute on function enroll_season_in_tournament(uuid) from public, anon;
revoke execute on function tournament_category_groups(uuid) from public, anon;
revoke execute on function seed_season_from_tournament(uuid, uuid) from public, anon;
revoke execute on function save_deck_card(uuid, uuid[]) from public, anon;
revoke execute on function lock_tournament_decks(uuid) from public, anon;

-- Y se re-otorga a quien sí las usa, porque el revoke a PUBLIC también le quita
-- el permiso heredado a `authenticated` si no lo tiene propio.
grant execute on function enroll_season_in_tournament(uuid) to authenticated;
grant execute on function tournament_category_groups(uuid) to authenticated;
grant execute on function seed_season_from_tournament(uuid, uuid) to authenticated;
grant execute on function save_deck_card(uuid, uuid[]) to authenticated;
grant execute on function lock_tournament_decks(uuid) to authenticated;
