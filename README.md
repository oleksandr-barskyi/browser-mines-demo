# Browser Mines Demo

A compact browser gambling-style game using fake credits only. It is built to show the parts a gaming/gambling browser role usually cares about: round lifecycle, payout math, server-held game state, responsive UI, and a provably fair verification flow.

## Features

- 5x5 Mines board with configurable stake and mine count
- Fake-credit wallet, cashout flow, bust state, and round history
- Server-side round generation with hidden mine positions while a round is active
- Provably fair proof using `serverSeedHash`, `serverSeed`, `clientSeed`, and `nonce`
- Shared game core covered by `node:test`
- No external dependencies

## Run

```bash
node server.mjs
```

Open `http://localhost:5173`.

## Test

```bash
node --test
node --check server.mjs
node --check src/main.js
```

If you use PowerShell and `npm` scripts are blocked by the execution policy, run the `node` commands above directly or use `npm.cmd run test`.

## Project Shape

```txt
browser-mines-demo/
  server.mjs          # Static server + small in-memory game API
  src/
    main.js           # Browser UI
    styles.css
    assets/           # Game tile SVG assets
    game/
      fair.js         # Seed hashing, HMAC stream, proof verification
      mines.js        # Payout math and round transitions
  test/
    fair.test.mjs
    mines.test.mjs
```

## Portfolio Note

This demo intentionally avoids real-money flows, KYC, payments, or production account handling. In a production gambling product the server seed would be precommitted before a bet, stored securely server-side, and revealed only after settlement.
