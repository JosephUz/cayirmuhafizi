import { OLCUM, ONLINE, SERVER } from './config.js';

/**
 * Android uygulaması mı (Capacitor, oyun dosyaları uygulamanın içinden açılır) yoksa tarayıcı mı. `?app` ile tarayıcıda
 * da uygulama kipi denenir (testler).
 */
export const isApp = () => !!window.Capacitor?.isNativePlatform?.() || new URLSearchParams(location.search).has('app');
/** Çevrim içi özellikler bu platformda açık mı (config.js → ONLINE). */
export const onlineEnabled = () => (isApp() ? ONLINE.app : ONLINE.web);

/**
 * WebSocket adresi. Statik sitede (*.josephuz.com) ve uygulamada config.js → SERVER; sayfa sunucunun kendisinden
 * açıldıysa (localhost, IP adresi, doğrudan sunucu adresi) aynı adres.
 */
export function serverUrl() {
  const h = location.hostname, self = !isApp() && (h === SERVER || h === 'localhost' || /^[\d.]+$|^\[/.test(h));
  return self ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : 'wss://' + SERVER;
}
/** Kullanım ölçümü adresi; yerelde (localhost / IP adresi) boş döner, ölçüm kapalıdır (olcum.js). Uygulamada açık. */
export const olcumUrl = () => {
  if (isApp()) return OLCUM; // Capacitor'da hostname localhost'tur ama uygulama ölçülmeli
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || /^[\d.]+$|^\[/.test(h) ? '' : OLCUM;
};
