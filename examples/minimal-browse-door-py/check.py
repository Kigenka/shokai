#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Yu Sung Yeh
"""Black-box checks for the Python browse-door sketch. Stdlib only."""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 5103
BASE = f"http://127.0.0.1:{PORT}/shokai"
pass_n = fail_n = 0


def check(cond: bool, what: str) -> None:
    global pass_n, fail_n
    if cond:
        pass_n += 1
        print("  PASS", what)
    else:
        fail_n += 1
        print("  FAIL", what)


def get(path: str):
    with urllib.request.urlopen(BASE + path, timeout=2) as r:
        return r.status, json.loads(r.read().decode())


def post(obj):
    data = json.dumps(obj).encode()
    req = urllib.request.Request(BASE + f"/places/browse-py/entry", data=data, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=2) as r:
        return r.status, json.loads(r.read().decode())


def main() -> int:
    print("minimal-browse-door-py checks")
    proc = subprocess.Popen([sys.executable, str(ROOT / "door.py")], env={**dict(**{k: v for k, v in __import__("os").environ.items()}), "PORT": str(PORT)})
    try:
        for _ in range(50):
            try:
                get("")
                break
            except Exception:
                time.sleep(0.05)
        else:
            print("door did not start"); return 1
        st, listing = get("")
        check(st == 200 and listing["places"][0]["name"] == "browse-py", "GET listing names the place")
        st, card = get(f"/places/browse-py/entry/host-card.json")
        check(st == 200 and card["payload"]["kind"] == "host", "GET host-card.json is a host card")
        st, lobby = post({"not": "a message"})
        check(st == 200 and lobby["messages"][0]["type"] == "lobby_briefing", "unsigned body gets the lobby")
        st, gre = post({"protocol": "shokai/0.5", "type": "greeting", "encounter_id": "e1", "from": "did:key:z6MkVisitor", "nonce": "n1", "locales": ["en-US"]})
        check(st == 200 and gre["messages"][0]["type"] == "greeting", "greeting is answered")
        eid = gre["messages"][0]["encounter_id"]
        st, rec = post({"protocol": "shokai/0.5", "type": "card_presentation", "encounter_id": eid, "from": "did:key:z6MkVisitor",
                        "card": {"payload": {"kind": "visitor", "representative_id": "did:key:z6MkVisitor"}}})
        check(st == 200 and rec["messages"][0].get("ok") is True, "visitor card is received")
        st, grant = post({"protocol": "shokai/0.5", "type": "invitation_request", "encounter_id": eid, "from": "did:key:z6MkVisitor", "actions": ["browse.look"]})
        check(st == 200 and grant["messages"][0]["decision"] == "grant", "browse.look is granted")
        seat = grant["messages"][0]["seat"]["seat_id"]
        st, act = post({"protocol": "shokai/0.5", "type": "act", "seat_id": seat, "tool": "browse.look", "arguments": {}})
        check(st == 200 and act["messages"][0].get("ok") is True, "browse.look act succeeds")
        st, spend = post({"protocol": "shokai/0.5", "type": "act", "seat_id": seat, "tool": "browse.look", "arguments": {"amount": {"value": "1.00", "currency": "USD"}}})
        check(st == 200 and spend["messages"][0]["decision"] == "deny", "spending on a browse door is refused")
        st, hostish = post({"protocol": "shokai/0.5", "type": "card_presentation", "encounter_id": eid, "from": "did:key:z6MkVisitor",
                            "card": {"payload": {"kind": "host"}}})
        # new encounter needed — use a fresh greeting path for host-kind
        st, gre2 = post({"protocol": "shokai/0.5", "type": "greeting", "encounter_id": "e2", "from": "did:key:z6MkVisitor", "nonce": "n2", "locales": ["en-US"]})
        eid2 = gre2["messages"][0]["encounter_id"]
        st, bad = post({"protocol": "shokai/0.5", "type": "card_presentation", "encounter_id": eid2, "from": "did:key:z6MkVisitor",
                        "card": {"payload": {"kind": "host"}}})
        check(st == 200 and bad["messages"][0].get("reason_code") == "CARD_KIND", "a host card shown as visitor is refused")
    finally:
        proc.terminate(); proc.wait(timeout=5)
    print(f"minimal-browse-door-py: {pass_n} passed, {fail_n} failed")
    return 1 if fail_n else 0


if __name__ == "__main__":
    raise SystemExit(main())
