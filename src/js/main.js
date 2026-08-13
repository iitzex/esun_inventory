const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const NEWS_CACHE_DURATION = 60 * 1000; // 1 minute (transactions change more often)
const MARKET_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes (open/closed status is stable intraday)

// main.js lives in src/js/, but .venv / inventory / src (Python package) / config.ini
// all live at the repo root — resolve everything relative to that.
const PROJECT_ROOT = path.join(__dirname, '..', '..');

const venvPythonPath = path.join(PROJECT_ROOT, '.venv', 'bin', 'python');
const PYTHON_CMD = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
const INVENTORY_DIR = path.join(PROJECT_ROOT, 'inventory');

const caches = new Map();

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Python scripts surface errors either via non-zero exit code or by printing
// "Error: ..." to stdout (see src/python/esun_inventory/cli/_runner.py).
// PYTHONPATH=src/python avoids relying on the editable install's absolute path
// in .venv/.../site-packages/_editable_impl_*.pth, which breaks after electron-
// packager relocates the app to ~/Applications.
function runPythonModule(moduleName, args = []) {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_CMD, ['-m', moduleName, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONPATH: path.join(PROJECT_ROOT, 'src', 'python') },
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0 && !stdout.startsWith('Error:')) {
        resolve({ success: true, data: stdout });
      } else {
        resolve({
          success: false,
          message: stdout.startsWith('Error:') ? stdout : stderr,
        });
      }
    });
  });
}

async function withCache(key, ttlMs, fn) {
  const entry = caches.get(key);
  const now = Date.now();
  if (entry && now - entry.time < ttlMs) {
    return { ...entry.value, fromCache: true };
  }
  const value = await fn();
  if (value.success) caches.set(key, { value, time: now });
  return value;
}

// Read a file, swallowing ENOENT. Avoids the TOCTOU pattern of checking
// existsSync before reading.
function tryReadFile(filePath, encoding = 'utf8') {
  try {
    return fs.readFileSync(filePath, encoding);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

ipcMain.handle('list-inventory', async () => {
  try {
    return fs.readdirSync(INVENTORY_DIR)
      .filter((f) => f.endsWith('.toon') && !f.endsWith('_balance.toon'))
      .sort((a, b) => b.localeCompare(a));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
});

ipcMain.handle('read-inventory', async (_event, filename) => {
  if (!filename || typeof filename !== 'string') return null;
  const base = path.basename(filename);
  if (base !== filename || !base.endsWith('.toon')) return null;
  return tryReadFile(path.join(INVENTORY_DIR, base));
});

ipcMain.handle('download-inventory', () =>
  runPythonModule('esun_inventory.cli.download_inventory')
);

ipcMain.handle('get-home-info', () =>
  withCache('home-info', CACHE_DURATION, () =>
    runPythonModule('esun_inventory.cli.home_info')
  )
);

ipcMain.handle('get-news-info', (_event, opts = {}) => {
  const { range = '0d', start, end } = opts;
  const key = start && end ? `news-${start}-${end}` : `news-${range}`;
  const args = start && end ? ['--start', start, '--end', end] : ['--range', range];
  return withCache(key, NEWS_CACHE_DURATION, () =>
    runPythonModule('esun_inventory.cli.news_info', args)
  );
});

ipcMain.handle('get-market-info', () =>
  withCache('market-info', MARKET_CACHE_DURATION, () =>
    runPythonModule('esun_inventory.cli.market_info')
  )
);

ipcMain.handle('save-self-txt', async (_event, content) => {
  try {
    fs.writeFileSync(path.join(PROJECT_ROOT, 'private', 'self.txt'), content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
