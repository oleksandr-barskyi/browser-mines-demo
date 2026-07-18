import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { cashOut, createRound, revealCell, toMoney, TOTAL_CELLS } from "./src/game/mines.js";
import { deriveMinePositions, generateSeed, sha256Hex } from "./src/game/fair.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 5173);
const rounds = new Map();
const history = [];
const settledRoundIds = new Set();

let balance = 1000;
let nonce = 0;
let currentRoundId = null;

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await handleStatic(request, response);
  } catch (error) {
    sendJson(response, error.statusCode ?? 500, {
      message: error.statusCode ? error.message : "Internal server error."
    });
  }
});

server.listen(port, () => {
  console.log(`Browser Mines Demo running at http://localhost:${port}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, statePayload());
    return;
  }

  if (method === "POST" && url.pathname === "/api/rounds") {
    const body = await readJson(request);
    const payload = await startRound(body);
    sendJson(response, 201, payload);
    return;
  }

  const revealMatch = url.pathname.match(/^\/api\/rounds\/([^/]+)\/reveal$/);
  if (method === "POST" && revealMatch) {
    const body = await readJson(request);
    const payload = revealRoundCell(revealMatch[1], body.cellIndex);
    sendJson(response, 200, payload);
    return;
  }

  const cashoutMatch = url.pathname.match(/^\/api\/rounds\/([^/]+)\/cashout$/);
  if (method === "POST" && cashoutMatch) {
    const payload = cashoutRound(cashoutMatch[1]);
    sendJson(response, 200, payload);
    return;
  }

  if (method === "POST" && url.pathname === "/api/reset") {
    resetDemo();
    sendJson(response, 200, statePayload());
    return;
  }

  throw httpError(404, "API route not found.");
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

async function handleStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(root, pathname));

  if (!filePath.startsWith(root)) {
    throw httpError(403, "Forbidden.");
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw httpError(404, "File not found.");
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw httpError(404, "File not found.");
    }

    throw error;
  }
}

function contentType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };

  return types[extname(filePath)] ?? "application/octet-stream";
}

async function readJson(request) {
  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;
    if (rawBody.length > 64_000) {
      throw httpError(413, "Request body is too large.");
    }
  }

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
