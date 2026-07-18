import test from "node:test";
import assert from "node:assert/strict";
import { deriveMinePositions, sha256Hex, verifyRound } from "../src/game/fair.js";
import { TOTAL_CELLS } from "../src/game/mines.js";

test("mine derivation is deterministic and unique", async () => {
  const input = {
    serverSeed: "server-seed-for-test",
    clientSeed: "candidate-seed",
    nonce: 7,
    mineCount: 5,
    totalCells: TOTAL_CELLS
  };

  const first = await deriveMinePositions(input);
  const second = await deriveMinePositions(input);

  assert.deepEqual(first, second);
  assert.equal(first.length, input.mineCount);
  assert.equal(new Set(first).size, input.mineCount);
  assert.ok(first.every((position) => position >= 0 && position < TOTAL_CELLS));
});

test("round proof verifies the committed hash and positions", async () => {
  const serverSeed = "another-server-seed";
  const clientSeed = "browser-gaming";
  const nonce = 3;
  const mineCount = 8;
  const serverSeedHash = await sha256Hex(serverSeed);
  const minePositions = await deriveMinePositions({
    serverSeed,
    clientSeed,
    nonce,
    mineCount,
    totalCells: TOTAL_CELLS
  });

  const result = await verifyRound({
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    mineCount,
    totalCells: TOTAL_CELLS,
    minePositions
  });

  assert.equal(result.valid, true);
  assert.equal(result.validHash, true);
  assert.equal(result.validMines, true);
});

test("round proof fails when revealed mine positions are changed", async () => {
  const serverSeed = "server-seed";
  const clientSeed = "client-seed";
  const nonce = 1;
  const mineCount = 3;
  const serverSeedHash = await sha256Hex(serverSeed);
  const minePositions = await deriveMinePositions({
    serverSeed,
    clientSeed,
    nonce,
    mineCount,
    totalCells: TOTAL_CELLS
  });

  const tampered = [...minePositions];
  tampered[0] = (tampered[0] + 1) % TOTAL_CELLS;

  const result = await verifyRound({
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    mineCount,
    totalCells: TOTAL_CELLS,
    minePositions: tampered
  });

  assert.equal(result.valid, false);
  assert.equal(result.validHash, true);
  assert.equal(result.validMines, false);
});
