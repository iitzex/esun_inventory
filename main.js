const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let homeInfoCache = null;
let lastCacheTime = 0;
let newsInfoCache = null;
let lastNewsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const NEWS_CACHE_DURATION = 60 * 1000; // 1 minute (transactions change more often)

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
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

// IPC Handler: List inventory files
ipcMain.handle('list-inventory', async () => {
  const inventoryDir = path.join(__dirname, 'inventory');
  if (!fs.existsSync(inventoryDir)) return [];
  
  const files = fs.readdirSync(inventoryDir)
    .filter(file => file.endsWith('.toon') && !file.endsWith('_balance.toon'))
    .sort((a, b) => b.localeCompare(a));
    
  return files;
});

// IPC Handler: Read inventory file
ipcMain.handle('read-inventory', async (event, filename) => {
  if (!filename) return null;
  const filePath = path.join(__dirname, 'inventory', filename);
  if (!fs.existsSync(filePath)) return null;
  
  return fs.readFileSync(filePath, 'utf8');
});
// IPC Handler: Read bank balance file
ipcMain.handle('read-balance', async (event, filename) => {
  if (!filename) return null;
  const filePath = path.join(__dirname, 'inventory', filename);
  if (!fs.existsSync(filePath)) return null;
  
  return fs.readFileSync(filePath, 'utf8');
});

// IPC Handler: Trigger inventory download via Python
ipcMain.handle('download-inventory', async () => {
  return new Promise((resolve, reject) => {
    const venvPath = path.join(__dirname, '.venv', 'bin', 'python');
    const pythonCmd = fs.existsSync(venvPath) ? venvPath : 'python3';
    
    const scriptPath = path.join(__dirname, 'download_inventory.py');
    const process = spawn(pythonCmd, [scriptPath]);
    
    let output = '';
    let errorOutput = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: output });
      } else {
        resolve({ success: false, message: errorOutput });
      }
    });
  });
});

// IPC Handler: Get Home Info (SDK Status)
ipcMain.handle('get-home-info', async () => {
  const now = Date.now();
  if (homeInfoCache && (now - lastCacheTime < CACHE_DURATION)) {
    console.log('Returning Home Info from cache');
    return { success: true, data: homeInfoCache, fromCache: true };
  }

  return new Promise((resolve, reject) => {
    const venvPath = path.join(__dirname, '.venv', 'bin', 'python');
    const pythonCmd = fs.existsSync(venvPath) ? venvPath : 'python3';
    const scriptPath = path.join(__dirname, 'get_home_info.py');
    const process = spawn(pythonCmd, [scriptPath]);
    
    let output = '';
    let errorOutput = '';
    process.stdout.on('data', (data) => output += data.toString());
    process.stderr.on('data', (data) => errorOutput += data.toString());
    process.on('close', (code) => {
      if (code === 0 && !output.startsWith('Error:')) {
        homeInfoCache = output;
        lastCacheTime = Date.now();
        resolve({ success: true, data: output });
      } else {
        resolve({ success: false, message: output.startsWith('Error:') ? output : errorOutput });
      }
    });
  });
});

// IPC Handler: Get News Info (Orders & Transactions)
ipcMain.handle('get-news-info', async () => {
  const now = Date.now();
  if (newsInfoCache && (now - lastNewsCacheTime < NEWS_CACHE_DURATION)) {
    console.log('Returning News Info from cache');
    return { success: true, data: newsInfoCache, fromCache: true };
  }

  return new Promise((resolve, reject) => {
    const venvPath = path.join(__dirname, '.venv', 'bin', 'python');
    const pythonCmd = fs.existsSync(venvPath) ? venvPath : 'python3';
    const scriptPath = path.join(__dirname, 'get_news_info.py');
    const process = spawn(pythonCmd, [scriptPath]);
    
    let output = '';
    let errorOutput = '';
    process.stdout.on('data', (data) => output += data.toString());
    process.stderr.on('data', (data) => errorOutput += data.toString());
    process.on('close', (code) => {
      if (code === 0 && !output.startsWith('Error:')) {
        newsInfoCache = output;
        lastNewsCacheTime = Date.now();
        resolve({ success: true, data: output });
      } else {
        resolve({ success: false, message: output.startsWith('Error:') ? output : errorOutput });
      }
    });
  });
});

// IPC Handler: Save content to self.txt
ipcMain.handle('save-self-txt', async (event, content) => {
  try {
    const filePath = path.join(__dirname, 'self.txt');
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});
