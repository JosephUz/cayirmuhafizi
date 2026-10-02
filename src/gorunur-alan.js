/**
 * Görünür alana kilitleme — telefonda oyun kökünü tarayıcının gerçekten gösterdiği dikdörtgene oturtur.
 *
 * Ne yapar: oyun kökü `position:fixed;inset:0` ile **düzen görünümünü** (layout viewport) doldurur. Telefonda
 * gerçekten görünen alan (visual viewport) bundan kısa olabilir ve **üstten kayabilir**; o zaman kökün tepesi —
 * üst bilgi çubuğu, lobinin oda kodu — ekranın dışında kalır. Görünür alanın üste kaydığı gerçek durumlar:
 *   - oda kodu / oyuncu adı yazarken açılan klavye (Android Chrome varsayılanı görünür alanı kaydırır),
 *   - iki parmakla yakınlaştırma,
 *   - iOS Safari'nin `overflow:hidden` olmasına rağmen sayfayı kaydırması.
 * Tek başına adres çubuğunun açılıp kapanması offsetTop'u değiştirmez; onun payı `--vv-h` (yükseklik) tarafındadır.
 * Üstteki çentik / durum çubuğu payı bu dosyanın işi değildir, CSS'te `env(safe-area-inset-top)` ile verilir.
 *
 * Çözüm: `window.visualViewport`'tan okunan ölçüler CSS değişkeni olarak belgeye yazılır ve kök bu dikdörtgene
 * oturtulur (bkz. style.css → `html.vv`):
 *   `--vv-h` yükseklik · `--vv-w` genişlik · `--vv-top` üst ofset · `--vv-left` sol ofset
 * `visualViewport` yoksa hiçbir şey yazılmaz, `vv` sınıfı eklenmez: CSS kendi `100dvh` / `100%` yedeğinde kalır.
 *
 * **Yalnız dokunmatikte**: masaüstünde de `visualViewport` vardır ve orada kilit yalnız zarar verir (dokunmatik
 * pedle yakınlaştırınca kök küçülüp kayar, sahne her harekette yeniden boyutlanır). Masaüstünde hiç devreye girmez.
 *
 * Klavye: oda kodu yazarken görünür alan yarıya iner ve üste kayar. O an kök küçültülüp kaydırılırsa lobi ve giriş
 * ekranı bozulur; bu yüzden yazı girişi odaktayken ve alan KLAVYE_ESIGI'nden fazla kısaldıysa son kararlı yükseklik
 * **ve üst ofset** korunur.
 *
 * Bu dosya oyuna bağlı değildir: dört oyunda da aynısı kullanılır (yalnız `style.css`'teki `html.vv` kuralları
 * oyunun köküne göre yazılır).
 */

/** Görünür alan bu oranın altına inerse sebep açılan klavyedir: yükseklik küçültülmez. */
export const KLAVYE_ESIGI = 0.75;

/** Yazı girişi sayılan öğeler (klavye bunlar için açılır). */
const YAZI_GIRISI = 'input:not([type=radio]):not([type=checkbox]):not([type=button]),textarea,[contenteditable=""],[contenteditable="true"]';

/**
 * Ham görünüm ölçülerinden kökün oturacağı dikdörtgeni hesaplar (saf işlev: testten de çağrılır).
 *
 * Klavye açıkken (`klavye`) hem yükseklik hem **üst ofset** son kararlı değerde donar: tarayıcı girişi göstermek
 * için görünür alanı yukarı kaydırır, kök de onunla kaydırılırsa altı ekrandan taşar.
 * @param {{vvH?:number,vvW?:number,vvTop?:number,vvLeft?:number,innerH?:number,innerW?:number,yaziGirisi?:boolean}} g
 * @param {{h?:number,top?:number}} sabit son kararlı (klavyesiz) yükseklik ve üst ofset
 * @returns {{h:number,w:number,top:number,left:number,klavye:boolean}}
 */
export function olcumler(g, sabit = {}) {
  const h = Math.round(g.vvH || g.innerH || 0);
  const w = Math.round(g.vvW || g.innerW || 0);
  const taban = Math.round(sabit.h || 0);
  const klavye = !!g.yaziGirisi && taban > 0 && h > 0 && h < taban * KLAVYE_ESIGI;
  return {
    h: klavye ? taban : h,
    w,
    top: klavye ? Math.max(0, Math.round(sabit.top || 0)) : Math.max(0, Math.round(g.vvTop || 0)),
    left: Math.max(0, Math.round(g.vvLeft || 0)),
    klavye,
  };
}

/** Odaktaki öğe yazı girişi mi (klavye açık olabilir). */
function yaziGirisiOdakta(doc) {
  const el = doc.activeElement;
  return !!el && typeof el.matches === 'function' && el.matches(YAZI_GIRISI);
}

/**
 * Dokunmatik mi (telefon, tablet, Android uygulaması; masaüstünde `?touch` ile denenebilir). Kilit yalnız burada
 * açılır — bkz. dosya başı. `src/touch.js` → `touchDevice()` ile aynı kural, ama bu dosya oyuna bağlı olmasın diye
 * burada ayrıca yazılı.
 */
function dokunmatikMi(win) {
  try {
    if (new URLSearchParams(win.location.search).has('touch')) return true;
    return !!win.matchMedia?.('(pointer: coarse)').matches;
  } catch { return false; }
}

/**
 * Kökü görünür alana kilitler: CSS değişkenlerini yazar, `resize` / `scroll` / yön değişiminde günceller ve sayfanın
 * kaymasını geri alır. **Yalnız dokunmatik cihazda** çalışır; masaüstünde ve `visualViewport` desteklenmeyen
 * tarayıcıda sessizce hiçbir şey yapmaz (CSS yedeği devreye girer).
 * @returns {{guncelle:()=>void, birak:()=>void}} güncelle: elle yenile · birak: dinleyicileri kaldır
 */
export function gorunurAlanaKilitle(win = globalThis) {
  const doc = win.document;
  const vv = win.visualViewport;
  if (!doc || !vv || !dokunmatikMi(win)) return { guncelle() {}, birak() {} };
  const kok = doc.documentElement;
  const sabit = { h: 0, top: 0 };

  const uygula = () => {
    const o = olcumler({
      vvH: vv.height, vvW: vv.width, vvTop: vv.offsetTop, vvLeft: vv.offsetLeft,
      innerH: win.innerHeight, innerW: win.innerWidth,
      yaziGirisi: yaziGirisiOdakta(doc),
    }, sabit);
    if (!o.klavye) { sabit.h = o.h; sabit.top = o.top; }
    kok.style.setProperty('--vv-h', o.h + 'px');
    kok.style.setProperty('--vv-w', o.w + 'px');
    kok.style.setProperty('--vv-top', o.top + 'px');
    kok.style.setProperty('--vv-left', o.left + 'px');
    kok.classList.toggle('vv-klavye', o.klavye);
    return o;
  };

  // Sayfa kaymasın: iOS `overflow:hidden` olmasına rağmen kaydırır ve sabit kök görünmez bölgeye çıkar. Klavye
  // açıkken tarayıcı girişi göstermek için kaydırır; o an karışma.
  const basaAl = () => {
    if (yaziGirisiOdakta(doc)) return;
    if (win.scrollX || win.scrollY) win.scrollTo(0, 0);
  };

  const yenile = () => { uygula(); basaAl(); };
  // Yön değişiminde ve klavye kapanışında tarayıcı eski ölçüyü verebilir: biraz sonra bir kez daha oku.
  const gecikmeliYenile = () => { yenile(); win.setTimeout(yenile, 120); win.setTimeout(yenile, 400); };

  kok.classList.add('vv');
  gecikmeliYenile();
  vv.addEventListener('resize', yenile);
  vv.addEventListener('scroll', yenile);
  win.addEventListener('resize', yenile);
  win.addEventListener('orientationchange', gecikmeliYenile);
  win.addEventListener('scroll', basaAl, { passive: true });
  doc.addEventListener('focusin', gecikmeliYenile);
  doc.addEventListener('focusout', gecikmeliYenile);

  return {
    guncelle: yenile,
    birak() {
      vv.removeEventListener('resize', yenile);
      vv.removeEventListener('scroll', yenile);
      win.removeEventListener('resize', yenile);
      win.removeEventListener('orientationchange', gecikmeliYenile);
      win.removeEventListener('scroll', basaAl);
      doc.removeEventListener('focusin', gecikmeliYenile);
      doc.removeEventListener('focusout', gecikmeliYenile);
      kok.classList.remove('vv', 'vv-klavye');
      for (const ad of ['--vv-h', '--vv-w', '--vv-top', '--vv-left']) kok.style.removeProperty(ad);
    },
  };
}
