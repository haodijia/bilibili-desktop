import {
  dialog,
  net,
  type BrowserWindow,
  type Extension,
  type Session,
} from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, createWriteStream } from 'node:fs';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { openPromise } from 'yauzl';

const RELEASE_API =
  'https://api.github.com/repos/jiuyang5354/bilibili-margin/releases/latest';
const RELEASE_DOWNLOAD =
  'https://github.com/jiuyang5354/bilibili-margin/releases/download/';
const MAX_DOWNLOAD = 32 * 1024 * 1024;
const MAX_UNPACKED = 128 * 1024 * 1024;

interface Manifest extends Record<string, unknown> {
  manifest_version: number;
  version: string;
  key: string;
}

interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
    digest: string;
  }[];
}

interface UpdaterOptions {
  bundledPath: string;
  storagePath: string;
  session: Session;
  getWindow: () => BrowserWindow | null;
  beforeUpdate: () => void;
  afterUpdate: (extension: Extension) => void;
}

function versionParts(version: string): number[] {
  if (!/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version))
    throw new Error('扩展版本号无效');
  const parts = version.split('.').map(Number);
  if (parts.some((part) => part > 65535)) throw new Error('扩展版本号无效');
  return parts;
}

function isNewer(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < 4; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return difference > 0;
  }
  return false;
}

async function manifestAt(directory: string): Promise<Manifest> {
  const manifest: Manifest = JSON.parse(
    await readFile(path.join(directory, 'manifest.json'), 'utf8'),
  );
  if (typeof manifest.version !== 'string' || manifest.manifest_version !== 3)
    throw new Error('更新包的扩展清单无效');
  versionParts(manifest.version);
  return manifest;
}

function scope(manifest: Manifest): string {
  const scripts = manifest.content_scripts as { matches: string[] }[];
  return JSON.stringify({
    permissions: [...((manifest.permissions as string[]) ?? [])].sort(),
    hostPermissions: [
      ...((manifest.host_permissions as string[]) ?? []),
    ].sort(),
    optionalPermissions: [
      ...((manifest.optional_permissions as string[]) ?? []),
    ].sort(),
    optionalHostPermissions: [
      ...((manifest.optional_host_permissions as string[]) ?? []),
    ].sort(),
    matches: [...new Set(scripts.flatMap((script) => script.matches))].sort(),
  });
}

async function readResponse(
  response: Response,
  limit: number,
  progress?: (size: number) => void,
): Promise<Buffer> {
  if (!response.ok || !response.body)
    throw new Error(`下载请求失败（HTTP ${response.status}）`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > limit) throw new Error('更新包超过允许的大小');
      chunks.push(result.value);
      progress?.(size);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

async function unpack(zipPath: string, directory: string): Promise<void> {
  const zip = await openPromise(zipPath, {
    lazyEntries: true,
    strictFileNames: true,
  });
  let totalSize = 0;
  let count = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
      totalSize += entry.uncompressedSize;
      if (++count > 4096 || totalSize > MAX_UNPACKED)
        throw new Error('更新包解压后超过允许的大小');
      if (mode && mode !== 0o100000 && mode !== 0o040000)
        throw new Error('更新包包含不支持的文件类型');
      const destination = path.resolve(directory, entry.fileName);
      if (!destination.startsWith(`${directory}${path.sep}`))
        throw new Error('更新包包含无效的文件路径');
      if (entry.fileName.endsWith('/')) {
        await mkdir(destination, { recursive: true });
      } else {
        await mkdir(path.dirname(destination), { recursive: true });
        await pipeline(
          await zip.openReadStreamPromise(entry),
          createWriteStream(destination, { flags: 'wx' }),
        );
      }
    }
  } finally {
    zip.close();
  }
}

export class MarginUpdater {
  private extension!: Extension;
  private bundled!: Manifest;
  private busy = false;
  private readonly versionsPath: string;
  private readonly activeFile: string;

  constructor(private readonly options: UpdaterOptions) {
    this.versionsPath = path.join(options.storagePath, 'versions');
    this.activeFile = path.join(options.storagePath, 'active-version.json');
  }

  private versionPath(version: string): string {
    versionParts(version);
    return path.join(this.versionsPath, version);
  }

  private async saveActive(version: string): Promise<void> {
    const pendingFile = path.join(
      this.options.storagePath,
      'active-version.pending.json',
    );
    await writeFile(pendingFile, JSON.stringify(version));
    await rename(pendingFile, this.activeFile);
  }

  private async prune(): Promise<void> {
    for (const directory of await readdir(this.versionsPath)) {
      if (directory !== this.extension.version)
        await rm(path.join(this.versionsPath, directory), {
          recursive: true,
          force: true,
        });
    }
  }

  private async copyNotices(directory: string): Promise<void> {
    for (const notice of ['LICENSE', 'ATTRIBUTION.md', 'fonts/licenses']) {
      await cp(
        path.join(this.options.bundledPath, notice),
        path.join(directory, notice),
        { recursive: true, force: false },
      );
    }
  }

  async load(): Promise<Extension> {
    this.bundled = await manifestAt(this.options.bundledPath);
    if (!this.bundled.key) throw new Error('内置 MARGIN 缺少固定标识');
    await mkdir(this.versionsPath, { recursive: true });
    const current: string | null = existsSync(this.activeFile)
      ? JSON.parse(await readFile(this.activeFile, 'utf8'))
      : null;
    if (current !== null) versionParts(current);
    const version =
      current === null || isNewer(this.bundled.version, current)
        ? this.bundled.version
        : current;
    if (version !== current) {
      const directory = this.versionPath(version);
      await rm(directory, { recursive: true, force: true });
      await cp(this.options.bundledPath, directory, { recursive: true });
    }
    const directory = this.versionPath(version);
    const manifest = await manifestAt(directory);
    if (manifest.version !== version || manifest.key !== this.bundled.key)
      throw new Error('已安装的 MARGIN 标识或版本不一致');
    await this.copyNotices(directory);
    this.extension =
      await this.options.session.extensions.loadExtension(directory);
    await this.saveActive(version);
    await this.prune();
    return this.extension;
  }

  start(): void {
    setTimeout(() => void this.check(), 5000).unref();
  }

  private async install(
    release: Release,
    parent: BrowserWindow,
  ): Promise<void> {
    const version = release.tag_name.replace(/^v/, '');
    versionParts(version);
    const asset = release.assets.find((item) => item.name === 'margin.zip');
    if (
      !asset ||
      asset.browser_download_url !==
        `${RELEASE_DOWNLOAD}${release.tag_name}/margin.zip` ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
    )
      throw new Error('发布页缺少可验证的 MARGIN 更新包');
    if (
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      asset.size > MAX_DOWNLOAD
    )
      throw new Error('更新包大小无效');
    const response = await net.fetch(asset.browser_download_url, {
      signal: AbortSignal.timeout(120000),
      credentials: 'omit',
    });
    const archive = await readResponse(response, MAX_DOWNLOAD, (size) => {
      if (!parent.isDestroyed())
        parent.setProgressBar(Math.min(size / asset.size, 1));
    });
    if (
      archive.length !== asset.size ||
      `sha256:${createHash('sha256').update(archive).digest('hex')}` !==
        asset.digest
    )
      throw new Error('更新包校验失败，未安装');
    const zipPath = path.join(this.options.storagePath, 'update.zip');
    const pendingPath = path.join(this.options.storagePath, 'pending');
    try {
      await rm(pendingPath, { recursive: true, force: true });
      await mkdir(pendingPath);
      await writeFile(zipPath, archive);
      await unpack(zipPath, pendingPath);
      const manifest = await manifestAt(pendingPath);
      if (manifest.version !== version)
        throw new Error('更新包版本与发布页不一致');
      if (scope(manifest) !== scope(this.bundled))
        throw new Error(
          '新版 MARGIN 需要不同的网页访问权限，请先更新 Bilibili 应用',
        );
      manifest.key = this.bundled.key;
      await this.copyNotices(pendingPath);
      await writeFile(
        path.join(pendingPath, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      const directory = this.versionPath(version);
      await rm(directory, { recursive: true, force: true });
      await rename(pendingPath, directory);
      this.options.beforeUpdate();
      this.options.session.extensions.removeExtension(this.extension.id);
      this.extension =
        await this.options.session.extensions.loadExtension(directory);
      await this.saveActive(version);
      this.options.afterUpdate(this.extension);
      await this.prune();
    } finally {
      await rm(zipPath, { force: true });
      await rm(pendingPath, { recursive: true, force: true });
    }
  }

  async check(manual = false): Promise<void> {
    const parent = this.options.getWindow();
    if (!parent || parent.isDestroyed()) return;
    if (this.busy) {
      if (manual)
        await dialog.showMessageBox(parent, {
          type: 'info',
          message: 'MARGIN 正在检查或更新，请稍候。',
        });
      return;
    }
    this.busy = true;
    let installing = false;
    try {
      const response = await net.fetch(RELEASE_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(20000),
        credentials: 'omit',
        cache: 'no-store',
      });
      const release: Release = JSON.parse(
        (await readResponse(response, 1024 * 1024)).toString('utf8'),
      );
      if (
        release.draft ||
        release.prerelease ||
        typeof release.tag_name !== 'string' ||
        !Array.isArray(release.assets)
      )
        throw new Error('发布页返回了无效的版本信息');
      const version = release.tag_name.replace(/^v/, '');
      const newer = isNewer(version, this.extension.version);
      if (parent.isDestroyed()) return;
      if (!newer) {
        if (manual)
          await dialog.showMessageBox(parent, {
            type: 'info',
            title: 'MARGIN 更新',
            message: 'MARGIN 已是最新版本',
            detail: `当前版本：${this.extension.version}`,
          });
        return;
      }
      const result = await dialog.showMessageBox(parent, {
        type: 'info',
        title: 'MARGIN 有新版本',
        message: `MARGIN ${version} 已发布`,
        detail: `当前版本：${this.extension.version}\n更新将自动下载并安装，然后重新加载所有标签页。正在播放的视频会中断。`,
        buttons: ['更新并重新加载', '稍后'],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response !== 0 || parent.isDestroyed()) return;
      installing = true;
      parent.setProgressBar(2);
      await this.install(release, parent);
      if (!parent.isDestroyed())
        await dialog.showMessageBox(parent, {
          type: 'info',
          title: 'MARGIN 更新完成',
          message: `已更新到 MARGIN ${this.extension.version}`,
          detail: '标签页已重新加载，设置与足迹已保留。',
        });
    } catch (error) {
      console.error('MARGIN update:', error);
      if ((manual || installing) && !parent.isDestroyed())
        await dialog.showMessageBox(parent, {
          type: 'error',
          title: 'MARGIN 更新未完成',
          message: '无法完成 MARGIN 更新',
          detail: String(error),
        });
    } finally {
      this.busy = false;
      if (!parent.isDestroyed()) parent.setProgressBar(-1);
    }
  }
}
