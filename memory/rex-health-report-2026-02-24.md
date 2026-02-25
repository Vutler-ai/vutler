# 🔧 Rex Health Report — 2026-02-24 09:55 CET

## Endpoints Health Check

| Service | URL | Status | Response Time | SSL |
|---------|-----|--------|--------------|-----|
| Snipara | https://snipara.com | ✅ 301→200 | 0.56s | ✅ Valid |
| VaultBrix | https://vaultbrix.com | ✅ 200 | 0.09s | ✅ Valid |
| Vutler App | https://app.vutler.ai | ✅ 200 | 0.03s | ✅ Valid |
| DubGrr | https://dubgrr.com | ✅ 307 (redirect) | 0.19s | ✅ Valid |
| Zorai | https://zorai.ai | ✅ 307 (redirect) | 0.46s | ✅ Valid |
| SwapLoom | https://swaploom.com | ✅ 307 (redirect) | 0.09s | ✅ Valid |
| Starbox Group | https://starbox-group.com | ✅ 307 (redirect) | 0.32s | ✅ Valid |

> SSL verify result = 0 for all = valid certificates.
> 307 redirects are normal (typically http→https or www redirects via hosting provider).

## VPS Status (83.228.222.180)

### Uptime
- **6 days, 22h31** — Load avg: **0.03, 0.12, 0.12** ✅ Very low

### RAM
- Total: **11Gi** | Used: **2.4Gi** | Available: **9.3Gi** ✅ OK (22% used)

### Disk
- **19G total** | **14G used** | **4.8G free** | **75% used** ⚠️ ATTENTION

### Docker Containers (11 running)
| Container | Status | Ports |
|-----------|--------|-------|
| vutler-api | ✅ Up 11h (healthy) | :3001 |
| postal-smtp | ✅ Up 19h | :25, :587 |
| postal-worker | ✅ Up 19h | — |
| postal-web | ✅ Up 19h | :8082 |
| postal-rabbitmq | ✅ Up 19h | internal |
| postal-mariadb | ✅ Up 19h | :3306 |
| vutler-rocketchat | ✅ Up 12h (healthy) | :3000 |
| vutler-postgres | ✅ Up 20h (healthy) | :5432 |
| vutler-redis | ✅ Up 20h (healthy) | :6379 |
| vutler-mongo | ✅ Up 20h (healthy) | :27017 |
| vutler-mailhog | ✅ Up 20h | :1025, :8025 |

## ⚠️ Alertes

1. **DISK 75%** — Le disque principal est à 75% (4.8G libres sur 19G). Pas critique mais à surveiller. Recommandation : nettoyer les images Docker inutilisées (`docker system prune`) et les vieux logs.

## ✅ Résumé

- **7/7 endpoints UP** — tous accessibles, SSL valide
- **11/11 containers running** — tous healthy
- **CPU/RAM** — charge très faible, aucun problème
- **Disk** — seul point d'attention à 75%
