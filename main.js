const {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
} = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const {
  loadMonitoredApps,
  saveMonitoredApps,
  getMonitoredApps,
  matchMonitoredApp,
} = require('./apps-store');

// X: network/mapped drives block Electron's default cache — use local AppData
const localUserData = path.join(os.homedir(), 'AppData', 'Roaming', 'copy-to-rtl');
app.setPath('userData', localUserData);
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-dir', path.join(localUserData, 'cache'));

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let lastClipboardText = '';
let monitoring = true;
let pollTimer = null;

const POLL_INTERVAL_MS = 200;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 360,
    minWidth: 320,
    minHeight: 200,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'Copy to RTL',
    backgroundColor: '#262624',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function openMonitoringSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 420,
    height: 540,
    minWidth: 360,
    minHeight: 400,
    parent: mainWindow,
    modal: true,
    show: false,
    title: 'Select Monitoring',
    backgroundColor: '#262624',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'monitoring-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile('monitoring-settings.html');
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Runs PowerShell asynchronously so the main process never blocks on the
// (~270ms) call while reading the foreground window title.
function getForegroundWindowTitle() {
  if (process.platform !== 'win32') return Promise.resolve('');

  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'foreground-title.ps1');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { encoding: 'utf8', timeout: 1500, windowsHide: true },
      (err, stdout) => resolve(err ? '' : String(stdout).trim())
    );
  });
}

function updateTrayTooltip() {
  if (!tray) return;
  tray.setToolTip(
    monitoring
      ? 'Copy to RTL — monitoring clipboard'
      : 'Copy to RTL — paused'
  );
}

function notifyMonitoringChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('monitoring-changed', monitoring);
}

function setMonitoring(enabled) {
  monitoring = enabled;
  if (monitoring) {
    startPolling();
  } else {
    stopPolling();
  }
  updateTrayTooltip();
  notifyMonitoringChanged();
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Select Monitoring',
      click: () => openMonitoringSettings(),
    },
    {
      label: 'Enable Monitoring',
      type: 'checkbox',
      checked: monitoring,
      click: (menuItem) => setMonitoring(menuItem.checked),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  // 32x32 RTL "text lines" glyph on the brand accent (#d97757). Self-contained
  // valid PNG (IHDR + IDAT + IEND) so the tray always shows a visible icon.
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaElEQVR42mNgGOzgZnn4f0rwgFhKkWNo' +
      'ZTlRjqC15XgdQS/LcTpiZDsAn0JqAbyOGNQOoEs0jDqAVI0DngZGE+HIdMCAF0SjJeGoAyhNHxS1CWjhgNEm2eBrlg+Kjsmg6Jo' +
      'Nis4pPQEANO4ceIO0of8AAAAASUVORK5CYII='
  );

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  updateTrayTooltip();
  rebuildTrayMenu();
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function sendClipboardUpdate(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('clipboard-update', payload);
}

async function pollClipboard() {
  if (!monitoring) return;

  const text = clipboard.readText();
  if (text === lastClipboardText) return;

  // Mark as seen immediately so overlapping polls (while the async title
  // lookup is in flight) don't process the same clipboard text twice.
  lastClipboardText = text;
  if (!text.trim()) return;

  const windowTitle = await getForegroundWindowTitle();
  if (!monitoring) return;

  const match = matchMonitoredApp(windowTitle);
  if (!match) return;

  sendClipboardUpdate({
    text,
    source: match.appId,
    appName: match.appName,
    windowTitle: match.windowTitle,
  });

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show();
  }
}

function startPolling() {
  stopPolling();
  lastClipboardText = clipboard.readText();
  pollTimer = setInterval(pollClipboard, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

ipcMain.handle('get-clipboard', () => clipboard.readText());

ipcMain.handle('get-monitoring', () => monitoring);

ipcMain.handle('set-monitoring', (_event, value) => {
  setMonitoring(Boolean(value));
});

ipcMain.handle('get-monitored-apps', () => getMonitoredApps());

ipcMain.handle('set-monitored-apps', (_event, apps) => {
  saveMonitoredApps(apps);
  return getMonitoredApps();
});

ipcMain.handle('open-monitoring-settings', () => {
  openMonitoringSettings();
});

ipcMain.handle('close-monitoring-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
});

ipcMain.handle('set-always-on-top', (_event, value) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (value) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
  } else {
    mainWindow.setAlwaysOnTop(false);
  }
});

ipcMain.handle('copy-to-clipboard', (_event, text) => {
  clipboard.writeText(text);
  lastClipboardText = text;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  loadMonitoredApps();
  createWindow();
  createTray();
  startPolling();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopPolling();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow.show();
  }
});