# Guide Utilisateur - Chiffrement E2E et VDrive Intégré
**Version:** 1.0 - Phase 2  
**Date:** 2026-02-23  
**Public cible:** PMEs, Solopreneurs, Teams

## Introduction au Chiffrement de Bout en Bout

### Qu'est-ce que le chiffrement E2E dans Vutler ?

Vutler Phase 2 introduit le **chiffrement de bout en bout (E2E)** pour vos conversations et fichiers. Cela signifie que :

✅ **Vos données sont chiffrées sur votre appareil** avant d'être envoyées  
✅ **Seuls vous et les participants autorisés** peuvent les déchiffrer  
✅ **Les agents IA accèdent temporairement** aux contenus pour vous aider  
✅ **Même nos administrateurs ne peuvent pas** lire vos données privées

### Pourquoi c'est important pour votre business ?
- 🔐 **Confidentialité client garantie** - Protégez vos échanges sensibles
- 📋 **Conformité GDPR/LPD** - Respectez automatiquement les réglementations
- 🤝 **Confiance équipe** - Partagez en toute sécurité avec vos collègues
- 🚀 **IA sécurisée** - Bénéficiez de l'assistance IA sans compromettre la confidentialité

## Guide d'Onboarding - Configuration E2E

### Étape 1: Activation du Chiffrement

1. **Connectez-vous** à votre compte Vutler
2. **Cliquez sur votre profil** (coin supérieur droit)
3. **Sélectionnez "Sécurité"** dans le menu
4. **Activez "Chiffrement de bout en bout"**

![Activation E2E](images/activation-e2e.png)

### Étape 2: Configuration de votre Clé Principale

Vutler va générer votre **clé de chiffrement principale** :

```
⚠️ IMPORTANT: Cette étape ne peut être répétée !

Votre phrase de récupération (24 mots):
abandon ability able about above absent absorb
abstract absurd abuse access accident account
accurate achieve acid acoustic acquire across
act action actor actress actual adapt add
address adjust admit adult advance advice

✅ J'ai noté ma phrase de récupération en sécurité
✅ Je comprends que sans cette phrase, mes données seront perdues
```

### Étape 3: Vérification de la Phrase

Saisissez **3 mots aléatoires** de votre phrase pour confirmer :

```
Mot #7: _________
Mot #15: _________
Mot #21: _________
```

### Étape 4: Configuration des Appareils

Si vous utilisez **plusieurs appareils** (ordinateur, téléphone), synchronisez votre clé :

1. **Sur votre nouvel appareil**, connectez-vous à Vutler
2. **Choisissez "Synchroniser clé existante"**
3. **Saisissez votre phrase de récupération**
4. **Confirmez avec votre mot de passe**

## Utiliser Vchat avec Chiffrement

### Envoi de Messages Chiffrés

Les messages sont **automatiquement chiffrés** une fois E2E activé :

![Message chiffré](images/message-chiffre.png)

**Indicateurs visuels :**
- 🔒 **Cadenas vert** = Message chiffré avec succès
- ⚠️ **Cadenas orange** = Chiffrement partiel (certains destinataires non-E2E)
- ❌ **Cadenas rouge** = Erreur de chiffrement

### Messages avec Agents IA

Vos **agents IA restent fonctionnels** avec le chiffrement :

```
👤 Vous: Analyse ce rapport financier confidentiel [📎 rapport-q4.pdf]

🤖 Claude: Je vois votre rapport financier Q4. Voici mon analyse :

📊 Résultats positifs:
• CA en hausse de 15% vs Q3
• Marge brute améliorée à 68%
• Trésorerie saine (€2.4M)

⚠️ Points d'attention:
• Charges marketing élevées (-12% ROI)
• Dette court terme à surveiller

Souhaitez-vous que je détaille certains aspects ?

🔒 Déchiffrement éphémère activé - Données effacées après traitement
```

**Ce qui se passe techniquement :**
1. Votre message/fichier reste **chiffré** dans notre base
2. L'agent **déchiffre temporairement** (30 secondes max) pour analyse
3. Les données sont **effacées** de la mémoire après traitement
4. L'agent **n'a jamais accès permanent** à vos contenus

### Gestion des Permissions Agent

**Personnalisez l'accès** de vos agents aux données chiffrées :

![Permissions agents](images/permissions-agents.png)

| Agent | Messages | Fichiers | GitHub | Recommandation |
|-------|----------|----------|--------|----------------|
| **Claude Assistant** | ✅ Déchiffrement | ✅ Métadonnées | ❌ Aucun | Pour assistance générale |
| **Code Assistant** | ❌ Aucun | ✅ Déchiffrement | ✅ Tous événements | Pour développement |
| **Analytics Bot** | ✅ Métadonnées | ❌ Aucun | ❌ Aucun | Pour statistiques |

**Types de permissions :**
- **🚫 Aucun** : Agent ne voit rien
- **📊 Métadonnées** : Titre, taille, type, mais pas le contenu
- **⚡ Déchiffrement éphémère** : Accès temporaire au contenu

## VDrive Intégré dans Vchat

### Upload et Partage de Fichiers

**Nouvelle expérience unifiée** - Partagez vos fichiers directement depuis le chat :

![VDrive intégré](images/vdrive-vchat.png)

#### Méthode 1: Drag & Drop
1. **Glissez votre fichier** dans la zone de chat
2. **Choisissez les permissions** de partage
3. **Le fichier est automatiquement chiffré** et uploadé

#### Méthode 2: Panel VDrive
1. **Cliquez sur l'icône VDrive** (📁) à côté du champ message
2. **Parcourez vos fichiers** existants ou uploadez
3. **Sélectionnez et partagez** en un clic

### Types de Partage

```
🌍 PUBLIC dans ce chat
└─ Tous les participants peuvent voir et télécharger

🔒 PRIVÉ avec preview
└─ Seuls les autorisés téléchargent, autres voient preview

👥 ÉQUIPE seulement
└─ Accessible uniquement aux membres de l'équipe

⏰ TEMPORAIRE (7 jours)
└─ Lien expire automatiquement
```

### Prévisualisation Sécurisée

**Previews générés côté serveur** sans compromettre la sécurité :

- **📄 Documents PDF** : Première page + métadonnées
- **🖼️ Images** : Miniature + infos EXIF filtrées
- **📊 Spreadsheets** : Première feuille (données masquées)
- **📹 Vidéos** : Thumbnail + durée

![Preview sécurisé](images/preview-securise.png)

### Navigation et Organisation

**Panel VDrive intégré** avec fonctionnalités complètes :

```
📁 VDrive - Mes Fichiers
├── 📂 Projets Clients
│   ├── 📄 Contrat_ACME_2026.pdf 🔒
│   └── 📊 Budget_Q1.xlsx 🔒
├── 📂 Équipe Marketing  
│   ├── 🎨 Logo_V2.png 🌍
│   └── 📹 Demo_Produit.mp4 🔒
└── 📂 Documents Partagés
    ├── 📋 Procédures_QA.md 👥
    └── 📈 Rapport_Mensuel.pdf ⏰
```

**Légende :**
- 🔒 Chiffré personnel
- 🌍 Public équipe  
- 👥 Accès équipe
- ⏰ Temporaire

## FAQ Sécurité

### Questions Générales

**Q: Si j'oublie ma phrase de récupération, que se passe-t-il ?**  
A: ⚠️ **Vos données chiffrées seront définitivement perdues**. Nous ne pouvons pas les récupérer car nous n'avons pas accès à votre clé de chiffrement. C'est le prix de la confidentialité absolue.

**Q: Les agents IA peuvent-ils "espionner" mes données ?**  
A: Non. Les agents déchiffrent vos données **seulement quand vous leur demandez** explicitement de les analyser. Le déchiffrement est **éphémère** (30 secondes max) et **tracé dans les logs**.

**Q: Comment fonctionne le partage d'équipe ?**  
A: Quand vous invitez quelqu'un dans votre équipe, sa clé publique chiffre une copie de la clé de votre équipe. Chaque membre peut alors déchiffrer les fichiers partagés.

**Q: Puis-je désactiver le chiffrement plus tard ?**  
A: Oui, mais **toutes vos données chiffrées deviendront inaccessibles**. Nous recommandons d'exporter vos données importantes avant.

### Questions Techniques

**Q: Quels algorithmes de chiffrement utilisez-vous ?**  
A: **AES-256-GCM** pour le chiffrement symétrique, **PBKDF2** (100,000 itérations) pour la dérivation de clés, **RSA-2048** pour l'échange de clés.

**Q: Mes données sont-elles vraiment sécurisées ?**  
A: Oui. Le chiffrement se fait **sur votre appareil** avec WebCrypto API. Nos serveurs ne stockent que des données chiffrées. Un audit sécurité externe valide notre implémentation.

**Q: Que se passe-t-il si Vutler est hacké ?**  
A: Les pirates n'obtiendraient que des **données chiffrées inutilisables** sans les clés. Vos mots de passe et phrases de récupération ne sont jamais stockés sur nos serveurs.

**Q: Le chiffrement ralentit-il Vutler ?**  
A: L'impact est **minimal** : ~50ms pour chiffrer un message, ~200ms pour un fichier de 1MB. Les opérations se font en arrière-plan.

### Dépannage

**Q: "Erreur de déchiffrement" sur mes anciens messages**  
A: Vérifiez que :
- Votre clé de chiffrement est bien synchronisée
- Votre navigateur supporte WebCrypto API
- Vous n'êtes pas en navigation privée

**Solution :** Paramètres → Sécurité → "Re-synchroniser clé"

**Q: Les agents ne peuvent plus accéder à mes fichiers**  
A: Vérifiez vos **permissions agent** :
1. Paramètres → Agents → [Nom de l'agent]
2. Modifiez les permissions selon vos besoins
3. Testez avec une nouvelle requête

**Q: Upload de gros fichiers échoue**  
A: Limites actuelles :
- **500 MB par fichier** (Solo/Pro)
- **2 GB par fichier** (Teams)
- **Upload par chunks** pour optimiser

### Contact Support

**🚨 Urgence sécurité :** security@starboxgroup.com  
**💬 Support général :** support@vutler.com  
**📚 Documentation :** https://docs.vutler.com  
**🎥 Tutoriels vidéo :** https://vutler.com/tutorials

---

## Troubleshooting Avancé

### Problèmes de Synchronisation Multi-Device

**Symptôme :** Messages/fichiers apparaissent chiffrés sur un appareil mais pas l'autre

**Solution étape par étape :**

1. **Vérifiez la synchronisation de clé :**
   ```
   Paramètres → Sécurité → État de synchronisation
   
   ✅ Appareil principal: MacBook Pro (actif)
   ❌ Appareil secondaire: iPhone (non synchronisé)
   ```

2. **Re-synchronisez depuis l'appareil principal :**
   ```
   Paramètres → Appareils → [iPhone] → "Synchroniser clé"
   → Saisissez votre mot de passe
   → QR code généré pour scan mobile
   ```

3. **Validez sur l'appareil secondaire :**
   ```
   Ouvrir Vutler mobile → Scanner QR code → Succès ✅
   ```

### Résolution Erreurs de Performance

**Symptôme :** Chiffrement lent, interface qui freeze

**Diagnostics :**
```javascript
// Ouvrez la console développeur (F12)
// Testez la performance crypto de votre navigateur:

console.time("crypto-test");
crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt", "decrypt"]
).then(() => console.timeEnd("crypto-test"));

// Résultat attendu: < 50ms
// Si > 200ms: votre navigateur/machine a des limitations
```

**Solutions :**
- **Navigateur moderne** : Chrome 90+, Firefox 88+, Safari 14+
- **Désactiver extensions** qui interfèrent avec WebCrypto
- **Plus de RAM** disponible (chiffrement consomme mémoire)

### Récupération d'Urgence

**Scénario :** J'ai perdu accès à tous mes appareils, mais j'ai ma phrase de récupération

**Procédure de récupération :**

1. **Nouvel appareil** → Connexion Vutler
2. **"J'ai perdu l'accès à mes appareils"** au lieu de login normal
3. **Saisie phrase de récupération** (24 mots)
4. **Vérification identité** (email + SMS si configuré)  
5. **Nouveau device configuré** comme appareil principal

**⚠️ Sécurité :** Cette procédure **révoque automatiquement** tous les anciens appareils.

### Migration vers Nouveau Compte

**Si vous devez changer d'organisation ou créer nouveau compte :**

1. **Export données** depuis ancien compte :
   ```
   Paramètres → Export → "Télécharger données déchiffrées"
   → Fichier ZIP avec contenus en clair
   ```

2. **Import dans nouveau compte** :
   ```
   Nouveau compte → Paramètres → Import → Sélectionner ZIP
   → Données re-chiffrées avec nouvelle clé
   ```

**Note :** L'historique des conversations avec agents n'est pas transférable pour des raisons de confidentialité.

---

**Dernière mise à jour :** 2026-02-23  
**Version doc :** 1.0  
**Feedback utilisateurs :** feedback@vutler.com