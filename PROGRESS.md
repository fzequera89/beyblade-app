# Beyblade League App — Estado del proyecto

> Última actualización: 2026-08-14. Este archivo es la fuente de verdad para retomar el proyecto desde cualquier máquina/sesión — está versionado en git, a diferencia de las notas de memoria de Claude Code (que solo viven localmente en la PC donde se desarrolló).

**Este documento cubre el ESTADO del proyecto.** Para lo demás:
> - [`README.md`](README.md) — qué es, cómo correrlo, arquitectura y modelo de seguridad
> - [`docs/database.md`](docs/database.md) — esquema, políticas RLS y funciones, consolidado
> - [`docs/elo-rules.md`](docs/elo-rules.md) — fórmulas de ELO y reglas de implementación

## Resumen

App de gestión de liga de Beyblade: torneos, brackets, ELO real, descubrimiento físico de jugadores/venues. React Native + Expo, backend Supabase.

- Repo: https://github.com/fzequera89/beyblade-app
- Supabase: proyecto "CML Beyblade" (ref `vgffwqmpiunxzmlfmtyo`), cuenta `fzequera89`
- EAS/Expo: cuenta `fzequera89` (login con email+contraseña, no con Google — esa cuenta no tiene password)
- Documento fuente de la propuesta original: `docs/elo-rules.md` (reglas de ELO, con correcciones) y la propuesta de producto (fuera del repo, en el escritorio de Farid)

## Progreso: ~89% del roadmap total

| Fase | % | Estado |
|---|---|---|
| Fase 0 — Fundamentos | 5% | ✅ Completa |
| Fase 1 — MVP liga digitalizada (M1-M5, M12) | 30% | ✅ Completa |
| Fase 2 — Descubrimiento físico (M6, M7) | 18% | ✅ Completa |
| Fase 3 — Estadísticas y gamificación (M9, M10) | 14% | ✅ Completa |
| Fase 4 — Eventos y capa social (M8, M11) | 13% | ✅ Completa |
| Fase 5 — Multi-liga y League Passport | 9% | ✅ Completa |
| QA, pulido y publicación en tiendas | 11% | ⬜ Pendiente |

**Todas las fases de producto están construidas.** Lo único que falta del roadmap ORIGINAL es la última línea: QA con datos reales, pulido y publicación en tiendas — ver "Qué falta para el 100%" al final.

⚠️ **El roadmap original no es todo el trabajo.** Después de escribirlo aparecieron dos frentes grandes que no estaban contemplados: el **rediseño de identidad** (terminado, ver abajo) y la **brecha contra el reglamento real de la liga** (~110x, sin empezar, ver "Brecha contra el reglamento DML").

## Rediseño de identidad — ✅ completo (2026-08-14)

No fue un recolor. El estado original tenía 329 colores escritos a mano en 34 pantallas, 3 componentes compartidos y cero iconos.

Lo que quedó:
- `src/theme.ts` — paleta, espaciado, tipografía y `glow()`. Todo color sale de aquí.
- `src/ui/` — Screen, Button, Field/PasswordField, Card, Pill, Hex, Chip, Stepper, Checkbox, OptionCard, Avatar, Logo, icons, EloChart, VenueCover. **Todo SVG propio, sin dependencia nativa nueva** (`react-native-svg` ya estaba por los QR).
- Navegación de **5 pestañas** (Inicio/Batallas/Play/Rankings/Perfil), cada una con su pila independiente, y botón Play hexagonal elevado.
- **Las 34 pantallas convertidas.** Cero pantallas con el estilo viejo — verificable buscando quién importa `components/Screen` (debe dar 0).
- 12 avatares ilustrados en `assets/avatars/c1..c12.png`; el código guarda solo la llave.
- Portada por locación (`VenueCover`): usa la foto real si existe, si no dibuja una arena derivada del id del lugar.

**Principio de diseño del cliente:** en una lista de tarjetas apiladas, la primera lleva tratamiento de héroe — pero **solo si de verdad es la más relevante** (la liga que es tuya, el torneo que sigue abierto, la locación donde hay gente ahora). Destacar por posición y no por relevancia le inventa importancia a algo que no la tiene.

**Trampas técnicas encontradas** (no repetirlas):
- `react-native-svg`: usar `transform="rotate(...)"`, NO las props `rotation`/`origin` — truenan en web.
- React Navigation necesita tema oscuro explícito o pinta `#f2f2f2` detrás y destella blanco en cada transición.
- `glow()` es un box-shadow: pinta la CAJA rectangular. Detrás de un hexágono se ve un cuadro negro. El halo va dentro del SVG.
- `StyleSheet.absoluteFillObject` no existe en los tipos de RN 0.86.
- Verificar el typecheck con el código de salida real. `npx tsc --noEmit | head` **siempre** sale 0 aunque falle, y así se commiteó una vez código roto.

**Enlaces de navegación:** cada pestaña es una pila aparte, así que un `navigate('X')` a una pantalla no registrada en ESA pila no hace nada — sin error visible. Se encontraron 10 así. Para revisarlo, cruzar cada `navigate()` de cada pantalla contra las pantallas registradas en cada pila de `TabNavigator.tsx`. Para saltar de pestaña: `navigate('Batallas', { screen: 'Leagues' })`.

## Qué existe hoy (funcional)

**Auth y perfil (1.1):** login email/password + Google OAuth (falta configurar el cliente OAuth de Google en Supabase/Google Cloud — sin eso el botón de Google no funciona en build real). Perfil editable, historial de matches.

**Ligas y temporadas (1.2):** crear liga (solo admin, ver abajo), unirse como miembro, temporadas.

**Torneos y bracket (1.3):** registro, check-in, generación de bracket ronda 1 con seeding por ELO. **Simplificación de MVP:** cada ronda se re-empareja por ELO actual (no posiciones fijas de bracket oficial) — ver `src/lib/bracket.ts`.

**Resultado y ELO (1.4):** reportar resultado (score 3-0/3-1/3-2), confirmación por el rival contrario o moderador, cálculo de ELO real vía función atómica `confirm_match_result` en Postgres, disputa/reapertura, avance automático de ronda de bracket.

**Panel de organizador (1.5):** check-in masivo, ranking/reporte por liga.

**Rol de administrador de plataforma** (agregado fuera del roadmap original, a petición del cliente): columna `players.is_admin`. Solo el admin crea ligas y nombra/quita moderadores de liga (antes cualquiera podía crear ligas). Admin actual: `farid.zeqvil89@gmail.com` — **cambiar al correo real del cliente cuando se defina**. Panel de administrador: stats globales, gestión de jugadores (incluye registrar jugadores manualmente sin cuenta, útil para gente sin la app todavía), ranking global.

**Venues y check-in físico (2.1, 2.2, 2.3):** alta de venues, QR de check-in (generar con `react-native-qrcode-svg`, escanear con `expo-camera` — **requiere build real, no se prueba en el preview web**), "Who's Playing Here" (check-ins de las últimas 4 horas por venue).

**Bladers Near Me y Find a Battle (2.4, 2.5):** toggle "buscando jugar" con expiración (30 min/1h/todo el día). **Decisión de alcance:** sin mapa real/GPS/MapLibre — se filtra por ciudad del jugador. El mapa visual (MapLibre, mencionado en la propuesta original) queda pendiente como mejora futura si de verdad se necesita — es una integración nativa pesada que requeriría dev client. Reto entre jugadores (retar/aceptar/rechazar); aceptar crea un match normal que reutiliza el flujo de reporte/confirmación/ELO de 1.4.

**Estadísticas y gamificación (3.1, 3.2, 3.3, 3.4):** al retomar Fase 3 se encontró que `match_rounds`, `combos`, `rivalries`, `badges` y `ranking_snapshots` tenían RLS activado desde 0002 **sin ninguna política** (o sea, cerradas del todo) y que nadie escribía en `match_rounds` ni en `combos`. Por eso Fase 3 incluyó primero la captura de esos datos:

- **Reporte round a round:** reportar un match ya no es elegir 3-0/3-1/3-2, sino registrar cada round con su ganador y su tipo de finish (spin / over / burst / xtreme, Beyblade X). El marcador se deriva de los rounds. Todo pasa por la función atómica `report_match_result` (migración 0014), no por un UPDATE directo, para que marcador y rounds no puedan quedar en desacuerdo.
- **Combos (`CombosScreen`):** CRUD de los combos del jugador (nombre + blade/ratchet/bit en `parts` jsonb). Al reportar un match se elige con cuál se jugó, y de ahí sale el rendimiento por combo.
- **Estadísticas (`StatsScreen`):** win rate, racha actual y mejor racha, desglose de cómo gana sus rounds, rendimiento por combo, y gráfica de evolución de ELO.
- **Gráfica de ELO (`EloChart`):** lee `ranking_snapshots` y se dibuja con `react-native-svg`, que ya era dependencia por los QR de 2.2 — **no se agregó ninguna dependencia nativa nueva**.
- **Rivalidades (`RivalriesScreen`):** récord head-to-head contra cada jugador, leyendo la tabla `rivalries` que ya se llenaba sola desde 1.4. Toca un rival y muestra los últimos matches contra él.
- **Logros (`BadgesScreen`):** catálogo de 14 badges (volumen de partidas, hitos de ELO, rachas, mata gigantes, impecable, finishes, némesis). Se otorgan solos: `confirm_match_result` llama a `award_badges` al final. Los íconos son emoji del lado del cliente (`src/lib/badges.ts`) para no depender de Storage; el nombre y la descripción sí viven en la base y se pueden editar sin tocar código.

**Eventos y capa social (4.1, 4.2, 4.3, 4.4):**

- **Eventos y asistencia (`EventsScreen`, `CreateEventScreen`, `EventDetailScreen`):** agenda de lo que viene, con tipo (torneo, noche de liga, juego libre, práctica, quedada, batalla de clubes, día de novatos), venue y confirmación de asistencia. **Quién puede crear:** los eventos DE LIGA solo el admin o un moderador de esa liga; los eventos ABIERTOS (sin liga) cualquier jugador — si las quedadas casuales se cerraran a moderadores, la mitad de M8 perdería sentido.
- **Seguir jugadores y perfil público (`PlayerProfileScreen`, `FollowsScreen`):** perfil consultable de cualquier jugador con seguir/dejar de seguir, retar directo, y el récord head-to-head contra uno mismo.
- **Feed de actividad (`FeedScreen`):** mezcla matches confirmados, logros desbloqueados y check-ins de la gente que sigues. **Sin tabla de feed denormalizada a propósito:** para el tamaño de una liga regional no se justifica mantenerla al día, y se desincroniza en cuanto algo se borra o se disputa.
- **Clubes (`ClubsScreen`, `ClubDetailScreen`):** el equipo con el que un jugador se identifica. A diferencia de una liga, **cualquiera puede fundar un club** — la escena se organiza sola. El roster se ordena por ELO (ranking interno) y el fundador entra automático por trigger, igual que el dueño de una liga en 0004.

**Multi-liga y League Passport (5.1, 5.2):**

- **Posición por liga (5.1):** la pantalla de ligas muestra "Vas #N de M" en cada liga donde el jugador es miembro. Se calcula ordenando a los miembros de esa liga por el rating **global** — no hay un ELO por liga (ver decisión 7).
- **League Passport (`PassportScreen`, 5.2):** la trayectoria completa en una sola vista consultable de cualquier jugador — ligas con su posición, torneos, clubes, logros, venues visitados, récord y rivales enfrentados. Es la vista que le da sentido al multi-liga: un mismo rating global con la historia de por dónde pasó.

## Decisiones de diseño / simplificaciones importantes

1. **Bracket sin seeding fijo:** cada ronda se re-calcula por ELO actual, no por posiciones de bracket predefinidas. Más simple, menos "oficial".
2. **Sin mapa real (MapLibre):** Bladers Near Me y venues usan listas filtradas por ciudad, no geolocalización real. Evita el peso de una integración nativa que necesita dev client.
3. **K-Factor asimétrico:** cada jugador usa su propio K según su experiencia (documentado en `docs/elo-rules.md`, punto 5) — un nuevo vs. un establecido no tiene intercambio de suma cero perfecta. Es estándar en sistemas Elo reales (igual que ajedrez FIDE).
4. **Avatar de perfil:** NO implementado (solo un círculo de placeholder). Decisión explícita de posponerlo.
5. **RLS en capas:** cada tabla se protegió con políticas mínimas conforme se construyó cada feature (no todo de una vez en Fase 0) — revisar `supabase/migrations/` en orden para el historial completo de qué política resuelve qué caso.
6. **Escrituras sensibles solo por función `SECURITY DEFINER`:** `report_match_result`, `confirm_match_result`, `accept_challenge` y `award_badges` no tienen política de INSERT/UPDATE equivalente. Es a propósito: nadie puede auto-asignarse un logro, inventar rounds ni mover su ELO con un insert directo, aunque tenga la anon key.
7. **ELO por categoría = filtro de lectura:** se resolvió el punto 4 de `docs/elo-rules.md` en la dirección recomendada. Existe **un solo rating global** por jugador; las vistas por liga/temporada/categoría son filtros sobre `ranking_snapshots`, no ratings independientes. **Pendiente de confirmar con el cliente**, pero cambiarlo después no toca el cálculo del ELO.
8. **Match al mejor de 5:** el primero que llega a 3 rounds gana, que es lo que ya asumía el marcador 3-0/3-1/3-2 de 1.4. Está en una constante (`ROUNDS_TO_WIN`) por si la liga cambia de formato.
9. **Fecha y hora de eventos como texto (AAAA-MM-DD / HH:MM):** un date picker nativo exigiría `@react-native-community/datetimepicker`, que obliga a dev client. Todo el proyecto viene evitando dependencias nativas nuevas (misma razón que la decisión 2). Es el punto más obvio a pulir en la fase de QA si el cliente lo pide.

## Pendientes conocidos

- **✅ Las 21 migraciones ya corrieron en Supabase** (la 0021, fotos de locación, el 2026-08-14 — verificado desde fuera: la columna `photo_url` responde y el bucket `venues` existe). Verificado desde fuera: `report_match_result` y `award_badges` responden, las columnas nuevas de `events` y `clubs` existen, y todas las tablas rechazan lectura anónima. El esquema está completo y al día con el repo.
- **Build de EAS pendiente de generar** desde la sub-etapa 1.1 (fix de placeholders) — el usuario pidió explícitamente esperar y acumular cambios de varias fases antes de generar el próximo build real, para no gastar builds en cada cambio chico.
- Configurar el cliente OAuth de Google en Supabase (para que el botón "Continuar con Google" funcione en producción).
- Cambiar `is_admin` del correo de prueba de Farid al correo real del cliente cuando se decida.
- Mapa visual (MapLibre) si el cliente lo pide de verdad — no está en el MVP actual.
- Avatar de perfil (selector de imagen + Supabase Storage) — pospuesto.

## Brecha contra el reglamento DML (~110x, sin empezar)

Medido el 2026-08-14 cruzando `Reglamento DML Beyblade actualizado pro.docx` contra el código y el esquema.

**Ya cumple:** puntuación por finish (Spin 1, Over 2, Burst 2, Xtreme 3, Aerial 3) calculada en el servidor, gana el primero a 4 puntos, Aerial prohibido en ranking, ELO como ranking aparte de las ligas, bracket de eliminación directa con byes, logros permanentes.

**Falta:**

| Bloque | x | Qué implica |
|---|---|---|
| Categorías | 25 | Los 8 estratos (Porcelana→Challenger), cupo 2-10, divisiones A/B, Porcelana al doble, nuevos entran en Porcelana |
| Ascenso y VP | 20 | Round robin por categoría, reto de ascenso 1º↔último de la superior, VP 3/2/1 por nivel, 4 criterios de desempate |
| Deck 3+1 | 15 | Modelar Blade/Ratchet/Bit por separado, deck card registrada y bloqueada durante el torneo, validar "no repetir piezas" |
| Arbitraje | 12 | Rol de juez (Principal / Apoyo), resolución de disputa, un Challenger/Diamante nunca arbitra su categoría |
| Penalizaciones | 12 | Tabla leves/graves/críticas; 2 leves iguales = 1 punto al rival, graves = pierde el combate, críticas = expulsión |
| Temporadas | 10 | Reseteo a los 3 meses, torneo inicial G3, asistencia (sin ella no hay eliminación por inasistencia ni reingreso) |
| Reglas de ronda | 8 | Lanzamiento nulo (advertencia → 1 punto al rival), empate = repetir ronda, self-over sin contacto |
| Sueltos | 8 | Elegir modalidad casual, torneos a 5/7/10, temática por votación, premios, checklist de desgaste |

**Tres hallazgos verificados en el código, importantes:**
1. `RANKS` existe en `src/theme.ts` pero **no lo usa ninguna pantalla** — es decoración, no un escalafón.
2. **La disputa es un callejón sin salida:** un jugador la marca (`MatchDetailScreen`), el panel de admin la cuenta, pero **no hay RPC ni pantalla para resolverla**. Entra y se queda ahí. Es lo único de esta lista que ya está roto en producción.
3. `matches.mode` y `matches.points_to_win` existen desde 0020, pero **nadie los escribe**: `src/lib/bracket.ts` y `accept_challenge` crean todo como `ranking`/4. En la práctica el Aerial nunca se puede usar y no hay torneos a 5/7/10.

**Decisiones del cliente ya cerradas:**
- **Challenger y Contender son lo mismo** (2026-08-14): confundió los nombres. Una sola categoría élite.
- El ELO se queda, pero como ranking **completamente aparte** de la escalera de categorías.
- Arbitraje **por excepción**: si ambos jugadores marcan el mismo resultado no hace falta juez; solo entra si difieren o alguien disputa, y le llega alerta.
- Sin GPS. Rondas suizas y modalidad por equipos (~15x) son pedido aparte, no están en el reglamento.

Orden recomendado: **arbitraje + penalizaciones (24x)** primero, porque la disputa ya está rota; después categorías + ascenso + VP (45x), que es lo que le da sentido competitivo a la liga.

## Cómo retomar el proyecto (checklist para una sesión nueva)

1. `git clone` / `git pull` del repo.
2. Copiar `.env.example` a `.env` y llenar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Settings → API del proyecto "CML Beyblade").
3. Confirmar que todas las migraciones en `supabase/migrations/` (0001 a la más reciente) ya corrieron en el SQL Editor de Supabase, en orden. **0005 debe correr sola**, aparte de las demás (ver el comentario en ese archivo). Las demás pueden ir seguidas. **Al 2026-08-14 las 21 ya están corridas** — si se agrega una nueva, actualizar esta línea.
4. `npm install`, luego `npm run web` para verificar rápido en el preview del navegador (no requiere emulador Android).
5. Para un build real: `npx eas-cli build --platform android --profile preview --non-interactive` (requiere `eas login` ya hecho en la máquina).

## Datos de demostración

`supabase/seed/demo_data.sql` llena la liga para enseñarle la app al cliente: 16 jugadores, 2 ligas, 2 clubes, 3 venues, un torneo terminado con bracket de 8, otro con inscripciones abiertas, 5 eventos, ~67 matches confirmados con sus rounds, y de ahí salen solos el ranking, las estadísticas, las rivalidades y los logros.

**Vive fuera de `supabase/migrations/` a propósito** — es dato, no esquema, y no debe correr en la cadena de migraciones.

**✅ Ya sembrado en Supabase (2026-08-13).** La liga está llena y la app se puede enseñar tal cual.

```sql
-- 1. Pegar el archivo en el SQL Editor y ejecutarlo (solo crea las funciones)
-- 2. Sembrar:
select seed_demo_data();
-- 3. Borrar todo antes de ir a producción:
select remove_demo_data();
```

> ⚠️ **Acordarse de correr `remove_demo_data()` antes de que la liga sea real.** Si no, los 16 jugadores falsos van a aparecer en el ranking oficial junto a los de verdad.

Notas de diseño:
- Todo lo de demo usa UUIDs que empiezan con `dddddddd`, y el borrado toca exactamente esos ids. **No afecta cuentas ni partidas reales.**
- Los jugadores de demo tienen `auth_user_id` nulo (el mismo caso de "registrar jugador a mano" del panel de admin), así que nadie puede iniciar sesión como ellos.
- **No usa `confirm_match_result`**: esa función exige `auth.uid()` y un seed no tiene sesión. Replica su misma matemática de ELO, así que el rating de cada jugador cuadra con la suma de sus cambios, con `ranking_snapshots` y con `rivalries`. `award_badges` sí se reutiliza tal cual.
- Semilla fija (`setseed(0.42)`) y limpieza previa: correrlo dos veces da el mismo resultado y no duplica nada.

## Qué falta para el 100% (QA, pulido y publicación — 11%)

Es la única línea del roadmap que queda, y buena parte **no la puede cerrar un agente**: necesita builds reales, cuentas de pago y decisiones del cliente.

**QA con datos reales (lo que sigue de inmediato):**
- Ninguna fase se ha probado **desde la app con una sesión iniciada**. Lo verificado hasta hoy es: typecheck limpio, el bundle compila, las pantallas montan y renderizan, las funciones de base responden, y los datos de demo ya están sembrados. El flujo completo hecho a mano desde la UI (crear combo → reportar round a round → confirmar con la segunda cuenta → ver moverse ELO, stats, rivalidad y logros) está **sin probar**.
- **Se necesitan dos cuentas** para cerrar el ciclo: `confirm_match_result` rechaza a propósito que quien reporta confirme su propio resultado.
- Probar el QR de check-in (2.2) y la cámara, que solo funcionan en build real, nunca en el preview web.

**Pulido pendiente:**
- Fecha/hora de eventos como texto (decisión 9) — cambiar a date picker exige dev client.
- Avatar de perfil (pospuesto desde Fase 1).
- Sin notificaciones push todavía (estaban en el stack acordado: FCM/Expo Push).
- Sin paginación en listas: hoy todo carga completo. A escala de liga regional aguanta; con miles de matches habría que paginar.

**Publicación (requiere al cliente, no al desarrollador):**
- Cuenta de Google Play (~$25 único) y de Apple (~$99/año).
- Configurar el cliente OAuth de Google en Supabase para que "Continuar con Google" funcione en producción.
- Cambiar `is_admin` del correo de prueba de Farid al correo real del cliente.
- Íconos, splash, capturas, textos de ficha y política de privacidad.
