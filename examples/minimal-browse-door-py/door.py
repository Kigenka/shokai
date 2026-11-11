#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Yu Sung Yeh
"""NOT CONFORMANT — do not deploy.

Tiny Shōkai Core Door (browse) sketch in Python 3 stdlib.

Language-neutrality companion to examples/minimal-browse-door/. Not a full
C295 claim: it answers the lobby, serves a host card, runs a short ritual,
seats browse-only, and refuses spending. No third-party packages.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

PROTOCOL = "shokai/0.5"
PLACE = "browse-py"
DISPLAY = "Python Browse Door"


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def jcs(obj: Any) -> bytes:
    """RFC 8785-ish: sorted keys, no whitespace, UTF-8. Enough for digests here."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def digest_of(obj: Any) -> str:
    return b64u(hashlib.sha256(jcs(obj)).digest())


def now_iso() -> str:
    import datetime as dt
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class Door:
    def __init__(self) -> None:
        self.nonces: set[str] = set()
        self.encounters: dict[str, dict[str, Any]] = {}
        self.seats: dict[str, dict[str, Any]] = {}
        self.rep_id = "did:key:z6MkPyBrowseDoorRepDemo0000000000000001"
        self.principal_id = "did:key:z6MkPyBrowseDoorPrinDemo000000000000001"

    def listing(self) -> dict[str, Any]:
        return {
            "protocol": PROTOCOL,
            "places": [{
                "name": PLACE,
                "display_name": DISPLAY,
                "entry": f"/shokai/places/{PLACE}/entry",
                "principal_id": self.principal_id,
                "representative_id": self.rep_id,
                "spec_ref": {"version": "0.5.0", "url": "https://shokaiprotocol.com/spec/0.5.0"},
                "accepted_tags": [PROTOCOL, "shokai/0.3"],
            }],
        }

    def host_card_public(self) -> dict[str, Any]:
        payload = {
            "kind": "host",
            "protocol": PROTOCOL,
            "display_name": DISPLAY,
            "principal": {"principal_id": self.principal_id, "kind": "organization"},
            "representative_id": self.rep_id,
            "host_scope": {"actions": ["browse.look"], "duties": ["seat"]},
            "house_digest": digest_of({"name": PLACE, "actions": ["browse.look"]}),
        }
        return {"payload": payload, "payload_digest": digest_of(payload), "signatures": []}

    def lobby(self, why: str) -> dict[str, Any]:
        return {
            "protocol": PROTOCOL,
            "messages": [{
                "type": "lobby_briefing",
                "about": {"en-US": f"{DISPLAY}: a browse-only door (Python stdlib demo)."},
                "how": {"en-US": "Greet, present a signed visitor card, then ask to look around. Nothing spends here."},
                "readiness": [
                    {"code": "card", "required": True},
                    {"code": "owner_binding", "required": True},
                    {"code": "purpose", "required": True},
                    {"code": "introduction", "required": False},
                    {"code": "why", "text": why},
                ],
            }],
        }

    def handle_json(self, body: Any) -> tuple[int, dict[str, Any]]:
        if not isinstance(body, dict):
            return 200, self.lobby("body was not a JSON object")
        msgs = body.get("messages") or ([body] if body.get("type") else None)
        if not isinstance(msgs, list) or not msgs:
            return 200, self.lobby("no messages")
        # Unsigned / unreadable → lobby (Core Door browse).
        first = msgs[0]
        payload = first.get("payload") if isinstance(first, dict) and "payload" in first else first
        if not isinstance(payload, dict) or "type" not in payload:
            return 200, self.lobby("unsigned or unreadable message")
        if payload.get("protocol") not in (PROTOCOL, "shokai/0.3", None):
            return 200, self.lobby("unknown protocol tag")
        t = payload.get("type")
        if t == "greeting":
            eid = payload.get("encounter_id") or secrets.token_urlsafe(16)
            nonce = secrets.token_urlsafe(16)
            self.nonces.add(nonce)
            self.encounters[eid] = {"step": 1, "visitor": payload.get("from"), "nonce": nonce}
            return 200, {"protocol": PROTOCOL, "messages": [{
                "type": "greeting", "protocol": PROTOCOL, "encounter_id": eid,
                "from": self.rep_id, "nonce": nonce, "locales": ["en-US"], "sent_at": now_iso(),
            }]}
        if t == "card_presentation":
            eid = payload.get("encounter_id")
            enc = self.encounters.get(eid or "")
            if not enc:
                return 200, self.lobby("no encounter for this presentation")
            card = (payload.get("card") or {}).get("payload") if isinstance(payload.get("card"), dict) else None
            if not isinstance(card, dict):
                return 200, self.lobby("missing card")
            if card.get("kind") == "host":
                return 200, {"protocol": PROTOCOL, "messages": [{
                    "type": "act_decision", "decision": "deny", "disposition": "not_a_fit",
                    "reason_code": "CARD_KIND", "encounter_id": eid, "from": self.rep_id,
                }]}
            enc["step"] = 2
            enc["card"] = card
            return 200, {"protocol": PROTOCOL, "messages": [{
                "type": "card_receipt", "encounter_id": eid, "from": self.rep_id, "ok": True,
            }]}
        if t == "invitation_request":
            eid = payload.get("encounter_id")
            enc = self.encounters.get(eid or "")
            if not enc or enc.get("step", 0) < 2:
                return 200, self.lobby("ritual order: present a card first")
            actions = payload.get("actions") or []
            if any(a != "browse.look" for a in actions):
                return 200, {"protocol": PROTOCOL, "messages": [{
                    "type": "invitation_response", "decision": "deny", "disposition": "not_a_fit",
                    "reason_code": "SEAT_SCOPE_EXCEEDED", "encounter_id": eid, "from": self.rep_id,
                }]}
            seat_id = "seat-" + secrets.token_urlsafe(8)
            self.seats[seat_id] = {"encounter_id": eid, "tools": ["browse.look"]}
            enc["step"] = 3
            return 200, {"protocol": PROTOCOL, "messages": [{
                "type": "invitation_response", "decision": "grant", "encounter_id": eid,
                "from": self.rep_id, "seat": {"seat_id": seat_id, "tool_allowlist": ["browse.look"]},
            }]}
        if t == "act":
            seat = self.seats.get(payload.get("seat_id") or "")
            if not seat:
                return 200, {"protocol": PROTOCOL, "messages": [{
                    "type": "act_decision", "decision": "deny", "disposition": "not_now",
                    "reason_code": "SEAT_SCOPE_EXCEEDED", "from": self.rep_id,
                }]}
            tool = payload.get("tool")
            args = payload.get("arguments") or {}
            if tool != "browse.look" or (isinstance(args, dict) and args.get("amount") is not None):
                return 200, {"protocol": PROTOCOL, "messages": [{
                    "type": "act_decision", "decision": "deny", "disposition": "not_a_fit",
                    "reason_code": "SEAT_SCOPE_EXCEEDED", "from": self.rep_id,
                    "rationale": "browse door: no spending, only browse.look",
                }]}
            return 200, {"protocol": PROTOCOL, "messages": [{
                "type": "act_result", "ok": True, "tool": tool, "from": self.rep_id,
                "result": {"looked": True, "place": PLACE},
            }]}
        if t == "farewell":
            return 200, {"protocol": PROTOCOL, "messages": [{
                "type": "farewell", "outcome": "completed", "from": self.rep_id,
            }]}
        return 200, self.lobby(f"unknown type {t!r}")


DOOR = Door()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("door-py: " + (fmt % args) + "\n")

    def _send(self, code: int, obj: Any, content_type: str = "application/json") -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path in ("/shokai", f"/shokai/places/{PLACE}"):
            return self._send(200, DOOR.listing())
        if path.endswith("/host-card.json"):
            return self._send(200, DOOR.host_card_public())
        if path.endswith("/entry"):
            return self._send(200, {"protocol": PROTOCOL, "entry": path, "place": PLACE})
        self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(n) if n else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            return self._send(200, DOOR.lobby("body was not UTF-8 JSON"))
        code, reply = DOOR.handle_json(body)
        self._send(code, reply)


def main() -> None:
    host, port = "127.0.0.1", int(os.environ.get("PORT", "5103"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"minimal-browse-door-py on http://{host}:{port}/shokai (PID {os.getpid()})", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
