# Short notes shipped with v0.5.0 (not normative)

**Status (v0.5.0): Notes, not in the core.** Each is a direction the editors want reviewed; none is scheduled. Examples are fictional.

## Several doors for one place
A place may keep a front door, a guest door, a staff door for its own agents and a vault door with joint opening, all leading into one room with one host representative. The door rules apply at every door; each door states which Shōkai visitor cards and purposes it serves. Related: P30 (joint opening).

## Passkeys on phones (owner-held storage)
One owner passkey can sign a separate Shōkai visitor card for each representative agent and a Shōkai host card for each place. It works with the platform passkey managers people already use, so it is platform-neutral. Representative keys stay on the owner's devices. Approvals come as a face or fingerprint prompt, and the return arrives as phone reminders or calendar holds.

## Shōkai on calls
Phone calls by agents announce themselves with a spoken claim the callee can't check. With Shōkai:
- **Outbound:** the calling representative agent carries its Shōkai visitor card and offers a short spoken code or a texted link the callee (or their agent) can check: which agent, which owner, what purpose.
- **Inbound:** the receiving host representative acts as the door: it checks the Shōkai visitor card, asks for one if missing, and politely turns away unknown agents.
- **Agent to agent:** both sides swap and check Shōkai cards silently at the start of the call, then talk.
Caller-ID checks prove a number, not the owner behind an agent, so this fills a separate gap. Candidate after v0.5.0.

## Other languages
After v0.5.0, a small, fast core for checking Shōkai cards (for example in Rust) that Python, Go, mobile and browsers can share. See SPEC.md §13 item 29.
