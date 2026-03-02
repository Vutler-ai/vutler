# Postal Email Configuration - Starbox Group

**Date:** 2026-03-01 21:09  
**Status:** Configuration en cours  
**Owner:** Jarvis

---

## 🎯 Domaines à Configurer

### 1. starbox-group.com (Corporate)
**Emails partagés:**
- info@starbox-group.com → alex@vutler.com
- contact@starbox-group.com → alex@vutler.com
- support@starbox-group.com → andrea@starbox-group.com
- sales@starbox-group.com → victor@starbox-group.com
- legal@starbox-group.com → andrea@starbox-group.com
- terms@starbox-group.com → andrea@starbox-group.com
- privacy@starbox-group.com → andrea@starbox-group.com
- gdpr@starbox-group.com → andrea@starbox-group.com
- security@starbox-group.com → mike@starbox-group.com
- hr@starbox-group.com → andrea@starbox-group.com

**Emails agents (12):**
- jarvis@starbox-group.com → alex@vutler.com (coordinateur)
- andrea@starbox-group.com → alex@vutler.com (office manager)
- mike@starbox-group.com → alex@vutler.com (lead engineer)
- philip@starbox-group.com → alex@vutler.com (UI/UX)
- luna@starbox-group.com → alex@vutler.com (product manager)
- max@starbox-group.com → alex@vutler.com (marketing)
- victor@starbox-group.com → alex@vutler.com (sales)
- oscar@starbox-group.com → alex@vutler.com (content)
- nora@starbox-group.com → alex@vutler.com (community)
- stephen@starbox-group.com → alex@vutler.com (spiritual)
- sentinel@starbox-group.com → alex@vutler.com (news analyst)
- marcus@starbox-group.com → alex@vutler.com (portfolio mgr)
- rex@starbox-group.com → alex@vutler.com (monitoring)

---

### 2. vutler.ai / vutler.com (Produit)
**Note:** Utilise emails @starbox-group.com (pas @vutler.ai)

**Emails affichés sur site:**
- Contact: contact@starbox-group.com
- Support: support@starbox-group.com
- Legal: legal@starbox-group.com
- Privacy: privacy@starbox-group.com

---

### 3. snipara.com (Produit)
**Note:** Utilise emails @starbox-group.com (pas @snipara.com)

**Emails affichés sur site:**
- Contact: contact@starbox-group.com
- Support: support@starbox-group.com
- Legal: legal@starbox-group.com
- Privacy: privacy@starbox-group.com

---

### 4. vaultbrix.com (Produit)
**Note:** Utilise emails @starbox-group.com (pas @vaultbrix.com)

**Emails affichés sur site:**
- Contact: contact@starbox-group.com
- Support: support@starbox-group.com
- Legal: legal@starbox-group.com
- Privacy: privacy@starbox-group.com

---

## 📋 Total Emails à Créer

- **starbox-group.com:** 10 partagés + 13 agents = 23 emails
- **vutler.ai:** Utilise @starbox-group.com (pas de domaine séparé)
- **snipara.com:** Utilise @starbox-group.com (pas de domaine séparé)
- **vaultbrix.com:** Utilise @starbox-group.com (pas de domaine séparé)

**Total:** 23 routes email (tous sur starbox-group.com)

---

## 🛠️ Configuration Steps

### 1. Create Admin User
```bash
docker exec -it postal-web postal admin create \
  --email alex@vutler.com \
  --password <secure-password> \
  --name "Alex Lopez"
```

### 2. Create Organization
```bash
docker exec -it postal-web postal org create \
  --name "Starbox Group" \
  --permalink starbox-group
```

### 3. Create Mail Server (1)
```bash
# starbox-group.com (utilisé par tous les sites)
docker exec -it postal-web postal server create \
  --org starbox-group \
  --name "Starbox Group" \
  --permalink starbox-group \
  --mode Live
```

### 4. Create Users (14 total)
```bash
# Alex (admin) - utilise alex@vutler.com pour login Postal
postal user create --email alex@vutler.com --name "Alex Lopez" --admin

# Note: alex@vutler.com = login Postal uniquement
# Pas de mailbox alex@starbox-group.com (utilise agents@ + shared@)

# 13 Agents
postal user create --email jarvis@starbox-group.com --name "Jarvis"
postal user create --email andrea@starbox-group.com --name "Andrea"
postal user create --email mike@starbox-group.com --name "Mike"
postal user create --email philip@starbox-group.com --name "Philip"
postal user create --email luna@starbox-group.com --name "Luna"
postal user create --email max@starbox-group.com --name "Max"
postal user create --email victor@starbox-group.com --name "Victor"
postal user create --email oscar@starbox-group.com --name "Oscar"
postal user create --email nora@starbox-group.com --name "Nora"
postal user create --email stephen@starbox-group.com --name "Stephen"
postal user create --email sentinel@starbox-group.com --name "Sentinel"
postal user create --email marcus@starbox-group.com --name "Marcus"
postal user create --email rex@starbox-group.com --name "Rex"
```

### 5. Create Mailboxes (23 total)
**Via Web UI:** https://mail.vutler.ai:8082

**For each mailbox:**
1. Create email address (e.g., info@starbox-group.com)
2. Assign users with access:
   - Shared emails → Alex + relevant agent
   - Agent emails → Alex + agent
3. Set permissions (read/write/delete)

---

## 📊 Mailbox Logic

**Vraies mailboxes** (pas de routing simple):

### Emails Partagés (avec accès multi-users)
- **info@starbox-group.com** → Mailbox partagée
  - Users: Alex + Jarvis
- **contact@starbox-group.com** → Mailbox partagée
  - Users: Alex + Jarvis
- **support@starbox-group.com** → Mailbox partagée
  - Users: Alex + Andrea
- **sales@starbox-group.com** → Mailbox partagée
  - Users: Alex + Victor
- **legal@starbox-group.com** → Mailbox partagée
  - Users: Alex + Andrea
- **terms@starbox-group.com** → Mailbox partagée
  - Users: Alex + Andrea
- **privacy@starbox-group.com** → Mailbox partagée
  - Users: Alex + Andrea
- **gdpr@starbox-group.com** → Mailbox partagée
  - Users: Alex + Andrea
- **security@starbox-group.com** → Mailbox partagée
  - Users: Alex + Mike
- **hr@starbox-group.com** → Mailbox partagée
  - Users: Alex + Andrea

### Emails Agents (mailbox individuelle + accès Alex)
- **jarvis@starbox-group.com** → Mailbox
  - Users: Alex + Jarvis
- **andrea@starbox-group.com** → Mailbox
  - Users: Alex + Andrea
- **mike@starbox-group.com** → Mailbox
  - Users: Alex + Mike
- **philip@starbox-group.com** → Mailbox
  - Users: Alex + Philip
- **luna@starbox-group.com** → Mailbox
  - Users: Alex + Luna
- **max@starbox-group.com** → Mailbox
  - Users: Alex + Max
- **victor@starbox-group.com** → Mailbox
  - Users: Alex + Victor
- **oscar@starbox-group.com** → Mailbox
  - Users: Alex + Oscar
- **nora@starbox-group.com** → Mailbox
  - Users: Alex + Nora
- **stephen@starbox-group.com** → Mailbox
  - Users: Alex + Stephen
- **sentinel@starbox-group.com** → Mailbox
  - Users: Alex + Sentinel
- **marcus@starbox-group.com** → Mailbox
  - Users: Alex + Marcus
- **rex@starbox-group.com** → Mailbox
  - Users: Alex + Rex

**Total:** 23 vraies mailboxes avec accès partagé

---

## 🔒 DNS Configuration

**MX Records (déjà configurés):**
- starbox-group.com → MX mail.vutler.ai

**SPF/DKIM/DMARC:**
- Configured in Postal for starbox-group.com server
- DNS: rp.vutler.ai (return path), track.vutler.ai (tracking)

---

## 🧪 Testing

**After setup:**
1. Send test email to info@starbox-group.com
2. Login as Alex → verify email visible in mailbox
3. Login as Jarvis → verify email visible (shared access)
4. Test each category:
   - support@ → Alex + Andrea can see
   - sales@ → Alex + Victor can see
   - security@ → Alex + Mike can see
5. Test agent emails:
   - Send to jarvis@ → Alex + Jarvis can see
   - Send to mike@ → Alex + Mike can see
6. Test reply from agent mailbox
7. Verify IMAP access for OpenClaw polling

---

## 🔌 Agent Email Access

**Option 1: IMAP Direct**
- Chaque agent poll sa boîte via IMAP
- Autonome mais fragmenté

**Option 2: Vutler Email Integration (RECOMMANDÉ)**
- Tous les emails centralisés dans Vutler /email page
- Filters par mailbox (info@, support@, jarvis@, etc.)
- Agents reçoivent notifications dans Vutler
- Workflow unifié

**Implementation:**
- Polling service checks all 23 mailboxes
- Stores in Vutler DB (emails table)
- Agents accès via Vutler UI
- Real-time notifications via WebSocket

---

## 📝 Next Steps

1. [ ] Create admin user in Postal (Alex)
2. [ ] Create organization "Starbox Group"
3. [ ] Create 1 mail server (starbox-group.com)
4. [ ] Create 14 users (Alex + 13 agents)
5. [ ] Create 23 mailboxes avec accès partagé
6. [ ] Configure IMAP for polling (all mailboxes)
7. [ ] Test email flow (send → receive → notify agent)
8. [ ] Integrate with Vutler /email page
9. [ ] Update MEMORY.md with final config

---

**Created:** 2026-03-01 21:09  
**Status:** Ready to configure  
**Owner:** Jarvis
