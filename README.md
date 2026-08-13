# Beyblade League App

App de gestión de liga competitiva de Beyblade: torneos con bracket, ranking ELO real, descubrimiento físico de jugadores y venues, estadísticas de combate, gamificación, eventos y capa social.

React Native + Expo (Android e iOS desde una sola base de código) con Supabase de backend.

| | |
|---|---|
| **Repo** | https://github.com/fzequera89/beyblade-app |
| **Backend** | Supabase, proyecto "CML Beyblade" (`vgffwqmpiunxzmlfmtyo`) |
| **Estado** | Todas las fases de producto completas (~89% del roadmap). Falta QA con datos reales y publicación en tiendas. |

## Documentación

| Documento | Para qué |
|---|---|
| **README.md** (este) | Qué es, cómo correrlo, arquitectura y modelo de seguridad |
| [`PROGRESS.md`](PROGRESS.md) | Estado del proyecto, decisiones de diseño, pendientes y checklist para retomar |
| [`docs/database.md`](docs/database.md) | Referencia completa del esquema, políticas RLS y funciones de base |
| [`docs/elo-rules.md`](docs/elo-rules.md) | Sistema ELO: fórmulas, K-Factor y reglas de implementación |

## Arrancar el proyecto

```bash
npm install
```

Copia `.env.example` a `.env` y llénalo con las credenciales de Supabase (Settings → API del proyecto "CML Beyblade"):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

`.env` está fuera de git a propósito.

Verifica que las 18 migraciones de `supabase/migrations/` ya corrieron en el SQL Editor, **en orden**. La `0005` debe correr sola, aparte de las demás (lleva un `ALTER TYPE ... ADD VALUE`, que no puede usarse en la misma transacción que después referencia ese valor). Las otras 17 pueden ir seguidas.

```bash
npm run web
```

Abre el preview en el navegador, que es la forma rápida de verificar cambios de UI. **No requiere emulador de Android.**

Lo único que el preview web no puede probar es la cámara: el escaneo de QR para check-in necesita un build real.

## Stack

- **React Native 0.86 + Expo 57** — Android e iOS sin escribir dos apps
- **React Navigation** (native stack)
- **Supabase** — Postgres, Auth, RLS
- **react-native-svg** — QR de check-in y gráfica de evolución de ELO
- **TypeScript**

**Sin dependencias nativas fuera de lo que trae Expo.** Es una restricción deliberada: cualquier módulo nativo extra obligaría a un dev client y complicaría el build. Por eso no hay mapa (MapLibre), ni date picker nativo, ni selector de imágenes.

## Estructura

```
src/
  components/      Screen (safe area) y EloChart
  context/         AuthContext: sesión, playerId, is_admin
  lib/             Cliente de Supabase, bracket, y catálogos
                   (badges, tipos de finish, tipos de evento)
  navigation/      RootNavigator: stack único con 3 estados
                   (sin sesión / sin perfil / app completa)
  screens/         34 pantallas
supabase/
  migrations/      18 migraciones en orden, comentadas
  seed/            demo_data.sql — datos de demostración
docs/              Referencia de base de datos y reglas de ELO
```

## Qué hace la app

**Liga y torneos.** Ligas con temporadas y roles (miembro / moderador). Torneos con registro, check-in y bracket de eliminación directa con seeding por ELO. Panel de organizador con check-in masivo y reporte de liga.

**Resultados y ELO.** Los matches se reportan **round a round**: quién ganó cada round y con qué tipo de finish (spin, over, burst, xtreme). El marcador se deriva de los rounds. El rival contrario o un moderador confirma, y solo entonces se recalcula el ELO. Hay disputa y reapertura.

**Descubrimiento físico.** Venues con QR de check-in, "quién está jugando aquí" (últimas 4 horas), toggle de "buscando jugar" con expiración, y retos directos entre jugadores.

**Estadísticas y gamificación.** Win rate, racha actual y mejor racha, desglose de cómo gana sus rounds, rendimiento por combo, gráfica de evolución de ELO, rivalidades head-to-head y 14 logros que se otorgan solos.

**Eventos y social.** Agenda de eventos con confirmación de asistencia, perfiles públicos, seguir jugadores, feed de actividad y clubes con roster.

**League Passport.** La trayectoria completa de un jugador en una vista: ligas con su posición, torneos, clubes, logros, venues visitados, récord y rivales.

## Modelo de seguridad

Todo pasa por **Row Level Security**. Cada tabla tiene RLS activado desde la migración `0002` y sus políticas se agregaron por capas conforme se construyó cada feature. `docs/database.md` tiene el mapa completo.

Dos reglas que vale la pena entender antes de tocar el código:

**Las escrituras sensibles no tienen política de INSERT/UPDATE.** Pasan exclusivamente por funciones `SECURITY DEFINER` que validan permisos internamente: `report_match_result`, `confirm_match_result`, `accept_challenge`, `award_badges`. Nadie puede inventar rounds, moverse el ELO ni auto-asignarse un logro con un insert directo, aunque tenga la anon key.

**El rol de administrador de plataforma** (`players.is_admin`) es el dueño de la organización: solo él crea ligas y nombra moderadores. El rol `organizer` en la base se muestra como "Moderador de liga" en la app.

## Datos de demostración

`supabase/seed/demo_data.sql` llena la liga para enseñar la app: 16 jugadores, 2 ligas, 2 clubes, 3 venues, un torneo terminado con bracket de 8, otro con inscripciones abiertas, 5 eventos y ~67 matches confirmados. De ahí salen solos el ranking, las estadísticas, las rivalidades y los logros.

```sql
-- Pegar el archivo en el SQL Editor y ejecutarlo crea las funciones.
select seed_demo_data();    -- sembrar
select remove_demo_data();  -- borrar antes de ir a producción
```

Todo lo de demo usa UUIDs que empiezan con `dddddddd` y el borrado toca exactamente esos ids, así que no afecta cuentas ni partidas reales. Los jugadores de demo tienen `auth_user_id` nulo: nadie puede iniciar sesión como ellos.

## Build real

```bash
npx eas-cli build --platform android --profile preview --non-interactive
```

Requiere `eas login` hecho en la máquina, con la cuenta `fzequera89` (login con email y contraseña — esa cuenta no tiene Google).

Los builds se acumulan a propósito: se generan cada varias fases, no en cada cambio.

## Lo que falta

Ver el detalle en [`PROGRESS.md`](PROGRESS.md). En resumen: QA con datos reales (hacen falta **dos cuentas**, porque quien reporta un resultado no puede confirmarlo), configurar el cliente OAuth de Google en Supabase, cambiar `is_admin` al correo real del cliente, y las cuentas de Google Play y Apple para publicar.
