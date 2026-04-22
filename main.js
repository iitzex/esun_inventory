const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const NEWS_CACHE_DURATION = 60 * 1000; // 1 minute (transactions change more often)

const venvPythonPath = path.join(__dirname, '.venv', 'bin', 'python');
const PYTHON_CMD = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
const INVENTORY_DIR = path.join(__dirname, 'inventory');

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
// "Error: ..." to stdout (see src/esun_inventory/cli/_runner.py).
// PYTHONPATH=src avoids relying on the editable install's absolute path in
// .venv/.../site-packages/_editable_impl_*.pth, which breaks after electron-
// packager relocates the app to ~/Applications.
function runPythonModule(moduleName, args = []) {
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_CMD, ['-m', moduleName, ...args], {
      cwd: __dirname,
      env: { ...process.env, PYTHONPATH: path.join(__dirname, 'src') },
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
  if (!filename) return null;
  return tryReadFile(path.join(INVENTORY_DIR, filename));
});

ipcMain.handle('download-inventory', () =>
  runPythonModule('esun_inventory.cli.download_inventory')
);

ipcMain.handle('get-home-info', () =>
  withCache('home-info', CACHE_DURATION, () =>
    runPythonModule('esun_inventory.cli.home_info')
  )
);

ipcMain.handle('get-news-info', (_event, range = '0d') =>
  withCache(`news-${range}`, NEWS_CACHE_DURATION, () =>
    runPythonModule('esun_inventory.cli.news_info', ['--range', range])
  )
);

ipcMain.handle('save-self-txt', async (_event, content) => {
  try {
    fs.writeFileSync(path.join(__dirname, 'self.txt'), content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
