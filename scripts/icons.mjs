import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Uygulama simgesi ve açılış ekranı: sancak (SVG) Playwright'la PNG'ye çizilir ve android/ kaynaklarına yazılır
 * (eski simge, yuvarlak simge, uyarlanabilir simge ön yüzü; açılış görselleri mevcut boyutlarında). store/ altına
 * Play Store için 512 px simge ve 1024x500 tanıtım görseli. Yalnızca simge değişince elle çalıştırılır:
 *   node scripts/icons.mjs   (Playwright ve Chrome gerekir; PLAYWRIGHT ortam değişkeni playwright paketinin yolu)
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BG = '#242d25';

/** Sancak: çayır tepesinde direk, rüzgarda mavi bayrak ve altın yıldız. */
const art = `
  <path d="M12 88 Q50 66 88 88 Z" fill="#7da246"/>
  <path d="M22 88 Q50 74 78 88 Z" fill="#94b957"/>
  <rect x="36" y="14" width="5" height="70" rx="2.5" fill="#8a5a33"/>
  <circle cx="38.5" cy="13" r="4.5" fill="#e6c25a"/>
  <path d="M41 19 C55 13 64 25 80 18 L80 50 C64 57 55 45 41 51 Z" fill="#3f8fd0"/>
  <path d="M41 19 C55 13 64 25 80 18 L80 24 C64 31 55 19 41 25 Z" fill="#8fd0ff" opacity=".35"/>
  <polygon points="60.0,26.0 62.4,31.7 68.6,32.2 63.9,36.3 65.3,42.3 60.0,39.0 54.7,42.3 56.1,36.3 51.4,32.2 57.6,31.7" fill="#e6c25a"/>`;
/** frame: 'square' | 'round' | 'none' (uyarlanabilir ön yüz: saydam, içerik ortadaki güvenli alanda). */
const svg = (frame, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  ${frame === 'square' ? `<rect width="100" height="100" rx="22" fill="${BG}"/>` : frame === 'round' ? `<circle cx="50" cy="50" r="50" fill="${BG}"/>` : ''}
  ${frame !== 'none' ? '<circle cx="50" cy="50" r="46" fill="#ffffff08"/>' : ''}
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${art}</g></svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
async function png(html, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true }));
}
const box = (inner, w, h, bg = 'transparent') => `<div style="width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center">${inner}</div>`;

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITY)) {
  const dir = path.join(res, 'mipmap-' + d), icon = Math.round(48 * k), fg = Math.round(108 * k);
  await png(box(svg('square', 0.92), icon, icon), icon, icon, path.join(dir, 'ic_launcher.png'));
  await png(box(svg('round', 0.9), icon, icon), icon, icon, path.join(dir, 'ic_launcher_round.png'));
  await png(box(svg('none', 0.62), fg, fg), fg, fg, path.join(dir, 'ic_launcher_foreground.png'));
}
writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

/** Açılış görseli: koyu yeşil zemin, ortada sancak ve ÇAYIR MUHAFIZI yazısı; mevcut splash.png boyutları korunur. */
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.34;
  return box(`<div style="text-align:center;font:950 ${s * 0.26}px Segoe UI,Arial,sans-serif;color:#f3ebd7;letter-spacing:-1px">
    <div style="width:${s}px;height:${s}px;margin:0 auto ${s * 0.08}px">${svg('none')}</div>ÇAYIR <span style="color:#e6c25a">MUHAFIZI</span></div>`, w, h, BG);
};
for (const dir of readdirSync(res).filter(d => d.startsWith('drawable'))) {
  const file = path.join(res, dir, 'splash.png');
  let head; try { head = readFileSync(file); } catch { continue; }
  const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
  await png(splash(w, h), w, h, file);
}

mkdirSync(path.join(root, 'store'), { recursive: true });
await png(box(svg('square', 0.92).replace('rx="22"', 'rx="0"'), 512, 512), 512, 512, path.join(root, 'store', 'icon-512.png'));
await png(box(`<div style="display:flex;align-items:center;gap:40px;font:950 74px Segoe UI,Arial,sans-serif;color:#f3ebd7;letter-spacing:-4px">
  <div style="width:300px;height:300px">${svg('none')}</div><div>ÇAYIR <span style="color:#e6c25a">MUHAFIZI</span>
  <div style="font:800 26px Segoe UI,Arial,sans-serif;letter-spacing:3px;color:#b9cebc;margin-top:6px">SANCAK SAVAŞI · KAHRAMAN + ORDU</div></div></div>`, 1024, 500, BG), 1024, 500, path.join(root, 'store', 'feature-1024x500.png'));
await browser.close();
console.log('simgeler hazır');
