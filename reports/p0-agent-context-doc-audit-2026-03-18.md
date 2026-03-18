# Audit Documentation Snipara & Vutler – Pertinence « agent-context »  
Date : 2026-03-18  
Auteur : sub-agent Rex  

---

## 1. Périmètre analysé

1. Répertoire `/workspace/scripts/snipara/*`, scripts Snipara et SQL de synchro
2. Répertoire `/workspace/projects/vutler/**` y compris `vutler-docs/`, `website/`, `settings-sprint/`
3. Mémoire pertinente : `memory/infra-vutler.md`, `memory/vutler-vps-health-latest.md`, `snipara-htask-regression-2026-03-16.md`

## 2. Constats principaux

### 2.1 Snipara

| Élément | Présence | Observations |
|---------|----------|--------------|
| README / overview | ❌ | Aucun fichier Markdown dédié. |
| Diagrammes d’architecture | ❌ | Pas de diagramme ou description des flux. |
| Spéc. API / contrats | ❌ | Les scripts bash/SQL supposent certaines tables/ routes Snipara mais rien n’est documenté. |
| Exemple de payload / scénarios | ❌ | N/A |
| Intégration avec agents OpenClaw | 🟠 | Existence de scripts `sync-agents-to-snipara.js` et hooks, mais sans guide d’usage. |

### 2.2 Vutler

| Section | Présence | Gaps clés |
|---------|----------|-----------|
| DEPLOY-NEXTJS-SERVER.md | ✔️ | Procedural uniquement ; manque contexte « pourquoi », dépendances, rollback. |
| TECHNICAL-REFERENCE.md | ✔️ | Bonne overview mais pas reliée aux concepts d’agent / sub-agent ; pas de mapping fichiers → capacités. |
| Website docs (about, features…) | ✔️(marketing) | Pas exploitable par agents pour reasoning. |
| Settings-sprint docs | ✔️ (process) | Détails opérationnels mais datés. |
| API / CLI docs | ❌ | Les dossiers `openclaw/src/commands/**` contiennent du code mais zéro doc narrative. |

## 3. Gaps concrets à combler

1. **Absence totale de documentation Snipara côté agent-context** : pas de README, pas d’ADR, pas de définition des entités ni de la taxonomie « htask ».
2. **Pas de mapping Vutler <-> agents** : l’arborescence OpenClaw pour Vutler est vaste, mais aucune table décrivant quelles commandes exposent quels outils aux agents.
3. **Manque de scénarios end-to-end** : aucun walkthrough « un agent traite une tâche Snipara, déclenche Vutler, etc. »
4. **Spécifications d’API internes manquantes** : tables SQL, endpoints REST/GraphQL référencés dans les scripts ne sont pas décrits.
5. **Absence de glossaire commun** : termes « htask », « swarm », « parity », etc. apparaissent sans définition.

## 4. Actions prioritaires (P1 = urgent)

| # | Priorité | Action | Propriétaire suggéré |
|---|----------|--------|----------------------|
| A1 | P1 | Créer `projects/snipara/README.md` avec : objectif, flux principaux, schéma base de données, endpoints. | Équipe Snipara |
| A2 | P1 | Générer un **glossaire partagé** (`docs/GLOSSARY.md`) alimenté par Snipara & Vutler. | Tech writers |
| A3 | P1 | Dans `vutler-docs/`, ajouter **COMMANDS.md** listant chaque CLI / src/commands/* avec description, exemples. | Core Vutler |
| A4 | P2 | Écrire un "Getting started agent→Snipara→Vutler" (tutorial 15 min). | DevRel |
| A5 | P2 | Ajouter ADRs pour choix d’architecture (swarm, parity cache). | Architects |
| A6 | P3 | Intégrer diagrammes (PlantUML / Mermaid) générés dans README via CI. | DevOps |

## 5. Patch-list exécutable (à appliquer)

```bash
# 1. Esquisse des fichiers (à exécuter à la racine workspace)
mkdir -p docs/snipara docs/vutler
cat > docs/snipara/README.md <<'EOF'
# Snipara – Vue d’ensemble
> _Template initial, à compléter_

## Mission
## Architecture (diagramme à insérer)
## Entités principales
## Endpoints / Tables
## Scénarios typiques
EOF

cat > docs/GLOSSARY.md <<'EOF'
# Glossaire Snipara & Vutler
| Terme | Définition |
|-------|------------|
| htask | TODO |
| swarm | TODO |
EOF

cat > docs/vutler/COMMANDS.md <<'EOF'
# Vutler – Commandes CLI / Agent
| Commande | Source file | Description | Exemple |
|----------|-------------|-------------|---------|
EOF

# 2. Commit
git add docs/snipara/README.md docs/GLOSSARY.md docs/vutler/COMMANDS.md
git commit -m "docs: bootstrap Snipara & Vutler agent-context documentation skeletons"
```

---

## 6. Conclusion

La documentation actuelle est insuffisante pour permettre à un agent (ou humain) de raisonner efficacement sur les systèmes Snipara & Vutler. Les actions ci-dessus posent les fondations minimales ; sans elles, toute automatisation restera fragile.
