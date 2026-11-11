# Minimal browse door (Python, stdlib)

**NOT CONFORMANT — do not deploy.** A **language-neutrality companion** to [`../minimal-browse-door/`](../minimal-browse-door/). Pure Python 3 standard library: no pip packages, no `@kigenka/shokai`.

It is a **sketch**, not a full Core Door (browse) claim. It shows that the core story — listing, lobby, greeting, card, grant, browse-only acts, refuse spending — does not depend on TypeScript or the SDK.

```bash
python3 door.py          # http://127.0.0.1:5103/shokai
python3 check.py         # starts the door, runs black-box checks, stops it
```

For a door that claims the browse profile, use the Node example and its conformance run.
