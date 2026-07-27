// Electron main process. Spawns the Next.js standalone server as a child
// (with `ELECTRON_RUN_AS_NODE=1`), waits for it to be reachable, then
// opens a `BrowserWindow` pointing at the local URL.
//
// Architecture: option (a) — Electron + Next.js standalone server. The
// App Router, sharp-based /api/export route, and the pdfjs worker in
// `public/` all work unchanged because they all see a real `http://` origin.

import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import * as path from 'node:path';
import { waitForUrl } from './wait-on';

// In CommonJS (the default for Electron's main process), `__dirname` is
// already provided by the runtime. We just have to type it for TS.
declare const __dirname: string;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const DEFAULT_PORT = 3000;
// When developing with `next dev` running outside Electron, the user can force
// the standalone server.js path (useful for testing the prod build without
// packaging). Defaults to "dev" — which keeps HMR working.
const forceStandalone =
  process.env.ELECTRON_DEV_FORCE_STANDALONE === '1' || !isDev;

// Single-instance lock — second launch focuses the existing window
// instead of trying to bind the same port.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let serverChild: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function pickFreePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tester = createServer();
    tester.unref();
    tester.on('error', () => {
      // preferred in use; try a random one
      const fallback = createServer();
      fallback.unref();
      fallback.on('error', reject);
      fallback.listen(0, '127.0.0.1', () => {
        const addr = fallback.address();
        const port =
          typeof addr === 'object' && addr ? addr.port : preferred;
        fallback.close();
        resolve(port);
      });
    });
    tester.listen(preferred, '127.0.0.1', () => {
      const addr = tester.address();
      const port = typeof addr === 'object' && addr ? addr.port : preferred;
      tester.close();
      resolve(port);
    });
  });
}

async function startServer(port: number): Promise<ChildProcess> {
  // Decide the entry based on dev vs prod:
  //   dev  → `next dev` (HMR works because Next sees real file changes)
  //   prod → the standalone `server.js` shipped inside the packaged app, run
  //          under Electron's bundled Node via `ELECTRON_RUN_AS_NODE=1`.
  // The previous logic preferred standalone whenever it existed on disk, which
  // meant dev:electron accidentally ran the production build (no HMR) as soon
  // as `next build` had been run for any reason.
  const fs = await import('node:fs');
  const standaloneServer = path.join(
    __dirname,
    '..',
    '.next',
    'standalone',
    'server.js',
  );
  const useStandalone = forceStandalone && fs.existsSync(standaloneServer);

  let cmd: string;
  let args: string[];
  let cwd: string;
  if (useStandalone) {
    // Spawn Electron's bundled Node binary as plain Node.
    cmd = process.execPath;
    args = [standaloneServer];
    cwd = path.dirname(standaloneServer);
  } else {
    // `npx next dev` for the dev:electron workflow, `npx next start` if the
    // user has a build but no standalone copy yet.
    cmd = 'npx';
    args = ['next', isDev ? 'dev' : 'start', '-p', String(port)];
    cwd = path.join(__dirname, '..');
  }

  const child = spawn(cmd, args, {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: useStandalone ? '1' : process.env.ELECTRON_RUN_AS_NODE,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: isDev ? 'development' : 'production',
    },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    // eslint-disable-next-line no-console
    console.log(`[electron] next server exited (code=${code}, signal=${signal})`);
    serverChild = null;
    // If the server dies, the app is unusable — quit.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    app.quit();
  });

  return child;
}

function buildMenu(): Menu {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: 'appMenu' as const }]
      : []),
    {
      label: '文件(&F)',
      submenu: [
        {
          label: '打开 PDF…(&O)',
          accelerator: 'CmdOrCtrl+O',
          click: async (_item, focusedWindow) => {
            const win =
              (focusedWindow as BrowserWindow | undefined) ?? mainWindow;
            if (!win) {
              return;
            }
            const result = await dialog.showOpenDialog(win, {
              title: '打开 PDF',
              filters: [{ name: 'PDF', extensions: ['pdf'] }],
              properties: ['openFile'],
            });
            if (result.canceled || result.filePaths.length === 0) return;
            const filePath = result.filePaths[0];
            try {
              const fs = await import('node:fs/promises');
              const bytes = await fs.readFile(filePath);
              const name = filePath.split(/[\\/]/).pop() ?? 'untitled.pdf';
              const payload = { name, bytes: new Uint8Array(bytes) };
              win.webContents.send('open-file', payload);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error('[electron] failed to read file', e);
              void dialog.showErrorBox(
                '打开 PDF 失败',
                String((e as Error)?.message ?? e),
              );
            }
          },
        },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit' },
      ],
    },
    {
      label: '编辑(&E)',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图(&V)',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' as const }] : []),
      ],
    },
    {
      label: '帮助(&H)',
      submenu: [
        {
          label: '关于 pdf2png',
          click: async () => {
            await dialog.showMessageBox({
              type: 'info',
              title: 'pdf2png',
              message: 'PDF 路网编辑器',
              detail: `版本 ${app.getVersion()}\nElectron ${process.versions.electron}\nNode ${process.versions.node}`,
              buttons: ['确定'],
            });
          },
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

async function createMainWindow(port: number): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b0b',
    title: 'pdf2png',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => {
    win.show();
  });
  // Open external links in the OS default browser, not in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  void win.loadURL(`http://127.0.0.1:${port}/`);
  return win;
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (serverChild) {
    try {
      serverChild.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  app.quit();
});

app.on('before-quit', () => {
  if (serverChild) {
    try {
      serverChild.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildMenu());
  const port = await pickFreePort(DEFAULT_PORT);
  // eslint-disable-next-line no-console
  console.log(`[electron] starting next server on port ${port}…`);
  serverChild = await startServer(port);
  await waitForUrl(`http://127.0.0.1:${port}/`, { timeoutMs: 60_000 });
  mainWindow = await createMainWindow(port);
}).catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[electron] failed to start', e);
  void dialog.showErrorBox('pdf2png 启动失败', String((e as Error)?.message ?? e));
  app.quit();
});

ipcMain.on('quit', () => {
  app.quit();
});

ipcMain.handle('open-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) {
    return null;
  }
  const result = await dialog.showOpenDialog(win, {
    title: '打开 PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const fs = await import('node:fs/promises');
  try {
    const bytes = await fs.readFile(filePath);
    const name = filePath.split(/[\\/]/).pop() ?? 'untitled.pdf';
    return { name, bytes: new Uint8Array(bytes) };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[electron] failed to read file', filePath, e);
    void dialog.showErrorBox('打开 PDF 失败', String((e as Error)?.message ?? e));
    return null;
  }
});
