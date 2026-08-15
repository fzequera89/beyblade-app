-- El control de administrador se comparte: la cuenta real de la liga y la de
-- desarrollo, las dos a la vez.
--
-- Hasta hoy el admin era solo el correo de prueba de Farid (0008). El cliente
-- ya definió el suyo: dmlbeybladereynosa@gmail.com. Por ahora conviven —
-- alguien tiene que poder destrabar la plataforma mientras el cliente aprende
-- a usarla, y quitarle el acceso al desarrollador el primer día significaría
-- que ningún problema de administración se puede diagnosticar.
--
-- Es re-ejecutable: si la cuenta del cliente todavía no existe, no cambia nada
-- y avisa. Basta volver a correrlo cuando el cliente ya se haya registrado.
--
-- Cuando el cliente quiera quedarse como único administrador, es una línea:
--   update players p set is_admin = false
--   from auth.users u
--   where p.auth_user_id = u.id and lower(u.email) = 'farid.zeqvil89@gmail.com';
-- Antes de correrla, confirmar que el otro admin ya existe y funciona: si se
-- retira al único que queda, nadie puede crear ligas ni nombrar moderadores,
-- incluido quien tendría que arreglarlo.

do $$
declare
  v_client uuid;
  v_dev uuid;
begin
  select p.id into v_client
  from players p
  join auth.users u on u.id = p.auth_user_id
  where lower(u.email) = 'dmlbeybladereynosa@gmail.com';

  select p.id into v_dev
  from players p
  join auth.users u on u.id = p.auth_user_id
  where lower(u.email) = 'farid.zeqvil89@gmail.com';

  if v_client is null then
    raise notice 'La cuenta dmlbeybladereynosa@gmail.com todavía no existe en la app. Pídele al cliente que cree su cuenta y vuelve a correr esta migración.';
  else
    update players set is_admin = true where id = v_client;
    raise notice 'Administrador otorgado a dmlbeybladereynosa@gmail.com.';
  end if;

  -- Se reafirma, no se retira: así esta migración deja el estado correcto
  -- aunque una versión anterior de este archivo ya le hubiera quitado el rol.
  if v_dev is not null then
    update players set is_admin = true where id = v_dev;
    raise notice 'La cuenta de desarrollo sigue siendo administrador.';
  end if;
end $$;
