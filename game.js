// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir.
const root = document.getElementById('meadow-game');
try {
  const { start } = await import('./src/main.js');
  await start(root);
} catch (err) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#19231d;color:#f6efd9;font:16px system-ui;padding:24px;text-align:center';
  el.textContent = 'Dünya yüklenemedi: WebGL desteğini ve yerel sunucuyu kontrol et. ' + (err && err.message ? err.message : '');
  root.appendChild(el);
  console.error(err);
}
