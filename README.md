# Shadow Launcher

Utilitaire Windows réel (pas une simulation) pour Shadow Market : scanne un
dossier local `Shadow_Scripts`, affiche dynamiquement les produits présents,
et exécute réellement les scripts sélectionnés.

## Ce qui est réellement implémenté (pas fake)

- **Scan dynamique** : `main.js` lit le contenu du dossier `Shadow_Scripts` à
  chaque ouverture (extensions `.bat`, `.cmd`, `.ps1`, `.reg`). Une image
  portant le même nom de fichier (`.jpg`, `.png`, `.webp`) est associée
  automatiquement.
- **Exécution réelle** : au clic sur "Lancer l'optimisation", chaque script
  coché est réellement exécuté (`cmd.exe /c` pour les `.bat`, `powershell.exe`
  pour les `.ps1`, `reg.exe import` pour les `.reg`), et le résultat réel
  (succès / code d'erreur) est affiché dans le terminal — plus de `setTimeout`
  qui fait semblant.
- **Élévation de privilèges** : l'application entière est packagée pour
  demander les droits administrateur au lancement
  (`requestedExecutionLevel: requireAdministrator` dans `package.json`).
  Un seul UAC apparaît à l'ouverture du launcher, puis tous les scripts
  héritent de ces droits — pas de popup UAC répétée par script.

  ⚠️ Je n'ai pas implémenté de bypass silencieux de l'UAC (élévation sans
  aucune confirmation utilisateur) : ce n'est ni possible proprement, ni
  souhaitable, car ça reviendrait à contourner une protection de sécurité
  Windows sans le consentement de l'utilisateur. Le compromis ci-dessus
  (un seul prompt à l'ouverture) donne le comportement "silencieux ensuite"
  que tu voulais pour l'exécution des scripts.

- **Redémarrage réel** : `shutdown /r /t 0` est réellement exécuté après
  confirmation.
- **Sécurité Electron** : `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true` — le renderer (HTML/JS affiché) n'a aucun accès direct au
  système ; tout passe par les 3 canaux IPC exposés dans `preload.js`
  (`scanProducts`, `executeScripts`, `restartPC`).

## Compiler en .exe

Le bac à sable où j'ai écrit ce code n'a pas accès réseau, donc je n'ai pas
pu lancer `npm install` ni compiler l'exe moi-même. À faire sur ta machine
(avec Node.js installé — version 18+ recommandée) :

```bash
cd shadow-launcher
npm install
npm run build
```

Ça génère dans `dist/` :
- `Shadow Launcher Setup x.x.x.exe` → installeur NSIS classique
- `ShadowLauncher-Portable.exe` → exécutable portable, un seul fichier

Pour juste tester en développement, sans compiler :

```bash
npm install
npm start
```

## Structure

```
shadow-launcher/
├── main.js            # process principal Electron (scan + exécution + restart)
├── preload.js          # pont IPC sécurisé (contextBridge)
├── renderer/
│   ├── index.html      # ton thème néon exact, câblé sur l'API réelle
│   └── renderer.js      # logique d'affichage + appels IPC
├── Shadow_Scripts/     # dossier où les clients déposent leurs .bat/.ps1/.reg
└── package.json        # config electron-builder (installeur + portable)
```

## Ajouter un produit

Dépose dans `Shadow_Scripts/` :
- `Apex_Free.bat` (le script)
- `Apex_Free.jpg` (optionnel — image du même nom)

Le launcher détecte le fichier au prochain lancement et génère
automatiquement la ligne correspondante avec son switch ON/OFF. Aucun code
à modifier.

## Icône de l'app (optionnel)

Ajoute un fichier `renderer/icon.ico` (256×256 recommandé) — il est déjà
référencé dans `main.js`. S'il est absent, Electron utilisera son icône par
défaut, sans planter.
