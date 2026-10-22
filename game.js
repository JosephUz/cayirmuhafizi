// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir (etkin dilde, bkz. src/dil.js).
const root = document.getElementById('meadow-game');
try {
  const { start } = await import('./src/main.js');
  await start(root);
} catch (err) {
  let yazi;
  try { const { t } = await import('./src/dil.js'); yazi = t('hata.yukleme'); } catch { yazi = 'The world could not load: check WebGL support and the local server. '; }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#19231d;color:#f6efd9;font:16px system-ui;padding:24px;text-align:center';
  el.textContent = yazi + (err && err.message ? err.message : '');
  root.appendChild(el);
  console.error(err);
}
