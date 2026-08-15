-- El control de administrador pasa a la cuenta real de la liga.
--
-- Hasta hoy el admin era el correo de prueba de Farid (0008). El cliente ya
-- definió el suyo: dmlbeybladereynosa@gmail.com.
--
-- OJO con el orden: si se quitara el admin viejo antes de confirmar que el
-- nuevo existe, la plataforma se quedaría SIN NINGÚN administrador y nadie
-- podría crear ligas ni nombrar moderadores — incluido quien tendría que
-- arreglarlo. Por eso el revoke solo ocurre si el grant funcionó.
--
-- Es re-ejecutable: si la cuenta del cliente todavía no existe, no cambia nada
-- y avisa. Basta volver a correrlo cuando el cliente ya se haya registrado.

do $$
declare
  v_new_admin uuid;
  v_old_count int;
begin
  select p.id into v_new_admin
  from players p
  join auth.users u on u.id = p.auth_user_id
  where lower(u.email) = 'dmlbeybladereynosa@gmail.com';

  if v_new_admin is null then
    raise notice 'La cuenta dmlbeybladereynosa@gmail.com todavía no existe en la app. No se cambió nada: el admin sigue siendo el de prueba. Pídele al cliente que cree su cuenta y vuelve a correr esta migración.';
    return;
  end if;

  update players set is_admin = true where id = v_new_admin;
  raise notice 'Administrador otorgado a dmlbeybladereynosa@gmail.com.';

  -- Solo ahora, con el admin nuevo ya confirmado, se retira el de prueba.
  update players p set is_admin = false
  from auth.users u
  where p.auth_user_id = u.id
    and lower(u.email) = 'farid.zeqvil89@gmail.com'
    and p.id <> v_new_admin;

  get diagnostics v_old_count = row_count;
  if v_old_count > 0 then
    raise notice 'Retirado el administrador de prueba (farid.zeqvil89@gmail.com).';
  end if;
end $$;
