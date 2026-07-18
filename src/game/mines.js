export const BOARD_SIZE = 5;
export const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;
export const DEFAULT_HOUSE_EDGE = 0.97;

export function combinations(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    return 0;
  }

  const normalizedK = Math.min(k, n - k);
  let result = 1;

  for (let i = 1; i <= normalizedK; i += 1) {
    result = (result * (n - normalizedK + i)) / i;
  }

  return result;
}

export function calculateSurvivalProbability({ totalCells = TOTAL_CELLS, mineCount, revealedCount }) {
  const safeCells = totalCells - mineCount;

  if (revealedCount <= 0) {
    return 1;
  }

  if (revealedCount > safeCells) {
    return 0;
  }

  return combinations(safeCells, revealedCount) / combinations(totalCells, revealedCount);
}

export function calculateMultiplier({
  totalCells = TOTAL_CELLS,
  mineCount,
  revealedCount,
  houseEdge = DEFAULT_HOUSE_EDGE
}) {
  if (revealedCount <= 0) {
    return 1;
  }

  const survivalProbability = calculateSurvivalProbability({ totalCells, mineCount, revealedCount });
  if (survivalProbability <= 0) {
    return 0;
  }

  const rawMultiplier = houseEdge / survivalProbability;
  return toMoney(Math.max(1, Math.floor(rawMultiplier * 100) / 100));
}

export function calculateNextMultiplier(round) {
  const safeCells = round.totalCells - round.mineCount;
  const nextRevealCount = Math.min(round.revealedCells.length + 1, safeCells);

  return calculateMultiplier({
    totalCells: round.totalCells,
    mineCount: round.mineCount,
    revealedCount: nextRevealCount,
    houseEdge: round.houseEdge
  });
}

export function createRound({
  id,
  bet,
  mineCount,
  minePositions,
  serverSeed,
  serverSeedHash,
  clientSeed,
  nonce,
  houseEdge = DEFAULT_HOUSE_EDGE,
  startedAt = Date.now()
}) {
  validateBet(bet);
  validateMineSetup(mineCount, minePositions);

  return {
    id,
    status: "active",
    totalCells: TOTAL_CELLS,
    bet: toMoney(bet),
    mineCount,
    minePositions: [...minePositions],
    revealedCells: [],
    explodedCell: null,
    multiplier: 1,
    nextMultiplier: calculateMultiplier({ mineCount, revealedCount: 1, houseEdge }),
    payout: 0,
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    houseEdge,
    startedAt,
    endedAt: null
  };
}

export function revealCell(round, cellIndex, now = Date.now()) {
  if (round.status !== "active") {
    return round;
  }

  validateCellIndex(cellIndex, round.totalCells);

  if (round.revealedCells.includes(cellIndex)) {
    return round;
  }

  if (round.minePositions.includes(cellIndex)) {
    return {
      ...round,
      status: "busted",
      explodedCell: cellIndex,
      multiplier: 0,
      nextMultiplier: 0,
      payout: 0,
      endedAt: now
    };
  }

  const revealedCells = [...round.revealedCells, cellIndex];
  const multiplier = calculateMultiplier({
    totalCells: round.totalCells,
    mineCount: round.mineCount,
    revealedCount: revealedCells.length,
    houseEdge: round.houseEdge
  });

  const safeCells = round.totalCells - round.mineCount;
  const completedBoard = revealedCells.length >= safeCells;
  const payout = completedBoard ? toMoney(round.bet * multiplier) : 0;

  return {
    ...round,
    status: completedBoard ? "cashed_out" : "active",
    revealedCells,
    multiplier,
    nextMultiplier: completedBoard ? 0 : calculateNextMultiplier({ ...round, revealedCells }),
    payout,
    endedAt: completedBoard ? now : null
  };
}

export function cashOut(round, now = Date.now()) {
  if (round.status !== "active") {
    return round;
  }

  if (round.revealedCells.length === 0) {
    throw new Error("At least one safe cell must be revealed before cashout.");
  }

  const payout = toMoney(round.bet * round.multiplier);

  return {
    ...round,
    status: "cashed_out",
    nextMultiplier: 0,
    payout,
    endedAt: now
  };
}

export function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function validateBet(bet) {
  if (!Number.isFinite(bet) || bet <= 0) {
    throw new RangeError("bet must be a positive number.");
  }
}

function validateMineSetup(mineCount, minePositions) {
  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount >= TOTAL_CELLS) {
    throw new RangeError(`mineCount must be between 1 and ${TOTAL_CELLS - 1}.`);
  }

  if (!Array.isArray(minePositions) || minePositions.length !== mineCount) {
    throw new RangeError("minePositions must match mineCount.");
  }

  const uniquePositions = new Set(minePositions);
  if (uniquePositions.size !== minePositions.length) {
    throw new RangeError("minePositions must be unique.");
  }

  for (const position of minePositions) {
    validateCellIndex(position, TOTAL_CELLS);
  }
}

function validateCellIndex(cellIndex, totalCells) {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalCells) {
    throw new RangeError(`cellIndex must be between 0 and ${totalCells - 1}.`);
  }
}
