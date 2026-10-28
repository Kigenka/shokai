<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# sign.kigenka.com, serverless (prepared 2026-10-28, not deployed)

The rc4 reference signing page running entirely on Vercel Functions, with its state in a store. No tunnel, and no machine has to be on during a session. It replaces relay mode ([deploy/sign-front](../sign-front/README.md)), which needs a tunnel the steward's box can't open.

## What's here

| Path | What it is |
|---|---|
| `src/core.mjs` | The page's request handlers (Web `Request` → `Response`), ported from `reference/signing-page/server.mjs`. The page logic itself (`describe.mjs`, `items.mjs`, `webauthn.mjs`) and the page files are copied unchanged |
| `src/stores.mjs` | Storage adapters: Upstash Redis over its REST API (production), files (local harness), memory (tests) |
| `build.mjs` | Writes `site/`: the static inert page and `/about` (from sign-front), `api/p.js` (the page at `/p/<token>/*`), `api/admin.js` (steward only), `api/_lib/`, `vercel.json`, `package.json` |
| `admin.mjs` | The steward's CLI: load the public owner credential, open a session, read and verify results, close a session |
| `local.mjs` | A loopback harness with the same env as `server.mjs`, so the reference e2e runs unchanged against these handlers |
| `test.mjs` | Storage, TTL, token, admin, replay, double decisions across two instances, stored-item tampering, the Vercel handlers wired through env vars, and `admin.mjs` |

The deployment's settings are fixed in the build (`api/_lib/config.mjs`): rp_id `sign.kigenka.com`, `NOTICE=test-stage`, 90 days. Only two things come from env vars: the store and the admin secret.

## What a session looks like

1. The steward runs `admin.mjs create items.json --link link.txt`. The server checks the items (the same `checkItems` as the reference page: anything it can't show in full is refused, including mixed kinds), mints a 24-byte token, stores the session under the token's SHA-256 with a TTL of at most 30 minutes, and freezes the items for the stored owner credential. The link goes only to `link.txt` (0600).
2. The owner opens `https://sign.kigenka.com/p/<token>/`. If the owner's passkey is already known (YSY's public credential from October 27, loaded once with `admin.mjs credential`), there's no registration: one tap for the items without amounts, then one tap for each item with an amount.
3. Two minutes after the last item is decided, or at the TTL, the link is inert. `admin.mjs results <session_id> --out <dir>` saves each signed item and checks it with the reference crypto. Results are kept for 7 days in the store.

## Store layout

All keys have the prefix `sign:`. Everything stored is public data:

- `cred:sign.kigenka.com`: the public owner credential, with its signature counter;
- `s:<sid>:meta`: the session, with the TTL;
- `s:<sid>:frozen`: the frozen items, with the grants and private parts they carry;
- `s:<sid>:ch:<challenge>`: a challenge. It lasts 5 minutes and is taken once (GETDEL).
- `s:<sid>:open`: the count of open challenges. At 32, requests get 429.
- `s:<sid>:dec:<name>`: the owner's decision, set once (SET NX);
- `s:<sid>:signed:<name>`: the signed output, kept 7 days;
- `admin:fail`: wrong admin secrets. After 20 in 10 minutes, the admin route is locked.

The token is never stored. Every read re-checks each frozen item: its digest must match its payload, and its summary must match what `describe()` says about that payload now. A stored item that changed is refused.

## What YSY must approve, one by one

1. **Storage: add Upstash for Redis from the Vercel Marketplace to the steward's Vercel team, and connect it to project `kigenka-sign`, Production only.** Use the free plan, and the region nearest the functions (`iad1`, US East). This accepts Upstash's terms and adds env vars to the project, named by the integration, among them `KV_REST_API_URL` and `KV_REST_API_TOKEN`. The code also reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, whichever the integration sets.
2. **One env var: `SIGN_ADMIN_SECRET`** (Production, marked Sensitive). Its value is 32 random bytes, at least 32 characters. Generate it on the steward's machine into a 0600 file, and never paste it into chat:

   ```bash
   node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))' > ~/kigenka-sign-admin-secret && chmod 600 ~/kigenka-sign-admin-secret
   vercel env add SIGN_ADMIN_SECRET production --sensitive --scope <team> < ~/kigenka-sign-admin-secret
   ```
3. **The production deployment** of `site/`. It replaces the inert front, `<inert-front-deployment-id>`. There are no domain, alias or DNS changes.
4. **The session itself:** loading the public owner credential, and opening one 30-minute session with the 4 test items (Edu and Muse: a card and a Willowfold mandate each; 3 taps).

No other settings change. The project keeps its domain and its headers.

## Deploy steps (after the approvals)

```bash
cd <repo root>   # the rc4 commit whose suites passed
node deploy/sign-serverless/build.mjs --check && node deploy/sign-serverless/test.mjs \
  && SIGNING_SERVER=deploy/sign-serverless/local.mjs node reference/signing-page/test/e2e.mjs
cd deploy/sign-serverless/site
vercel link --yes --project kigenka-sign --scope <team>
vercel env ls --scope <team>          # expect KV_REST_API_URL, KV_REST_API_TOKEN, SIGN_ADMIN_SECRET (Production)
vercel deploy --prod --yes --scope <team>
```

Without the CLI, use the Vercel MCP tool `create_deployment`: the steward's team, name and project `kigenka-sign`, target `production`. A call may pass at most 4 files by `$file:`, so bundle the two functions first (this is how the October 28 deployment was made):

```bash
for f in p admin; do npx esbuild@0.25 site/api/$f.js --bundle --format=esm --platform=node --target=node22 --legal-comments=inline --outfile=<bundle>/api/$f.js; done
```

Run `test.mjs` with the bundled `p.js` and `admin.js` in place of `site/api/` (45 of 45). Then pass `api/p.js`, `api/admin.js`, `about.html` and `style.css` by `$file:`, and inline `index.html`, `robots.txt`, `package.json` and `vercel.json`. After the deploy, compare the live static files with `site/` byte for byte.

Then open the session:

```bash
export SIGN_ADMIN_SECRET_FILE=~/kigenka-sign-admin-secret
node deploy/sign-serverless/admin.mjs credential <steward-dir>/owner-credential.json
node deploy/sign-serverless/admin.mjs create <steward-dir>/session/items.json --link <steward-dir>/session/link.txt --ttl 30
```

## Smoke check

```bash
U=https://sign.kigenka.com; L=$(cat <steward-dir>/session/link.txt)
curl -sSI $U/ | grep -iE '^HTTP|strict-transport|x-frame|content-security|x-robots|cache-control'
curl -sS $U/ | grep -c 'No signing session is open'                            # inert front unchanged
curl -sS $U/about | grep -c 'days in advance\. A way'                           # 1
curl -sS -o /dev/null -w '%{http_code}\n' "$U/p/$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64url"))')/api/state"   # 404
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $U/api/admin                 # 404 (no secret)
curl -sS "${L}" | grep -c 'test-stage convenience'                             # 1: the session page, with the notice
curl -sS "${L}api/state" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=JSON.parse(d);console.log(s.rp_id,s.registered,s.pending.length,s.pending.map(p=>p.own_tap))})'
#   expect: sign.kigenka.com true 4 [ false, true, false, true ]
```

Afterwards: run `admin.mjs results <session_id> --out <steward-dir>/session/results`. Every signed item must print "verifies (A.1)".

## Roll back

- **Code:** Vercel Instant Rollback to `<inert-front-deployment-id>` (the inert front). Use the MCP `request_rollback`, or `vercel rollback <inert-front-deployment-id> --scope <team>`. After a rollback, new deployments don't take the domain until one is promoted.
- **Storage and secret:** they can stay; nothing reads them once the functions are gone. To remove them, delete the `SIGN_ADMIN_SECRET` env var and disconnect or uninstall the Upstash integration. Save results with `admin.mjs results` first.
- **Signatures already made** keep verifying without the page.
