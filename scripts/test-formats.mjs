// Pruebas del motor de emparejamiento. Se ejecuta el .ts transpilado por tsc.
import {
  roundRobinRounds, roundRobinByes, assignBlocks, swissPairing, buildStandings,
  sortStandings, singleElimFirstRound, singleElimByes, nextElimRound,
  recommendStructure, shuffle,
} from '../.tmp-test/formats.js';

let fails = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FALLA ${name} ${extra}`); fails++; }
}

const P = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

console.log('\n== TODOS CONTRA TODOS ==');
for (const n of [4, 5, 8, 9]) {
  const rounds = roundRobinRounds(P(n));
  const seen = new Set();
  let dup = false;
  for (const r of rounds) for (const { a, b } of r) {
    const k = [a, b].sort().join('|');
    if (seen.has(k)) dup = true;
    seen.add(k);
  }
  const expectedPairs = (n * (n - 1)) / 2;
  check(`${n} jugadores: ${expectedPairs} combates, todos distintos`,
    seen.size === expectedPairs && !dup, `(dio ${seen.size}, dup=${dup})`);
  check(`${n} jugadores: ${n % 2 === 0 ? n - 1 : n} rondas`,
    rounds.length === (n % 2 === 0 ? n - 1 : n), `(dio ${rounds.length})`);

  // Nadie juega dos veces en la misma ronda.
  let clash = false;
  for (const r of rounds) {
    const inRound = r.flatMap((p) => [p.a, p.b]);
    if (new Set(inRound).size !== inRound.length) clash = true;
  }
  check(`${n} jugadores: nadie juega dos veces en una ronda`, !clash);
}
const byes9 = roundRobinByes(P(9));
check('9 jugadores: cada quien descansa exactamente una vez',
  new Set(byes9.filter(Boolean)).size === 9, `(${byes9.filter(Boolean).length} byes)`);

console.log('\n== GRUPOS ==');
const blocks = assignBlocks(P(16), 2);
check('16 en 2 grupos: 8 y 8', blocks[0].length === 8 && blocks[1].length === 8);
check('el sembrado 1 y el 2 caen en grupos distintos',
  blocks[0][0] === 'p1' && blocks[1][0] === 'p2');
const b3 = assignBlocks(P(15), 3);
check('15 en 3 grupos: 5/5/5', b3.every((b) => b.length === 5), JSON.stringify(b3.map(b=>b.length)));

console.log('\n== SUIZO ==');
{
  const ids = P(8);
  let matches = [];
  const rounds = 3;
  for (let r = 1; r <= rounds; r++) {
    const st = buildStandings(ids, matches);
    const { pairs, bye } = swissPairing(st, matches, r);
    check(`ronda ${r}: 4 combates`, pairs.length === 4, `(dio ${pairs.length})`);
    // Simula: gana siempre el de id menor.
    for (const { a, b } of pairs) {
      const winner = a < b ? a : b;
      matches.push({
        player_a_id: a, player_b_id: b, winner_id: winner,
        score_a: winner === a ? 4 : 1, score_b: winner === b ? 4 : 1, bracket_round: r,
      });
    }
    if (bye) check(`ronda ${r}: bye inesperado`, false, bye);
  }
  const keys = matches.map((m) => [m.player_a_id, m.player_b_id].sort().join('|'));
  check('en 3 rondas nadie repitió rival', new Set(keys).size === keys.length,
    `(${keys.length - new Set(keys).size} repetidos)`);
}
{
  // Impar: alguien tiene que descansar, y no debe repetirse.
  const ids = P(7);
  let matches = [];
  const byes = [];
  for (let r = 1; r <= 3; r++) {
    const st = buildStandings(ids, matches);
    const { pairs, bye } = swissPairing(st, matches, r);
    check(`impar ronda ${r}: 3 combates y un bye`, pairs.length === 3 && !!bye);
    if (bye) byes.push(bye);
    for (const { a, b } of pairs) {
      const winner = a < b ? a : b;
      matches.push({
        player_a_id: a, player_b_id: b, winner_id: winner,
        score_a: winner === a ? 4 : 2, score_b: winner === b ? 4 : 2, bracket_round: r,
      });
    }
  }
  check('el bye no se repite en la misma persona', new Set(byes).size === byes.length, byes.join(','));
}

console.log('\n== DESEMPATES ==');
{
  // A y B con 1 victoria cada uno.
  //   A ganó apretado (+1) contra FUERTE, que a su vez ganó lo suyo.
  //   B ganó holgado (+4) contra DEBIL, que perdió todo.
  // Los dos criterios tienen que darles el orden CONTRARIO entre sí.
  const ids = ['A', 'B', 'FUERTE', 'DEBIL', 'OTRO'];
  const matches = [
    { player_a_id: 'A', player_b_id: 'FUERTE', winner_id: 'A', score_a: 4, score_b: 3, bracket_round: 1 },
    { player_a_id: 'B', player_b_id: 'DEBIL', winner_id: 'B', score_a: 4, score_b: 0, bracket_round: 1 },
    { player_a_id: 'FUERTE', player_b_id: 'OTRO', winner_id: 'FUERTE', score_a: 4, score_b: 0, bracket_round: 2 },
    { player_a_id: 'OTRO', player_b_id: 'DEBIL', winner_id: 'OTRO', score_a: 4, score_b: 1, bracket_round: 3 },
  ];
  const st = buildStandings(ids, matches);
  const dml = sortStandings(st, matches, 'dml').map((s) => s.player_id);
  const opp = sortStandings(st, matches, 'opponents').map((s) => s.player_id);
  check('reglamento DML: B va antes que A (diferencia +4 contra +1)',
    dml.indexOf('B') < dml.indexOf('A'), dml.join(' > '));
  check('fuerza de rivales: A va antes que B (su rival ganó más)',
    opp.indexOf('A') < opp.indexOf('B'), opp.join(' > '));
}

console.log('\n== ELIMINACIÓN SIMPLE ==');
{
  const r1 = singleElimFirstRound(P(8));
  check('8 jugadores: 4 combates, sin byes', r1.pairs.length === 4 && singleElimByes(P(8)).length === 0);
  check('siembra 1 vs 8', r1.pairs[0].a === 'p1' && r1.pairs[0].b === 'p8');

  const byes5 = singleElimByes(P(5));
  const r1b = singleElimFirstRound(P(5));
  check('5 jugadores: 3 pasan directo y hay 1 combate',
    byes5.length === 3 && r1b.pairs.length === 1, `(byes=${byes5.length}, pares=${r1b.pairs.length})`);
  check('los byes se los llevan los mejores sembrados', byes5.join(',') === 'p1,p2,p3', byes5.join(','));

  const r2 = nextElimRound(['p1', 'p2', 'p3', 'p4'], 2);
  check('siguiente ronda: 2 combates', r2.pairs.length === 2);
  const r3 = nextElimRound(['p1', 'p2', 'p3'], 3);
  check('con 3 vivos: 1 combate y 1 descansa', r3.pairs.length === 1 && r3.bye === 'p3');
}

console.log('\n== RECOMENDACIÓN POR NÚMERO DE JUGADORES ==');
for (const [n, kind, cut] of [[6, 'round_robin', 4], [10, 'round_robin', 4], [14, 'blocks', 4], [24, 'swiss', 8]]) {
  const r = recommendStructure(n);
  check(`${n} jugadores → ${kind} + top ${cut}`,
    r.phases[0].kind === kind && r.phases[1]?.cut_size === cut,
    JSON.stringify(r.phases.map((p) => p.kind)));
}

console.log('\n== BARAJA DETERMINISTA ==');
check('misma semilla, mismo orden',
  shuffle(P(10), 'x').join() === shuffle(P(10), 'x').join());
check('semilla distinta, orden distinto',
  shuffle(P(10), 'x').join() !== shuffle(P(10), 'y').join());

console.log(fails === 0 ? '\nTODO BIEN\n' : `\n${fails} FALLAS\n`);
process.exit(fails === 0 ? 0 : 1);
