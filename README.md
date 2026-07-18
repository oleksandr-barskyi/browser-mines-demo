# Browser Mines Demo

A compact browser gambling-style game using fake credits only. It is built to show the parts a gaming/gambling browser role usually cares about: round lifecycle, payout math, server-held game state, responsive UI, and a provably fair verification flow.

## Features

- 5x5 Mines board with configurable stake and mine count
- Fake-credit wallet, cashout flow, bust state, and round history
- Server-side round generation with hidden mine positions while a round is active
- Provably fair proof using `serverSeedHash`, `serverSeed`, `clientSeed`, and `nonce`
- Shared game core covered by `node:test`
- No external dependencies
- Vercel-ready `api/game.js` function for hosted demos

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

## Deploy

```bash
vercel --prod
```

The Vercel deployment uses `api/game.js`, a single serverless endpoint that mirrors the local API. The demo keeps game state in memory, so a production build should replace this with Redis, Postgres, or another persistent store before handling real users.

## Project Shape

```txt
browser-mines-demo/
  api/
    game.js          # Vercel serverless API endpoint
  server.mjs          # Static server + small in-memory game API
  vercel.json
  src/
    main.js           # Browser UI
    styles.css
    assets/           # Game tile SVG assets
    game/
      fair.js         # Seed hashing, HMAC stream, proof verification
      mines.js        # Payout math and round transitions
      session.js      # Shared in-memory round lifecycle
  test/
    fair.test.mjs
    mines.test.mjs
```

## Portfolio Note

This demo intentionally avoids real-money flows, KYC, payments, or production account handling. In a production gambling product the server seed would be precommitted before a bet, stored securely server-side, and revealed only after settlement.
