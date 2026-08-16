# Beyblade League App — Estado del proyecto

> Última actualización: 2026-08-15. Este archivo es la fuente de verdad para retomar el proyecto desde cualquier máquina/sesión — está versionado en git, a diferencia de las notas de memoria de Claude Code (que solo viven localmente en la PC donde se desarrolló).

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

**Rol de administrador de plataforma** (agregado fuera del roadmap original, a petición del cliente): columna `players.is_admin`. Solo el admin crea ligas y nombra/quita moderadores de liga (antes cualquiera podía crear ligas). **Desde 0045 la bandera se DERIVA de una lista de correos** (`admin_emails`): hoy `fzequera89@gmail.com` y `dmlbeybladereynosa@gmail.com`. Panel de administrador: stats globales, gestión de jugadores (incluye registrar jugadores manualmente sin cuenta, útil para gente sin la app todavía), ranking global.

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

- **✅ Las migraciones 0001–0029 ya corrieron en Supabase.** La 0029 (factor K por partidas de ranking) verificada el 2026-08-14: `players.ranked_matches_played` responde donde antes daba `42703`, el backfill dejó a los 21 jugadores con `ranked_matches_played = matches_played` (134 = 134, correcto porque todo lo anterior a 0026 fue de ranking), y `apply_match_confirmation` sigue devolviendo `42501` — el candado de 0023 sobrevivió al `create or replace`. Verificación previa (0001–0028): `finish_points('launch_fail')=1`/`('void')=0` y `report_match_result` reconoce ambos → 0028; `tournaments.mode` filtra por `casual` → 0026; `accept_challenge` es casual → 0027; `judge_assignments`/`arbitrable_match_ids` → 0024/0025; `penalty_codes`/`penalties` → 0022; las funciones internas devuelven 42501 → 0023 sigue firme; `photo_url`/bucket `venues` → 0021; y todas las tablas rechazan lectura anónima). El esquema está completo y al día con el repo. **Ojo con el "vía Management API":** el `SUPABASE_ACCESS_TOKEN` que está en el entorno de esta máquina pertenece a **otra cuenta** de Supabase (`farid.zeq89@gmail.com`, org "Agentes Org", proyectos ROCE / Co-Meta). **No ve el proyecto DML Beyblade**, que vive en la cuenta `fzequera89` — comprobado el 2026-08-14: `/database/query` contra `vgffwqmpiunxzmlfmtyo` devuelve **403**, y `/v1/projects` con ese token no lista el proyecto. Las migraciones de ESTE proyecto se corren a mano en el SQL Editor, salvo que se genere un token de la cuenta correcta.
- **Build de EAS pendiente de generar** desde la sub-etapa 1.1 (fix de placeholders) — el usuario pidió explícitamente esperar y acumular cambios de varias fases antes de generar el próximo build real, para no gastar builds en cada cambio chico.
- Configurar el cliente OAuth de Google en Supabase (para que el botón "Continuar con Google" funcione en producción).
- ~~Cambiar `is_admin` al correo real del cliente~~ ✅ hecho en 0045: la lista de correos manda y el cliente entra como admin solo, al registrarse.
- Mapa visual (MapLibre) si el cliente lo pide de verdad — no está en el MVP actual.
- ~~Avatar de perfil~~ ✅ hecho (selector de imagen + Storage, en `EditProfileScreen`).

## Brecha contra el reglamento DML (~110x, sin empezar)

Medido el 2026-08-14 cruzando `Reglamento DML Beyblade actualizado pro.docx` contra el código y el esquema.

**Ya cumple:** puntuación por finish (Spin 1, Over 2, Burst 2, Xtreme 3, Aerial 3) calculada en el servidor, gana el primero a 4 puntos, Aerial prohibido en ranking, ELO como ranking aparte de las ligas, bracket de eliminación directa con byes, logros permanentes.

**Falta:**

| Bloque | x | Qué implica |
|---|---|---|
| ~~Categorías~~ ✅ 0030 | 25 | Los 8 estratos (Porcelana→Challenger), cupo 2-10, divisiones A/B, Porcelana al doble, nuevos entran en Porcelana |
| ~~Ascenso y VP~~ ✅ 0030/0031/0039 | 20 | ~~Round robin por categoría, reto de ascenso, VP por nivel, 4 criterios de desempate~~ — el round robin por categoría es la fase `category_rr` de 0039 |
| ~~Deck 3+1~~ ✅ 0040 | 15 | ~~Deck card registrada y bloqueada durante el torneo, validar "no repetir piezas"~~ — hecho en 0040 |
| Arbitraje | 12 | Rol de juez (Principal / Apoyo), resolución de disputa, un Challenger/Diamante nunca arbitra su categoría |
| Penalizaciones | 12 | Tabla leves/graves/críticas; 2 leves iguales = 1 punto al rival, graves = pierde el combate, críticas = expulsión |
| ~~Temporadas~~ ✅ 0031+0039 | 10 | ~~Reseteo a los 3 meses, torneo inicial G3, asistencia~~ — reseteo en 0031; G3 y asistencia en 0039 |
| ~~Reglas de ronda~~ ✅ 0028 | 8 | ~~Lanzamiento nulo (advertencia → 1 punto al rival), empate = repetir ronda, self-over sin contacto~~ — hecho en 0028 |
| ~~Sueltos~~ ✅ 0043+0044 | 8 | ~~Modalidad casual, torneos a 5/7/10, temática por votación, premios, checklist de desgaste~~ — todo hecho |

**Tres hallazgos verificados en el código, importantes:**
1. `RANKS` existe en `src/theme.ts` pero **no lo usa ninguna pantalla** — es decoración, no un escalafón.
2. **La disputa es un callejón sin salida:** un jugador la marca (`MatchDetailScreen`), el panel de admin la cuenta, pero **no hay RPC ni pantalla para resolverla**. Entra y se queda ahí. Es lo único de esta lista que ya está roto en producción.
3. ~~`matches.mode` y `matches.points_to_win` existen desde 0020, pero nadie los escribe~~ — **`mode` resuelto en 0026**: el torneo tiene modalidad y baja a cada combate del bracket, así que el Aerial ya es alcanzable en casual. ~~Sigue pendiente `points_to_win`~~ — **resuelto con el motor de fases**: cada fase lleva su meta (4/5/7/10), `generatePhaseRound` la baja a cada combate y `report_match_result` la respeta, así que un torneo a 7 puntos ya se juega a 7. Los retos ya se resolvieron: `accept_challenge` los crea como `casual` desde 0027 (no mueven ELO).

**Decisiones del cliente ya cerradas:**
- **Challenger y Contender son lo mismo** (2026-08-14): confundió los nombres. Una sola categoría élite.
- El ELO se queda, pero como ranking **completamente aparte** de la escalera de categorías.
- ~~Arbitraje **por excepción**~~ — **revertido el 2026-08-14**, ver 0025: ahora **todo** resultado lo aprueba un juez, coincidan los jugadores o no.
- Sin GPS. Rondas suizas y modalidad por equipos (~15x) son pedido aparte, no están en el reglamento.

Orden recomendado: **arbitraje + penalizaciones (24x)** primero, porque la disputa ya está rota; después categorías + ascenso + VP (45x), que es lo que le da sentido competitivo a la liga.

### ✅ Categorías + Ascenso + VP — CONSTRUIDO y CORRIDO (0030 y 0031, 2026-08-14)

El escalafón del reglamento existe. `RANKS` en `theme.ts` dejó de ser
decoración: las 8 llaves son las mismas que la tabla `categories`.

**Cómo conviven ELO y VP** (la decisión de fondo, ya cerrada con el cliente y
ahora implementada): son dos sistemas que miden cosas distintas y ninguno se
calcula del otro.

| | ELO | VP |
|---|---|---|
| Qué mide | Habilidad personal | Posición oficial en la liga |
| Alcance | Global, cruza ligas | Por temporada |
| Reset | Nunca | Cada 3 meses |
| Dónde se ve | Rankings, perfil, passport | Escalafón de la temporada |

Un jugador puede tener ELO alto y estar en Bronce porque acaba de entrar, y
está bien.

**0030 — categorías y VP:**
- `categories`: catálogo de los 8 estratos con `tier`, `vp_value` y `max_capacity`. En tabla y no en código, igual que badges y penalizaciones: el cliente corrige un cupo o un valor sin build.
- `season_standings`: dónde está cada jugador en cada temporada — categoría, división, posición, VP, puntos a favor/en contra, ganados/perdidos y `active` (inasistencia).
- `enroll_in_season`: los nuevos entran en Porcelana, sin excepción. El Challenger puede elegir categoría; el organizador puede sembrar la tabla inicial.
- `apply_vp_for_match`: acredita VP al cerrar el combate. **Solo ranking y solo si el torneo tiene temporada** — los casuales quedan fuera solos, y los retos sueltos son casuales desde 0027. El valor lo pone la categoría DE CADA JUGADOR: un Diamante arriesga 3 y un Porcelana 1 en el mismo combate. **La derrota resta lo mismo que la victoria suma** — se puede terminar en negativo.
- `season_standings_ordered`: la tabla con los 4 criterios de desempate del reglamento.

**0031 — ascenso, divisiones y cierre:**
- `promotion_challenges` + `open_promotion_challenge`: el 1º de una categoría reta al último de la superior. **Se juega como un combate normal** — reusa reporte, doble marca, aprobación del juez y ELO. Lo único distinto pasa al confirmarse: si gana el retador, intercambian categoría y puesto.
- `rebalance_divisions`: parte en A/B lo que pasa de cupo, **repartiendo en zigzag por posición** (1º a la A, 2º a la B, 3º a la A…). Cortar por la mitad dejaría una división de élite y otra de relleno.
- `close_season`: cuenta títulos, otorga Challenger al llegar a 5, siembra la temporada siguiente conservando categoría y reiniciando VP y posiciones. Los inactivos reingresan al último puesto de Porcelana; el Challenger vigente es inmune.
- `set_season_attendance`: marcar inasistencia.

**Detalle de diseño que importa:** `apply_league_effects` es un punto de
extensión llamado desde `apply_match_confirmation`. Existe para que lo que
venga después (contar asistencia, deck cards) se enganche ahí y **no obligue a
reescribir la función de 150 líneas por quinta vez** — tenerla copiada en
varios lados es justo lo que 0022 vino a evitar.

**El enfrentamiento directo se generalizó.** No es un valor por jugador, es una
relación entre dos; resolverlo para un empate de 3+ requeriría un grafo. Se
implementó como *victorias contra los demás empatados en VP y diferencia*, que
para el caso de dos —el que el reglamento describe— da el mismo resultado.

**Tres decisiones que tomé y hay que confirmar con el cliente:**
1. **VP de Challenger = 3.** El reglamento no lo dice; se asumió la banda superior. Está en la tabla `categories`: cambiarlo es un UPDATE, no una migración.
2. **El reto de ascenso lo abre el organizador**, no es automático. El reglamento dice que el 1º "PUEDE retar" —es un derecho que se ejerce— y hace falta que el round robin haya terminado para saber quién va primero.
3. **El cierre de temporada es manual.** "Al finalizar se realiza un reinicio" es un acto de la administración, no un reloj: un reset por fecha borraría una tabla en medio de un torneo.

**UI:** `LadderScreen` — escalafón agrupado por categoría con el color de cada
rango, tu posición destacada arriba, y para la organización el botón de abrir
reto de ascenso sobre el 1º de cada categoría y el de reorganizar divisiones.
Se llega tocando una temporada en el detalle de liga.

**Lo que falta de este bloque:** ~~la UI para cerrar temporada~~ ✅ hecha
(`LadderScreen`, commit `30ae233`, 2026-08-15): la organización elige una
temporada destino ya creada y cierra; conserva categorías, reinicia
posiciones/VP/marcadores, cuenta títulos y reingresa inactivos a Porcelana.
Siguen pendientes el **round robin por categoría** (hoy el bracket sigue siendo
eliminación directa) y el **torneo inicial G3**.

### ✅ El eslabón torneo↔temporada — CERRADO (2026-08-15)

Estaba anotado aquí como el eslabón faltante: `CreateTournamentScreen` **nunca
fijaba `tournaments.season_id`**, y `apply_vp_for_match` solo puntúa combates
cuyo torneo tiene temporada. O sea que **ningún torneo creado desde la app
alimentaba el escalafón ni el VP** — el QA de VP funcionó porque el combate de
prueba se ató a mano a una temporada.

Ahora el armador pregunta **"¿De qué temporada?"** en el paso de identidad, solo
para torneos de **ranking** (`TournamentSpec.seasonId` → `tournaments.season_id`).

**Por qué viene marcada la temporada más reciente y no "Suelto":** el error que
esto vino a arreglar es de **omisión, no de elección**. Un torneo de ranking
suelto se ve idéntico a uno atado, y la diferencia solo se nota semanas después,
cuando alguien pregunta por qué el escalafón no se movió. "Suelto" sigue
disponible, pero hay que pedirlo. Y si la liga **no tiene ninguna temporada**, el
armador lo dice ahí mismo en vez de dejar que se cree un torneo que no va a
puntuar; la vista previa ("ASÍ VA A QUEDAR") también lo declara antes de crear.

Queda pendiente la otra mitad de la conexión, que es un pedido de decisión al
cliente: **generar el round robin por categoría desde el escalafón**, creando el
torneo ya atado a la temporada.

**Sin probar con datos reales.** Verificado: 0030 y 0031 corridas y comprobadas
contra la base (catálogo con los 8 tiers, las 3 tablas, las 9 funciones, las
columnas de Challenger), las internas devuelven 42501, typecheck limpio con el
código de salida real y el bundle compila.

### ✅ Round robin por categoría, torneo inicial G3 y deck 3+1 — CONSTRUIDO (0039 y 0040, 2026-08-15)

✅ **0039, 0040 y 0041 CORRIDAS Y VERIFICADAS CONTRA LA BASE** (2026-08-15, con
un token de Management API de la cuenta `fzequera89` que dio Farid). Ya no hace
falta el SQL Editor: con ese token, `POST /v1/projects/<ref>/database/query`
corre migraciones y consultas.

**Cómo se verificó, que es lo interesante para la próxima vez:** se puede probar
el flujo COMPLETO sin app y sin sesión real, impersonando dentro de una
transacción que termina en `rollback` — no queda rastro en producción:

```sql
begin;
  -- montaje como postgres (salta RLS)
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<auth_user_id>","role":"authenticated"}';
  select mi_funcion(...);   -- ahora auth.uid() devuelve ese usuario
rollback;
```

Resultados reales de esa prueba:
- `enroll_season_in_tournament` + `tournament_category_groups` sobre 6 jugadores
  sembrados en dos categorías → devolvió **Oro 3 / Bronce 3**, agrupado por tier.
- `seed_season_from_tournament` sobre el bracket de 8 ya jugado de los datos demo
  → colocó **campeón 1º, finalista 2º, semifinalistas 3º y 4º**, y el resto por
  diferencia de puntos. Es exactamente "hasta dónde llegó".
- `save_deck_card`: el deck legal guardó sus 3 combos y `lock_tournament_decks`
  lo dejó bloqueado; el deck con **"Flat" y "flat"** fue rechazado ("repite 1
  pieza"), o sea que la normalización funciona; y 2 combos donde pide 3 también
  se rechazó.
- La RLS de `season_standings` rechazó un insert directo hecho como
  `authenticated` — la tabla sigue siendo escribible solo por función.

**0039 — el torneo de ranking del reglamento:**
- Fase nueva `category_rr`: todos contra todos **dentro de cada categoría**. El
  motor ya sabía hacer "grupos", pero los repartía por siembra; para el
  reglamento el grupo ES la categoría, así que el cruce lo hace
  `tournament_category_groups` (inscripciones × escalafón × catálogo) y el
  emparejamiento se queda en el motor puro, que sí se prueba sin base.
- `enroll_season_in_tournament`: inscribe a la temporada entera de una vez, solo
  a los **activos** — quien está marcado por inasistencia no entra hasta
  reingresar. Sin check-in: presentarse sigue siendo un acto aparte.
- `seed_season_from_tournament`: el **torneo inicial (G3)**. El orden sale de
  hasta dónde llegó cada quien (ronda más alta jugada, si la ganó, victorias,
  diferencia) y reordena **dentro de cada categoría**. Un torneo no cambia de
  categoría a nadie: para eso está el reto de ascenso.
- **UI:** en `LadderScreen`, la organización crea el torneo de la temporada con
  un botón ("por categoría" o "inicial G3"); nace atado a la temporada y con
  todos inscritos. En el detalle del torneo, la pestaña BRACKET muestra **una
  tabla por categoría** (una sola diría que un Porcelana va arriba de un Oro sin
  haber jugado contra él) y los combates agrupados por rango. Al terminar un G3
  aparece "FIJAR POSICIONES DE LA TEMPORADA".
- **Asistencia:** `set_season_attendance` existía desde 0031 y **no la llamaba
  ninguna pantalla**. Ahora la organización toca a un jugador del escalafón para
  marcar inasistencia o reactivarlo.

**0040 — deck card (el "3+1"):**
- `deck_cards` + `deck_card_combos`, una tarjeta **por torneo** y no por jugador:
  el mismo jugador lleva decks distintos a torneos distintos, y el del torneo
  pasado tiene que quedar como se jugó.
- `save_deck_card` valida las dos reglas que el software no podía ni
  representar: **cantidad exacta** según la modalidad (3 en 3v3, 5 en 5G) y
  **ninguna pieza repetida** entre las combinaciones — comparando en minúsculas
  y sin espacios, porque "Wizard Rod" y "wizard  rod" son la misma pieza escrita
  por dos personas.
- `lock_tournament_decks`: los bloquea la **organización**, todos de una vez. Si
  dependiera del jugador, nadie bloquearía el propio; y con el bracket ya armado,
  editar el deck sería elegirlo después de ver contra quién te tocó.
- **Las piezas NO son catálogo**: `combos.parts` ya guarda blade/ratchet/bit como
  texto, y una tabla cerrada obligaría a migrar cada vez que sale una pieza.
- **UI:** `DeckScreen` — los espacios se ven vacíos como una tarjeta que llenar,
  cada combo enseña sus piezas y se atenúa el que choca con lo ya elegido, en vez
  de dejar que lo descubras al guardar. Y **`MatchDetailScreen` solo ofrece los
  combos del deck** cuando el torneo tiene uno registrado.
- La validación de "no repetir" vive **dos veces a propósito**: en el cliente
  para que se vea mientras armas, en el servidor para que sea cierta.

**Verificado:** typecheck limpio con el código de salida real, `npm run
test:formats` sigue en verde (58 comprobaciones), el bundle compila y la app
monta. **Nada de esto se ha probado contra la base**, porque las migraciones no
han corrido.

> Nota de consola: en el preview de desarrollo aparecen avisos de
> `react-native-svg` ("rect attribute height: a negative value is not valid")
> durante el primer layout. Se comprobó que **ya estaban en `main` antes de este
> trabajo** y que **no aparecen en producción**; el DOM final es válido.


### 🔒 0041 — otra vez: las funciones nuevas nacieron abiertas a PUBLIC (2026-08-15)

Al verificar la 0039 se encontró que **un anónimo con la anon key podía ejecutar
`tournament_category_groups`** y leer los grupos por categoría de cualquier
torneo. Las otras cuatro se defienden solas (piden `auth.uid()`), pero esa es un
`select` `security definer` sin comprobación.

**Es la misma causa de la 0023 y volvió a pasar:** en Postgres una función nueva
le da EXECUTE a **PUBLIC** por defecto. Se vio en `proacl` como `=X/postgres`
(grantee vacío = PUBLIC). El `alter default privileges` que dejó la 0023 no
cubrió estas, creadas por la Management API.

La 0041 revoca a `public` y a `anon` en las cinco y re-otorga a `authenticated`.
**Verificado después de correrla:** las cinco devuelven `42501 permission denied`
a la anon key, y `deck_cards` / `deck_card_combos` devuelven vacío sin sesión.

**La regla, otra vez:** toda función nueva necesita `revoke execute ... from
public, anon` ADEMÁS del `grant ... to authenticated`. Grantear no quita lo de
PUBLIC.

### ✅ Deck 3+1, paginación, checklist de desgaste y temática por votación (0042–0044, 2026-08-15)

Con esto **la brecha contra el reglamento DML queda cerrada**: no quedan bloques
de esa tabla sin construir.

**0042 — el deck era 3+1, no 3.** La 0040 se quedó corta en dos cosas que solo
se ven leyendo el reglamento otra vez: el deck lleva **3 principales más 1
extra** (que se juega completo o se desarma para dar piezas a los otros), y la
deck card **solo aplica en ranking**, no en casual. La firma de `save_deck_card`
no cambió a propósito: el extra entra como último elemento del mismo arreglo.
Agregar un parámetro habría creado una función nueva por sobrecarga y dejado
viva la vieja —con la validación incompleta— para cualquier APK que siguiera
llamándola. El extra también entra en la regla de no repetir piezas, porque
puede entrar a jugar completo — **confirmado por el cliente el 2026-08-15**.

**Paginación de 12.** No es un número redondo: las filas miden 72-88 pt y el
área visible de una lista ronda 600, así que caben 7 u 8. Doce es pantalla y
media — se ve que la lista sigue y el botón queda al alcance. **Sin carga
automática al llegar abajo**, por pedido explícito: un ranking que crece solo
mientras lo lees no deja saber en qué lugar vas. De paso se arregló algo peor
que la falta de paginación: `RankingsScreen` pedía `.limit(100)`, así que **el
jugador 101 no existía para la app**, sin aviso. Paginan: ranking general,
ranking global del admin, feed y tabla de liga.

**0043 — guía de desgaste e inspección.** La tabla del reglamento (Bit, Ratchet,
Blade: qué se revisa, qué es ilegal, qué prueba de seguridad) vive en
`wear_checks`, en tabla y no en código, porque esos criterios dependen de qué
piezas van saliendo. La inspección se guarda **sobre la propia deck card**
—quién revisó, cuándo, si pasó, con qué nota— y no en una tabla aparte: la única
pregunta que se hace en la mesa es "¿este deck ya pasó?". **Aprobar congela la
tarjeta** (el reglamento dice que después de autorizar no se cambian piezas);
**rechazar no**, porque el jugador tiene que poder corregir y volver. Nadie
inspecciona su propio deck, y quién puede inspeccionar sale de los mismos cuatro
caminos que arbitrar.

**0044 — temática por votación.** Decisiones del cliente: **cualquiera propone y
un moderador acepta**; **votan los miembros de la liga** (no solo los inscritos,
porque se decide la semana previa, cuando mucha gente no se ha inscrito); y
**cierra sola en una fecha**.

*"Cierra sola" sin proceso agendado:* este proyecto no tiene cron. La función de
cierre es **idempotente y la puede llamar cualquiera** — la app la llama al abrir
el torneo. Lo automático no es quién llama, es que la función se niega a cerrar
antes de la fecha y, pasada la fecha, cierra igual sin importar quién entre: el
primero que abra la pantalla lo consuma. El voto es uno por persona y por torneo
(la llave primaria es el torneo, no la opción: con la opción como llave, cambiar
de opinión dejaría dos votos vivos), y se puede cambiar hasta el cierre.

**Verificado contra la base**, todo con sesión simulada y `rollback`:
- Deck 3+1 guarda el cuarto marcado como extra; sin extra sigue siendo válido;
  en casual lo rechaza; con 5 combos lo rechaza.
- La guía quedó sembrada con sus tres renglones; la inspección guarda juez, hora
  y nota, congela al aprobar, y rechaza a quien intenta inspeccionarse solo.
- La votación: propuesta, cambio de voto (queda **un** voto), cierre prematuro
  que no hace nada, cierre pasada la fecha que fija la ganadora, y segunda
  llamada que devuelve lo mismo.

### ✅ 0045 — el administrador se define por correo, no por bandera a mano (2026-08-15)

Decisión del cliente: los administradores son **`fzequera89@gmail.com`** (cuenta
del desarrollo, dueña del proyecto Supabase) y **`dmlbeybladereynosa@gmail.com`**
(cuenta oficial de la liga). La cuenta de pruebas `farid.zeqvil89@gmail.com`
**dejó de ser administradora**.

**Por qué no fue un simple UPDATE:** la cuenta del cliente **todavía no existe**
en `auth.users`. No se le puede poner una bandera a una fila que no existe, y por
eso la 0032 había quedado como "volver a correrla cuando se registre" — o sea,
dependiendo de que alguien se acuerde. Se invirtió: **la lista de correos es el
dato y la bandera se deriva**.

- `admin_emails` — la lista. Sin políticas de RLS, ni de lectura: la app nunca la
  consulta, solo lee `players.is_admin` como siempre. Se administra desde el
  panel de Supabase, igual que los otros catálogos.
- `apply_admin_emails()` — sincroniza la bandera con la lista. **Otorga y quita**,
  porque la lista es la verdad. **No se le otorga EXECUTE a `authenticated` a
  propósito**: es la única función del esquema que reparte permisos, y expuesta
  con la anon key sería una escalada de privilegios esperando un hueco. Se corre
  desde el panel o con la service key.
- Trigger `players_grant_admin_if_listed` — el día que el cliente cree su cuenta,
  su perfil **nace con la bandera puesta**, sin que nadie corra nada. Solo otorga;
  quitar es deliberado y pasa por la función.

**Verificado contra la base:** al aplicarla cambiaron 2 filas (una alta, una
baja) y hoy el único admin es `fzequera89@gmail.com`; y simulando el registro del
cliente dentro de una transacción con rollback —con el correo escrito en otras
mayúsculas, a propósito— el perfil nació con `is_admin = true`.

**Para agregar o quitar un administrador de aquí en adelante:** insertar o borrar
en `admin_emails` y correr `select apply_admin_emails();` desde el SQL Editor. No
hace falta migración ni build.

### Reglamento extraído (referencia, para no releer el .docx)

Investigado el 2026-08-14 leyendo `Reglamento DML Beyblade actualizado pro.docx` (secciones II–V). Reglas textuales para arrancar sin releer el .docx:

**Estructura de categorías — 8 estratos (mayor a menor):** 1. Challenger (élite / selección oficial) · 2. Diamante (jueceo de apoyo) · 3. Platino · 4. Oro · 5. Plata · 6. Bronce · 7. Hierro · 8. Porcelana (iniciación).
- Cupos (Hierro→Diamante): mín 2, máx 10. Si pasa de 10 → se abren **divisiones** (Oro A / Oro B).
- **Porcelana (base):** siempre el DOBLE de capacidad de las superiores (si Oro tiene 5, Porcelana 10).
- Nuevos: entran obligatoriamente en Porcelana.
- Reingreso (eliminado por inasistencia): reinicia en el ÚLTIMO puesto de Porcelana. Challenger es el único que no resetea por inasistencia (solo por incumplir jueceo).

**Ranking y ascenso (torneo de ranking = 2 fases):**
- Fase 1 — **Round Robin de categoría:** cada jugador enfrenta a todos los de su rango (grupo de 5 = 4 combates); se reacomodan internamente por desempeño.
- Fase 2 — **Reto de ascenso:** el 1º de una categoría puede retar al ÚLTIMO de la categoría inmediata superior. Gana el retador → intercambian posiciones para el siguiente torneo; pierde → ambos mantienen su lugar.

**VP (Puntos de Victoria) para el Ranking Unificado Interclubes** — por nivel de riesgo. OJO: la derrota RESTA lo mismo que la victoria suma:
- Diamante/Platino: **+3 / −3** · Oro/Plata: **+2 / −2** · Bronce/Hierro/Porcelana: **+1 / −1**.

**Criterios de desempate (en orden de prioridad):** 1. Diferencia de puntos (anotados − recibidos: spin/burst/over/xtreme). 2. Enfrentamiento directo (ganador del último duelo). 3. Antigüedad (más tiempo activo). 4. Orden alfabético (solo para el Ranking Unificado, que dura 6 meses).

**Challenger (estatus de élite):** se accede al llegar 1º de la tabla en 5 ocasiones (seguidas o alternas). Vigencia 1 año. Privilegios: inmunidad a reseteo por inasistencia, elección de categoría, patrocinios. Obligación: apoyar en jueceo mín 3 veces/temporada; incumplir el jueceo es la única forma de perder el rango antes de tiempo.

**Temporada:** 3 meses; al terminar, reinicio de posiciones para reestructurar categorías. Torneo inicial = eliminación directa (G3) para fijar la posición inicial.

**Decisiones a confirmar con el cliente antes de construir:**
- El ELO se queda como ranking APARTE (ya cerrado); VP + categorías son un sistema distinto. Hoy `RANKS` existe en `theme.ts` pero no lo usa nadie.
- **Cómo puntúa Challenger en VP** — no aparece en la tabla de VP del reglamento.
- **El reto de ascenso:** ¿automático tras el round robin o lo gestiona el organizador? ¿Se juega como un match normal?
- **La reestructuración al reset de temporada:** ¿automática por posición o manual del organizador?
- Empezar por el ESQUEMA (categorías, membresía por temporada+categoría con su posición, VP acumulados por temporada) antes que la UI.

### ✅ Arbitraje y penalizaciones — construido y CORRIDO (2026-08-14)

La 0022 ya corrió en Supabase. Verificado desde fuera con la anon key: `can_arbitrate` responde `false`, las tablas `penalty_codes` y `penalties` existen, las columnas `judge_role`/`suspended_until`/`penalty_points_a`/`arbitrated_by` están, y `resolve_dispute`, `register_penalty`, `set_judge_role` y `suspend_player` llegan a su lógica de negocio y rechazan a quien no debe.

Lo que trae 0022: rol de juez (`players.judge_role`), `can_arbitrate`, `resolve_dispute`, catálogo `penalty_codes` con las 12 infracciones del reglamento, `register_penalty` con su efecto en el marcador, `suspend_player`, `set_judge_role`, y `apply_match_confirmation` (el cierre del match — ELO, snapshots, rivalidad, logros — extraído a un solo lugar en vez de copiado en dos funciones).

Detalle de diseño que importa: los puntos de penalización viven en `matches.penalty_points_a/b`, no dentro de `score_a/score_b`. Si vivieran ahí, el siguiente reporte los borraría, porque ese reporte recalcula el marcador desde los rounds.

En la app quedó: panel del juez dentro del match (resolver o sancionar), bandeja de disputas ordenada por la que más lleva esperando, aviso "te toca arbitrar" arriba de Batallas, y el admin nombrando jueces desde el listado de jugadores.

**Sin probar con datos reales.** Verificado: typecheck limpio, 0 rutas de navegación muertas, la bandeja monta en el preview.

### 🔒 0023 — las funciones internas estaban abiertas a cualquiera (2026-08-14)

Al verificar la 0022 se encontró que **`grant_badge`, `award_badges` y
`apply_match_confirmation` eran ejecutables por un anónimo con solo la anon
key** — las dos primeras devolvían 204 (ejecutaban de verdad), la tercera
entraba a su cuerpo. Contradecía de frente la decisión 6.

`apply_match_confirmation` era el peor caso: no valida permisos a propósito
(está pensada para que la llamen otras funciones), **y tampoco revisa que el
match no esté ya confirmado**. Un jugador con sesión podía cerrar un match
saltándose la regla de "quien reporta no puede confirmar", y llamarla en bucle
sobre el mismo match para inflar ELO y `matches_played`.

**Causa:** la 0022 hacía `revoke ... from public`, pero Supabase le da EXECUTE
**directo** a `anon` y `authenticated` con su propio `alter default privileges`.
Revocarle a `PUBLIC` no les quita ese grant. La `award_badges` además tenía un
`grant execute ... to authenticated` explícito de sobra, escrito en la 0015.

La 0023 revoca a los tres roles por nombre y además cambia el default para el
rol `postgres`, para que la próxima función no vuelva a nacer abierta. Corrida y
verificada: las tres devuelven ahora **42501 permission denied**, y las nueve
funciones que la app sí usa siguen respondiendo igual.

**Regla para lo que venga:** toda función nueva necesita su `grant execute ...
to authenticated` explícito, o la app no la va a poder llamar.

**Lo que sigue de este bloque:** las reglas de ronda ya están hechas (0028, ver abajo); falta solo las notificaciones push. La doble marca ya está hecha, ver abajo.

### ✅ 0024 — doble marca a ciegas y bandeja del juez filtrada (2026-08-14)

**El problema del flujo viejo no era que faltara un paso, era que el paso que
había no verificaba nada.** A reportaba round a round y a B se le mostraba
"ganó A por 4–2" con un botón grande de CONFIRMAR. Eso es ratificar, no
verificar: B veía la respuesta antes de opinar, y el camino de menor esfuerzo
era aceptar. Un error de A —o una mentira— pasaba derecho.

**Cómo quedó.** B marca **a ciegas**: registra quién ganó y el marcador sin ver
lo de A. Si coinciden, el combate se cierra solo y no se molesta a ningún juez.
Si no coinciden, recién ahí se le revela la versión de A, lado a lado con la
suya, y B elige: aceptarla o disputar dejando escrito el motivo.

**Dos decisiones de diseño que importan:**

1. **B marca el RESULTADO, no los rounds.** Pedirle reingresar los 5 rounds
   duplicaría el trabajo en el 95% de los casos en que están de acuerdo. El
   cliente cerró la decisión como "si ambos marcan el mismo resultado no hace
   falta juez" — resultado, no rounds. Ganador + marcador es lo que un jugador
   sí recuerda al terminar.
2. **Una diferencia NO abre disputa automática.** El marcador sale de sumar
   puntos por tipo de finish; es fácil recordar bien quién ganó y errarle al
   total. Mandar eso a un juez sería fabricar disputas de aritmética.

**Que la marca sea de verdad a ciegas costó más que la lógica:** el marcador de
arriba, el anillo del avatar del ganador y la lista de rounds guardados ya le
enseñaban a B toda la versión de A. Los tres se ocultan mientras le toque
marcar (`mustMarkBlind` en `MatchDetailScreen`). **Si se agrega algo nuevo a esa
pantalla, hay que preguntarse si delata el resultado.**

**El aviso al juez estaba inflado.** `BattlesScreen` contaba
`matches where status='disputed'` **sin ningún filtro**: cada juez veía las
disputas de toda la plataforma, incluidas las de combates que él mismo estaba
jugando, donde `can_arbitrate` le devuelve `false` y no puede hacer nada. Ahora
el conteo y la bandeja salen de `arbitrable_match_ids()`, que filtra en el
servidor con la misma función que después acepta o rechaza el fallo. **Había que
arreglarlo antes de conectar notificaciones**, no después: ese conteo es el que
las va a disparar.

**El juez ya no llega a ciegas:** la pantalla del combate disputado le muestra
qué marcó cada uno, lado a lado, y el motivo que escribió quien disputó
(`disputed_by`, `dispute_reason`).

**De paso se cerraron dos escrituras directas** que ya no hacían falta:
`matches_update_report_by_participant` (0007) dejaba a un participante escribir
`score_a=9, winner_id=él mismo` con un UPDATE crudo y saltarse
`report_match_result` entera — sin rounds, sin validar `points_to_win` y sin la
regla de que el Aerial no vale en ranking. Y `matches_update_dispute` quedó
reemplazada por `dispute_match()`, que además registra quién, cuándo y por qué.

**Sin probar con datos reales.** Verificado: typecheck limpio con el código de
salida real, y el bundle compila.

### ✅ 0025 — todo resultado lo aprueba un juez, y jueces por liga/torneo (2026-08-14)

**Cambio de regla del cliente que revierte una decisión anterior.** Estaba
cerrado como "arbitraje por excepción" (si los dos coinciden, no hace falta
juez). Ahora: **ningún resultado queda firme sin que un juez lo apruebe**,
coincidan o no.

**La doble marca de 0024 no se tiró: cambió de papel.** Dejó de ser el mecanismo
que cerraba el combate y pasó a ser la EVIDENCIA con la que el juez decide. Si
los dos marcaron igual, el panel se lo dice y aprobar es un toque.

**El costo, que conviene tener presente:** en una noche con 30 combates hay 30
aprobaciones en cola, y el ELO de todos se queda quieto hasta que alguien las
atienda. Por eso `approve_match_result` es deliberadamente barata — no pide
motivo ni reescribir el marcador. Para CAMBIAR un resultado sigue estando
`resolve_dispute`, que sí exige dejar escrito el porqué. **Si en la práctica la
cola se atasca, el lugar a mirar es este, no el reglamento.**

**Jueces asignables (`judge_assignments`).** Antes ser juez era global
(`players.judge_role`) o salía de ser moderador de la liga. Ahora se nombra
gente PARA una liga o PARA un torneo, que es como funciona un cuerpo arbitral
real: se convoca para el evento. `can_arbitrate` reconoce los cuatro caminos —
admin, juez global, juez asignado (liga o torneo), moderador de la liga — y
sigue rechazando que alguien arbitre su propio combate, nombramiento o no. De
paso ahora también rechaza a un jugador suspendido.

Pantalla nueva `JudgesScreen`, reutilizable: recibe `leagueId` o `tournamentId`.
Se llega desde el detalle de liga y desde el detalle de torneo. **Ojo con la
navegación:** `TournamentDetail` está registrada en DOS pilas (Inicio y
Batallas), así que `Judges` tuvo que registrarse en las dos — es exactamente la
trampa de los 10 enlaces muertos documentada arriba.

**Los jugadores ya no confirman.** `confirm_match_result` se dejó viva pero
lanzando una excepción con un mensaje entendible, en vez de revocarle el
permiso: si queda un APK viejo instalado, su botón da un mensaje que se lee en
lugar de un "permission denied". Lo reemplazan `accept_reported_result` (B se da
por convencido tras ver la diferencia, sin cerrar nada) y `approve_match_result`
(el juez cierra).

**La bandeja dejó de ser solo de disputas.** Ahora cae ahí todo lo reportado,
etiquetado de un vistazo: EN DISPUTA / NO COINCIDEN / COINCIDEN / FALTA LA 2ª
MARCA, con lo trabado primero. El tratamiento de héroe solo se aplica si lo
primero de verdad está trabado — destacar algo que solo hay que aprobar le
inventaría urgencia.

**Sin probar con datos reales.** Verificado: typecheck limpio con el código de
salida real, el bundle compila y la app monta sin errores de consola.

### ✅ 0026 — modalidad Casual / Ranking en el torneo (CORRIDA 2026-08-14)

El reglamento (sección "Modalidades de juego y competición") define dos
modalidades que no son un matiz, son reglas distintas: **Casual (Arcade)** —al
azar entre los presentes, Aerial vale, "sin presión de ranking"— y **Ranking
(Estructura de Temporada)** —bracket por ELO, sin Aerial, alimenta el ranking.

Lo que ya existía y NO había que tocar: la marca `matches.mode` (desde 0020), la
validación del Aerial por modo en `report_match_result`, y el cliente ofreciendo
el finish Aerial solo en casual (`finishesFor`). **El único hueco era que nadie
escribía `mode='casual'`, y que el cierre del combate no lo miraba.**

Lo que quedó:

- **`tournaments.mode`** (`ranking`/`casual`, default `ranking`). Se elige al
  crear el torneo (`TournamentsScreen`) y baja a cada combate que genera el
  bracket (`src/lib/bracket.ts`). Columna nueva propia en vez de reusar `format`
  (texto libre sin usar), para que el valor esté acotado igual que en `matches`.
- **`apply_match_confirmation` consciente del modo.** En casual el delta de ELO
  es 0 y no se inserta punto en `ranking_snapshots` (la curva). Todo lo demás se
  registra igual que ranking.
- **Bracket casual al azar.** `buildPairs` baraja (Fisher-Yates) en vez de sembrar
  por ELO, y el bye también sale al azar. Ranking sigue exactamente igual.
- **UI:** selector de modalidad en crear-torneo, y el detalle del torneo muestra
  la modalidad con la nota "al azar · Aerial · no mueve el ELO".

**Decisión de diseño (opción 1, confirmada por el cliente 2026-08-14):** un
combate casual registra el resultado ENTERO —marcador, rounds, finishes,
estadísticas por combo, rivalidad, logros y `matches_played`— y lo único que NO
hace es mover el rating de ELO ni su curva. Farid lo cerró explícito: **"ELO no
sube, matches_played sí sube".** Efecto lateral aceptado: como `matches_played`
sube, quien juegue ≥10 casuales antes de su primer ranked entra con K=24 en vez
de 40 (su primer ranked mueve un poco menos). Se decidió que está bien.

**Sin probar con datos reales.** Verificado: typecheck limpio con el código de
salida real, el bundle compila (757 módulos) y la app monta sin errores de consola.

### ✅ 0027 — los retos "Find a Battle" son casual (CORRIDA 2026-08-14)

Decisión del cliente (2026-08-14): un reto directo 1-a-1 no debe mover el ELO.
`accept_challenge` ahora fija `mode='casual'` en el match que crea, así que el
reto se registra entero (incluido `matches_played`) pero deja el rating quieto,
y de paso admite Aerial. Es la misma función de 0013 con ese único cambio. No
toca la UI: `MatchDetailScreen` ya lee `match.mode` y se adapta solo.

### ✅ 0028 — reglas de ronda: puntuación SIN contacto válido (CORRIDA 2026-08-14)

El reglamento (sección "Puntuación") dice que no toda salida da puntos: hace
falta **contacto válido** (ambos Beys tocaron el suelo y hubo colisión). Sin él:
lanzamiento nulo → advertencia y se repite; 2ª falla consecutiva → 1 punto al
rival; self-over/xtreme sin tocar al rival → NO valen 2/3, se tratan como error
de lanzamiento; empate → se repite la ronda.

El modelo anterior no podía representar nada de esto: toda ronda era un finish
con ganador y 1-3 puntos. Se agregan **dos resultados de ronda** en
`match_rounds.finish_type` (la columna `winner_id` ya era nullable desde 0001,
no cambia el esquema):

- **`launch_fail`** → 1 punto al jugador anotado (el rival del que falló). Cubre
  la 2ª falla consecutiva y el self-over reincidente.
- **`void`** → 0 puntos, sin ganador; la ronda se repite. Cubre el empate y el
  1er lanzamiento nulo. Se guarda como constancia; no cuenta para el objetivo.

`finish_points` y `report_match_result` (migración 0028) los reconocen; una ronda
`void` se inserta sin ganador y no suma. En la UI (`MatchDetailScreen`) hay una
sección nueva "Sin contacto válido" con los dos resultados, y el picker de
ganador se desactiva cuando eliges empate. `finishTypes.ts` expone
`NO_CONTACT_OUTCOMES` y un tipo `OutcomeCode`.

**Decisión de alcance:** la app registra el resultado (void o punto), NO lleva el
conteo de reincidencia "1ª vs 2ª falla" — eso lo decide el juez/los jugadores en
la mesa, igual que el resto del reporte round a round. Y las advertencias/empates
que se repiten se pueden registrar (`void`) o simplemente no anotarse; la ronda
que resuelve es la que cuenta.

**Sin probar con datos reales.** Verificado: typecheck limpio con el código de
salida real, el bundle compila (756 módulos) y la app monta sin errores de consola.

### ✅ Formatos de torneo y rediseño visual (2026-08-15)

**Migraciones 0032–0035, TODAS CORRIDAS Y VERIFICADAS** (por Management API, ver abajo).

- **0032** — administrador: conviven `dmlbeybladereynosa@gmail.com` (cuenta del cliente) y la de desarrollo. **La del cliente todavía NO existe**: cero registros en `auth.users`. La migración es re-ejecutable; correrla otra vez cuando el cliente cree su cuenta.
- **0033** — `tournament_phases`, y en `tournaments`: `combat_mode`, `deck_order`, `swiss_tiebreak`, `photo_url`. En `matches`: `phase_id`, `block_number`, `bracket_side`. Los torneos viejos recibieron una fase de eliminación simple para no quedarse sin estructura.
- **0034** — `leagues.photo_url` y bucket `covers` (rutas por tipo: `league/`, `tournament/`…). Las portadas de torneo estaban yendo al bucket `venues` por reaprovechar código.
- **0035** — `starts_at`, `venue_id`, `capacity` (NULL = sin límite), `registration_closes_at`, `level`, `prize`; más `register_for_tournament` y `create_venue_quick`.

**Motor de emparejamiento (`src/lib/formats.ts`)** — funciones PURAS, sin base ni red: todos contra todos, grupos, suizo, eliminación simple y doble, siembra, byes y top cut. **`npm run test:formats` corre 58 comprobaciones**, incluidas simulaciones de torneos completos de doble eliminación de 4 a 16 jugadores. **Correrlo antes de tocar ese archivo.** La simulación encontró un fallo que la lectura no veía: en doble eliminación el finalista de arriba desaparecía mientras abajo seguían jugando.

Suizo con los DOS desempates que pidió el cliente: `dml` (diferencia de puntos → enfrentamiento directo) y `opponents` (fuerza de rivales, Buchholz/OMW%).

**`src/lib/formatsRepo.ts`** conecta el motor con la base. El estado de la doble eliminación se DEDUCE de las derrotas, no se guarda: un estado guardado se desincroniza en cuanto un juez corrige un resultado. Solo cuentan los resultados confirmados.

**Decisiones del cliente ya cerradas (2026-08-15):**
- Ranking local: **victorias primero**, puntos como desempate. Los VP (Challenger 5, Diamante/Platino 4, Oro/Plata 3, Bronce/Hierro 2, Porcelana 1) son **solo del interclubes**, no de la tabla local. ⚠️ 0030 construyó los VP como si fueran la tabla local: **hay que partirlo en dos**.
- **Ciudades/interclubes: van ahora**, ya existen ligas en otras ciudades.
- Formatos: deben cubrir 1v1, 3v3, 5G, stock, eliminación simple y doble, suizo con top cut. Armador guiado.
- **Cupo real** (bloquea al llenarse) con opción sin límite. **Sede desde las locaciones existentes**, con opción de crear una nueva que queda guardada en Locaciones.
- **Regla visual permanente:** todo lo que se crea (ligas, torneos, eventos, clubes) lleva portada. "Solo cuando suma y no resta": nada decorativo que empuje el contenido útil.

**Pantallas rehechas y aprobadas por Farid:** detalle de liga (portada a sangre, escudo, podio top 3, color propio por liga), lobby de ligas (tarjeta horizontal con escudo), ranking de liga (mismo modelo que el ranking general). Cada liga usa **su** color, derivado de su id vía `coverAccent()` — el mismo de su portada dibujada.

Dos errores que solo aparecieron al probar con nombres reales: el escudo daba "LIG" para "Liga CML Central" (la palabra "liga" la llevan todas), y "CML Central" y "CML Norte" daban el mismo escudo. Ahora son dos renglones (`src/lib/emblem.ts`). Y las fechas SIN hora (`2026-05-14`) se leían como UTC y en México retrocedían un día.

### ✅ Lobby de torneos, detalle con pestañas y avance de fases — CONSTRUIDO (commit `59cad88`, 2026-08-15)

Los tres primeros puntos de "LO QUE SIGUE" ya están hechos y aprobados contra los
mockups. Se construyó en otra sesión que se quedó sin créditos antes de pushear;
esta sesión (2026-08-15) lo verificó y publicó.

- **Lobby de torneos (`TournamentsScreen`)** — filtros TODOS/ABIERTOS/COMPLETADOS,
  tarjeta héroe con portada, cuenta regresiva ("FALTAN 12 DÍAS"), barra de cierre
  de inscripciones, filtro "MÍOS", lista con escudo hexagonal (`emblem.ts`),
  campeón con ELO en los terminados y banner "¿Organizas torneos?". El orden lo
  manda la relevancia (abierto y próximo primero), y el tratamiento de héroe solo
  se aplica si lo primero DE VERDAD es lo más relevante.
- **Detalle de torneo (`TournamentDetailScreen`)** — pestañas
  RESUMEN/JUGADORES/BRACKET/INFORMACIÓN sobre una sola cabecera. Check-in propio y
  QR del organizador, "TU POSICIÓN" e inscritos por ELO, tarjeta de premio,
  "tu siguiente combate", campeón, y el enlace al cuerpo de jueces.
- **Avance de fases** — `generatePhaseRound()` (antes sin usar) está cableado en
  `advance()`: el organizador genera la primera ronda con los que hicieron
  check-in y cada ronda siguiente, con la tabla por fase, byes, gran final y el
  bloqueo "faltan N resultados por aprobar". Reconoce round robin, grupos, suizo,
  eliminación simple y doble. **Ya se puede jugar un torneo de punta a punta.**
- El viejo `src/lib/bracket.ts` y `BracketScreen.tsx` se borraron (los reemplaza
  el motor `formats.ts` + `formatsRepo.ts`). `when.ts` centraliza fechas.

**Verificado (2026-08-15):** typecheck limpio con código de salida real, `npm run
test:formats` 58/58, el bundle compila y sirve sin errores de consola, y las
pantallas reproducen los mockups elemento por elemento. **Sin probar con sesión
iniciada** (los jugadores demo tienen `auth_user_id` nulo): el flujo completo
desde la UI logueada sigue pendiente de la fase de QA.

### ✅ El hub de Batallas usa los lobbies ricos (commit `063ba08`, 2026-08-15)

**El bug que reportó Farid:** las sub-pestañas **Batallas → Torneos** y
**Batallas → Ligas** se veían "sin cambios" (tarjetas simples) aunque el resto de
la app sí. Causa: los lobbies ricos se habían construido como pantallas aparte
(`TournamentsScreen`, `LeaguesScreen`) a las que el hub NO llegaba —
`BattlesScreen` renderizaba sus propias listas viejas. No era caché ni deploy:
faltó conectar el hub con los diseños nuevos.

- **Componentes compartidos nuevos** (filosofía `src/ui/`, un solo lugar por
  entidad): `src/ui/LeagueCard.tsx` (escudo hexagonal, ADMIN/MODERADOR según
  **dueño real** vía `leagues.owner_player_id`, MiniStats miembros/torneos/tu
  posición) y `src/ui/tournamentCards.tsx` (`HeroCard`, `RowCard`, `byRelevance`,
  `attachChampions`). `LeaguesScreen` y `TournamentsScreen` se refactorizaron para
  consumirlos — dejaron de tener su copia local del markup.
- **Batallas → Torneos:** filtros TODOS/ABIERTOS/COMPLETADOS + HeroCard +
  RowCard, **global** (todos los torneos, con la liga como subtítulo), inscritos,
  cuenta regresiva y campeón en los terminados.
- **Batallas → Ligas:** `LeagueCard` con "Mis ligas" + Explorar y los stats
  calculados (posición sobre el rating global, decisión 7).

**Regla para lo que venga:** hay DOS alcances de estos lobbies —el del hub
(global) y el de pantalla propia (`TournamentsScreen` por-liga, `LeaguesScreen`
todas). Ambos comparten `LeagueCard`/`tournamentCards`: tocar la tarjeta en un
lado la cambia en los dos. Es a propósito.

**Verificado (2026-08-15):** typecheck limpio con código de salida real, el bundle
compila, producción sirve el bundle nuevo y la app monta sin errores de consola.
**Sin probar con sesión iniciada** (falta cuenta de prueba): el render logueado de
las dos sub-pestañas sigue pendiente de QA.

### ✅ Portadas de eventos y clubes (commit `4b0cba6`, migración 0036, 2026-08-15)

Cierra la regla visual "todo lo que se crea lleva portada". El bucket `covers` y
`cover.ts` ya soportaban `event`/`club`; faltaban la columna y el permiso.

- **0036** (CORRIDA vía Management API): `photo_url` en `events` y `clubs`, y
  **amplía la política del bucket `covers`**. Ojo: la de 0034 solo dejaba subir a
  admin/moderador de liga, pero **un club lo funda cualquiera (0018) y un evento
  abierto lo crea cualquiera (0016)** — así que se agregó, por ruta
  (`foldername(name)[1]`/`[2]`), que el **dueño del club** suba `club/<id>/…` y el
  **creador del evento** suba `event/<id>/…`.
- **`cover.ts` `changeCover(kind, table, id)`**: pick → upload → update, el flujo
  completo compartido por los 4 detalles (liga, torneo, evento, club).
- **EventDetail / ClubDetail:** banner de portada a sangre arriba + botón editar
  🖼️ para quien puede (creador/dueño/admin).
- **EventsScreen / ClubsScreen:** portada de fondo en la tarjeta héroe. **Las
  filas siguen con su glifo** (🏆/🌀/🛡️) a propósito: a tamaño chico una arena
  dibujada se ve confusa; el glifo lee mejor. La portada luce en el héroe y en el
  detalle. Es la lectura de "solo cuando suma y no resta".

Verificado: typecheck limpio, el bundle compila, producción sirve el bundle nuevo
y monta sin errores de consola. Sin probar con sesión iniciada (subir una foto
real necesita build/dispositivo y cuenta).

### ✅ Corte VP local vs. interclubes — PRIMERA MITAD (commit `dc0e505`, migración 0037, 2026-08-15)

Decisión del cliente (2026-08-15): la tabla local y los VP son **dos sistemas
distintos**. La 0030 había construido el VP como si fuera la tabla local
(`season_standings_ordered` ordenaba por `vp desc`).

- **0037** (CORRIDA y verificada): `season_standings_ordered` ahora ordena por
  **VICTORIAS** (`matches_won desc`), con diferencia de puntos como 1er
  desempate, luego enfrentamiento directo, antigüedad y alfabético. El
  enfrentamiento directo ahora empata por victorias+diferencia (antes por VP).
  Como todo lo que usa "1er lugar" (ascensos, títulos, divisiones) sale de
  `season_standings_ordered.place`, el nuevo orden se propaga solo.
- **Escala de VP corregida a 5/4/3/2/1** (Challenger 5, Diamante/Platino 4,
  Oro/Plata 3, Bronce/Hierro 2, Porcelana 1) en `categories.vp_value` y en
  `src/lib/categories.ts`. ⚠️ **Decisión que tomé:** la nota del cliente del
  15-ago da esta escala, distinta de la tabla textual del reglamento que puso la
  0030 (3/3/3/2/2/1/1/1). Cambiarla es un UPDATE.
- **LadderScreen:** el récord **G–P** es ahora la métrica principal a la vista;
  el VP pasó a secundario, etiquetado "VP interclubes". Texto explicativo al día.

**⚠️ Falta la SEGUNDA MITAD (el interclubes de verdad), señalada con el cliente:**
el **Ranking Unificado Interclubes** completo — VP acumulado **cruzando ligas y
ciudades** (hoy el VP sigue viviendo por-liga-temporada en `season_standings`),
con su propia pantalla y su periodo de ~6 meses. El cliente dijo "interclubes van
ahora", pero construirlo entero es ~18x y no confirmó alcance ni respondió las
preguntas; se hizo el corte local (lo claramente decidido, bajo riesgo) y esto
queda como el siguiente paso grande.

**Verificado:** typecheck limpio, la función desplegada ordena por `matches_won`
y ya no por `vp` (comprobado con `pg_get_functiondef`), el bundle compila y
producción monta sin errores. Sin datos de temporada sembrados, así que la tabla
con jugadores reales sigue sin probarse.

### ✅ Ranking Unificado Interclubes — SEGUNDA MITAD, CONSTRUIDO (commit `d61eaac`, migración 0038, 2026-08-15)

El VP dejó de ordenar la tabla local en 0037; aquí gana su lugar propio. El
cliente confirmó **escala 5/4/3/2/1** y **"ya hazlo"** al interclubes completo.

**Ahora hay cuatro medidas de posición, y conviene no confundirlas:**
| | ELO | Tabla local (0037) | Interclubes (0038) |
|---|---|---|---|
| Mide | habilidad | posición en 1 liga | VP unificados |
| Alcance | global | 1 liga/temporada | TODAS las ligas/ciudades |
| Ordena por | rating | victorias | VP |
| Reset | nunca | 3 meses (temporada) | ~6 meses (periodo) |

- **0038** (CORRIDA y verificada): `interclub_periods` (siempre uno vigente,
  índice único lo garantiza) + `interclub_standings` (VP global por jugador y
  periodo). `apply_vp_for_match` ahora acredita al periodo vigente **además** de
  la tabla local (un combate suma a las dos cuentas). `interclub_ranking_ordered
  (p_period_id default null→vigente)` ordena por VP → dif. puntos →
  enfrentamiento directo → antigüedad (`first_at`) → alfabético. `current_
  interclub_period()` y `reset_interclub_ranking(label)` (solo admin: cierra el
  vigente y abre otro; el histórico se conserva por periodo).
- **`InterclubScreen`**: periodo vigente, líder destacado, tu posición, tabla con
  récord G–P y VP. Se llega desde `RankingsScreen` (tarjeta 🏅, NO como scope de
  ELO — son sistemas distintos). Registrada en la pila de Rankings.

**Decisiones que tomé (ver cabecera de 0038):** el VP de un combate usa la
categoría del jugador en ESA liga; solo puntúan combates de ranking con
temporada; el periodo se reinicia a mano (como el cierre de temporada de 0031);
antigüedad = primer combate que puntuó en el periodo.

**Verificado:** `interclub_ranking_ordered` ordena por VP con datos reales de
prueba (insertados y limpiados), `apply_vp_for_match` ya escribe al interclubes
(`pg_get_functiondef`), periodo sembrado, typecheck limpio, bundle compila,
producción monta sin errores. **Sin datos de temporada reales**, así que el VP
acumulándose de combates de verdad sigue sin probarse punta a punta.

**LO QUE SIGUE:**
1. QA **desde la app, con dos cuentas**: crear el torneo de la temporada desde el escalafón → check-in → generar rondas por categoría → reportar → doble marca → aprobar como juez → ver moverse ELO, tabla local, VP e interclubes. La base ya está probada punta a punta (ver arriba); lo que falta es la interfaz con dedos de verdad, y **dos cuentas**, porque quien reporta no puede aprobar su propio resultado.
3. Lo que no puede cerrar un agente: **notificaciones push** y **date picker** (los dos exigen dependencia nativa + dev client, contra la decisión 2/9 de este documento), **OAuth de Google**, cuentas de tienda, íconos/capturas/política de privacidad.
4. ~~Paginación de listas~~ ✅ hecha (páginas de 12, ver arriba).

**Correr migraciones sin pegarlas a mano:** el `SUPABASE_ACCESS_TOKEN` del entorno es de OTRA cuenta y no ve este proyecto. Con un token de la cuenta `fzequera89` sí se puede, vía Management API:
`POST https://api.supabase.com/v1/projects/vgffwqmpiunxzmlfmtyo/database/query` con `{"query": "..."}`.
⚠️ **Con `curl`, no con Python**: el endpoint responde 403 de Cloudflare al agente de urllib.

## Cómo retomar el proyecto (checklist para una sesión nueva)

1. `git clone` / `git pull` del repo.
2. Copiar `.env.example` a `.env` y llenar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Settings → API del proyecto "CML Beyblade").
3. Confirmar que todas las migraciones en `supabase/migrations/` (0001 a la más reciente) ya corrieron en el SQL Editor de Supabase, en orden. **0005 debe correr sola**, aparte de las demás (ver el comentario en ese archivo). Las demás pueden ir seguidas. **Al 2026-08-15 las 0001–0045 están corridas y verificadas contra la base** (0036 = portadas de eventos y clubes; 0037 = tabla local por victorias + escala VP 5/4/3/2/1; 0038 = Ranking Unificado Interclubes) — si se agrega una nueva, actualizar esta línea.
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
- ~~Avatar de perfil~~ ✅ hecho: `EditProfileScreen` sube foto a Storage y guarda `players.avatar_url`.
- Sin notificaciones push todavía (estaban en el stack acordado: FCM/Expo Push).
- Sin paginación en listas: hoy todo carga completo. A escala de liga regional aguanta; con miles de matches habría que paginar.

**Publicación (requiere al cliente, no al desarrollador):**
- Cuenta de Google Play (~$25 único) y de Apple (~$99/año).
- Configurar el cliente OAuth de Google en Supabase para que "Continuar con Google" funcione en producción.
- ~~Cambiar `is_admin` al correo real del cliente~~ ✅ hecho en 0045.
- Íconos, splash, capturas, textos de ficha y política de privacidad.
