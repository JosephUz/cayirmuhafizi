import { isApp, olcumUrl } from './platform.js';

/**
 * Kullanım ölçümü: maç başladı / bir dakika oynandı / maç bitti / link paylaşıldı olayları josephuz.com'a (/api/olay) gider,
 * orada Workers Analytics Engine'e yazılır. Kişisel veri yok: cihaz kimliği rastgele bir UUID (localStorage'da kalır ki
 * "kaç farklı cihaz" sayılabilsin), yönlendiren sayfa, uygulama mı web mi. Yerelde (olcumUrl boş) hiçbir şey gönderilmez;
 * gönderim hataları yutulur, oyun asla etkilenmez. Menüye dönüş / odayı terk için olay yoktur.
 */
const OYUN = 'cayirmuhafizi';
const CIHAZ_ANAHTARI = 'josephuz-cihaz';

const rastgele = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
let oturumCihaz = null;
/** Kalıcı cihaz kimliği; localStorage yoksa (gizli sekme, kapalı) oturum boyunca aynı rastgele değer. */
function cihaz() {
  try {
    let c = localStorage.getItem(CIHAZ_ANAHTARI);
    if (!c) { c = rastgele(); localStorage.setItem(CIHAZ_ANAHTARI, c); }
    return c;
  } catch {
    return (oturumCihaz ||= rastgele());
  }
}

/** Tek bir olay gönderir: sendBeacon (sayfa kapanırken de gider; gövde string, Worker Content-Type'a bakmaz), yoksa fetch keepalive. */
export function olay(ad, ekstra = {}) {
  const url = olcumUrl();
  if (!url) return;
  try {
    const govde = JSON.stringify({ oyun: OYUN, olay: ad, cihaz: cihaz(), yonlendiren: (document.referrer || '').slice(0, 200), uygulama: isApp(), ...ekstra });
    if (navigator.sendBeacon && navigator.sendBeacon(url, govde)) return;
    fetch(url, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: govde }).catch(() => {});
  } catch { /* ölçüm oyunu asla bozmasın */ }
}

// Maç bayrakları: her maçta bir kez "bir_dakika" ve bir kez "bitirdi"; macBasladi sıfırlar.
// Süre oyuncunun kendi oynama süresidir (maç saati değil): çevrimiçi maça ortadan katılan için de doğru olsun.
let dakikaGitti = false, bitisGitti = false, baslangicMs = 0;
const gecenSn = () => (performance.now() - baslangicMs) / 1000;

/** Gerçek maç başlangıcı (çevrimdışı begin, çevrimiçi ilk onStart). */
export function macBasladi() { dakikaGitti = false; bitisGitti = false; baslangicMs = performance.now(); olay('basladi'); }
/** Her karede çağrılır (ucuz: bayrak dolunca hemen döner); oyuncu 60 sn oynayınca bir kez "bir_dakika". */
export function macKontrol() {
  if (dakikaGitti || gecenSn() < 60) return;
  dakikaGitti = true; olay('bir_dakika');
}
/** Maç bitti (sonuç ekranı); süre = oyuncunun bu maçta oynadığı saniye. */
export function macBitti() {
  if (bitisGitti) return;
  bitisGitti = true; olay('bitirdi', { sure: Math.round(gecenSn()) });
}
/** Lobi linki kopyalandı. */
export function paylasti() { olay('paylasti'); }
