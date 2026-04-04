# Legacy Surface Audit — April 2026

Audit repo de réduction de surface après les patchs prod P0→P5.

## Removed in This Chunk

- `/api/v1/vchat` retiré du bundle Office et fichier stub supprimé
- `/api/v1/drive-chat` retiré du bundle Office et fichier stub supprimé
- `/vchat` retiré des prefixes applicatifs côté frontend
- plan public `Open Beta` retiré de la page pricing marketing

Raison:

- ces surfaces étaient exposées publiquement
- elles ne portaient aucun comportement réel
- elles brouillaient la lecture du produit et augmentaient la surface d’attaque/documentation sans valeur runtime

## Remaining Legacy / Soft Surfaces

### A. Legacy compatibility kept on purpose

- `services/llmProviderCompat.js`
  - nécessaire tant que `workspace_llm_providers` existe encore dans des environnements anciens
- `api/auth.js`
  - migration contrôlée des anciens hashes SHA-256 vers bcrypt à la connexion
- `services/sniparaResolver.js`
  - fallback legacy workspace config pour environnements partiellement migrés
- `packages/nexus/lib/permission-engine.js`
  - compat avec anciens formats de consent model

### B. Public/runtime surfaces to evaluate next

- `api/usage.js`
  - shim legacy deprecated; à supprimer si aucun mount/runtime ne le référence encore
- `api/email-vaultbrix.js`
  - garde encore des routes marquées `legacy`
- `api/ws-chat.js`
  - socket browser actuel; pas legacy au sens Mongo, mais à auditer côté hardening/auth/observability
- `packages/local-daemon/*`
  - encore plusieurs branches `legacy config` / `allowedRepos`
- `services/runbooks.js`
  - fallback modèle encore sur `gpt-4o-mini`
- `packages/nexus/lib/providers/llm.js`
  - fallback modèle encore sur `gpt-4o`

### C. Product / UX surfaces still misleading

- admin et tables internes gardent encore la notion de plan `beta`
  - acceptable en interne pour migration/grants
  - à éviter sur les surfaces marketing publiques
- docs Nexus/MCP mentionnent encore certains chemins ou états `legacy`, `coming soon`, `experimental`
  - à nettoyer par lot documentaire séparé

### D. Hardening debt not yet removed

- bruit de bootstrap async dans les tests
  - `services/sandbox.js`
  - `services/pushService.js`
- intégrations stub/coming-soon encore visibles dans plusieurs docs et potentiellement dans des réponses API
- plusieurs specs/archive docs décrivent encore l’historique Mongo/Rocket.Chat

## Proposed Next Chunks

### L1 — Shim/API cleanup

- supprimer `api/usage.js` si non monté
- normaliser `api/email-vaultbrix.js` ou le débrancher si doublon

### L2 — Fallback model cleanup

- retirer les fallbacks `gpt-4o*` restants dans `services/runbooks.js` et `packages/nexus/lib/providers/llm.js`

### L3 — Bootstrap noise hardening

- empêcher les side effects async non attendus dans les tests pour `sandbox` et `pushService`

### L4 — Internal beta cleanup

- clarifier si `plan=beta` doit rester un état admin-only
- si oui: le sortir des surfaces business restantes
