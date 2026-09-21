// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir.
const root = document.getElementById('meadow-game');
const message = root.querySelector('#mg-message');
try {
  const { start } = await import('./src/main.js');
  await start(root);
} catch (err) {
  message.hidden = false;
  message.textContent = 'Dünya yüklenemedi: WebGL desteğini ve yerel sunucuyu kontrol et.';
  console.error(err);
}
