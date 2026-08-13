# Referencia de base de datos

Esquema, políticas RLS y funciones del proyecto Supabase "CML Beyblade".

El historial vive en `supabase/migrations/`, archivo por archivo y comentado. Este documento es la vista consolidada: qué existe hoy y por qué está así.

## Principios

**RLS por capas.** Todas las tablas tienen Row Level Security activado desde la migración `0002`, que no define ninguna política — o sea, por defecto todo queda cerrado. Las políticas se fueron agregando conforme se construyó cada feature. Una tabla sin políticas no es un descuido: es una tabla que todavía no se usa.

**Escrituras sensibles solo por función.** Las operaciones que podrían falsificarse no tienen política de INSERT/UPDATE. Pasan por funciones `SECURITY DEFINER` que validan permisos internamente. Sin esto, cualquiera con la anon key podría moverse el ELO o regalarse logros.

**Lectura generalmente abierta a autenticados.** Rankings, perfiles, rosters y resultados son públicos dentro de la app. Las excepciones son los retos (`challenges`), visibles solo para los dos involucrados.

## Tablas

### Jugadores e identidad

**`players`** — Un jugador de la liga.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `auth_user_id` | uuid único → `auth.users` | **Nulo** si lo registró un admin a mano o si es dato de demo |
| `display_name`, `city`, `country`, `birth_date` | | |
| `main_beyblade`, `play_style` | text | |
| `elo_rating` | `numeric(8,2)` | Con decimales a propósito: redondear en cada match acumularía error de arrastre |
| `matches_played` | int | Determina el K-Factor del jugador |
| `is_admin` | boolean | Administrador de plataforma (migración `0008`) |
| `avatar_url` | text | Existe en el esquema, **no implementado en la app** |

RLS: lectura para cualquier autenticado. Escritura solo sobre el propio registro (`auth_user_id = auth.uid()`), más un insert extra para que el admin registre jugadores sin cuenta.

### Ligas

**`leagues`** — `owner_player_id` es el dueño. **Solo el admin crea ligas** (`0008` reemplazó la política original que dejaba crear a cualquiera).

**`league_members`** — PK compuesta `(league_id, player_id)`, con `role` del enum `member_role` (`member` | `organizer`). El `organizer` se muestra en la app como "Moderador de liga".

Un jugador solo puede insertarse a sí mismo y **siempre como `member`**; ascender a organizador es un UPDATE que solo puede hacer un organizador existente de esa liga o el admin. Sin esa separación, cualquiera se auto-nombraría moderador con un insert directo.

**`seasons`** — Temporadas de una liga. Las crea un organizador.

### Torneos

**`tournaments`** — Los crea un organizador de la liga. `status` es texto libre (`pending`, `completed`).

**`tournament_registrations`** — PK `(tournament_id, player_id)`. `checked_in_at` nulo significa registrado pero sin presentarse. Un jugador se registra solo; el organizador también puede hacer check-in masivo.

**`bracket_byes`** — Quién pasó de ronda sin jugar, cuando el número de participantes es impar.

### Matches

**`matches`** — El centro del sistema.

| Columna | Nota |
|---|---|
| `player_a_id`, `player_b_id` | **Sin `on delete cascade`** — borrar un jugador con matches falla |
| `combo_a_id`, `combo_b_id` | Con qué combo jugó cada quien |
| `score_a`, `score_b` | Se **derivan de los rounds**, no se capturan directo |
| `status` | Enum `match_status`: `pending` → `reported` → `confirmed`, con desvío a `disputed` |
| `elo_a_before`, `elo_b_before`, `elo_a_change`, `elo_b_change` | Foto del cálculo, para poder auditarlo después |
| `bracket_round` | Nulo en matches casuales |

**`match_rounds`** — Un renglón por round: `round_number`, `winner_id`, `finish_type` (`spin` | `over` | `burst` | `xtreme`).

`finish_type` es texto validado en la función, **no un enum**. Es deliberado: un enum obligaría a un `ALTER TYPE ... ADD VALUE` para agregar un tipo nuevo, y eso arrastra el problema de la migración `0005` (no puede correr en la misma transacción que después lo usa). Con texto validado, agregar un finish es un simple `CREATE OR REPLACE` de la función.

Lectura pública. **Sin política de escritura**: solo escribe `report_match_result`, para que el marcador y los rounds no puedan quedar en desacuerdo.

### Estadísticas derivadas

**`rivalries`** — Récord head-to-head. La pareja se guarda **normalizada, con el uuid menor primero**, para que exista una sola fila por par sin importar quién fue A o B en cada match. Al leerla hay que resolver de qué lado quedó el jugador.

`last_match_id` apunta a `matches` **sin cascade** — hay que borrar rivalidades antes que matches.

**`ranking_snapshots`** — Un punto por jugador cada vez que confirma un match. Alimenta la gráfica de evolución de ELO. `scope` es enum (`global` | `league` | `season` | `club`); hoy solo se escribe `global`.

> **Decisión de producto:** existe **un solo rating global** por jugador. Las vistas "por liga" o "por temporada" son filtros de lectura sobre ese mismo rating, no ratings independientes. Está pendiente confirmarlo con el cliente, pero cambiarlo después no toca el cálculo del ELO.

**`combos`** — Los combos de cada jugador. `parts` es jsonb con `blade`, `ratchet` y `bit`. Cada quien administra los suyos; todos los pueden leer, porque hacen falta para mostrar con qué se ganó un match.

### Gamificación

**`badges`** — Catálogo de 14 logros. `code` es la llave estable que usa la lógica; nombre y descripción son texto de UI editables sin tocar código. Los íconos son emoji **del lado del cliente** (`src/lib/badges.ts`), para no depender de Storage.

**`player_badges`** — PK `(player_id, badge_id)`, así que otorgar dos veces no duplica. Solo lectura por política: los otorga `award_badges`.

Los 14: primera victoria, 10 y 50 matches, rachas de 3/5/10, ELO 1100/1200/1300, mata gigantes (ganarle a alguien con +100 de ELO), impecable (3-0), xtreme finish, 10 burst finishes, y némesis (5 encuentros con el mismo rival).

### Presencia física

**`venues`** — Lugares. `qr_code` es único y es lo que se escanea. Los crea el admin o cualquier moderador de liga.

**`check_ins`** — Quién llegó a dónde y cuándo. Alimenta "Who's Playing Here" (últimas 4 horas).

**`presence`** — Toggle de "buscando jugar" con `expires_at` (30 min / 1 h / todo el día). Enum `presence_status`, hoy solo `looking_to_play`.

> **Decisión de alcance:** no hay geolocalización real ni mapa. El filtrado es por ciudad del jugador. Un mapa (MapLibre) es una integración nativa pesada que obligaría a un dev client.

**`challenges`** — Retos directos. `status` es texto con CHECK (`pending` | `accepted` | `declined` | `cancelled`). **Visible solo para los dos involucrados** — la única tabla con lectura restringida.

Aceptar un reto no inserta en `matches` directamente: lo hace `accept_challenge`, para no tener que abrir un permiso amplio de insert sobre matches.

### Eventos y social

**`events`** — Enum `event_type`: torneo, noche de liga, juego libre, práctica, quedada, batalla de clubes, día de novatos.

Quién puede crearlos:
- **Eventos de liga** (`league_id` no nulo): solo el admin o un moderador de esa liga. Son oficiales.
- **Eventos abiertos** (`league_id` nulo): cualquier jugador. Son las quedadas casuales; cerrarlas a moderadores vaciaría medio módulo.

En ambos casos `created_by` tiene que ser uno mismo.

**`event_rsvps`** — Lista de asistentes, pública. Cada quien se apunta y se borra solo.

**`clubs`** — El equipo con el que un jugador se identifica. A diferencia de una liga, **cualquiera funda un club**. El fundador entra al roster automáticamente por trigger.

**`club_members`** — Roster. Se ordena por ELO en la app, que funciona como ranking interno del club.

**`follows`** — PK `(follower_id, followee_id)` con CHECK de no seguirse a uno mismo. El insert está restringido a seguir en nombre propio; sin eso, cualquiera inflaría seguidores ajenos. El seguido también puede borrar la fila, que equivale a quitarse un seguidor.

### Sin usar todavía

`event_rsvps` y `clubs` ya se usan. Quedan en el esquema desde `0001` pero **sin implementar en la app**: `players.avatar_url` (pospuesto a propósito) y el resto de valores del enum `ranking_scope`.

## Funciones

| Función | Migración | Qué hace |
|---|---|---|
| `set_league_owner_as_organizer` | `0004` | Trigger: al crear una liga, el dueño entra como organizador |
| `confirm_match_result` | `0007`, ampliada en `0015` | Confirma un resultado y corre **todo** el cálculo de ELO |
| `accept_challenge` | `0013` | Acepta un reto y crea el match, atómicamente |
| `report_match_result` | `0014` | Registra el match round a round |
| `clear_rounds_on_reopen` | `0014` | Trigger: borra los rounds si un match se reabre |
| `grant_badge` | `0015` | Otorga un logro, ignorando si ya lo tenía |
| `award_badges` | `0015` | Evalúa los 14 logros de un jugador |
| `set_club_owner_as_member` | `0018` | Trigger: el fundador entra al roster de su club |

### `report_match_result(p_match_id, p_rounds, p_combo_id)`

Valida que quien llama sea participante y que el match siga en `pending`. Recibe los rounds como jsonb (`[{winner_id, finish_type}, ...]`), valida cada uno, **deriva el marcador de ellos**, rechaza empates, y guarda el combo de quien reporta en el lado que le toca.

Borra los rounds previos antes de insertar, para que re-reportar tras una disputa quede limpio.

### `confirm_match_result(p_match_id)`

El corazón del sistema. Solo la puede llamar el participante contrario (nunca quien reportó) o un organizador de la liga. En una sola transacción:

1. Calcula el ELO con las fórmulas de [`elo-rules.md`](elo-rules.md) — **K-Factor por jugador**, según la experiencia de cada quien, así que un novato contra un veterano no tiene intercambio de suma cero
2. Guarda la foto del cálculo en el match
3. Actualiza `elo_rating` y `matches_played` de ambos
4. Inserta dos `ranking_snapshots`
5. Suma la rivalidad, con la pareja normalizada
6. Llama a `award_badges` para los dos

### `award_badges(p_player_id, p_match_id)`

Evalúa los 14 logros. Es **idempotente**: se puede llamar las veces que sea sin duplicar. No depende de `auth.uid()`, lo que permite reutilizarla desde el script de seed.

La racha se calcula contando hacia atrás desde el match más reciente hasta la primera derrota.

## Orden de borrado

Estas llaves foráneas **no tienen cascade**, así que el orden importa al borrar:

```
rivalries, challenges  →  antes que matches (apuntan a match ids)
matches                →  antes que players y combos
tournaments            →  antes que events
events, clubs, leagues →  antes que players (apuntan a player ids)
```

`supabase/seed/demo_data.sql` tiene el orden completo y correcto en `remove_demo_data()`.

## Migraciones

Correr **en orden**. La `0005` debe correr sola: lleva un `ALTER TYPE ... ADD VALUE` que no puede usarse en la misma transacción que después referencia ese valor.

| # | Qué resuelve |
|---|---|
| `0001` | Esquema base completo |
| `0002` | Activa RLS en todo (sin políticas: cierra todo por defecto) |
| `0003` | Perfil de jugador |
| `0004` | Ligas, temporadas y roles |
| `0005` | Agrega `pending` al enum de status — **correr sola** |
| `0006` | Torneos y bracket |
| `0007` | Reporte, confirmación y cálculo de ELO |
| `0008` | Rol de administrador de plataforma |
| `0009` | El admin registra jugadores sin cuenta |
| `0010` | Venues |
| `0011` | Check-ins |
| `0012` | Presencia |
| `0013` | Retos |
| `0014` | Rounds, finish types y combos |
| `0015` | Catálogo de logros y otorgamiento |
| `0016` | Eventos y asistencia |
| `0017` | Seguir jugadores |
| `0018` | Clubes |
