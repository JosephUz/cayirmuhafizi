import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Android APK: oyun dosyalarını toplar (build-web), Capacitor ile android/ projesine kopyalar (cap sync) ve Gradle ile
 * derler. Android Studio gerekmez: JDK ve Android SDK komut satırı araçları yeterli. Yerleri JAVA_HOME / ANDROID_HOME
 * ortam değişkenlerinden, yoksa ~/android altından (jdk-*, sdk) bulunur.
 *   npm run apk              → hata ayıklama APK'sı: apk/CayirMuhafizi-debug.apk (chrome://inspect ile incelenebilir). Yayın
 *                              anahtarı varsa (android/keystore.properties + .jks, git'e girmez) ayrıca imzalı
 *                              apk/CayirMuhafizi.apk (telefona kurulacak asıl sürüm) ve Play Store için apk/CayirMuhafizi.aab
 *   npm run apk -- --install → üstüne USB ile bağlı telefona kurar (adb, telefonda USB hata ayıklama açık olmalı)
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = path.join(os.homedir(), 'android');
const win = process.platform === 'win32';

const javaHome = process.env.JAVA_HOME || (existsSync(tools) && readdirSync(tools).filter(d => d.startsWith('jdk')).map(d => path.join(tools, d))[0]);
const sdk = process.env.ANDROID_HOME || path.join(tools, 'sdk');
if (!javaHome || !existsSync(javaHome)) fail('JDK bulunamadı: JAVA_HOME ayarla ya da ~/android/jdk-* altına JDK 21 aç.');
if (!existsSync(sdk)) fail('Android SDK bulunamadı: ANDROID_HOME ayarla ya da ~/android/sdk altına kur.');
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, PATH: path.join(javaHome, 'bin') + path.delimiter + process.env.PATH };

// Gradle SDK yerini android/local.properties'ten okur (ters bölü orada kaçış karakteridir: düz bölü yazılır).
writeFileSync(path.join(root, 'android', 'local.properties'), 'sdk.dir=' + sdk.replace(/\\/g, '/') + '\n');

run('node', ['scripts/build-web.mjs']);
run(win ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android']);
const signed = existsSync(path.join(root, 'android', 'keystore.properties'));
run(path.join(root, 'android', win ? 'gradlew.bat' : 'gradlew'), ['assembleDebug', ...(signed ? ['assembleRelease', 'bundleRelease'] : []), '--console=plain'], path.join(root, 'android'));

const outputs = path.join(root, 'android', 'app', 'build', 'outputs');
mkdirSync(path.join(root, 'apk'), { recursive: true });
const copies = [[path.join(outputs, 'apk', 'debug', 'app-debug.apk'), 'CayirMuhafizi-debug.apk']];
if (signed) copies.push([path.join(outputs, 'apk', 'release', 'app-release.apk'), 'CayirMuhafizi.apk'], [path.join(outputs, 'bundle', 'release', 'app-release.aab'), 'CayirMuhafizi.aab']);
for (const [from, name] of copies) { copyFileSync(from, path.join(root, 'apk', name)); console.log('hazır: apk/' + name); }
const apk = path.join(root, 'apk', signed ? 'CayirMuhafizi.apk' : 'CayirMuhafizi-debug.apk');
if (process.argv.includes('--install')) run(path.join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb'), ['install', '-r', apk]);

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win });
  if (r.status !== 0) fail(cmd + ' ' + args.join(' ') + ' başarısız (' + r.status + ')');
}
function fail(message) { console.error(message); process.exit(1); }
