# HEARTBEAT.md

## TODO & Agenda Check
On deeper heartbeats (~30min), scan `TODO.md` for overdue 🔴 items and `AGENDA.md` for upcoming events (<2h). Alert Alex if anything needs attention.

## Startup Checks (every new session)
Run these silently at first heartbeat after session start:
1. **Tailscale**: `open /Applications/Tailscale.app && sleep 3 && /Applications/Tailscale.app/Contents/MacOS/Tailscale up` (if stopped)
2. **Caffeinate**: Check `pgrep caffeinate` — if not running, `nohup caffeinate -dims &`
3. **Power source**: Check `pmset -g ps` — if on battery, alert Alex on WhatsApp

## Vchat (Vutler RC) — Internal Comms
Post messages to Vchat channels via RC API on VPS (port 3000):
```
ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180 'curl -s -X POST "http://127.0.0.1:3000/api/v1/chat.sendMessage" -H "X-Auth-Token: <TOKEN>" -H "X-User-Id: <USER_ID>" -H "Content-Type: application/json" -d "{\"message\":{\"rid\":\"<CHANNEL_ID>\",\"msg\":\"<TEXT>\"}}"'
```

### Vchat Channel IDs
general=GENERAL, engineering=6994cd266dac3d6576c9d4fa, product=6994cd266dac3d6576c9d501, design=6994cd266dac3d6576c9d508, marketing-growth=6994cd276dac3d6576c9d50e, sales=6994cd276dac3d6576c9d515, content=6994cd276dac3d6576c9d51b, community=6994cd276dac3d6576c9d522, ops-jarvis=6994cd276dac3d6576c9d529, ops-strategy=6994cd276dac3d6576c9d52d

### Channel → Agent Routing
| Channel | Agents |
|---------|--------|
| engineering | mike, philip, luna |
| product | luna, mike, philip |
| design | philip, oscar |
| marketing-growth | max, oscar, nora |
| sales | victor, max |
| content | oscar, max, nora |
| community | nora, max, oscar |
| ops-jarvis | jarvis, andrea |
| ops-strategy | jarvis, luna, andrea |
| general | everyone |

## Vchat Inbox
Check `memory/vchat-inbox.jsonl` for new messages from Vchat. If there are messages:
1. Read each line (JSON: channel, channel_id, user_id, username, message, message_id, ts)
2. Route to the right agent(s) based on channel (see Channel → Agent Routing above)
3. Respond via RC API on VPS (see Vchat comms section above)
4. After processing, clear the file: write empty string to `memory/vchat-inbox.jsonl`

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
