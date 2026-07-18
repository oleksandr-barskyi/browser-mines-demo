const textEncoder = new TextEncoder();

export function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateSeed(byteLength = 32) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure random generation is not available in this runtime.");
  }

  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacSha256Bytes(key, message) {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(String(key)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(String(message)));
  return new Uint8Array(signature);
}

export async function deriveMinePositions({ serverSeed, clientSeed, nonce, mineCount, totalCells }) {
  validateDerivationInput({ serverSeed, clientSeed, nonce, mineCount, totalCells });

  const positions = [];
  const used = new Set();
  const rejectionLimit = Math.floor(256 / totalCells) * totalCells;
  let cursor = 0;

  while (positions.length < mineCount) {
    const block = await hmacSha256Bytes(serverSeed, `${clientSeed}:${nonce}:${cursor}`);

    for (const byte of block) {
      if (byte >= rejectionLimit) {
        continue;
      }

      const candidate = byte % totalCells;
      if (used.has(candidate)) {
        continue;
      }

      used.add(candidate);
      positions.push(candidate);

      if (positions.length === mineCount) {
        break;
      }
    }

    cursor += 1;
    if (cursor > 1000) {
      throw new Error("Unable to derive enough unique mine positions.");
    }
  }

  return positions;
}

export async function verifyRound({
  serverSeed,
  serverSeedHash,
  clientSeed,
  nonce,
  mineCount,
  totalCells,
  minePositions
}) {
  const expectedHash = await sha256Hex(serverSeed);
  const expectedMinePositions = await deriveMinePositions({
    serverSeed,
    clientSeed,
    nonce,
    mineCount,
    totalCells
  });

  const validHash = expectedHash === serverSeedHash;
  const validMines = arraysEqual(expectedMinePositions, minePositions);

  return {
    valid: validHash && validMines,
    validHash,
    validMines,
    expectedHash,
    expectedMinePositions
  };
}

function validateDerivationInput({ serverSeed, clientSeed, nonce, mineCount, totalCells }) {
  if (!serverSeed || !clientSeed) {
    throw new Error("Both serverSeed and clientSeed are required.");
  }

  if (!Number.isInteger(nonce) || nonce < 1) {
    throw new RangeError("nonce must be a positive integer.");
  }

  if (!Number.isInteger(totalCells) || totalCells < 2 || totalCells > 256) {
    throw new RangeError("totalCells must be an integer from 2 to 256.");
  }

  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount >= totalCells) {
    throw new RangeError("mineCount must be at least 1 and lower than totalCells.");
  }
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}
