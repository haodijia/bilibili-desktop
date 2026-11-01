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
import {
  HOME_URL,
  TOOLBAR_HEIGHT,
  type BrowserAction,
  type TabState,
} from './browser';

interface Tab {
  view: WebContentsView;
  state: TabState;
}

let win: BrowserWindow | null = null;
let tabs: Tab[] = [];
let activeId = 0;
let popup: WebContentsView | null = null;
let extensionUrl = '';
let videoFullScreen = false;
const PARTITION = 'persist:bilibili';

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
  const contents = activeTab()?.view.webContents;
  win.webContents.send('browser:state', {
    tabs: tabs.map((tab) => tab.state),
    activeId,
    canGoBack: contents?.navigationHistory.canGoBack() ?? false,
    canGoForward: contents?.navigationHistory.canGoForward() ?? false,
    marginOpen: popup !== null,
  });
  win.setTitle(`${activeTab()?.state.title ?? '哔哩哔哩'} — Bili Desktop`);
}

function layout(): void {
  if (!win) return;
  const [width, height] = win.getContentSize();
  const top = videoFullScreen ? 0 : TOOLBAR_HEIGHT;
  for (const tab of tabs) {
    tab.view.setBounds({
      x: 0,
      y: top,
      width,
      height: Math.max(0, height - top),
    });
  }
  popup?.setBounds({ x: width - 320, y: top, width: 304, height: 330 });
}

function closePopup(): void {
  if (!popup || !win) return;
  win.contentView.removeChildView(popup);
  popup.webContents.close();
  popup = null;
  publish();
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
    const command = process.platform === 'darwin' ? input.meta : input.control;
    if (input.key === 'Escape' && popup) {
      event.preventDefault();
      closePopup();
    } else if (command && input.key.toLowerCase() === 'l') {
      event.preventDefault();
      focusAddress();
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
      preload: undefined,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const contents = view.webContents;
  const tab: Tab = {
    view,
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
  contents.on('did-navigate', update);
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

function focusAddress(): void {
  closePopup();
  win?.webContents.focus();
  win?.webContents.send('browser:focus-address');
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
  publish();
}

function act(action: BrowserAction): void {
  const contents = activeTab()?.view.webContents;
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
    case 'back':
      if (contents?.navigationHistory.canGoBack())
        contents.navigationHistory.goBack();
      break;
    case 'forward':
      if (contents?.navigationHistory.canGoForward())
        contents.navigationHistory.goForward();
      break;
    case 'reload':
      if (contents?.isLoading()) contents.stop();
      else contents?.reload();
      break;
    case 'home':
      if (contents) void contents.loadURL(HOME_URL).catch(() => {});
      break;
    case 'margin':
      togglePopup();
      break;
    case 'navigate': {
      if (typeof action.value !== 'string' || !contents) break;
      const value = action.value.trim();
      if (!value) break;
      let url: string;
      if (/^https?:\/\//i.test(value)) url = value;
      else if (/^[\w-]+(?:\.[\w-]+)+(?:[:/].*)?$/.test(value))
        url = `https://${value}`;
      else
        url = `https://search.bilibili.com/all?keyword=${encodeURIComponent(value)}`;
      if (isPageURL(url)) void contents.loadURL(url).catch(() => {});
      contents.focus();
      break;
    }
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
            click: () => act({ type: 'back' }),
          },
          {
            label: '前进',
            accelerator: 'CmdOrCtrl+]',
            click: () => act({ type: 'forward' }),
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
          { label: '地址栏', accelerator: 'CmdOrCtrl+L', click: focusAddress },
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
            click: () => {
              const c = activeTab()?.view.webContents;
              if (c) c.setZoomLevel(c.getZoomLevel() + 0.5);
            },
          },
          {
            label: '缩小',
            accelerator: 'CmdOrCtrl+-',
            click: () => {
              const c = activeTab()?.view.webContents;
              if (c) c.setZoomLevel(c.getZoomLevel() - 0.5);
            },
          },
          {
            label: '实际大小',
            accelerator: 'CmdOrCtrl+0',
            click: () => activeTab()?.view.webContents.setZoomLevel(0),
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
    title: 'Bili Desktop',
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
      const extension = await session
        .fromPartition(PARTITION)
        .extensions.loadExtension(extensionPath);
      extensionUrl = extension.url;
      installMenu();
      await createWindow();
      app.on('activate', () => {
        if (!win) void createWindow();
      });
    })
    .catch((error: unknown) => {
      dialog.showErrorBox('Bili Desktop 启动失败', String(error));
      app.quit();
    });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
