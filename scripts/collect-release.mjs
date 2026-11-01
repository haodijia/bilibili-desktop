import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [platform, arch] = process.argv.slice(2);
if (
  !['darwin', 'win32'].includes(platform) ||
  !['arm64', 'x64'].includes(arch)
) {
  throw new Error(
    'Usage: node scripts/collect-release.mjs <darwin|win32> <arm64|x64>',
  );
}
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const paths = await readdir('out/make', { recursive: true });
const specifications =
  platform === 'darwin'
    ? [
        ['.dmg', `Bilibili-${version}-macOS-${arch}.dmg`],
        ['.zip', `Bilibili-${version}-macOS-${arch}.zip`],
      ]
    : [
        ['.exe', `Bilibili-${version}-Windows-${arch}-Setup.exe`],
        ['.zip', `Bilibili-${version}-Windows-${arch}.zip`],
      ];
await mkdir('release', { recursive: true });
const checksums = [];
for (const [extension, filename] of specifications) {
  const matches = paths.filter((file) => file.endsWith(extension));
  if (matches.length !== 1)
    throw new Error(
      `Expected one ${extension} artifact, found ${matches.length}`,
    );
  const destination = path.join('release', filename);
  await copyFile(path.join('out/make', matches[0]), destination);
  checksums.push(
    `${createHash('sha256')
      .update(await readFile(destination))
      .digest('hex')}  ${filename}`,
  );
}
await writeFile(
  `release/checksums-${platform}-${arch}.txt`,
  `${checksums.join('\n')}\n`,
);
