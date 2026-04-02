# TODO

Mise à jour : **28 mars 2026**

Board courant du projet.  
Le précédent état (bugs P0/P1, DDL Vaultbrix, anciens P2) est archivé et n’est plus représentatif de la situation actuelle.

---

## Recently Shipped (mars 2026)

- [x] Audit sécurité pré-prod terminé, avec correctifs **P0 / P1 / P2**
- [x] Guard d’authentification pour la sandbox
- [x] Provider **Codex** via **ChatGPT OAuth** avec streaming **SSE**
- [x] Serveur **MCP Vutler** unifié (`@vutler/mcp`)
- [x] Intégration **Post for Me** + packs add-on **Stripe**
- [x] Séparation de **vutler.ai** et **app.vutler.ai**
- [x] Wizard de type d’agent + limites de skills (**max 8**)
- [x] Lineup **GPT-5.4** + préfixe `codex/`
- [x] Auth **X-API-Key** pour compatibilité MCP
- [x] `PUT /api/v1/auth/me`
- [x] Fallback d’exécution de tâches vers **Anthropic**
- [x] Configuration **Snipara** dans les settings
- [x] Réécriture documentation **P0** :
  - [x] `README`
  - [x] `AGENTS`
  - [x] `CODING_STANDARDS`
  - [x] `VUTLER-TOOLS`

---

## Current Priorities

- [ ] Documentation **P1 / P2**
  - [ ] `SECURITY`
  - [ ] `frontend/README`
  - [ ] `TOOLS`
  - [ ] roadmap
- [ ] Daemon local WebSocket pour git-sync (`@vutler/local-daemon`)
- [ ] Stabilisation de l’écosystème MCP
- [ ] Observabilité du streaming SSE
- [ ] Matrice de compatibilité des providers

---

## Deferred

- [ ] Intégration **LiveKit**  
  _Deferred — reprise uniquement sur go explicite d’Alex_
- [ ] Dispatch webhook **Enterprise Nexus** + callback async
- [ ] Périmètre exploratoire CLI

---

## Removed / Deprecated

- **Rocket.Chat integration** — remplacée par WebSocket natif
- **MongoDB support** — supprimé
- **MiniMax provider** — supprimé
```

Si tu veux, je peux aussi te le reformater en version un peu plus “produit/engineering board”, avec sections **Shipped / In progress / Next / Later / Removed**, plus lisible dans un repo.
