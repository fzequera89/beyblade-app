-- Cerrar el acceso de los clientes a las funciones internas.
--
-- Por qué hacía falta: la 0022 revocó apply_match_confirmation "from public",
-- pero Supabase le da EXECUTE DIRECTO a los roles anon y authenticated con un
-- `alter default privileges` propio. Revocarle a PUBLIC no les quita ese grant
-- directo. Verificado el 2026-08-14 con la anon key y sin sesión: grant_badge y
-- award_badges devolvían 204 (ejecutaron), y apply_match_confirmation entraba a
-- su cuerpo. La anon key viaja en el bundle de la app: no es un secreto.
--
-- Estas tres funciones son SECURITY DEFINER y NO validan quién llama, porque
-- están pensadas para ser llamadas por otras funciones que sí lo hacen. Las
-- llamadoras (confirm_match_result, resolve_dispute, register_penalty) corren
-- como el dueño de la función, así que conservan el EXECUTE y siguen andando.

revoke all on function apply_match_confirmation(uuid, uuid) from public, anon, authenticated;
revoke all on function award_badges(uuid, uuid)             from public, anon, authenticated;
revoke all on function grant_badge(uuid, text)              from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Causa raíz: que la próxima función no vuelva a nacer abierta
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sin esto, cada función nueva que se cree vuelve a salir con EXECUTE para anon
-- y authenticated, y hay que acordarse de revocarla a mano cada vez.
--
-- A partir de aquí toda función nueva necesita su `grant execute ... to
-- authenticated` explícito para que la app la pueda llamar. Este repo YA lo
-- hace en todas: confirm_match_result, accept_challenge, report_match_result,
-- finish_points, can_arbitrate, resolve_dispute, register_penalty,
-- set_judge_role y suspend_player tienen su grant escrito.

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
