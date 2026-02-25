#!/usr/bin/env python3
"""Email polling bridge — polls alex@vutler.com for new emails, writes to inbox for heartbeat processing."""
import imaplib, email, json, time, os, sys
from email.header import decode_header

IMAP_HOST = "mail.infomaniak.com"
IMAP_USER = "alex@vutler.com"
IMAP_PASS = "Roxanne1212**#"
INBOX_FILE = "/Users/lopez/.openclaw/workspace/memory/email-inbox.jsonl"
STATE_FILE = "/Users/lopez/.openclaw/workspace/memory/email-poll-state.json"
POLL_INTERVAL = 60  # seconds

def decode_mime(s):
    if not s:
        return ""
    parts = decode_header(s)
    result = []
    for part, charset in parts:
        if isinstance(part, bytes):
            result.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(part)
    return " ".join(result)

def get_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")[:2000]
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")[:2000]
    return ""

# Load state
seen_uids = set()
if os.path.exists(STATE_FILE):
    try:
        seen_uids = set(json.load(open(STATE_FILE)).get("seen_uids", []))
    except:
        pass

print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Email poll started. {len(seen_uids)} known UIDs.", flush=True)

while True:
    try:
        m = imaplib.IMAP4_SSL(IMAP_HOST)
        m.login(IMAP_USER, IMAP_PASS)
        m.select("INBOX")
        
        typ, data = m.search(None, "UNSEEN")
        uids = data[0].split() if data[0] else []
        
        new_count = 0
        for uid in uids:
            uid_str = uid.decode()
            if uid_str in seen_uids:
                continue
            
            typ, msg_data = m.fetch(uid, "(RFC822)")
            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)
            
            from_addr = decode_mime(msg.get("From", ""))
            to_addr = decode_mime(msg.get("To", ""))
            subject = decode_mime(msg.get("Subject", ""))
            date = msg.get("Date", "")
            body = get_body(msg)
            
            entry = {
                "uid": uid_str,
                "from": from_addr,
                "to": to_addr,
                "subject": subject,
                "date": date,
                "body": body[:1000],
                "ts": int(time.time() * 1000)
            }
            
            with open(INBOX_FILE, "a") as f:
                f.write(json.dumps(entry) + "\n")
            
            seen_uids.add(uid_str)
            new_count += 1
            print(f"  📧 {from_addr} → {to_addr}: {subject[:60]}", flush=True)
        
        if new_count > 0:
            json.dump({"seen_uids": list(seen_uids)}, open(STATE_FILE, "w"))
        
        m.logout()
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr, flush=True)
    
    time.sleep(POLL_INTERVAL)
