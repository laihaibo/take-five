import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  Notification,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  openDb,
  getSettings,
  setSettings,
  getTodayStats,
  getWeekStats,
  listBreakEvents,
  isInWorkHours,
} from './db.mjs';
import { createBreakTimer } from './timer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'out');
const DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:3210';

let mainWindow = null;
let breakWindow = null;
let tray = null;
let timer = null;
let staticPort = null;
let appBaseUrl = DEV_URL;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function isPortAlive(url, timeoutMs = 400) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.normalize(path.join(rootDir, urlPath));
        if (!filePath.startsWith(rootDir)) {
          res.writeHead(403).end('Forbidden');
          return;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        if (!fs.existsSync(filePath)) {
          // SPA fallback for client routes
          const fallback = path.join(rootDir, 'index.html');
          if (fs.existsSync(fallback) && urlPath.startsWith('/')) {
            filePath = fallback;
          } else {
            res.writeHead(404).end('Not found');
            return;
          }
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500).end(String(err));
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(addr.port);
    });
  });
}

async function resolveAppBase() {
  if (process.env.ELECTRON_START_URL) return process.env.ELECTRON_START_URL;
  if (!app.isPackaged && (await isPortAlive(DEV_URL))) return DEV_URL;

  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    throw new Error(
      `找不到界面。请先运行 pnpm build，或启动开发服务器 pnpm dev（${DEV_URL}）`
    );
  }
  if (staticPort == null) {
    staticPort = await startStaticServer(outDir);
  }
  return `http://127.0.0.1:${staticPort}`;
}

function createTrayIcon() {
  // 32x32 blue circle with glass highlight — generated PNG buffer
  const size = 32;
  const canvas = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist <= r) {
        // accent #7C9CFF
        const t = Math.max(0, 1 - dist / r);
        canvas[i] = 124;
        canvas[i + 1] = 156;
        canvas[i + 2] = 255;
        canvas[i + 3] = Math.round(255 * (0.55 + 0.45 * t));
      } else {
        canvas[i + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function trayTitleFromState(s) {
  if (!s) return 'Take Five';
  const mins = Math.floor(s.remainingMs / 60000);
  const secs = Math.floor((s.remainingMs % 60000) / 1000);
  const clock = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  if (s.mode === 'focus') return `专注 ${clock}`;
  if (s.mode === 'break') return `休息 ${clock}`;
  if (s.mode === 'break-prompt') return '该休息了';
  if (s.mode === 'paused') return '已暂停';
  return 'Take Five';
}

function updateTray(s) {
  if (!tray) return;
  tray.setToolTip(`Take Five · ${trayTitleFromState(s)}`);
  if (process.platform === 'win32') {
    tray.setTitle?.('');
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 440,
    minHeight: 640,
    title: 'Take Five',
    backgroundColor: '#0A0C10',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    applyAlwaysOnTop();
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.loadURL(`${appBaseUrl}/`);
}

function applyAlwaysOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const on = getSettings().alwaysOnTop;
  mainWindow.setAlwaysOnTop(on, on ? 'screen-saver' : 'normal');
  // Keep above other apps but still movable; avoid taskbar steal on some Windows setups
  if (on) {
    mainWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  } else {
    mainWindow.setVisibleOnAllWorkspaces?.(false);
  }
  return on;
}

function createBreakWindow(state) {
  if (breakWindow && !breakWindow.isDestroyed()) {
    breakWindow.show();
    breakWindow.focus();
    return breakWindow;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  breakWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  breakWindow.setAlwaysOnTop(true, 'screen-saver');
  breakWindow.loadURL(`${appBaseUrl}/?view=break`);

  breakWindow.on('closed', () => {
    breakWindow = null;
  });

  return breakWindow;
}

function closeBreakWindow() {
  if (breakWindow && !breakWindow.isDestroyed()) breakWindow.close();
  breakWindow = null;
}

function notify(state) {
  if (!getSettings().soundEnabled) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: 'Take Five',
    body: `${state.suggestedActivity?.label || '休息'}一下吧 — 已专注 ${state.plannedMinutes} 分钟`,
    silent: false,
  });
  n.show();
}

function broadcast(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer:state', state);
  }
  if (breakWindow && !breakWindow.isDestroyed()) {
    breakWindow.webContents.send('timer:state', state);
  }
  updateTray(state);

  if (state.mode === 'break-prompt') {
    if (!breakWindow || breakWindow.isDestroyed()) {
      createBreakWindow(state);
      notify(state);
    } else if (!breakWindow.isVisible()) {
      breakWindow.show();
    }
  } else if (state.mode === 'break' || state.mode === 'focus' || state.mode === 'idle') {
    // keep break window only in break-prompt; auto-close when resolved
    if (state.mode !== 'break-prompt') closeBreakWindow();
  }
}

function setupIpc() {
  ipcMain.handle('timer:state', () => timer.getState());
  ipcMain.handle('timer:start-focus', () => {
    timer.startFocus();
    return timer.getState();
  });
  ipcMain.handle('timer:pause', () => {
    timer.pause();
    return timer.getState();
  });
  ipcMain.handle('timer:resume', () => {
    timer.resume();
    return timer.getState();
  });
  ipcMain.handle('timer:reset', () => {
    timer.reset();
    closeBreakWindow();
    return timer.getState();
  });
  ipcMain.handle('break:start', () => {
    closeBreakWindow();
    timer.startBreak();
    return timer.getState();
  });
  ipcMain.handle('break:postpone', (_e, minutes) => {
    closeBreakWindow();
    timer.postpone(minutes);
    return timer.getState();
  });
  ipcMain.handle('break:skip', () => {
    closeBreakWindow();
    timer.skip();
    return timer.getState();
  });
  ipcMain.handle('break:complete', (_e, checked) => {
    closeBreakWindow();
    timer.completeBreak(false, Array.isArray(checked) ? checked : undefined);
    return timer.getState();
  });
  ipcMain.handle('break:toggle-activity', (_e, id) => {
    timer.toggleCheckedActivity(String(id || ''));
    return timer.getState();
  });
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = setSettings(patch);
    timer.applySettings();
    if ('alwaysOnTop' in (patch || {})) applyAlwaysOnTop();
    return next;
  });
  ipcMain.handle('stats:today', () => getTodayStats());
  ipcMain.handle('stats:week', () => getWeekStats());
  ipcMain.handle('stats:events', (_e, limit) => listBreakEvents(limit || 100));
  ipcMain.handle('window:show-main', () => {
    if (!mainWindow) createMainWindow();
    mainWindow.show();
    mainWindow.focus();
  });
  ipcMain.handle('window:close-break', () => closeBreakWindow());
  ipcMain.handle('window:set-always-on-top', (_e, on) => {
    const next = setSettings({ alwaysOnTop: Boolean(on) });
    applyAlwaysOnTop();
    timer?.applySettings();
    return { alwaysOnTop: next.alwaysOnTop };
  });
  ipcMain.handle('window:get-always-on-top', () => ({
    alwaysOnTop: getSettings().alwaysOnTop,
  }));
}

function createTray() {
  tray = new Tray(createTrayIcon());
  const rebuildMenu = () => {
    const pinned = getSettings().alwaysOnTop;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '打开主面板',
        click: () => {
          if (!mainWindow) createMainWindow();
          mainWindow.show();
        },
      },
      {
        label: pinned ? '取消置顶（钉在桌面）' : '钉在桌面最前端',
        type: 'checkbox',
        checked: pinned,
        click: (item) => {
          setSettings({ alwaysOnTop: Boolean(item.checked) });
          applyAlwaysOnTop();
          rebuildMenu();
        },
      },
      {
        label: '立即开始专注',
        click: () => timer.startFocus(),
      },
      {
        label: '推迟 5 分钟',
        click: () => {
          closeBreakWindow();
          timer.postpone(5);
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
  };
  rebuildMenu();
  tray.on('click', () => {
    if (!mainWindow) createMainWindow();
    mainWindow.show();
  });
}

app.whenReady().then(async () => {
  openDb();
  try {
    appBaseUrl = await resolveAppBase();
  } catch (err) {
    console.error(err);
    appBaseUrl = DEV_URL;
  }
  timer = createBreakTimer(broadcast);
  setupIpc();
  createMainWindow();
  createTray();

  const s = getSettings();
  if (isInWorkHours(s)) {
    // 上班：默认手动点「开始专注」；仅在设置开启时自动进入
    if (s.autostartFocus) {
      setTimeout(() => timer.startFocus(), 800);
    }
  } else {
    // 非工作时段启动：保证干净待开始
    timer.endWorkday();
  }
});

app.on('window-all-closed', () => {
  // stay in tray on Windows; only quit explicitly
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});
