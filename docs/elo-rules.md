# Sistema ELO — Liga de Beyblade (versión final)

Basado en `Reglas_ELO_Liga_Beyblade.docx`. Matemática y ejemplos del documento original verificados (correctos). Se agregan 4 reglas de implementación que el documento no cubría.

## Reglas base (sin cambios)

- Rating inicial: `R0 = 1000`.
- Probabilidad esperada: `Ea = 1 / (1 + 10^((Rb - Ra) / 400))`.
- Resultado: `S = 1` (victoria) / `S = 0` (derrota). No hay empates.
- K-Factor: `K = 40` en las primeras 10 partidas oficiales del jugador, `K = 24` desde la partida 11.
- Margen de victoria: `D = |Pa - Pb|` (diferencia de rounds internos), `M = min(1.30, 1 + 0.20 * ln(D + 1))`.
- Fórmula final: `R'a = Ra + K * M * (Sa - Ea)`; el oponente recibe el cambio exactamente opuesto (suma cero).
- Abandono: victoria/derrota registrada, `M = 1.00` (no se usa el marcador parcial).
- No se reinicia el ELO por temporada; es un rating global permanente.

## Adiciones necesarias para implementar (no estaban en el documento original)

1. **Disparador del cálculo:** el ELO se recalcula solo cuando un `Match` pasa a estado `confirmed` (confirmación del rival o de un árbitro), nunca al momento de solo *reportar* el resultado. Esto conecta con el riesgo de "resultados en disputa" ya identificado en la propuesta de producto.
2. **Precisión numérica:** el rating se guarda como `numeric(8,2)` en base de datos (con decimales). El redondeo a entero es solo cosmético, únicamente en la UI. Redondear en cada actualización acumularía error de arrastre en cientos de matches.
3. **Fallback sin marcador interno:** si un match no tiene marcador por rounds (ej. formato a una sola ronda), usar `D = 0` → `M = 1.00`. El documento no cubría formatos sin marcador interno.
4. **Punto a validar con el cliente:** este documento define un único ELO global por jugador, pero la propuesta de producto (módulo M5) menciona "ELO... por categoría". Recomendación: las vistas "por categoría/liga/temporada" deben ser *filtros de lectura* (`RankingSnapshot`) sobre el mismo rating global, no ratings independientes — así no hay contradicción. Confirmar esto con el cliente antes de Fase 1.
5. **K asimétrico entre jugadores (implementado en 1.4):** el documento asume un solo K por match y dice que el intercambio es de suma cero. Pero el K-Factor depende de la ETAPA DE CADA JUGADOR (nuevo vs. establecido), así que un jugador nuevo (K=40) contra uno establecido (K=24) en el MISMO match usan K distinto. Se implementó cada jugador con su propio K (`Ka`, `Kb`), calculado sobre su propio `matches_played` antes de este match. Consecuencia: la "conservación de ELO total de la liga" solo se cumple cuando ambos jugadores comparten la misma etapa; en un cruce nuevo-vs-establecido el intercambio no es perfectamente simétrico. Esto es estándar en sistemas Elo reales (igual que en ajedrez FIDE) — no es un error, pero es distinto de lo que el documento original enunciaba de forma general.

## Ejemplos (verificados, sin cambios)

- Favorito gana 3-0 (Carlos 1300 vs Miguel 1100, K=24): Carlos ≈ +7.36 → 1307.36; Miguel → 1092.64.
- Sorpresa: Miguel (1100) gana 3-0 a Carlos (1300), K=24: Miguel ≈ +23.3 → 1123.3; Carlos → 1276.7.
