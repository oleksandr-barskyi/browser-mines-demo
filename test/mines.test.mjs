import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMultiplier,
  calculateSurvivalProbability,
  cashOut,
  combinations,
  createRound,
  revealCell
} from "../src/game/mines.js";

test("combinations supports payout probability math", () => {
  assert.equal(combinations(5, 2), 10);
  assert.equal(combinations(25, 0), 1);
  assert.equal(combinations(3, 4), 0);
});

test("multiplier increases as more safe cells are revealed", () => {
  const first = calculateMultiplier({ mineCount: 5, revealedCount: 1 });
  const third = calculateMultiplier({ mineCount: 5, revealedCount: 3 });
  const probability = calculateSurvivalProbability({ mineCount: 5, revealedCount: 3 });

  assert.ok(first > 1);
  assert.ok(third > first);
  assert.ok(probability > 0 && probability < 1);
});

test("safe reveal updates the round and cashout pays fake credits", () => {
  const round = makeRound();
  const afterReveal = revealCell(round, 0, 1000);
  const cashed = cashOut(afterReveal, 2000);

  assert.equal(afterReveal.status, "active");
  assert.deepEqual(afterReveal.revealedCells, [0]);
  assert.ok(afterReveal.multiplier > 1);
  assert.equal(cashed.status, "cashed_out");
  assert.equal(cashed.payout, Number((round.bet * afterReveal.multiplier).toFixed(2)));
  assert.equal(cashed.endedAt, 2000);
});

test("revealing a mine busts the round", () => {
  const round = makeRound();
  const busted = revealCell(round, 1, 3000);

  assert.equal(busted.status, "busted");
  assert.equal(busted.explodedCell, 1);
  assert.equal(busted.payout, 0);
  assert.equal(busted.endedAt, 3000);
});

test("cashout requires at least one safe reveal", () => {
  assert.throws(() => cashOut(makeRound()), /At least one safe cell/);
});

function makeRound() {
  return createRound({
    id: "M-00001",
    bet: 100,
    mineCount: 3,
    minePositions: [1, 5, 24],
    serverSeed: "server",
    serverSeedHash: "hash",
    clientSeed: "client",
    nonce: 1
  });
}
