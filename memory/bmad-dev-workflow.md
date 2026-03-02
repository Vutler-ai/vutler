# BMAD Development Workflow - Vutler

**Date:** 2026-03-01 20:44  
**Based on:** BMAD-METHOD (https://github.com/bmad-code-org/BMAD-METHOD)  
**Adapted for:** Feature development with UI + API + DB alignment

---

## 🎯 Problème à Résoudre

**Symptôme:** UI existe mais API 404, ou API existe mais pas d'UI, ou les deux mal câblés

**Root Cause:** Pas de spec unifiée **AVANT** de commencer à coder

**Solution:** BMAD Workflow en 4 phases obligatoires

---

## 📋 Les 4 Phases BMAD pour Features

### Phase B: Business (John - Product Manager)

**Objectif:** Comprendre **POURQUOI** on construit cette feature

**Livrables:**
- User Story courte
- Success metrics
- User flow (happy path + edge cases)

**Template:**
```markdown
## US-XXX: [Feature Name]

**As a** [persona]  
**I want to** [action]  
**So that** [business value]

**Success Metrics:**
- [Metric 1]: X% improvement
- [Metric 2]: Y users active

**User Flow:**
1. User opens /page
2. User clicks "Button"
3. API call → loading state
4. Success → show result
5. Error → show error message

**Edge Cases:**
- Empty state (no data)
- Error state (API 500)
- Loading state
```

**Responsable:** Luna (Product Manager agent) ou Alex

**Durée:** 30 min - 1h

---

### Phase M: Metrics (Winston - Architect)

**Objectif:** Définir les **critères de succès techniques**

**Livrables:**
- Acceptance Criteria (DoD)
- Performance targets
- Error handling requirements

**Template:**
```markdown
## Acceptance Criteria

**Functional:**
- [ ] Page renders without console errors
- [ ] API returns 200 with expected data structure
- [ ] DB query completes in <100ms
- [ ] Loading state shows during API call
- [ ] Error state shows on API failure
- [ ] Empty state shows when no data

**Performance:**
- [ ] Page load <2s
- [ ] API response <500ms
- [ ] Bundle size +<50KB

**Quality:**
- [ ] TypeScript types match API contract
- [ ] No hardcoded values
- [ ] Responsive (mobile + desktop)
```

**Responsable:** Jarvis (Architect) ou Mike (Tech Lead)

**Durée:** 15-30 min

---

### Phase A: Architecture (Winston - Architect)

**Objectif:** Définir le **contract API + DB schema** AVANT de coder

**Livrables:**
- API Contract (request/response)
- DB Schema (si nécessaire)
- Type definitions (TypeScript)

**Template:**
```markdown
## API Contract

### Endpoint
**Method:** POST  
**Path:** /api/v1/feature  
**Auth:** Required (Bearer token)

### Request
{
  "field1": "string",
  "field2": number,
  "field3": "optional string?"
}

### Response (Success)
**Status:** 201 Created
{
  "success": true,
  "data": {
    "id": number,
    "field1": "string",
    "createdAt": "ISO 8601 string"
  }
}

### Response (Error)
**Status:** 400 Bad Request
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}

## DB Schema (if needed)

CREATE TABLE features (
  id SERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL,
  field1 VARCHAR(255) NOT NULL,
  field2 INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_features_workspace ON features(workspace_id);

## TypeScript Types

// Shared contract (used by both frontend and backend)
export interface FeatureRequest {
  field1: string;
  field2: number;
  field3?: string;
}

export interface FeatureResponse {
  success: boolean;
  data?: {
    id: number;
    field1: string;
    createdAt: string;
  };
  error?: string;
  code?: string;
}
```

**Responsable:** Mike (Backend) + Philip (Frontend) review ensemble

**Durée:** 30 min - 1h

**Critical:** Frontend ET Backend doivent approuver ce contract AVANT de commencer à coder

---

### Phase D: Design (Philip - UX Designer)

**Objectif:** Wireframe + interaction states

**Livrables:**
- Mockup (Figma ou HTML/CSS simple)
- States: default, loading, success, error, empty
- Mobile + Desktop responsive

**Template (Markdown Wireframe):**
```markdown
## Wireframe: Feature Page

### Desktop View (Default State)
┌────────────────────────────────────────┐
│ Header: Feature Name                   │
├────────────────────────────────────────┤
│                                        │
│ [Input Field 1]                        │
│ [Input Field 2]                        │
│                                        │
│ [Create Feature Button]                │
│                                        │
│ Results:                               │
│ ┌────────────────────────────────────┐ │
│ │ • Feature 1 (created 2h ago)       │ │
│ │ • Feature 2 (created 1d ago)       │ │
│ └────────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘

### Loading State
[Create Feature Button] → [🔄 Creating...]

### Success State
✅ "Feature created successfully!"
→ Add to results list
→ Clear form

### Error State
❌ "Failed to create feature: [error message]"
→ Keep form filled
→ Allow retry

### Empty State (no features)
📭 "No features yet. Create your first one above!"
```

**Responsable:** Philip (UI/UX Designer)

**Durée:** 1-2h

**Critical:** Wireframe doit montrer TOUS les états (loading, error, empty)

---

## 🔄 Workflow Complet (Step-by-Step)

### Avant de Commencer à Coder

```
1. John (PM):    Write User Story → 30 min
2. Winston (Arch): Write Acceptance Criteria → 15 min
3. Winston + Mike + Philip: Review API Contract ensemble → 30 min
   → TOUS approuvent? → Continue
   → Désaccord? → Itérer jusqu'à consensus
4. Philip (UX): Create Wireframe avec tous états → 1h
5. CHECKPOINT: Review complet (John + Winston + Philip) → 15 min
   → Tout aligné? → GO CODER
   → Gaps? → Revenir à phase concernée
```

**Total avant coding:** 2h30 - 3h

**Gain:** -15h de debug après

---

### Pendant le Coding

**Backend (Mike):**
1. Créer DB schema (si nécessaire) → 15 min
2. Seed data sample → 15 min
3. Créer endpoint selon contract exact → 1-2h
4. Tests curl/Postman → 15 min
5. **Vérifier types TypeScript matchent contract** → 5 min

**Frontend (Philip):**
1. Créer page/component selon wireframe → 1-2h
2. Implémenter états (loading, error, empty) → 30 min
3. Appeler API selon contract exact → 30 min
4. **Vérifier types TypeScript matchent contract** → 5 min

**Durée parallèle:** 2-3h (backend + frontend en même temps)

---

### Integration & QA

```
1. Philip teste frontend avec API réelle → 15 min
   → Marche? → Continue
   → Bugs? → Debug ensemble (Mike + Philip)

2. Mike teste edge cases (empty, error) → 15 min

3. Ensemble: QA checklist complète → 30 min
   - [ ] Happy path works
   - [ ] Loading state shows
   - [ ] Error state shows (test with invalid data)
   - [ ] Empty state shows (test with empty DB)
   - [ ] Types match on both sides
   - [ ] No console errors
   - [ ] Responsive works

4. CHECKPOINT: Demo à Luna (PM)
   → Acceptance criteria met? → DONE
   → Gaps? → Fix et re-test
```

**Durée:** 1-1.5h

---

## 📊 Comparaison Ancien vs BMAD Workflow

### Ancien Workflow (sans BMAD)
```
Sprint planning → Start coding
  ↓
Mike code backend pendant 2 jours
  ↓
Philip code frontend pendant 2 jours
  ↓
Integration: "Ah merde, l'API attend {token} mais le frontend envoie {localToken}"
  ↓
Debug 4h
  ↓
Fix backend OU frontend
  ↓
Re-test
  ↓
QA trouve autre bug (empty state pas géré)
  ↓
Fix 2h
  ↓
DONE (maybe)

Total: 5 jours
```

### BMAD Workflow
```
Sprint planning
  ↓
BMAD Phase B+M+A+D: 3h (John, Winston, Philip ensemble)
  ↓
Contract approved par tous
  ↓
Mike + Philip codent en parallèle: 3h (guidés par contract exact)
  ↓
Integration: "Ça marche du premier coup car on suit le même contract"
  ↓
QA: 1h
  ↓
DONE

Total: 2 jours
```

**Gain:** -60% temps, -90% bugs d'intégration

---

## 🛠️ Outils pour Supporter BMAD

### 1. Contract-First File (Shared TypeScript)

Créer `/contracts/feature.ts` avant de coder:

```typescript
// contracts/notifications.ts
export interface NotificationRequest {
  userId: string;
  message: string;
  type: 'info' | 'warning' | 'error';
}

export interface NotificationResponse {
  success: boolean;
  notification?: {
    id: number;
    message: string;
    createdAt: string;
  };
  error?: string;
  code?: string;
}
```

Backend ET Frontend importent ce fichier:

```typescript
// Backend (api/notifications.ts)
import { NotificationRequest, NotificationResponse } from '../../contracts/notifications';

router.post('/notifications', async (req, res) => {
  const body: NotificationRequest = req.body; // TypeScript valide
  // ...
  const response: NotificationResponse = { ... };
  res.json(response);
});

// Frontend (components/NotificationForm.tsx)
import { NotificationRequest, NotificationResponse } from '@/contracts/notifications';

async function createNotification(data: NotificationRequest): Promise<NotificationResponse> {
  const response = await fetch('/api/v1/notifications', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  return response.json(); // TypeScript valide
}
```

### 2. BMAD Story Template (Markdown)

Créer template réutilisable:

```
/templates/bmad-story.md

# US-XXX: [Feature Name]

## B: Business (Product Manager)
[User story + success metrics]

## M: Metrics (Architect)
[Acceptance criteria + DoD]

## A: Architecture (Architect)
[API contract + DB schema + Types]

## D: Design (UX Designer)
[Wireframe + states]

## Implementation Log
- [x] Contract reviewed and approved
- [x] Backend implemented
- [x] Frontend implemented
- [x] Integration tested
- [x] QA passed
```

### 3. Pre-Commit Hook (Force BMAD Compliance)

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Check if story has BMAD sections
if ! git diff --cached --name-only | grep -q "docs/stories/"; then
  echo "✅ No story files modified"
  exit 0
fi

# Verify BMAD sections exist
for file in $(git diff --cached --name-only | grep "docs/stories/"); do
  if ! grep -q "## B: Business" "$file" || \
     ! grep -q "## M: Metrics" "$file" || \
     ! grep -q "## A: Architecture" "$file" || \
     ! grep -q "## D: Design" "$file"; then
    echo "❌ ERROR: $file is missing BMAD sections"
    echo "Run: npx bmad-method create-story"
    exit 1
  fi
done

echo "✅ BMAD compliance verified"
```

---

## 🎯 Application Immédiate à Vutler

### Pour les Bugs P1 en Cours (Mike)

**Avant de fixer chaque bug:**
1. **B:** Quel est le user flow attendu?
2. **M:** Quels sont les critères de succès?
3. **A:** Quel est le contract API exact? (request/response)
4. **D:** Quels états UI faut-il gérer? (loading, error, empty)

**Exemple: Bug #8 (Notifications)**

**B: Business**
- User veut voir ses notifications
- Success: User voit liste de notifs + peut les marquer comme lues

**M: Metrics**
- [ ] GET /api/v1/notifications retourne 200 + array
- [ ] Page /notifications affiche liste
- [ ] Empty state si aucune notif
- [ ] Loading state pendant API call

**A: Architecture**
```typescript
// contracts/notifications.ts
export interface Notification {
  id: number;
  type: 'info' | 'warning' | 'error';
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  success: boolean;
  data: Notification[];
  total: number;
}
```

**D: Design**
- Default: Liste de notifs
- Empty: "📭 No notifications"
- Loading: "🔄 Loading..."

**Implementation:**
1. Mike crée endpoint selon contract → 30 min
2. Mike seed 3-5 sample notifs → 10 min
3. Philip update frontend pour appeler endpoint → 20 min
4. Test ensemble → 10 min
5. DONE

Total: 1h10 (au lieu de 3-4h avec bugs)

---

## 📋 Checklist de Transition

### Cette Semaine (Stabilisation Vutler)
- [ ] Mike utilise BMAD mental model pour bugs P1
- [ ] Documenter chaque bug avec mini-BMAD (B+M+A+D notes)
- [ ] Review ensemble avant de coder si complexe

### Semaine Prochaine (Sprints Futurs)
- [ ] Créer `/contracts/` folder dans repo
- [ ] Template BMAD story dans `/templates/`
- [ ] Pre-commit hook pour forcer BMAD
- [ ] Formation équipe (15 min demo BMAD workflow)

### Long Terme
- [ ] Installer BMAD-METHOD complet (`npx bmad-method install`)
- [ ] Utiliser agents BMAD (John, Winston, Amelia) pour guidance
- [ ] Intégrer avec Vutler (agents cloud peuvent run BMAD workflows)

---

## 🎓 Resources

**BMAD-METHOD:**
- Repo: https://github.com/bmad-code-org/BMAD-METHOD
- Docs analysées: `/projects/vutler/docs/bmad-analysis.md`

**Notre adaptation:**
- Workflow: `memory/bmad-dev-workflow.md` (ce fichier)
- Rules: `memory/dev-workflow-rules.md`
- Vutler stabilisation: `memory/vutler-stabilisation-strategy.md`

---

**Créé par:** Jarvis  
**Approuvé par:** Alex Lopez  
**Obligatoire:** Oui, à partir de maintenant
