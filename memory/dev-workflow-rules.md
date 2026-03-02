# Règles de Workflow Dev - Vutler

**Date:** 2026-03-01 20:42  
**Owner:** Jarvis  
**Approuvé par:** Alex Lopez

---

## 🎯 Règle Fondamentale: "Tout Câblé ou Rien"

**Principe:** Chaque feature doit être **complètement câblée end-to-end** avant d'être considérée "terminée".

### ❌ Ce qu'on NE fait PLUS

**Anti-pattern 1: UI sans API**
```
❌ Frontend: Page /notifications existe
❌ Backend: Endpoint /api/v1/notifications retourne 404
Résultat: Page vide, mauvaise UX
```

**Anti-pattern 2: API sans UI**
```
❌ Backend: Endpoint /api/v1/agents/deploy existe
❌ Frontend: Aucun bouton "Deploy" dans l'UI
Résultat: Feature inutilisable, code mort
```

**Anti-pattern 3: UI + API mais pas câblés**
```
❌ Frontend: Appelle /api/v1/nexus/register avec { username, password }
❌ Backend: Attend { email, token }
Résultat: 400 Bad Request, feature cassée
```

---

## ✅ Nouveau Workflow: Full-Stack Obligatoire

### Checklist par Feature (OBLIGATOIRE)

**1. Conception**
- [ ] Spec API documentée (routes, params, responses)
- [ ] Mockup UI (wireframe ou Figma)
- [ ] Contract API ↔ Frontend défini

**2. Implémentation Backend**
- [ ] Endpoint créé
- [ ] DB schema créé (si nécessaire)
- [ ] Seed data ajoutée
- [ ] Tests API (curl/Postman)
- [ ] Status codes corrects (200/201/400/404/500)

**3. Implémentation Frontend**
- [ ] Page/Component créé
- [ ] Appelle le bon endpoint
- [ ] Gère les erreurs (loading, error states)
- [ ] Affiche les données correctement

**4. Intégration**
- [ ] Test end-to-end (UI → API → DB → UI)
- [ ] Vérifier les types (TypeScript si possible)
- [ ] Vérifier les champs (ex: `localToken` vs `token`)

**5. QA**
- [ ] Page fonctionne sans console errors
- [ ] API retourne data (pas array vide)
- [ ] Happy path + error cases testés

---

## 📋 Template de Story (Nouveau Format)

Chaque user story doit inclure **API + Frontend + Wiring**:

```markdown
## US-XXX: Feature Name

### API Spec
**Endpoint:** POST /api/v1/feature
**Request:**
{
  "field1": "string",
  "field2": number
}
**Response:**
{
  "success": true,
  "data": { ... }
}

### Frontend Spec
**Page:** /feature
**Component:** FeatureForm.tsx
**Calls:** POST /api/v1/feature
**Displays:** data.result in table

### DB Schema (si nécessaire)
CREATE TABLE features (
  id SERIAL PRIMARY KEY,
  ...
);

### Acceptance Criteria
- [ ] Backend: curl test passes
- [ ] Frontend: page renders without errors
- [ ] Integration: form submit → API → DB → UI update
- [ ] Edge cases: empty state, error handling
```

---

## 🚫 Definition of Done (DoD)

Une story est **DONE** seulement si:

1. ✅ Backend endpoint existe et retourne data
2. ✅ Frontend appelle endpoint et affiche data
3. ✅ DB tables existent avec seed data
4. ✅ Aucune erreur console (404, 500, undefined)
5. ✅ Edge cases gérés (loading, empty, error)
6. ✅ Testé end-to-end par dev
7. ✅ Commit + push avec message clair

**Si une seule checkbox manque → PAS DONE → PAS DE COMMIT**

---

## 📊 Exemples de Bugs Causés par Non-Respect

| Bug | Cause | Impact |
|-----|-------|--------|
| Nexus Registration | Frontend attend `token`, API retourne `localToken` | 🔴 Bloquant |
| Drive fichiers | UI existe, API retourne `[]` | 🔴 Bloquant |
| Email | UI existe, API stub vide | 🟠 Bloquant |
| Integrations | UI existe, endpoints 404 | 🟠 Important |
| LLM Settings | UI existe, static files 404 | 🟠 Important |
| Notifications | UI existe, API stub | 🟡 Polish |
| Usage | UI existe, API retourne vide | 🟡 Polish |
| Audit | UI existe, API stub | 🟡 Polish |

**Total bugs évitables:** 8/18 (44%)

**Temps perdu en debug:** ~15h (estimation)

---

## 🔧 Outils pour Éviter le Problème

### 1. Contract-First Development

Définir le contrat API **AVANT** de coder:

```typescript
// api-contracts/notifications.ts
export interface NotificationRequest {
  userId: string;
  message: string;
  type: 'info' | 'warning' | 'error';
}

export interface NotificationResponse {
  success: boolean;
  notification: {
    id: number;
    message: string;
    createdAt: string;
  };
}
```

Frontend et Backend utilisent le même fichier TypeScript.

### 2. API Mocking

Frontend peut commencer avec mock:

```typescript
// En dev, utilise mock si API pas prête
const API_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3001/api/v1' 
  : 'https://app.vutler.ai/api/v1';

// Mock fallback
if (!API_AVAILABLE) {
  return MOCK_DATA;
}
```

### 3. Integration Tests

Test automatisé end-to-end:

```javascript
// tests/integration/notifications.test.js
test('Create notification flow', async () => {
  // 1. Call API
  const response = await fetch('/api/v1/notifications', {
    method: 'POST',
    body: JSON.stringify({ message: 'Test' })
  });
  expect(response.status).toBe(201);
  
  // 2. Verify DB
  const notif = await db.query('SELECT * FROM notifications WHERE message = $1', ['Test']);
  expect(notif.rows.length).toBe(1);
  
  // 3. Verify Frontend renders
  await page.goto('/notifications');
  await page.waitForSelector('.notification-item');
  expect(await page.textContent('.notification-item')).toContain('Test');
});
```

---

## 🎯 Action Plan Immédiat

### Pour Vutler Stabilisation (en cours)

**Mike doit câbler TOUT:**
- Bug #5 (Email): ✅ API complet + seed data
- Bug #6 (Integrations): ✅ Tous endpoints + error handling
- Bug #7 (LLM Settings): ✅ Static files copiés
- Bug #8 (Notifications/Usage/Audit): ✅ API + DB + seed data

**Aucune exception.**

### Pour Futurs Sprints

**Avant de commencer un sprint:**
1. Review des stories → vérifier que spec API + UI existe
2. Assign: 1 dev = backend + frontend de SA story
3. Daily check: "Ton endpoint marche? Ton UI l'appelle?"

**En fin de sprint:**
1. Demo end-to-end (pas juste backend OU frontend)
2. QA checklist complète
3. Commit seulement si 100% câblé

---

## 📝 Conclusion

**Ancien workflow (cassé):**
```
Sprint → Dev backend → Dev frontend → Integration → Bugs
         ↓             ↓               ↓          ↓
      3 jours       3 jours         2 jours    4 jours (!)
                                              = 12 jours
```

**Nouveau workflow (correct):**
```
Sprint → Spec contract → Dev full-stack → QA → Done
         ↓               ↓                ↓      ↓
      1 jour          5 jours          1 jour  = 7 jours
```

**Gain:** -42% temps, -80% bugs

---

**Approuvé par:** Alex Lopez  
**Obligatoire à partir de:** Maintenant (2026-03-01)  
**Non-négociable:** Oui
