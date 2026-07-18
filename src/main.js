import { calculateMultiplier, TOTAL_CELLS, toMoney } from "./game/mines.js";
import { verifyRound } from "./game/fair.js";

const els = {
  balance: document.querySelector("#balance"),
  roundStatus: document.querySelector("#roundStatus"),
  currentMultiplier: document.querySelector("#currentMultiplier"),
  settingsForm: document.querySelector("#settingsForm"),
  betInput: document.querySelector("#betInput"),
  minesInput: document.querySelector("#minesInput"),
  mineOutput: document.querySelector("#mineOutput"),
  clientSeedInput: document.querySelector("#clientSeedInput"),
  startButton: document.querySelector("#startButton"),
  cashoutButton: document.querySelector("#cashoutButton"),
  resetButton: document.querySelector("#resetButton"),
  board: document.querySelector("#board"),
  roundBet: document.querySelector("#roundBet"),
  safePicks: document.querySelector("#safePicks"),
  nextMultiplier: document.querySelector("#nextMultiplier"),
  potentialPayout: document.querySelector("#potentialPayout"),
  payoutLadder: document.querySelector("#payoutLadder"),
  serverHash: document.querySelector("#serverHash"),
  serverSeed: document.querySelector("#serverSeed"),
  clientSeed: document.querySelector("#clientSeed"),
  nonce: document.querySelector("#nonce"),
  minePositions: document.querySelector("#minePositions"),
  proofJson: document.querySelector("#proofJson"),
  verifyButton: document.querySelector("#verifyButton"),
  verifyResult: document.querySelector("#verifyResult"),
  historyList: document.querySelector("#historyList"),
  toast: document.querySelector("#toast")
};

let state = {
  balance: 1000,
  currentRound: null,
  history: []
};

els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await withBusy(async () => {
    const nextState = await api("/api/game?action=start", {
      method: "POST",
      body: JSON.stringify({
        bet: Number(els.betInput.value),
        mineCount: Number(els.minesInput.value),
        clientSeed: els.clientSeedInput.value
      })
    });
    state = nextState;
    els.verifyResult.textContent = "Server seed stays hidden until settlement.";
    render();
  });
});

els.cashoutButton.addEventListener("click", async () => {
  if (!state.currentRound) {
    return;
  }

  await withBusy(async () => {
    state = await api("/api/game?action=cashout", {
      method: "POST",
      body: JSON.stringify({ roundId: state.currentRound.id })
    });
    els.verifyResult.textContent = "Ready to verify.";
    render();
  });
});

els.resetButton.addEventListener("click", async () => {
  await withBusy(async () => {
    state = await api("/api/game?action=reset", { method: "POST" });
    els.verifyResult.textContent = "Waiting for a settled round.";
    render();
  });
});

els.minesInput.addEventListener("input", () => {
  els.mineOutput.value = els.minesInput.value;
  renderLadder();
});

els.verifyButton.addEventListener("click", async () => {
  const round = state.currentRound;
  if (!round || round.status === "active") {
    return;
  }

  const result = await verifyRound({
    serverSeed: round.serverSeed,
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    mineCount: round.mineCount,
    totalCells: round.totalCells,
    minePositions: round.minePositions
  });

  els.verifyResult.textContent = result.valid
    ? "Verified: hash and mine positions match."
    : "Verification failed.";
});

init();

async function init() {
  try {
    state = await api("/api/game?action=state");
  } catch (error) {
    showToast(error.message);
  }

  render();
}

function render() {
  const round = state.currentRound;
  const isActive = round?.status === "active";
  const safePicks = round?.revealedCells.length ?? 0;
  const potentialPayout = round ? toMoney(round.bet * round.multiplier) : 0;

  els.balance.textContent = formatCredits(state.balance);
  els.roundStatus.textContent = labelForStatus(round?.status);
  els.currentMultiplier.textContent = `${formatMultiplier(round?.multiplier ?? 1)}x`;
  els.roundBet.textContent = formatCredits(round?.bet ?? 0);
  els.safePicks.textContent = String(safePicks);
  els.nextMultiplier.textContent = `${formatMultiplier(round?.nextMultiplier ?? nextMultiplierFromInputs())}x`;
  els.potentialPayout.textContent = formatCredits(potentialPayout);

  els.startButton.disabled = isActive;
  els.cashoutButton.disabled = !isActive || safePicks === 0;
  els.betInput.disabled = isActive;
  els.minesInput.disabled = isActive;
  els.clientSeedInput.disabled = isActive;

  renderBoard();
  renderLadder();
  renderProof();
  renderHistory();
}

function renderBoard() {
  const round = state.currentRound;
  const isActive = round?.status === "active";
  const isSettled = round && round.status !== "active";

  els.board.innerHTML = "";

  for (let index = 0; index < TOTAL_CELLS; index += 1) {
    const cell = document.createElement("button");
    const revealed = round?.revealedCells.includes(index) ?? false;
    const mine = round?.minePositions?.includes(index) ?? false;
    const exploded = round?.explodedCell === index;

    cell.type = "button";
    cell.className = "cell";
    cell.disabled = !isActive || revealed;
    cell.dataset.index = String(index);

    if (revealed) {
      cell.classList.add("safe");
      cell.setAttribute("aria-label", `Cell ${index + 1}, safe`);
    } else if (isSettled && mine) {
      cell.classList.add("mine");
      cell.setAttribute("aria-label", `Cell ${index + 1}, mine`);
    } else {
      cell.setAttribute("aria-label", `Reveal cell ${index + 1}`);
    }

    if (exploded) {
      cell.classList.add("exploded");
    }

    cell.addEventListener("click", () => reveal(index));
    els.board.append(cell);
  }
}

async function reveal(cellIndex) {
  const round = state.currentRound;
  if (!round || round.status !== "active") {
    return;
  }

  await withBusy(async () => {
    state = await api("/api/game?action=reveal", {
      method: "POST",
      body: JSON.stringify({ roundId: round.id, cellIndex })
    });

    if (state.currentRound.status === "busted") {
      els.verifyResult.textContent = "Ready to verify.";
    }

    if (state.currentRound.status === "cashed_out") {
      els.verifyResult.textContent = "Ready to verify.";
    }

    render();
  });
}

function renderLadder() {
  const round = state.currentRound;
  const mineCount = round?.mineCount ?? Number(els.minesInput.value);
  const revealed = round?.revealedCells.length ?? 0;
  const safeCells = TOTAL_CELLS - mineCount;
  const steps = Math.min(5, Math.max(0, safeCells - revealed));

  els.mineOutput.value = String(mineCount);
  els.payoutLadder.innerHTML = "";

  for (let offset = 1; offset <= steps; offset += 1) {
    const revealCount = revealed + offset;
    const chip = document.createElement("span");
    chip.className = "ladder-chip";
    chip.textContent = `${revealCount}: ${formatMultiplier(calculateMultiplier({ mineCount, revealedCount: revealCount }))}x`;
    els.payoutLadder.append(chip);
  }
}

function renderProof() {
  const round = state.currentRound;

  if (!round) {
    els.serverHash.textContent = "-";
    els.serverSeed.textContent = "-";
    els.clientSeed.textContent = "-";
    els.nonce.textContent = "-";
    els.minePositions.textContent = "-";
    els.proofJson.value = "";
    els.verifyButton.disabled = true;
    return;
  }

  const settled = round.status !== "active";
  const proof = {
    serverSeedHash: round.serverSeedHash,
    serverSeed: settled ? round.serverSeed : null,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    mineCount: round.mineCount,
    totalCells: round.totalCells,
    minePositions: settled ? round.minePositions : null
  };

  els.serverHash.textContent = round.serverSeedHash;
  els.serverSeed.textContent = settled ? round.serverSeed : "Hidden";
  els.clientSeed.textContent = round.clientSeed;
  els.nonce.textContent = String(round.nonce);
  els.minePositions.textContent = settled ? [...round.minePositions].sort((a, b) => a - b).join(", ") : "Hidden";
  els.proofJson.value = JSON.stringify(proof, null, 2);
  els.verifyButton.disabled = !settled;
}

function renderHistory() {
  els.historyList.innerHTML = "";

  if (state.history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "No settled rounds yet.";
    els.historyList.append(empty);
    return;
  }

  for (const item of state.history) {
    const row = document.createElement("article");
    row.className = `history-row ${item.status}`;

    const title = document.createElement("strong");
    title.textContent = item.status === "cashed_out" ? "Cashout" : "Bust";

    const meta = document.createElement("span");
    meta.textContent = `${item.id} - ${item.revealedCount} safe - ${item.mineCount} mines`;

    const value = document.createElement("b");
    value.textContent = `${formatMultiplier(item.multiplier)}x / ${formatCredits(item.payout)}`;

    row.append(title, meta, value);
    els.historyList.append(row);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with ${response.status}`);
  }

  return payload;
}

async function withBusy(action) {
  setBusy(true);
  try {
    await action();
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  document.body.classList.toggle("busy", isBusy);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    els.toast.classList.remove("visible");
  }, 3200);
}

function labelForStatus(status) {
  const labels = {
    active: "Active",
    cashed_out: "Cashed",
    busted: "Busted"
  };

  return labels[status] ?? "Idle";
}

function nextMultiplierFromInputs() {
  return calculateMultiplier({
    mineCount: Number(els.minesInput.value),
    revealedCount: 1
  });
}

function formatMultiplier(value) {
  return Number(value).toFixed(2);
}

function formatCredits(value) {
  return Number(value).toFixed(2);
}
