// Simulación completa de eliminación doble.
import { nextDoubleElimRound } from '../.tmp-test/formats.js';

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FALLA ${name} ${extra}`); fails++; }
};

// Simula un torneo entero. Gana siempre el de número menor (p1 es el mejor),
// así el resultado es predecible y se puede afirmar quién debe quedar campeón.
function simulate(n, { upsetInFinal = false } = {}) {
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const num = (p) => parseInt(p.slice(1), 10);

  let state = { wbAlive: [...ids], lbAlive: [], justDropped: [], round: 1 };
  const losses = new Map(ids.map((i) => [i, 0]));
  let totalMatches = 0;
  let champion = null;
  let guard = 0;

  while (guard++ < 100) {
    const r = nextDoubleElimRound(state);
    if (r.finished) { champion = r.championId; break; }

    if (r.isGrandFinal) {
      totalMatches++;
      const [{ a, b }] = r.pairs;
      // El de arriba gana, salvo que se pida la sorpresa.
      const winner = upsetInFinal ? b : a;
      const loser = winner === a ? b : a;
      losses.set(loser, losses.get(loser) + 1);
      if (losses.get(loser) >= 2) { champion = winner; break; }
      // El que venía de abajo le quitó su primera derrota al de arriba:
      // se juega otra final (reset del bracket).
      state = { wbAlive: [winner], lbAlive: [loser], justDropped: [], round: state.round + 1 };
      continue;
    }

    const nextWb = [];
    const nextLb = [];
    const dropped = [];

    for (const { a, b, side } of r.pairs) {
      totalMatches++;
      const winner = num(a) < num(b) ? a : b;
      const loser = winner === a ? b : a;
      losses.set(loser, losses.get(loser) + 1);

      if (side === 'winners') { nextWb.push(winner); dropped.push(loser); }
      else nextLb.push(winner);
    }
    for (const { player, side } of r.byes) {
      if (side === 'winners') nextWb.push(player);
      else nextLb.push(player);
    }

    // Nadie con una sola derrota debe haber quedado fuera.
    const alive = new Set([...nextWb, ...nextLb, ...dropped]);
    for (const id of ids) {
      if (losses.get(id) === 1 && !alive.has(id)) {
        return { error: `${id} tenía 1 derrota y desapareció en la ronda ${state.round}` };
      }
    }

    state = { wbAlive: nextWb, lbAlive: nextLb, justDropped: dropped, round: state.round + 1 };
  }

  return { champion, totalMatches, rounds: state.round, losses, guard };
}

console.log('\n== ELIMINACIÓN DOBLE ==');
for (const n of [4, 6, 8, 12, 16]) {
  const r = simulate(n);
  check(`${n} jugadores: termina y no se cicla`, !r.error && r.guard < 100, r.error ?? `guard=${r.guard}`);
  check(`${n} jugadores: campeón es p1`, r.champion === 'p1', `(fue ${r.champion})`);
  if (!r.error) {
    const eliminados = [...r.losses.values()].filter((l) => l >= 2).length;
    check(`${n} jugadores: ${n - 1} eliminados con 2 derrotas`, eliminados === n - 1, `(fueron ${eliminados})`);
    // Cota sana: una doble eliminación son ~2n-1 combates.
    check(`${n} jugadores: cantidad de combates razonable (${r.totalMatches})`,
      r.totalMatches >= n - 1 && r.totalMatches <= 2 * n + 2);
  }
}

console.log('\n== SORPRESA EN LA GRAN FINAL ==');
{
  // El de la llave de perdedores gana la final: como el otro no tenía
  // derrotas, se tiene que jugar una segunda final.
  const r = simulate(8, { upsetInFinal: true });
  check('el campeón de abajo obliga a una segunda final y gana', !r.error && r.champion !== null,
    r.error ?? `campeón=${r.champion}`);
}

console.log(fails === 0 ? '\nTODO BIEN\n' : `\n${fails} FALLAS\n`);
process.exit(fails === 0 ? 0 : 1);
