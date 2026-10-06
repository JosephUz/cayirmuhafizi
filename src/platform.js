import { OLCUM, ONLINE, SERVER } from './config.js';

/** Gerçekten Capacitor uygulamasının içinde mi (taklit `?app` sayılmaz; bkz. olcumUrl). */
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
/**
 * Android uygulaması mı (Capacitor, oyun dosyaları uygulamanın içinden açılır) yoksa tarayıcı mı. `?app` ile tarayıcıda
 * da uygulama kipi denenir (testler).
 */
export const isApp = () => isNative() || new URLSearchParams(location.search).has('app');
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
/**
 * Kullanım ölçümü adresi; yerelde (localhost / IP adresi) boş döner, ölçüm kapalıdır (olcum.js). Gerçek
 * uygulamada açıktır.
 *
 * Kapı **gerçek Capacitor**'a bakar, `isApp()`e değil: Capacitor'da hostname localhost'tur ama uygulama
 * ölçülmelidir, oysa `?app` yalnız testlerin uygulama kipi **taklididir**. `isApp()` denseydi
 * `127.0.0.1/?app` ile açılan dokunmatik dumanı testi her koşuda www.josephuz.com'a gerçek bir ölçüm olayı
 * yollardı: hem üretim sayıları test koşularıyla kirlenirdi, hem de ağı/DNS'i kapalı bir makinede istek
 * düşüp sayfaya `ERR_NAME_NOT_RESOLVED` konsol hatası düşerdi — test de onu gördüğü için `npm test` ağa
 * bağımlı hâle gelirdi (Kalite Kapısı JOS-1219 bu yüzden düştü).
 */
export const olcumUrl = () => {
  if (isNative()) return OLCUM;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || /^[\d.]+$|^\[/.test(h) ? '' : OLCUM;
};
