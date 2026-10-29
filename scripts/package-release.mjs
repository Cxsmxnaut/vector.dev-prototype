import {execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('Release packaging requires an Apple Silicon Mac.');
}
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const {version} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('Invalid release version.');
const release = join(root, 'release');
const bundle = join(release, 'vector.dev-darwin-arm64');
const app = join(bundle, 'vector.dev.app');
const run = (command, args) => execFileSync(command, args, {stdio: 'inherit', cwd: root});
const plistValue = key => execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', join(app, 'Contents/Info.plist')], {encoding: 'utf8'}).trim();
if (plistValue('CFBundleShortVersionString') !== version || plistValue('CFBundleIdentifier') !== 'dev.vector.desktop') {
  throw new Error('Packaged application does not match this release. Run npm run package:mac first.');
}
const minimumMacOS = plistValue('LSMinimumSystemVersion');
const stem = `vector.dev-${version}-macos-arm64`;
const dmg = join(release, `${stem}.dmg`);
const zip = join(release, `${stem}.zip`);
const notices = join(app, 'Contents/Resources/Third Party Notices');
await mkdir(notices, {recursive: true});
for (const name of ['LICENSE', 'LICENSES.chromium.html']) await copyFile(join(bundle, name), join(notices, name));

// Ad-hoc signing seals the bundle for integrity; it does not provide Apple trust or notarization.
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
const staging = await mkdtemp(join(release, '.vector-release-'));
try {
  await cp(app, join(staging, 'vector.dev.app'), {recursive: true, verbatimSymlinks: true});
  await symlink('/Applications', join(staging, 'Applications'));
  await writeFile(join(staging, 'Getting Started.txt'), `vector.dev ${version}\n\nDrag vector.dev.app into Applications.\n\nRequires an Apple Silicon Mac running macOS ${minimumMacOS} or newer, a compatible installed Codex executable, and an existing Codex sign-in. Keep the Codex desktop host installed if you use its bundled executable. Codex usage consumes your account's allowance or credits.\n\nThis is a development prerelease. The app is ad-hoc signed for integrity, but is not Developer ID signed or Apple-notarized. macOS may block it. Automatic updates are not included.\n\nFull desktop parity is incomplete; exact two-way host sidebar editing, cloud features, voice, and independent automation scheduling are not implemented.\n\nSource, requirements, and known limitations:\nhttps://github.com/Cxsmxnaut/vector.dev\n`);
  await rm(zip, {force: true});
  run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
  run('/usr/bin/hdiutil', ['create', '-volname', `vector.dev ${version}`, '-srcfolder', staging, '-ov', '-format', 'UDZO', '-imagekey', 'zlib-level=9', dmg]);
  run('/usr/bin/hdiutil', ['verify', dmg]);
  run('/usr/bin/unzip', ['-tq', zip]);
  const checksums = [];
  for (const name of [`${stem}.dmg`, `${stem}.zip`]) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(join(release, name))) hash.update(chunk);
    checksums.push(`${hash.digest('hex')}  ${name}`);
  }
  await writeFile(join(release, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
  console.log(`Release assets ready in ${release}`);
} finally {
  await rm(staging, {recursive: true, force: true});
}
