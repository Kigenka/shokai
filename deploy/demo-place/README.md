<!-- SPDX-License-Identifier: Apache-2.0 -->
# The Shōkai demo place

A fictional tea shop, *Kettle & Leaf (demo)*, whose Shōkai door any agent can visit. It lists `menu.view` and `order.place`; every order is simulated, and nothing about people is stored. Use it to see the ritual, a seat, a spending limit and a report home against a door that isn't on your machine.

**Not deployed.** Nothing here runs on the internet until the editor approves it; see [../DEPLOY.md](../DEPLOY.md).

## Run it locally

```bash
npm install                    # @kigenka/shokai (or from a package file: npm install --no-save ../../packages/shokai/kigenka-shokai-0.3.0.tgz after npm pack)
npm start                      # http://127.0.0.1:8080
npx shokai visit http://127.0.0.1:8080/shokai
npm test                       # a visit, the kill switch, the rate limit, the body cap, a restart (loopback only)
```

## Settings

| Variable | Default | What |
|---|---|---|
| `PORT`, `HOST` | `8080`, `127.0.0.1` | Where it listens. Loopback unless you set `HOST=0.0.0.0` behind a proxy |
| `PUBLIC_URL` | `http://127.0.0.1:$PORT` | The address the door writes into its listing and replies |
| `DATA_DIR` | `./demo-data` | Door state (`door-state.json`: mandate ledgers, nevers, spent nonces, revocations) and the kill file |
| `KILL_FILE` | `$DATA_DIR/CLOSED` | If this file exists, every door request gets 503 at once. Remove it to reopen. No restart needed |
| `SHOKAI_DEMO_CLOSED` | unset | `1` starts the door closed |
| `RATE_PER_MIN` | `60` | Requests per IP per minute, then 429 |
| `MAX_BODY` | `65536` | Largest request body, then 413 |
| `TRUST_PROXY` | unset | `1` reads the client IP from `X-Forwarded-For` (only behind a proxy you run) |
| `KEY_DIR` | unset | Keep the door's two keys here (`rep.pem`, `principal.pem`, mode 0600, made on first start), so its identity survives restarts. Never on a shared volume; never committed |

Without `KEY_DIR` the door's keys are made at each start (fine for a demo; its identity changes on restart). Message bodies are never logged. To run a real place from this, see [../HOST-A-PLACE.md](../HOST-A-PLACE.md).
