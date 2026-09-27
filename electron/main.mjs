import {
  app,
  BrowserWindow,
  dialog,
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
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  openDb,
  closeDb,
  getSettings,
  setSettings,
  getTodayStats,
  getWeekStats,
  listBreakEvents,
  isInWorkHours,
} from './db.mjs';
import { createBreakTimer, ACTIVITY_COPY } from './timer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'out');
const DEV_URL = process.env.ELECTRON_START_URL || 'http://127.0.0.1:3210';

let mainWindow = null;
let breakWindow = null;
let tray = null;
let timer = null;
let staticPort = null;
let staticServer = null;
let appBaseUrl = DEV_URL;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!app.isReady()) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
}
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
  const root = path.resolve(rootDir);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.resolve(path.join(root, urlPath));
        const rel = path.relative(root, filePath);
        if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
          res.writeHead(403).end('Forbidden');
          return;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }
        if (!fs.existsSync(filePath)) {
          // 仅对无扩展名的客户端路由回退 index.html；缺失的静态资源必须 404
          if (path.extname(urlPath) || !fs.existsSync(path.join(root, 'index.html'))) {
            res.writeHead(404).end('Not found');
            return;
          }
          filePath = path.join(root, 'index.html');
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
      staticServer = server;
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

// ---- 托盘图标：运行时生成 PNG（raw RGBA 位图在 Windows 上是 BGRA，通道序不可靠） ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createTrayIcon() {
  // 32x32 强调色圆点 + 边缘 alpha 渐隐，对应 --accent #34D399
  const size = 32;
  const rgba = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cx;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist <= r) {
        const t = Math.max(0, 1 - dist / r);
        rgba[i] = 52;
        rgba[i + 1] = 211;
        rgba[i + 2] = 153;
        rgba[i + 3] = Math.round(255 * (0.55 + 0.45 * t));
      }
    }
  }
  return nativeImage.createFromBuffer(encodePng(size, size, rgba));
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

let lastTrayTip = '';

function updateTray(s) {
  if (!tray) return;
  const tip = `Take Five · ${trayTitleFromState(s)}`;
  if (tip === lastTrayTip) return;
  lastTrayTip = tip;
  tray.setToolTip(tip);
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
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    applyAlwaysOnTop();
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && !app.isQuitting) {
      dialog.showErrorBox(
        'Take Five',
        `界面加载失败（${code} ${desc}）\n${url}\n\n请先运行 pnpm build 生成 out/，或用 pnpm dev 启动开发服务器。`
      );
    }
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
      sandbox: true,
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
  if (!Notification.isSupported()) return;
  // soundEnabled 只关提示音，不能连休息提醒本身一起吞掉
  const n = new Notification({
    title: 'Take Five',
    body: `${state.suggestedActivity?.label || '休息'}一下吧 — 已专注 ${state.plannedMinutes} 分钟`,
    silent: !getSettings().soundEnabled,
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
  } else {
    // break-prompt 结束即收起全屏层
    closeBreakWindow();
  }
}

// ---- IPC 输入校验 ----

const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const THEMES = new Set(['light', 'dark', 'system']);
const NUM_BOUNDS = {
  focusMinutes: [1, 180],
  breakMinutes: [1, 60],
  maxPostpones: [0, 10],
};
const BOOL_KEYS = [
  'strictMode',
  'soundEnabled',
  'workEnabled',
  'weekdaysOnly',
  'quietHoursEnabled',
  'autostartFocus',
  'alwaysOnTop',
];
const HM_KEYS = ['workStart', 'workEnd', 'quietHoursStart', 'quietHoursEnd'];

function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function sanitizeSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return {};
  const out = {};
  for (const [key, [min, max]] of Object.entries(NUM_BOUNDS)) {
    if (key in patch) {
      const n = clampInt(patch[key], min, max);
      if (n !== null) out[key] = n;
    }
  }
  if (Array.isArray(patch.postponeOptions)) {
    const opts = [
      ...new Set(
        patch.postponeOptions
          .map((n) => clampInt(n, 1, 120))
          .filter((n) => n !== null)
      ),
    ]
      .sort((a, b) => a - b)
      .slice(0, 5);
    if (opts.length) out.postponeOptions = opts;
  }
  if (Array.isArray(patch.activities)) {
    const acts = [
      ...new Set(patch.activities.map(String).filter((id) => id in ACTIVITY_COPY)),
    ];
    if (acts.length) out.activities = acts;
  }
  for (const key of BOOL_KEYS) {
    if (key in patch) out[key] = patch[key] === true || patch[key] === 'true';
  }
  for (const key of HM_KEYS) {
    if (key in patch && typeof patch[key] === 'string' && HM_RE.test(patch[key])) {
      out[key] = patch[key];
    }
  }
  if ('theme' in patch && THEMES.has(patch.theme)) out.theme = patch.theme;
  return out;
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
    const clean = sanitizeSettingsPatch(patch);
    const next = Object.keys(clean).length ? setSettings(clean) : getSettings();
    timer.applySettings();
    if ('alwaysOnTop' in clean) applyAlwaysOnTop();
    return next;
  });
  ipcMain.handle('stats:today', () => getTodayStats());
  ipcMain.handle('stats:week', () => getWeekStats());
  ipcMain.handle('stats:events', (_e, limit) => {
    const n = Math.round(Number(limit));
    return listBreakEvents(Number.isFinite(n) ? Math.min(500, Math.max(1, n)) : 100);
  });
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
  if (!gotLock) return;
  try {
    openDb();
  } catch (err) {
    dialog.showErrorBox('Take Five', `数据库初始化失败：\n${err?.message || err}`);
    app.quit();
    return;
  }
  try {
    appBaseUrl = await resolveAppBase();
  } catch (err) {
    dialog.showErrorBox('Take Five', String(err?.message || err));
    app.quit();
    return;
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
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
  closeDb();
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});
