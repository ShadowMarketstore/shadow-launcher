const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Extensions de scripts qu'on accepte de lister dans le catalogue
const SCRIPT_EXTS = ['.bat', '.cmd', '.ps1', '.reg'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

let mainWindow;

// ---------------------------------------------------------------------
// Journal d'erreurs : un .exe packagé n'a pas de console visible, donc
// toute erreur non capturée provoquait avant un plantage silencieux
// (fenêtre qui s'ouvre puis se ferme sans rien expliquer). Désormais,
// toute erreur fatale est écrite dans un fichier et affichée à l'écran
// avant que l'app ne quitte, pour qu'on sache toujours ce qui s'est
// passé.
// ---------------------------------------------------------------------
function logFatalError(context, err) {
  try {
    const logPath = path.join(app.getPath('userData'), 'shadow-launcher-crash.log');
    const line = `[${new Date().toISOString()}] ${context} : ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(logPath, line);
  } catch (writeErr) {
    // Si même l'écriture du log échoue, on ne peut plus rien faire de plus.
  }
}

process.on('uncaughtException', (err) => {
  logFatalError('uncaughtException', err);
  dialog.showErrorBox(
    'Shadow Launcher — Erreur inattendue',
    `Une erreur a empêché le launcher de continuer :\n\n${err.message}\n\nDétails enregistrés dans shadow-launcher-crash.log (dossier données de l'application).`
  );
});

// Les sessions RDP/VM (bureaux à distance type AppOnFly, Windows 365...) ont
// souvent un pilote graphique virtualisé ("Microsoft Remote Display Adapter")
// qui fait planter les apps Electron/Chromium au démarrage. Désactiver
// l'accélération matérielle est le contournement standard documenté par
// Electron pour ce cas précis — sans impact visible sur une app aussi simple
// que celle-ci, y compris sur un vrai PC avec une vraie carte graphique.
app.disableHardwareAcceleration();

app.on('render-process-gone', (event, webContents, details) => {
  logFatalError('render-process-gone', new Error(JSON.stringify(details)));
});
app.on('child-process-gone', (event, details) => {
  logFatalError('child-process-gone', new Error(JSON.stringify(details)));
});

// Dossier "Shadow_Scripts" : à côté de l'exe une fois packagé,
// à côté de main.js en développement.
function getScriptsDir() {
  const base = app.isPackaged
    ? path.dirname(process.execPath)
    : __dirname;
  return path.join(base, 'Shadow_Scripts');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ---------------------------------------------------------------------
// Surveillance intelligente du dossier Téléchargements Windows :
// tout fichier "Shadow_*" (.bat/.cmd/.ps1/.reg direct, ou .zip contenant
// ces fichiers) est automatiquement récupéré et rangé dans Shadow_Scripts,
// sans action manuelle du client.
// ---------------------------------------------------------------------
const processedDownloads = new Set();

function isShadowDownload(filename) {
  if (!/^shadow_/i.test(filename)) return false;
  const ext = path.extname(filename).toLowerCase();
  return ext === '.zip' || SCRIPT_EXTS.includes(ext);
}

// Attend que le fichier ait fini de télécharger (taille stable dans le temps)
// avant de le traiter, pour ne pas attraper un téléchargement en cours.
function waitUntilStable(filePath, onStable) {
  let lastSize = -1;
  const check = () => {
    fs.stat(filePath, (err, stats) => {
      if (err) return; // fichier déplacé/supprimé entre-temps, on abandonne
      if (stats.size > 0 && stats.size === lastSize) {
        onStable();
      } else {
        lastSize = stats.size;
        setTimeout(check, 700);
      }
    });
  };
  check();
}

function processDownloadedFile(filePath) {
  const dir = getScriptsDir();
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toLowerCase();

  try {
    if (ext === '.zip') {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      zip.getEntries().forEach(entry => {
        if (entry.isDirectory) return;
        const entryExt = path.extname(entry.entryName).toLowerCase();
        if (SCRIPT_EXTS.includes(entryExt) || IMAGE_EXTS.includes(entryExt)) {
          zip.extractEntryTo(entry, dir, false, true);
        }
      });
    } else if (SCRIPT_EXTS.includes(ext)) {
      fs.copyFileSync(filePath, path.join(dir, filename));
    } else {
      return;
    }

    if (mainWindow) {
      mainWindow.webContents.send('products-updated', { ok: true, file: filename });
    }
  } catch (err) {
    if (mainWindow) {
      mainWindow.webContents.send('products-updated', { ok: false, file: filename, message: err.message });
    }
  }
}

function startDownloadsWatcher() {
  const downloadsDir = app.getPath('downloads');
  if (!fs.existsSync(downloadsDir)) return;

  try {
    fs.watch(downloadsDir, { persistent: true }, (eventType, filename) => {
      if (!filename || !isShadowDownload(filename)) return;

      const fullPath = path.join(downloadsDir, filename);
      if (processedDownloads.has(fullPath) || !fs.existsSync(fullPath)) return;
      processedDownloads.add(fullPath);

      waitUntilStable(fullPath, () => processDownloadedFile(fullPath));
    });
  } catch (err) {
    // Certains environnements (lecteurs réseau, sessions distantes type RDP)
    // ne supportent pas fs.watch. On désactive juste la surveillance auto
    // plutôt que de faire planter tout le launcher — le bouton "+" reste
    // disponible en secours pour ajouter des scripts manuellement.
    logFatalError('startDownloadsWatcher (non-bloquant, surveillance désactivée)', err);
  }
}

app.whenReady().then(() => {
  try {
    const dir = getScriptsDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    createWindow();
    startDownloadsWatcher();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    logFatalError('app.whenReady', err);
    dialog.showErrorBox(
      'Shadow Launcher — Erreur au démarrage',
      `Le launcher n'a pas pu démarrer correctement :\n\n${err.message}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------
// IPC : scanner dynamiquement le dossier Shadow_Scripts
// ---------------------------------------------------------------------
ipcMain.handle('scan-products', async () => {
  const dir = getScriptsDir();
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir);
  // Seuls les fichiers "Shadow_..." sont de vrais produits activables.
  // Exclut les fichiers d'infrastructure comme ShadowEngine_Core.ps1
  // (importé par les produits en interne, jamais destiné à être lancé seul).
  const scriptFiles = entries.filter(f =>
    SCRIPT_EXTS.includes(path.extname(f).toLowerCase()) && /^shadow_/i.test(f)
  );

  const products = scriptFiles.map(scriptFile => {
    const base = path.parse(scriptFile).name; // nom sans extension
    const fullPath = path.join(dir, scriptFile);

    // On cherche une image portant le même nom de base
    let imageDataUrl = null;
    for (const ext of IMAGE_EXTS) {
      const candidate = path.join(dir, base + ext);
      if (fs.existsSync(candidate)) {
        const buf = fs.readFileSync(candidate);
        const mime = ext === '.png' ? 'image/png'
          : ext === '.webp' ? 'image/webp'
          : 'image/jpeg';
        imageDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        break;
      }
    }

    // Nom d'affichage lisible : "Apex_Free" -> "Apex Free"
    const displayName = base.replace(/[_-]+/g, ' ').trim();

    return {
      id: scriptFile,
      nom: displayName,
      desc: `Fichier : ${scriptFile}`,
      image: imageDataUrl,
      fichier: fullPath,
      ext: path.extname(scriptFile).toLowerCase()
    };
  });

  return products;
});

// ---------------------------------------------------------------------
// IPC : exécuter les scripts cochés
// ---------------------------------------------------------------------
// L'app entière tourne en administrateur (voir package.json ->
// requestedExecutionLevel: requireAdministrator), donc chaque script
// hérite déjà des privilèges élevés : pas besoin (et pas souhaitable)
// de contourner l'UAC script par script.
function runOne(fullPath, ext) {
  return new Promise(resolve => {
    if (!fs.existsSync(fullPath)) {
      return resolve({ file: path.basename(fullPath), ok: false, message: 'Fichier introuvable' });
    }

    let child;
    try {
      if (ext === '.ps1') {
        child = spawn('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', fullPath
        ], { windowsHide: true });
      } else if (ext === '.reg') {
        child = spawn('reg.exe', ['import', fullPath], { windowsHide: true });
      } else {
        // .bat / .cmd
        child = spawn('cmd.exe', ['/c', fullPath], { windowsHide: true, cwd: path.dirname(fullPath) });
      }
    } catch (err) {
      return resolve({ file: path.basename(fullPath), ok: false, message: err.message });
    }

    let stderr = '';
    child.stderr && child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', err => {
      resolve({ file: path.basename(fullPath), ok: false, message: err.message });
    });

    child.on('close', code => {
      resolve({
        file: path.basename(fullPath),
        ok: code === 0,
        message: code === 0 ? 'Exécuté avec succès' : `Code de sortie ${code}${stderr ? ' — ' + stderr.slice(0, 200) : ''}`
      });
    });
  });
}

ipcMain.handle('execute-scripts', async (event, files) => {
  const results = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const result = await runOne(f, ext);
    results.push(result);
  }
  return results;
});

// ---------------------------------------------------------------------
// IPC : ouvrir le dossier Shadow_Scripts dans l'explorateur Windows
// ---------------------------------------------------------------------
ipcMain.handle('open-scripts-folder', async () => {
  const dir = getScriptsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const errorMessage = await shell.openPath(dir);
  return { ok: errorMessage === '', message: errorMessage || 'Dossier ouvert' };
});

// ---------------------------------------------------------------------
// IPC : redémarrage système
// ---------------------------------------------------------------------
ipcMain.handle('restart-pc', async () => {
  return new Promise(resolve => {
    const child = spawn('shutdown', ['/r', '/t', '0'], { windowsHide: true });
    child.on('error', err => resolve({ ok: false, message: err.message }));
    child.on('spawn', () => resolve({ ok: true, message: 'Redémarrage lancé' }));
  });
});

