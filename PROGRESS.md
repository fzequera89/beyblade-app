# Beyblade League App — Estado del proyecto

> Última actualización: 2026-08-12. Este archivo es la fuente de verdad para retomar el proyecto desde cualquier máquina/sesión — está versionado en git, a diferencia de las notas de memoria de Claude Code (que solo viven localmente en la PC donde se desarrolló).

## Resumen

App de gestión de liga de Beyblade: torneos, brackets, ELO real, descubrimiento físico de jugadores/venues. React Native + Expo, backend Supabase.

- Repo: https://github.com/fzequera89/beyblade-app
- Supabase: proyecto "CML Beyblade" (ref `vgffwqmpiunxzmlfmtyo`), cuenta `fzequera89`
- EAS/Expo: cuenta `fzequera89` (login con email+contraseña, no con Google — esa cuenta no tiene password)
- Documento fuente de la propuesta original: `docs/elo-rules.md` (reglas de ELO, con correcciones) y la propuesta de producto (fuera del repo, en el escritorio de Farid)

## Progreso: ~53% del roadmap total

| Fase | % | Estado |
|---|---|---|
| Fase 0 — Fundamentos | 5% | ✅ Completa |
| Fase 1 — MVP liga digitalizada (M1-M5, M12) | 30% | ✅ Completa |
| Fase 2 — Descubrimiento físico (M6, M7) | 18% | ✅ Completa |
| Fase 3 — Estadísticas y gamificación (M9, M10) | 14% | ⬜ Pendiente |
| Fase 4 — Eventos y capa social (M8, M11) | 13% | ⬜ Pendiente |
| Fase 5 — Multi-liga y League Passport | 9% | ⬜ Pendiente |
| QA, pulido y publicación en tiendas | 11% | ⬜ Pendiente |

## Qué existe hoy (funcional)

**Auth y perfil (1.1):** login email/password + Google OAuth (falta configurar el cliente OAuth de Google en Supabase/Google Cloud — sin eso el botón de Google no funciona en build real). Perfil editable, historial de matches.

**Ligas y temporadas (1.2):** crear liga (solo admin, ver abajo), unirse como miembro, temporadas.

**Torneos y bracket (1.3):** registro, check-in, generación de bracket ronda 1 con seeding por ELO. **Simplificación de MVP:** cada ronda se re-empareja por ELO actual (no posiciones fijas de bracket oficial) — ver `src/lib/bracket.ts`.

**Resultado y ELO (1.4):** reportar resultado (score 3-0/3-1/3-2), confirmación por el rival contrario o moderador, cálculo de ELO real vía función atómica `confirm_match_result` en Postgres, disputa/reapertura, avance automático de ronda de bracket.

**Panel de organizador (1.5):** check-in masivo, ranking/reporte por liga.

**Rol de administrador de plataforma** (agregado fuera del roadmap original, a petición del cliente): columna `players.is_admin`. Solo el admin crea ligas y nombra/quita moderadores de liga (antes cualquiera podía crear ligas). Admin actual: `farid.zeqvil89@gmail.com` — **cambiar al correo real del cliente cuando se defina**. Panel de administrador: stats globales, gestión de jugadores (incluye registrar jugadores manualmente sin cuenta, útil para gente sin la app todavía), ranking global.

**Venues y check-in físico (2.1, 2.2, 2.3):** alta de venues, QR de check-in (generar con `react-native-qrcode-svg`, escanear con `expo-camera` — **requiere build real, no se prueba en el preview web**), "Who's Playing Here" (check-ins de las últimas 4 horas por venue).

**Bladers Near Me y Find a Battle (2.4, 2.5):** toggle "buscando jugar" con expiración (30 min/1h/todo el día). **Decisión de alcance:** sin mapa real/GPS/MapLibre — se filtra por ciudad del jugador. El mapa visual (MapLibre, mencionado en la propuesta original) queda pendiente como mejora futura si de verdad se necesita — es una integración nativa pesada que requeriría dev client. Reto entre jugadores (retar/aceptar/rechazar); aceptar crea un match normal que reutiliza el flujo de reporte/confirmación/ELO de 1.4.

## Decisiones de diseño / simplificaciones importantes

1. **Bracket sin seeding fijo:** cada ronda se re-calcula por ELO actual, no por posiciones de bracket predefinidas. Más simple, menos "oficial".
2. **Sin mapa real (MapLibre):** Bladers Near Me y venues usan listas filtradas por ciudad, no geolocalización real. Evita el peso de una integración nativa que necesita dev client.
3. **K-Factor asimétrico:** cada jugador usa su propio K según su experiencia (documentado en `docs/elo-rules.md`, punto 5) — un nuevo vs. un establecido no tiene intercambio de suma cero perfecta. Es estándar en sistemas Elo reales (igual que ajedrez FIDE).
4. **Avatar de perfil:** NO implementado (solo un círculo de placeholder). Decisión explícita de posponerlo.
5. **RLS en capas:** cada tabla se protegió con políticas mínimas conforme se construyó cada feature (no todo de una vez en Fase 0) — revisar `supabase/migrations/` en orden para el historial completo de qué política resuelve qué caso.

## Pendientes conocidos

- **Build de EAS pendiente de generar** desde la sub-etapa 1.1 (fix de placeholders) — el usuario pidió explícitamente esperar y acumular cambios de varias fases antes de generar el próximo build real, para no gastar builds en cada cambio chico.
- Configurar el cliente OAuth de Google en Supabase (para que el botón "Continuar con Google" funcione en producción).
- Cambiar `is_admin` del correo de prueba de Farid al correo real del cliente cuando se decida.
- Mapa visual (MapLibre) si el cliente lo pide de verdad — no está en el MVP actual.
- Avatar de perfil (selector de imagen + Supabase Storage) — pospuesto.

## Cómo retomar el proyecto (checklist para una sesión nueva)

1. `git clone` / `git pull` del repo.
2. Copiar `.env.example` a `.env` y llenar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Settings → API del proyecto "CML Beyblade").
3. Confirmar que todas las migraciones en `supabase/migrations/` (0001 a la más reciente) ya corrieron en el SQL Editor de Supabase, en orden. **0005 debe correr sola**, aparte de las demás (ver el comentario en ese archivo).
4. `npm install`, luego `npm run web` para verificar rápido en el preview del navegador (no requiere emulador Android).
5. Para un build real: `npx eas-cli build --platform android --profile preview --non-interactive` (requiere `eas login` ya hecho en la máquina).
