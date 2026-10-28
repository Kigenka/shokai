<!-- SPDX-License-Identifier: Apache-2.0 -->
# Deploying the demo place: plan (not run)

Status: **plan only.** Nothing is deployed. Each step marked *approval* needs the editor's explicit approval. This plan is for Kigenka's demo place; to host your own place, see [HOST-A-PLACE.md](HOST-A-PLACE.md).

## What goes live

One small Node process: [`demo-place/`](demo-place/README.md), a fictional tea shop's door. Simulated acts only; no accounts, no payments, no personal data, no LLM calls (so no API keys and no model cost). Its only state is the door's own ledger file.

## Where

| Option | Fit | Cost (checked 2026-10-27) |
|---|---|---|
| **Fly.io, one `shared-cpu-1x` 256 MB Machine in `iad`, a 1 GB volume for `DATA_DIR`** (recommended) | A long-running process with a file on disk, which the door's durable state needs; TLS and a shared IPv4 included | about **$2.19/month** + $0.15/month volume + $0.02/GB egress; no free tier ([fly.io/pricing](https://fly.io/pricing)) |
| A small VM you already run (Caddy in front for TLS) | Same shape; you own patching | whatever the VM costs |
| Vercel Functions | Not a fit as is: functions are stateless, so the door would run refuse-on-loss and lose its ledger between invocations; would need Redis or Blob state | — |

Address: `https://demo.shokai.kigenka.com` (a CNAME in the kigenka.com DNS; *approval*), with `PUBLIC_URL` set to it.

## Lockdown

- The process runs as a non-root user (`Dockerfile`), listens on `0.0.0.0:8080` only inside the Machine; Fly's proxy terminates TLS. `TRUST_PROXY=1` so the rate limit sees the real client IP.
- Per-IP rate limit 60/min, 64 KiB bodies, 10 s request timeout, and the door's own encounter cap (§3.4).
- No secrets in the image or the repo. The door's keys are made at start. No message bodies in logs.
- One Machine, `auto_stop_machines = "off"`, `min_machines_running = 1`, and a hard `max` of 1 (no autoscaling, so no surprise bill).
- A spend alert on the Fly organization at $10/month.

## Kill switch (fastest first)

1. `fly ssh console -C "touch /data/CLOSED"`: every door request gets 503 at once; `/healthz` says `open: false`. Remove the file to reopen.
2. `fly secrets set SHOKAI_DEMO_CLOSED=1` (restarts closed) or `fly scale count 0` (stops the Machine).
3. `fly apps destroy shokai-demo-place` and remove the DNS record.

## Monitoring and rollback

- Fly's health check on `/healthz`; an uptime check from outside on the same path.
- Rollback: `fly deploy --image <previous image>` (Fly keeps the release history). The state file stays on the volume.
- Weekly: look at request counts and 429s. If it is abused, close it (step 1) first, then decide.

## Steps when approved

1. *approval* Publish `@kigenka/shokai@0.3.0` (see [../RELEASING.md](../RELEASING.md)); the image installs it from npm.
2. *approval* `fly launch --no-deploy --name shokai-demo-place --region iad`, `fly volumes create data --size 1`, mount it at `/data`; set `PUBLIC_URL`.
3. *approval* `fly deploy`; run `npx @kigenka/shokai visit https://<app>.fly.dev/shokai` and the any-agent prompt against it.
4. *approval* The DNS record, then update `PUBLIC_URL`, the README, the site and [ANY-AGENT-PROMPT.md](ANY-AGENT-PROMPT.md) with the address.
