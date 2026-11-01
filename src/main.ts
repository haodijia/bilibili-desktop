import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  session,
  WebContentsView,
  type WebContents,
  type WebContentsViewConstructorOptions,
} from 'electron';
import path from 'node:path';
import { MarginUpdater } from './margin-updater';
import {
  HOME_URL,
  TAB_STRIP_HEIGHT,
  type BrowserAction,
  type TabState,
} from './browser';

interface Tab {
  view: WebContentsView;
  state: TabState;
  zoomAdjustment: number;
}

let win: BrowserWindow | null = null;
let tabs: Tab[] = [];
let activeId = 0;
let popup: WebContentsView | null = null;
let extensionUrl = '';
let marginUpdater: MarginUpdater;
let videoFullScreen = false;
const PARTITION = 'persist:bilibili';
const DESKTOP_PAGE_WIDTH = 1920;

function basePageZoom(): number {
  return Math.min(1, win!.getContentSize()[0] / DESKTOP_PAGE_WIDTH);
}

function fitPage(tab: Tab): void {
  const factor = Math.max(
    0.25,
    Math.min(5, basePageZoom() * tab.zoomAdjustment),
  );
  if (Math.abs(tab.view.webContents.getZoomFactor() - factor) > 0.0001) {
    tab.view.webContents.setZoomFactor(factor);
  }
}

function zoomPage(step: number | 'reset'): void {
  const tab = activeTab();
  if (!tab) return;
  tab.zoomAdjustment = step === 'reset' ? 1 : tab.zoomAdjustment * 1.2 ** step;
  tab.zoomAdjustment =
    Math.max(0.25, Math.min(5, basePageZoom() * tab.zoomAdjustment)) /
    basePageZoom();
  fitPage(tab);
}

function isPageURL(value: string): boolean {
  try {
    return (
      ['https:', 'http:'].includes(new URL(value).protocol) ||
      value === 'about:blank'
    );
  } catch {
    return false;
  }
}

function activeTab(): Tab | undefined {
  return tabs.find((tab) => tab.state.id === activeId);
}

function publish(): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('browser:state', {
    tabs: tabs.map((tab) => tab.state),
    activeId,
  });
  win.setTitle(`${activeTab()?.state.title ?? '哔哩哔哩'} — Bilibili`);
}

function layout(): void {
  if (!win) return;
  const [width, height] = win.getContentSize();
  const top = videoFullScreen ? 0 : TAB_STRIP_HEIGHT;
  for (const tab of tabs) {
    tab.view.setBounds({
      x: 0,
      y: top,
      width,
      height: Math.max(0, height - top),
    });
    fitPage(tab);
  }
  popup?.setBounds({ x: width - 320, y: top, width: 304, height: 330 });
}

function closePopup(): void {
  if (!popup || !win) return;
  win.contentView.removeChildView(popup);
  popup.webContents.close();
  popup = null;
}

function selectTab(id: number, focus = true): void {
  if (!tabs.some((tab) => tab.state.id === id)) return;
  closePopup();
  activeId = id;
  for (const tab of tabs) tab.view.setVisible(tab.state.id === id);
  layout();
  if (focus) activeTab()?.view.webContents.focus();
  publish();
}

function closeTab(id: number): void {
  const index = tabs.findIndex((tab) => tab.state.id === id);
  if (index < 0 || !win) return;
  const [tab] = tabs.splice(index, 1);
  win.contentView.removeChildView(tab.view);
  if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
  if (tabs.length === 0) {
    win.close();
  } else if (activeId === id) {
    selectTab(tabs[Math.min(index, tabs.length - 1)].state.id);
  } else {
    publish();
  }
}

function configureContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (!isPageURL(url)) return { action: 'deny' };
    return {
      action: 'allow',
      outlivesOpener: true,
      overrideBrowserWindowOptions: {
        webPreferences: {
          partition: PARTITION,
          zoomMode: 'isolated',
          zoomFactor: basePageZoom(),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      },
      createWindow: (options) => {
        const tab = createTab(
          undefined,
          disposition !== 'background-tab',
          options,
        );
        // Apply tab visibility after Electron finishes attaching the guest page.
        setImmediate(() => {
          if (win && tabs.includes(tab)) selectTab(activeId, false);
        });
        return tab.view.webContents;
      },
    };
  });
  contents.on('will-navigate', (event) => {
    if (!isPageURL(event.url)) event.preventDefault();
  });
  contents.on('will-redirect', (event) => {
    if (event.isMainFrame && !isPageURL(event.url)) event.preventDefault();
  });
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape' && popup) {
      event.preventDefault();
      closePopup();
    }
  });
}

function createTab(
  url?: string,
  foreground = true,
  options?: WebContentsViewConstructorOptions,
): Tab {
  if (!win) throw new Error('Browser window is not ready');
  const view = new WebContentsView({
    ...options,
    webPreferences: {
      ...options?.webPreferences,
      partition: PARTITION,
      zoomMode: 'isolated',
      zoomFactor: basePageZoom(),
      preload: undefined,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const contents = view.webContents;
  contents.setZoomMode('isolated');
  const tab: Tab = {
    view,
    zoomAdjustment: 1,
    state: {
      id: contents.id,
      title: '新标签页',
      url: url ?? '',
      loading: true,
      audible: false,
      error: '',
    },
  };
  tabs.push(tab);
  win.contentView.addChildView(view);
  view.setVisible(false);
  configureContents(contents);
  const update = () => {
    if (contents.isDestroyed()) return;
    tab.state.url = contents.getURL() || tab.state.url;
    tab.state.loading = contents.isLoading();
    tab.state.audible = contents.isCurrentlyAudible();
    publish();
  };
  contents.on('page-title-updated', (_event, title) => {
    tab.state.title = title;
    update();
  });
  contents.on('did-start-loading', () => {
    tab.state.error = '';
    update();
  });
  contents.on('did-stop-loading', update);
  contents.on('did-navigate', () => {
    fitPage(tab);
    update();
  });
  contents.on('did-navigate-in-page', update);
  contents.on('media-started-playing', update);
  contents.on('media-paused', update);
  contents.on('focus', () => {
    if (activeId !== tab.state.id) selectTab(tab.state.id, false);
    else closePopup();
  });
  contents.on(
    'did-fail-load',
    (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        tab.state.error = `页面加载失败：${description}。请检查网络后刷新。`;
        update();
      }
    },
  );
  contents.on('render-process-gone', () => {
    tab.state.error = '页面进程已退出，请刷新重试。';
    tab.state.loading = false;
    publish();
  });
  contents.on('destroyed', () => closeTab(tab.state.id));
  contents.on('enter-html-full-screen', () => {
    videoFullScreen = true;
    layout();
  });
  contents.on('leave-html-full-screen', () => {
    videoFullScreen = false;
    layout();
  });
  contents.on('context-menu', (_event, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (isPageURL(params.linkURL)) {
      items.push(
        {
          label: '在新标签页中打开链接',
          click: () => createTab(params.linkURL, false),
        },
        {
          label: '复制链接地址',
          click: () => clipboard.writeText(params.linkURL),
        },
        { type: 'separator' },
      );
    }
    items.push({ role: 'copy', enabled: params.editFlags.canCopy });
    if (params.isEditable) items.push({ role: 'paste' }, { role: 'selectAll' });
    items.push({ label: '重新加载', click: () => contents.reload() });
    Menu.buildFromTemplate(items).popup({ window: win! });
  });
  if (foreground) selectTab(tab.state.id);
  else layout();
  if (url)
    void contents.loadURL(url).catch(() => {
      /* did-fail-load reports navigation errors. */
    });
  publish();
  return tab;
}

function togglePopup(): void {
  if (popup) return closePopup();
  if (!win) return;
  popup = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.contentView.addChildView(popup);
  configureContents(popup.webContents);
  layout();
  void popup.webContents
    .loadURL(`${extensionUrl}popup.html`)
    .catch((error: unknown) => {
      closePopup();
      dialog.showErrorBox('MARGIN 打开失败', String(error));
    });
  popup.webContents.focus();
}

function act(action: BrowserAction): void {
  switch (action.type) {
    case 'new':
      createTab(HOME_URL);
      break;
    case 'select':
      selectTab(action.id);
      break;
    case 'close':
      closeTab(action.id);
      break;
  }
}

function installMenu(): void {
  const cycle = (offset: number) => {
    if (!tabs.length) return;
    const index = tabs.findIndex((tab) => tab.state.id === activeId);
    selectTab(tabs[(index + offset + tabs.length) % tabs.length].state.id);
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      {
        label: '文件',
        submenu: [
          {
            label: '新建标签页',
            accelerator: 'CmdOrCtrl+T',
            click: () => act({ type: 'new' }),
          },
          {
            label: '关闭标签页',
            accelerator: 'CmdOrCtrl+W',
            click: () => closeTab(activeId),
          },
          { type: 'separator' },
          { role: 'close', label: '关闭窗口' },
        ],
      },
      { role: 'editMenu', label: '编辑' },
      {
        label: '浏览',
        submenu: [
          {
            label: '后退',
            accelerator: 'CmdOrCtrl+[',
            click: () => {
              const history = activeTab()?.view.webContents.navigationHistory;
              if (history?.canGoBack()) history.goBack();
            },
          },
          {
            label: '前进',
            accelerator: 'CmdOrCtrl+]',
            click: () => {
              const history = activeTab()?.view.webContents.navigationHistory;
              if (history?.canGoForward()) history.goForward();
            },
          },
          {
            label: '重新加载',
            accelerator: 'CmdOrCtrl+R',
            click: () => activeTab()?.view.webContents.reload(),
          },
          {
            label: '强制重新加载',
            accelerator: 'CmdOrCtrl+Shift+R',
            click: () => activeTab()?.view.webContents.reloadIgnoringCache(),
          },
          {
            label: '哔哩哔哩首页',
            click: () => {
              const contents = activeTab()?.view.webContents;
              if (contents) void contents.loadURL(HOME_URL).catch(() => {});
            },
          },
          { label: 'MARGIN 设置', click: togglePopup },
          {
            label: '检查 MARGIN 更新…',
            click: () => void marginUpdater.check(true),
          },
          { type: 'separator' },
          {
            label: '下一个标签页',
            accelerator: 'Ctrl+Tab',
            click: () => cycle(1),
          },
          {
            label: '上一个标签页',
            accelerator: 'Ctrl+Shift+Tab',
            click: () => cycle(-1),
          },
          ...Array.from({ length: 9 }, (_, index) => ({
            label: `切换到标签页 ${index + 1}`,
            accelerator: `CmdOrCtrl+${index + 1}`,
            click: () => {
              const tab = index === 8 ? tabs.at(-1) : tabs[index];
              if (tab) selectTab(tab.state.id);
            },
          })),
          { type: 'separator' },
          {
            label: '放大',
            accelerator: 'CmdOrCtrl+Plus',
            click: () => zoomPage(0.5),
          },
          {
            label: '缩小',
            accelerator: 'CmdOrCtrl+-',
            click: () => zoomPage(-0.5),
          },
          {
            label: '恢复自动适配',
            accelerator: 'CmdOrCtrl+0',
            click: () => zoomPage('reset'),
          },
          { role: 'togglefullscreen' },
          {
            label: '开发者工具',
            accelerator: 'Alt+CmdOrCtrl+I',
            click: () => activeTab()?.view.webContents.toggleDevTools(),
          },
        ],
      },
      { role: 'windowMenu', label: '窗口' },
    ]),
  );
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 800,
    minHeight: 550,
    title: 'Bilibili',
    backgroundColor: '#ffffff',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  win.on('close', () => {
    closePopup();
    for (const tab of tabs) {
      tab.view.webContents.removeAllListeners('destroyed');
      tab.view.webContents.close();
    }
    tabs = [];
    activeId = 0;
    videoFullScreen = false;
  });
  win.on('closed', () => {
    win = null;
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    await win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else
    await win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  createTab(HOME_URL);
}

app.setName('Bilibili');
app.setPath('userData', path.join(app.getPath('appData'), 'Bili Desktop'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    } else if (app.isReady()) {
      void createWindow();
    }
  });
  ipcMain.on('browser:action', (event, action: BrowserAction) => {
    if (
      event.sender === win?.webContents &&
      event.senderFrame === win.webContents.mainFrame &&
      action &&
      typeof action.type === 'string'
    )
      act(action);
  });
  ipcMain.on('browser:ready', (event) => {
    if (event.sender === win?.webContents) publish();
  });
  app
    .whenReady()
    .then(async () => {
      const extensionPath = app.isPackaged
        ? path.join(process.resourcesPath, 'margin')
        : path.join(app.getAppPath(), 'extensions/margin');
      marginUpdater = new MarginUpdater({
        bundledPath: extensionPath,
        storagePath: path.join(app.getPath('userData'), 'extensions', 'margin'),
        session: session.fromPartition(PARTITION),
        getWindow: () => win,
        beforeUpdate: closePopup,
        afterUpdate: (extension) => {
          extensionUrl = extension.url;
          for (const tab of tabs) tab.view.webContents.reload();
        },
      });
      const extension = await marginUpdater.load();
      extensionUrl = extension.url;
      installMenu();
      await createWindow();
      marginUpdater.start();
      app.on('activate', () => {
        if (!win) void createWindow();
      });
    })
    .catch((error: unknown) => {
      dialog.showErrorBox('Bilibili 启动失败', String(error));
      app.quit();
    });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
