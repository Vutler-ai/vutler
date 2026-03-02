# LinkedIn Billing Incident - 2026-03-01

**Date:** 2026-03-01 21:19-21:22  
**Status:** ✅ Résolu (campagnes désactivées)  
**Owner:** Jarvis  
**Reported by:** Alex Lopez

---

## 🚨 Incident Summary

**Issue:** Factures LinkedIn élevées (montant anormal)

**Timeline:**
- 21:19: Alex signale factures LinkedIn élevées
- 21:19: Jarvis contacte Max (Marketing) pour vérifier
- 21:20: Max confirme aucune campagne lancée par lui
- 21:21: Jarvis guide Alex vers LinkedIn Ads Manager
- 21:22: Alex désactive les campagnes

**Resolution:** ✅ Campagnes désactivées

---

## 🔍 Investigation

### Questions en suspens:
- [ ] Montant exact de la facture?
- [ ] Durée des campagnes (dates début/fin)?
- [ ] Qui a lancé les campagnes? (historique accès)
- [ ] Type de campagnes (Ads, InMails, Sponsored Posts)?
- [ ] Budget quotidien/mensuel configuré?

### Agents consultés:
- ✅ Max (Marketing) → aucune campagne par lui
- ❓ Victor (Sales) → pas consulté
- ❓ Nora (Community) → pas consultée
- ❓ Luna (Product) → pas consultée

### Root Cause (CONFIRMÉ):
✅ **Alex avait lancé une promotion LinkedIn d'un article de blog** et l'avait oubliée.
- Campagne légitime
- Pas de problème de sécurité
- Juste un oubli de désactivation après la promotion

### Hypothèses initiales (INVALIDÉES):
1. ~~Renouvellement auto~~ ❌
2. ~~Campagne non autorisée~~ ❌
3. ~~Accès partagé~~ ❌
4. ~~Tests oubliés~~ ❌

---

## 🛡️ Safeguards Recommandés

### 1. Alertes Budget (Immédiat)
**Setup dans LinkedIn Ads Manager:**
- Budget daily cap: CHF 50/jour max
- Budget monthly cap: CHF 500/mois max
- Email alerts à Alex quand >80% budget utilisé

### 2. Process d'Autorisation (Cette semaine)
**Règle:** Toute dépense marketing >CHF 100/mois doit être approuvée par Alex

**Workflow:**
1. Agent (Max, Victor, Nora) veut lancer campagne
2. Création draft + estimation budget
3. Soumission à Alex via Vutler /approvals
4. Alex approuve/rejette + set budget cap
5. Agent lance campagne avec budget approuvé

### 3. Accès Restreint (Cette semaine)
**LinkedIn Ads Manager:**
- Admin: Alex uniquement
- Campaign Manager: Max (après approval process)
- Viewer: Victor, Nora, Luna (read-only)

**Credentials:**
- Stockés dans `.secrets/linkedin-credentials.md`
- Jamais partagés en clair
- Rotation tous les 3 mois

### 4. Audit Trail (Long terme)
**Logging automatique:**
- Toute campagne lancée → log dans Vutler audit
- Budget changes → notification Alex
- Weekly report: dépenses marketing par canal

### 5. Cost Dashboard (Long terme)
**Vutler /usage page:**
- Section "Marketing Spend"
- Breakdown par canal (LinkedIn, X, Facebook, etc.)
- Comparison budget vs actual
- YTD total

---

## 📝 Action Items

### Immédiat (Aujourd'hui)
- [x] Désactiver campagnes actives (fait par Alex)
- [ ] Documenter montant exact + dates
- [ ] Setup budget caps dans LinkedIn Ads Manager
- [ ] Vérifier pas d'autres campagnes actives (X, Facebook, etc.)

### Cette Semaine
- [ ] Créer process d'approval pour dépenses marketing
- [ ] Restreindre accès LinkedIn Ads Manager
- [ ] Documenter credentials dans `.secrets/`
- [ ] Email notification setup (budget alerts)

### Ce Mois
- [ ] Audit complet des comptes marketing (tous canaux)
- [ ] Cost dashboard dans Vutler
- [ ] Formation équipe sur process d'approval
- [ ] Monthly marketing spend report

---

## 💡 Lessons Learned

**Ce qu'on a appris:**
1. Pas de tracking des dépenses marketing en temps réel
2. Accès trop ouvert aux plateformes ads
3. Pas de process d'approval avant dépenses
4. Agents n'ont pas connaissance de qui a accès à quoi

**Comment éviter à l'avenir:**
1. Budget caps stricts sur toutes plateformes
2. Process d'approval obligatoire
3. Accès restreints + rotation credentials
4. Dashboard temps réel des dépenses

---

## 📊 Cost Impact

**TBD:** En attente du montant exact de la facture LinkedIn

**Next steps:**
1. Alex fournit montant exact
2. Jarvis documente dans ce fichier
3. Update budget 2026 si nécessaire

---

**Created:** 2026-03-01 21:22  
**Last Updated:** 2026-03-01 21:22  
**Status:** ✅ Incident résolu, safeguards à implémenter
