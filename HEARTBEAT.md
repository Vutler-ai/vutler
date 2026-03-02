# HEARTBEAT.md

## TODO & Agenda Check
On deeper heartbeats (~30min), scan `TODO.md` for overdue 🔴 items and `AGENDA.md` for upcoming events (<2h). Alert Alex if anything needs attention.

## Startup Checks (every new session)
Run these silently at first heartbeat after session start:
1. **Tailscale**: `open /Applications/Tailscale.app && sleep 3 && /Applications/Tailscale.app/Contents/MacOS/Tailscale up` (if stopped)
2. **Caffeinate**: Check `pgrep caffeinate` — if not running, `nohup caffeinate -dims &`
3. **Power source**: Check `pmset -g ps` — if on battery, alert Alex on WhatsApp

## ~~Vchat (Rocket.Chat)~~ — DEPRECATED
**Status:** No longer used. Rocket.Chat/Vchat removed from stack.
Internal comms now via other channels (WhatsApp, direct sessions_send).

## Email Inbox
Check `memory/email-inbox.jsonl` for new emails (polled from alex@vutler.com via IMAP).
If there are emails:
1. Read each line (JSON: uid, from, to, subject, body, date, ts)
2. Determine which agent(s) should handle based on the "to" address and content
3. Forward to the right agent via `sessions_send` if needed
4. Reply via kChat or WhatsApp to Alex with a summary
5. After processing, clear the file: write empty string to `memory/email-inbox.jsonl`

### Email → Agent Routing
| To address | Agents |
|-----------|--------|
| contact@ | andrea, victor |
| support@ | nora, mike |
| sales@ | victor, max |
| legal@, terms@, gdpr@ | andrea |
| security@ | mike, andrea |
| hr@ | andrea |
| info@ | andrea |
