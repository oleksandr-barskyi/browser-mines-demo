import { cashOut, createRound, revealCell, toMoney, TOTAL_CELLS } from "./mines.js";
import { deriveMinePositions, generateSeed, sha256Hex } from "./fair.js";

const rounds = new Map();
const history = [];
const settledRoundIds = new Set();

let balance = 1000;
let nonce = 0;
let currentRoundId = null;

export async function handleGameAction(action, body = {}) {
  if (action === "state") {
    return response(200, statePayload());
  }

  if (action === "start") {
    return response(201, await startRound(body));
  }

  if (action === "reveal") {
    return response(200, revealRoundCell(body.roundId, body.cellIndex));
  }

  if (action === "cashout") {
    return response(200, cashoutRound(body.roundId));
  }

  if (action === "reset") {
    resetDemo();
    return response(200, statePayload());
  }

  throw httpError(404, "API route not found.");
}

export async function handleGamePath(method, path, body = {}) {
  if (method === "GET" && path === "/api/state") {
    return handleGameAction("state");
  }

  if (method === "POST" && path === "/api/rounds") {
    return handleGameAction("start", body);
  }

  const revealMatch = path.match(/^\/api\/rounds\/([^/]+)\/reveal$/);
  if (method === "POST" && revealMatch) {
    return handleGameAction("reveal", { ...body, roundId: revealMatch[1] });
  }

  const cashoutMatch = path.match(/^\/api\/rounds\/([^/]+)\/cashout$/);
  if (method === "POST" && cashoutMatch) {
    return handleGameAction("cashout", { roundId: cashoutMatch[1] });
  }

  if (method === "POST" && path === "/api/reset") {
    return handleGameAction("reset");
  }

  throw httpError(404, "API route not found.");
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function startRound({ bet, mineCount, clientSeed }) {
  const activeRound = getCurrentRound();
  if (activeRound?.status === "active") {
    throw httpError(409, "Finish the active round before starting another one.");
  }

  const parsedBet = toMoney(Number(bet));
  const parsedMineCount = Number(mineCount);
  const parsedClientSeed = String(clientSeed ?? "").trim() || "candidate-demo-seed";

  if (!Number.isFinite(parsedBet) || parsedBet <= 0) {
    throw httpError(400, "Bet must be a positive number.");
  }

  if (parsedBet > balance) {
    throw httpError(400, "Bet is higher than the current fake-credit balance.");
  }

  if (!Number.isInteger(parsedMineCount) || parsedMineCount < 1 || parsedMineCount >= TOTAL_CELLS) {
    throw httpError(400, `Mine count must be between 1 and ${TOTAL_CELLS - 1}.`);
  }

  nonce += 1;
  const serverSeed = generateSeed();
  const serverSeedHash = await sha256Hex(serverSeed);
  const minePositions = await deriveMinePositions({
    serverSeed,
    clientSeed: parsedClientSeed,
    nonce,
    mineCount: parsedMineCount,
    totalCells: TOTAL_CELLS
  });

  const round = createRound({
    id: `M-${String(nonce).padStart(5, "0")}`,
    bet: parsedBet,
    mineCount: parsedMineCount,
    minePositions,
    serverSeed,
    serverSeedHash,
    clientSeed: parsedClientSeed,
    nonce
  });

  balance = toMoney(balance - parsedBet);
  rounds.set(round.id, round);
  currentRoundId = round.id;

  return statePayload();
}

function revealRoundCell(roundId, cellIndex) {
  const round = requireRound(roundId);
  const previousStatus = round.status;
  const nextRound = revealCell(round, Number(cellIndex));

  rounds.set(roundId, nextRound);
  settleIfNeeded(nextRound, previousStatus);

  return statePayload();
}

function cashoutRound(roundId) {
  const round = requireRound(roundId);
  const previousStatus = round.status;
  const nextRound = cashOut(round);

  rounds.set(roundId, nextRound);
  settleIfNeeded(nextRound, previousStatus);

  return statePayload();
}

function settleIfNeeded(round, previousStatus) {
  if (previousStatus !== "active" || round.status === "active" || settledRoundIds.has(round.id)) {
    return;
  }

  if (round.status === "cashed_out") {
    balance = toMoney(balance + round.payout);
  }

  history.unshift(toHistoryEntry(round));
  settledRoundIds.add(round.id);

  if (history.length > 12) {
    history.pop();
  }
}

function statePayload() {
  const currentRound = getCurrentRound();

  return {
    balance,
    currentRound: currentRound ? toPublicRound(currentRound) : null,
    history
  };
}

function toPublicRound(round) {
  const settled = round.status !== "active";

  return {
    id: round.id,
    status: round.status,
    totalCells: round.totalCells,
    bet: round.bet,
    mineCount: round.mineCount,
    revealedCells: round.revealedCells,
    explodedCell: round.explodedCell,
    multiplier: round.multiplier,
    nextMultiplier: round.nextMultiplier,
    payout: round.payout,
    serverSeedHash: round.serverSeedHash,
    serverSeed: settled ? round.serverSeed : null,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    minePositions: settled ? round.minePositions : null,
    startedAt: round.startedAt,
    endedAt: round.endedAt
  };
}

function toHistoryEntry(round) {
  return {
    id: round.id,
    status: round.status,
    bet: round.bet,
    payout: round.payout,
    multiplier: round.multiplier,
    mineCount: round.mineCount,
    revealedCount: round.revealedCells.length,
    serverSeedHash: round.serverSeedHash,
    endedAt: round.endedAt
  };
}

function requireRound(roundId) {
  const round = rounds.get(roundId);
  if (!round) {
    throw httpError(404, "Round not found.");
  }

  return round;
}

function getCurrentRound() {
  return currentRoundId ? rounds.get(currentRoundId) : null;
}

function resetDemo() {
  rounds.clear();
  history.splice(0, history.length);
  settledRoundIds.clear();
  balance = 1000;
  nonce = 0;
  currentRoundId = null;
}

function response(status, payload) {
  return { status, payload };
}
