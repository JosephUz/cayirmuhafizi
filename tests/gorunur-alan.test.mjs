// Görünür alana kilitleme (src/gorunur-alan.js): telefonda tarayıcı çubuklarının bıraktığı alanın ölçüsü ve kilidin
// yazdığı CSS değişkenleri. Tarayıcı gerekmez: ölçü hesabı saf işlev, kilit ise sahte bir pencereyle denenir.
import assert from 'node:assert/strict';
import test from 'node:test';
import { KLAVYE_ESIGI, gorunurAlanaKilitle, olcumler } from '../src/gorunur-alan.js';

test('görünür alan ölçüleri visualViewport değerlerinden gelir', () => {
  const o = olcumler({ vvH: 334, vvW: 844, vvTop: 56, vvLeft: 0, innerH: 390, innerW: 844 });
  assert.deepEqual(o, { h: 334, w: 844, top: 56, left: 0, klavye: false });
});

test('visualViewport yoksa pencere ölçüsüne düşer', () => {
  const o = olcumler({ innerH: 390, innerW: 844 });
  assert.equal(o.h, 390);
  assert.equal(o.w, 844);
  assert.equal(o.top, 0);
});

test('görünür alan kısalınca (çubuk açılması) yeni ölçü uygulanır', () => {
  // Önce tam alan ölçülmüş, sonra görünür alan kısalmış: kök de kısalır, yoksa altı ekrandan taşar.
  const o = olcumler({ vvH: 334, vvW: 844, vvTop: 0 }, { h: 390, top: 0 });
  assert.equal(o.h, 334);
  assert.equal(o.top, 0);
  assert.equal(o.klavye, false);
});

test('görünür alan üste kayınca (yakınlaştırma / iOS kaydırması) kök de kayar', () => {
  const o = olcumler({ vvH: 334, vvW: 844, vvTop: 56 }, { h: 390, top: 0 });
  assert.equal(o.top, 56, 'kök görünür alanla birlikte aşağı iner, tepesi ekranın dışında kalmaz');
});

test('oda kodu yazarken klavye açılınca yükseklik ve üst ofset donar', () => {
  // Klavye açılınca tarayıcı görünür alanı hem kısaltır hem yukarı kaydırır (vvTop). Kök ikisini de izlerse
  // lobi bozulur ve altı ekrandan taşar: son kararlı değerlerde kalmalı.
  const o = olcumler({ vvH: 180, vvW: 844, vvTop: 150, yaziGirisi: true }, { h: 390, top: 0 });
  assert.equal(o.klavye, true, 'klavye olarak görülmeli');
  assert.equal(o.h, 390, 'içerik bozulmasın diye son kararlı yükseklik kalır');
  assert.equal(o.top, 0, 'üst ofset de donar, yoksa kökün altı ekrandan taşar');
});

test('yazı girişi odaktayken bile küçük kısalma (eşiğin üstünde) uygulanır', () => {
  const h = Math.round(390 * KLAVYE_ESIGI) + 5;
  const o = olcumler({ vvH: h, vvW: 844, vvTop: 12, yaziGirisi: true }, { h: 390, top: 0 });
  assert.equal(o.klavye, false);
  assert.equal(o.h, h);
  assert.equal(o.top, 12);
});

test('eksik ya da negatif ofsetler sıfırlanır', () => {
  const o = olcumler({ vvH: 334, vvW: 844, vvTop: -3 });
  assert.equal(o.top, 0);
  assert.equal(o.left, 0);
});

/** Sahte pencere: CSS değişkenlerini ve sınıfları toplayan en küçük DOM. */
function sahtePencere({ h, w, top = 0, left = 0, vvYok = false, dokunmatik = true } = {}) {
  const degiskenler = new Map(), siniflar = new Set(), dinleyiciler = new Map();
  const kaydet = (hedef, tur, fn) => { if (!hedef.has(tur)) hedef.set(tur, new Set()); hedef.get(tur).add(fn); };
  const vv = {
    height: h, width: w, offsetTop: top, offsetLeft: left,
    addEventListener: (tur, fn) => kaydet(dinleyiciler, 'vv:' + tur, fn),
    removeEventListener: (tur, fn) => dinleyiciler.get('vv:' + tur)?.delete(fn),
  };
  const doc = {
    activeElement: null,
    documentElement: {
      style: {
        setProperty: (k, v) => degiskenler.set(k, v),
        removeProperty: k => degiskenler.delete(k),
      },
      classList: {
        add: (...c) => c.forEach(x => siniflar.add(x)),
        remove: (...c) => c.forEach(x => siniflar.delete(x)),
        toggle: (c, on) => (on ? siniflar.add(c) : siniflar.delete(c)),
      },
    },
    addEventListener: (tur, fn) => kaydet(dinleyiciler, 'doc:' + tur, fn),
    removeEventListener: (tur, fn) => dinleyiciler.get('doc:' + tur)?.delete(fn),
  };
  const kaydirma = [];
  const win = {
    document: doc, visualViewport: vvYok ? undefined : vv,
    innerHeight: h, innerWidth: w, scrollX: 0, scrollY: 0,
    location: { search: '' },
    matchMedia: s => ({ matches: dokunmatik && s === '(pointer: coarse)' }),
    setTimeout: () => 0,
    scrollTo: (x, y) => kaydirma.push([x, y]),
    addEventListener: (tur, fn) => kaydet(dinleyiciler, 'win:' + tur, fn),
    removeEventListener: (tur, fn) => dinleyiciler.get('win:' + tur)?.delete(fn),
  };
  return { win, vv, degiskenler, siniflar, kaydirma, tetikle: ad => dinleyiciler.get(ad)?.forEach(fn => fn()) };
}

test('kilit CSS değişkenlerini ve vv sınıfını yazar', () => {
  const p = sahtePencere({ h: 334, w: 844, top: 56 });
  const kilit = gorunurAlanaKilitle(p.win);
  assert.ok(p.siniflar.has('vv'), 'style.css kuralları için vv sınıfı eklenmeli');
  assert.equal(p.degiskenler.get('--vv-h'), '334px');
  assert.equal(p.degiskenler.get('--vv-w'), '844px');
  assert.equal(p.degiskenler.get('--vv-top'), '56px');
  assert.equal(p.degiskenler.get('--vv-left'), '0px');
  kilit.birak();
  assert.ok(!p.siniflar.has('vv'));
  assert.equal(p.degiskenler.size, 0);
});

test('adres çubuğu açılıp kapanınca (visualViewport resize) değişkenler güncellenir', () => {
  const p = sahtePencere({ h: 390, w: 844 });
  gorunurAlanaKilitle(p.win);
  assert.equal(p.degiskenler.get('--vv-h'), '390px');
  p.vv.height = 334; p.vv.offsetTop = 56;
  p.tetikle('vv:resize');
  assert.equal(p.degiskenler.get('--vv-h'), '334px');
  assert.equal(p.degiskenler.get('--vv-top'), '56px');
});

test('sayfa kayarsa başa alınır (iOS overflow:hidden olmasına rağmen kaydırır)', () => {
  const p = sahtePencere({ h: 390, w: 844 });
  gorunurAlanaKilitle(p.win);
  p.win.scrollY = 40;
  p.tetikle('win:scroll');
  assert.deepEqual(p.kaydirma.at(-1), [0, 0]);
});

test('visualViewport desteklenmeyen tarayıcıda hiçbir şey yazılmaz (CSS yedeği çalışır)', () => {
  const p = sahtePencere({ h: 390, w: 844, vvYok: true });
  gorunurAlanaKilitle(p.win);
  assert.equal(p.siniflar.size, 0);
  assert.equal(p.degiskenler.size, 0);
});

test('masaüstünde kilit hiç devreye girmez (orada da visualViewport var)', () => {
  // Masaüstünde kilit yalnız zarar verir: dokunmatik pedle yakınlaştırınca kök küçülüp kayar ve sahne her
  // harekette yeniden boyutlanır. Tarayıcı çubuğu sorunu da yalnız telefonda vardır.
  const p = sahtePencere({ h: 900, w: 1600, dokunmatik: false });
  gorunurAlanaKilitle(p.win);
  assert.equal(p.siniflar.size, 0, 'vv sınıfı eklenmemeli');
  assert.equal(p.degiskenler.size, 0);
});

test('masaüstünde ?touch ile denenebilir', () => {
  const p = sahtePencere({ h: 900, w: 1600, dokunmatik: false });
  p.win.location.search = '?touch';
  gorunurAlanaKilitle(p.win);
  assert.ok(p.siniflar.has('vv'));
});
