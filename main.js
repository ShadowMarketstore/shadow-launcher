const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Extensions de scripts qu'on accepte de lister dans le catalogue
const SCRIPT_EXTS = ['.bat', '.cmd', '.ps1', '.reg'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

let mainWindow;

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
    icon: path.join(__dirname, 'renderer', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  const dir = getScriptsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
  const scriptFiles = entries.filter(f =>
    SCRIPT_EXTS.includes(path.extname(f).toLowerCase())
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
// IPC : redémarrage système
// ---------------------------------------------------------------------
ipcMain.handle('restart-pc', async () => {
  return new Promise(resolve => {
    const child = spawn('shutdown', ['/r', '/t', '0'], { windowsHide: true });
    child.on('error', err => resolve({ ok: false, message: err.message }));
    child.on('spawn', () => resolve({ ok: true, message: 'Redémarrage lancé' }));
  });
});
