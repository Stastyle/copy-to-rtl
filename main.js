const {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
} = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
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
let saveStateTimer = null;

const POLL_INTERVAL_MS = 200;

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

// Default size: 30% of the screen width, 70% of the height.
function defaultWindowSize() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.round(width * 0.3),
    height: Math.round(height * 0.7),
  };
}

function isOnSomeDisplay(bounds) {
  return screen.getAllDisplays().some((display) => {
    const wa = display.workArea;
    return (
      bounds.x < wa.x + wa.width &&
      bounds.x + bounds.width > wa.x &&
      bounds.y < wa.y + wa.height &&
      bounds.y + bounds.height > wa.y
    );
  });
}

// Returns the last saved bounds if valid, otherwise null.
function loadWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(getWindowStatePath(), 'utf8'));
    if (
      Number.isFinite(saved.width) &&
      Number.isFinite(saved.height) &&
      saved.width >= 320 &&
      saved.height >= 200
    ) {
      return saved;
    }
  } catch {
    /* no saved state yet */
  }
  return null;
}

function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    // getNormalBounds() gives the restored size even while min/maximized.
    fs.writeFileSync(
      getWindowStatePath(),
      JSON.stringify(mainWindow.getNormalBounds()),
      'utf8'
    );
  } catch {
    /* best effort */
  }
}

function scheduleWindowStateSave() {
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(persistWindowState, 400);
}

function createWindow() {
  const saved = loadWindowState();
  const size = saved || defaultWindowSize();

  const options = {
    width: size.width,
    height: size.height,
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
  };

  // Restore the previous position only if it's still on a connected display.
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && isOnSomeDisplay(saved)) {
    options.x = saved.x;
    options.y = saved.y;
  }

  mainWindow = new BrowserWindow(options);

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  // Remember the last size/position across launches.
  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('close', persistWindowState);
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

// Enabled monitored-app keywords (e.g. ['claude', 'anthropic']) used to locate
// the window to place beside this app when snapping the layout.
function getEnabledKeywords() {
  const keywords = [];
  for (const monitoredApp of getMonitoredApps()) {
    if (!monitoredApp.enabled) continue;
    for (const keyword of monitoredApp.keywords || []) {
      const trimmed = String(keyword).trim();
      if (trimmed) keywords.push(trimmed);
    }
  }
  return keywords;
}

// Finds the first visible top-level window whose title contains one of the
// keywords and moves it to `rect` (physical pixels). Resolves { movedTarget }.
function moveExternalWindow(keywords, rect) {
  if (process.platform !== 'win32' || !keywords.length) {
    return Promise.resolve({ movedTarget: false });
  }

  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'snap-window.ps1');
    execFile(
      'powershell.exe',
      [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-Keywords', keywords.join(','),
        '-X', String(rect.x), '-Y', String(rect.y),
        '-W', String(rect.width), '-H', String(rect.height),
      ],
      { encoding: 'utf8', timeout: 4000, windowsHide: true },
      (err, stdout) => resolve({ movedTarget: !err && String(stdout).trim() === 'moved' })
    );
  });
}

// Snaps this window to the right third of its display's work area and moves the
// first matching monitored window (e.g. Claude) into the left two-thirds.
function snapLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve({ movedTarget: false });
  }

  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const wa = display.workArea; // DIP
  const thirdWidth = Math.max(320, Math.round(wa.width / 3));
  const otherWidth = wa.width - thirdWidth;

  // Self -> right third (Electron uses DIP coordinates).
  mainWindow.setBounds({
    x: wa.x + otherWidth,
    y: wa.y,
    width: thirdWidth,
    height: wa.height,
  });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Target -> left two-thirds. Win32 MoveWindow expects physical pixels.
  const targetPhysical = screen.dipToScreenRect(mainWindow, {
    x: wa.x,
    y: wa.y,
    width: otherWidth,
    height: wa.height,
  });

  return moveExternalWindow(getEnabledKeywords(), targetPhysical);
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
      click: () => app.quit(),
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

ipcMain.handle('snap-layout', () => snapLayout());

// Single-instance lock: a second launch focuses the existing window and exits,
// so there's never more than one tray icon / clipboard poller / window.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    loadMonitoredApps();
    createWindow();
    createTray();
    startPolling();
  });
}

app.on('before-quit', () => {
  persistWindowState();
  stopPolling();
  clearTimeout(saveStateTimer);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});