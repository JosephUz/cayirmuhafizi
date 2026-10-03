import * as T from 'three';

/**
 * **Kalabalık ordu çizimi** (yalnız `?gosteri=savas`, bkz. src/gosteri-savas.js): binlerce askeri **iki** çizim
 * çağrısında çizer.
 *
 * Neden ayrı bir çizici var? Oyunun normal birim görünümü (characters.js buildView) asker başına ~15 ayrı mesh kurar;
 * uzak sadeleştirmesinden (PERF.lodDist) sonra bile ~4 kalır. 2000 asker = ~8000 çizim çağrısı eder ve tarayıcı
 * bunu 60 fps'te çizemez (ölçüm: 500 askerde ~2000 çağrıyla 57 fps, yani çağrı başına ~8 µs). Bu sahnede asker
 * görünümü hiç kurulmaz (`e.view` null kalır, main.js o birimleri atlar); onun yerine **taraf başına tek bir
 * InstancedMesh** her karede bütün askerlerin matrisini yazar. Çizim çağrısı asker sayısından bağımsız olarak 2'dir.
 *
 * Asker tek parça, birleştirilmiş bir geometridir (bacak + gövde + kafa + miğfer + kılıç); renkler **köşe rengine**
 * gömülüdür, yani tek malzeme bütün parçaları doğru renkte çizer. Vuruş parlaması `instanceColor` ile verilir
 * (three.js köşe rengiyle örnek rengini çarpar).
 *
 * Kadraj: tek bir InstancedMesh bütün sahayı kapladığı için ekran dışı elemesi (frustum) hiçbir işe yaramaz, bu
 * yüzden kapatılır — her karede sınır küresi hesaplamak boşuna CPU olurdu.
 */

/**
 * Bir kutu parçası: ölçü, yer, isteğe bağlı z ekseni dönüşü (kılıç) ve rengi. Oyunun asker iskeletiyle (bkz.
 * characters.js buildView) aynı oranlarda ama sadeleştirilmiş: bu kadrajda uzuvlar görünmez.
 * **Miğfer bilerek büyük ve taraf rengindedir**: tepeden bakışta askerin görünen yüzeyi neredeyse yalnız odur.
 */
const PARCALAR = yan => [
  // Bacaklar tek kutu: bu ölçekte (asker ekranda ~18 piksel) iki ayrı bacak görünmez.
  { w: 0.5, h: 0.62, d: 0.32, y: 0.33, renk: '#3c4a46' },
  { w: 0.66, h: 0.74, d: 0.38, y: 1.0, renk: yan.tunik },
  { w: 0.5, h: 0.5, d: 0.46, y: 1.62, renk: '#e1b48a' },
  { w: 0.74, h: 0.24, d: 0.68, y: 1.96, renk: yan.migfer },
  // Kılıç: omzun yanında, hafif dışa yatık.
  { w: 0.13, h: 1.1, d: 0.09, x: 0.5, y: 1.36, z: 0.12, dz: -0.3, renk: '#e6eee8' },
];

/** Parçaları tek bir indekssiz geometride birleştirir; her parçanın rengi köşe rengi olarak yazılır. */
function askerGeometrisi(yan) {
  const parcalar = PARCALAR(yan).map(p => {
    const g = new T.BoxGeometry(p.w, p.h, p.d);
    if (p.dz) g.rotateZ(p.dz);
    g.translate(p.x || 0, p.y, p.z || 0);
    return { g: g.toNonIndexed(), renk: new T.Color(p.renk) };
  });
  const n = parcalar.reduce((t, p) => t + p.g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const { g, renk } of parcalar) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < c; i++) { col[(o + i) * 3] = renk.r; col[(o + i) * 3 + 1] = renk.g; col[(o + i) * 3 + 2] = renk.b; }
    o += c;
    g.dispose();
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  return geo;
}

const KOK = new T.Euler(0, 0, 0, 'YXZ');
const KONUM = new T.Vector3(), DONUS = new T.Quaternion(), OLCEK = new T.Vector3();
const MATRIS = new T.Matrix4();
const BOS = new T.Matrix4().makeScale(0, 0, 0);

/**
 * Bir tarafın ordusunu çizen InstancedMesh. `yan`: { tunik, migfer } renkleri; `siga` en çok kaç asker.
 * `guncelle(liste)` her karede çağrılır ve listedeki birimlerin konum / yön / ölüm eğimini matrise yazar.
 */
export function createOrduCizim(scene, yan, siga) {
  const geo = askerGeometrisi(yan);
  const malzeme = new T.MeshStandardMaterial({ roughness: 1, flatShading: true, vertexColors: true });
  const im = new T.InstancedMesh(geo, malzeme, siga);
  im.instanceMatrix.setUsage(T.DynamicDrawUsage);
  // Asker gölgesi yok (bkz. config QUALITY.units): kalabalıkta en pahalı kalem gölge geçişidir.
  im.castShadow = false; im.receiveShadow = true;
  im.frustumCulled = false;
  im.count = 0;
  // Vuruş parlaması: örnek rengi köşe rengiyle çarpılır, yani 1 = olduğu gibi, >1 = beyaza doğru parlama.
  im.instanceColor = new T.InstancedBufferAttribute(new Float32Array(siga * 3).fill(1), 3);
  im.instanceColor.setUsage(T.DynamicDrawUsage);
  scene.add(im);
  const renkler = im.instanceColor.array;

  /**
   * Bir karelik yazma. `liste` birim dizisidir; ölüler de yazılır (devrilme ve gömülme canlandırması burada).
   * `olcekler` birim başına boy çarpanıdır (her askeri birbirinin kopyası yapmamak için, bkz. gosteri-savas.js).
   */
  function guncelle(liste, parlama) {
    const n = Math.min(liste.length, siga);
    for (let i = 0; i < n; i++) {
      const e = liste[i], s = e.gosteriAsker;
      let egim = 0, y = e.jumpY, olcek = s.boy;
      if (e.alive) {
        // Yürüyüş zıplaması ve vuruş öne eğilmesi: kutu asker canlanmış görünsün (uzuv animasyonu yok).
        y += s.sekme;
        if (e.attackTimer > 0) egim = 0.5 * (e.attackTimer / e.stats.weapon.duration);
      } else {
        // Ölüm: COMBAT.deathDuration boyunca devrilir, sonra COMBAT.sinkDuration boyunca yere gömülür.
        const t = e.deathTimer < 1.1 ? e.deathTimer / 1.1 : 1;
        egim = -Math.PI * 0.5 * (1 - (1 - t) * (1 - t));
        const batma = e.deathTimer > 1.1 ? Math.min(1, (e.deathTimer - 1.1) / 0.7) : 0;
        y -= batma * 2.4;
        if (batma >= 1) { im.setMatrixAt(i, BOS); renkler[i * 3] = renkler[i * 3 + 1] = renkler[i * 3 + 2] = 1; continue; }
      }
      KOK.set(egim, e.facing, 0);
      DONUS.setFromEuler(KOK);
      KONUM.set(e.pos.x, y, e.pos.z);
      OLCEK.set(olcek, olcek, olcek);
      MATRIS.compose(KONUM, DONUS, OLCEK);
      im.setMatrixAt(i, MATRIS);
      const f = e.hitFlash > 0 ? 1 + parlama * (e.hitFlash / 0.18) : 1;
      renkler[i * 3] = renkler[i * 3 + 1] = renkler[i * 3 + 2] = f;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
  }

  function kaldir() { scene.remove(im); geo.dispose(); malzeme.dispose(); }

  return { im, guncelle, kaldir };
}
