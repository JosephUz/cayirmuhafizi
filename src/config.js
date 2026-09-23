// Tüm ayar sayıları tek yerde. Hız birimi: birim/sn, süreler saniye.

/**
 * Takım oyunu: 1v1 … 5v5. İnsan oyuncu her zaman **mavi** takımda 0. yuvadadır; kalan yuvalar (iki takımda da) botlarla
 * dolar. Her oyuncunun (insan ya da bot) kendi sancağı, üssü, kasası, ordusu ve kahramanı vardır; düşmanlık takıma
 * göredir (faction = takım: 'blue' senin takımın, 'red' rakip takım). Arena takım büyüklüğüyle genişler (half(n) yarı
 * boy); üsler takım çapasından (1v1'deki sancak yerleri) hatta dik doğrultuda baseGap aralıkla dizilir, her üsten
 * haritanın ortasına bir yol ve o yolda bir başlangıç kulesi vardır. Çapadaki üs (0. yuva) üç hattın da başıdır.
 */
export const TEAMS = {
  sizes: [1, 2, 3, 4, 5], default: 1,
  half: n => 120 + 25 * (n - 1),
  baseGap: 46,
  /** Bot adları ve sahip renkleri (birimin ayağındaki halka, yapının direğindeki bant); insan hep humanColor (altın). */
  names: ['Aslan', 'Kartal', 'Kurt', 'Şahin', 'Boğa', 'Pars', 'Doğan', 'Çakır', 'Tuğrul', 'Alp'],
  colors: ['#8fe08f', '#ff9a3c', '#c48bff', '#5fe0d8', '#ff6fa8', '#f0f0f0', '#a0c4ff', '#d7b26d', '#b6ff5c', '#ffb3b3'],
  humanColor: '#ffd12e',
  /** Çevrim içi oyunda mavi takımdaki insanlar sırayla bu renkleri alır (ilk kuran altın); botlar kalan renklerden. */
  humanColors: ['#ffd12e', '#ff9a3c', '#8fe08f', '#5fe0d8', '#c48bff'],
};
/**
 * Yürünebilir alanın **en büyük** yarı boyu (5v5 arenası); oyun içi gerçek sınır world.half'tır (bkz. TEAMS.half:
 * 1v1'de 120, zemin 240x240). Sis ızgarası ve gölge kamerası en büyük arenaya göre boyutlanır.
 */
export const HALF = TEAMS.half(TEAMS.sizes[TEAMS.sizes.length - 1]);

export const PHYSICS = {
  /** Birimler arası kişisel alan: çarpışma yarıçapları bu katsayıyla büyütülür (sıkı paket olmasınlar). */
  unitSpacing: 1.9,
  /** Darbe hızının sönümlenmesi (1/s). */
  pushDrag: 4.2,
  restitution: 0.35,
  correction: 0.85,
  fixedStep: 1 / 60,
  maxSteps: 5,
};

export const GRAVITY = 22;
export const JUMP_SPEED = 7.8;
export const SPRINT_MULT = 1.65;

export const BLOCK = {
  speedMult: 0.45,
  /** Kalkanın koruduğu ön yarım: saldırı yönü ile bakış yönü dot eşiği. */
  frontDot: 0.15,
  damageMult: 0.15,
  knockMult: 0.3,
};

/**
 * Sağ tık: kahraman **durduğu yerde bir hortum** çağırır. Hortum çağrıldığı noktada kalır (kahraman uzaklaşabilir),
 * `duration` boyunca döner ve her `tick` saniyede yarıçapındaki **bütün düşmanlara** (birim ve yapı) vuruşunun
 * `damageMult` katı hasarı yeniden indirir: 2 saniyede 8 vuruş, toplam vuruşun ~4.8 katı. Yarıçapı seviyeyle
 * modüler büyür (her LEVEL.dashEvery seviyede %10, bkz. dashMult). `cast` çağırma anındaki kısa savuşturma
 * penceresi, `cooldown` iki hortum arası bekleme, `rings` / `height` / `spin` huninin görüntüsüdür.
 */
export const TORNADO = { duration: 2, radius: 3.2, tick: 0.25, damageMult: 0.6, cooldown: 1.4, knockback: 3, cast: 0.22, invuln: 0.5, rings: 7, height: 4.2, spin: 7 };

/**
 * Sağ tıkta hortumla birlikte **ileri atılma**: kahraman imlece doğru fırlar, hortum da fırladığı (durduğu) noktada
 * kalır. Atılma mesafesi oyunun başında `base` birimdir ve **seviye başına `perLevel` birim** bunun üstüne eklenir
 * (en çok `max`): kahraman seviye aldıkça haritada belirgin biçimde daha hızlı yol alır. İtme sürtünmeyle söndüğü
 * için (PHYSICS.pushDrag) itme gücü **mesafe x sürtünme** verilir; böylece kahraman gerçekten bu kadar yol alır.
 * `duration` atılma sırasındaki savuşturma (dodgeTimer) penceresi, `invuln` vurulmazlık süresidir.
 */
export const DASH = { base: 4.8, perLevel: 0.12, max: 12, duration: 0.28, invuln: 0.5, /** Kalkanlı setlerde vurulmazlık bu kat uzar. */ shieldInvulnMult: 1.8 };

/**
 * Sol tık kahramanda **dönerek vuruş**: normal vuruşun (yakın dövüşte yay, yayda imlece giden ok yaylımı) üstüne
 * kahramanın çevresinde `duration` saniye dönen bir çember açılır ve her `tick` saniyede çemberin içindeki
 * **bütün** düşmanlara — birim ve yapı — vuruşunun `damageMult` katı iner (yön / açı aranmaz, 360°).
 * Yakın dövüşte çemberin yarıçapı kahramanın vuruş menzilidir (en az `minRadius`, seviyeyle büyür); okçuda
 * `bowRadius`tır ve çember kahramanın **seviyesi kadar dönen oktan** oluşur. Peş peşe tıklamada çember yenilenir,
 * üst üste binmez. `spin` çemberin dönüş hızıdır.
 */
export const SPIN = { duration: 1, tick: 0.2, damageMult: 0.5, minRadius: 2.4, bowRadius: 4.4, spin: 6.5, knockback: 2 };

/**
 * Kahraman **yetenek setleri**: set silah x at ile belirlenir (kalkan yalnızca atılma vurulmazlığını uzatır, DASH.shieldInvulnMult).
 * Sol tık her sette silahın kendi vuruşu (yakın dövüşte yay, okçuda ok) + sete özel ek etki; sağ tık her sette ileri atılma +
 * sete özel ikinci etki. Sayılar vuruş gücünün katıdır; yarıçaplar dashMult (her 10 seviyede +%10), uzunluklar vuruş
 * menziliyle (seviyeyle) büyür, ok sayıları heroArrows (seviye) ile artar. Uygulama: abilities.js.
 */
/**
 * Sol tık **basılı tutma = şarjlı vuruş**. Tık anında silahın normal vuruşu iner; fare delay sn'den uzun basılı kalırsa şarj
 * başlar, full sn'de dolar (kahramanın üstünde çubuk), bırakınca silaha özgü güçlü vuruş çıkar (şarj oranı c: 0..1, hasar
 * 1 + (damage - 1) x c). Şarj sırasında hız speedMult; şarjlı vuruştan sonra bekleme cooldownMult kat.
 * **Her silahta aynı kalıp**: şarjlı vuruş, o silahın normal sol tık vuruşunu **peş peşe shots kez** (gap sn arayla) yapar;
 * şarj yarımsa atış sayısı da yarıdır (en az 1). Her vuruş normal güçtedir, hasar çarpanı yoktur. Dalgalar sırasında nişan
 * imleci izler, yani vuruşları süpürebilirsin.
 *  - Kılıç: 360° şok dalgası (her dalga daha geniş, sert iter).
 *  - Mızrak: koridor dalgası (her dalga daha uzun, en yakını sana çeker).
 *  - Yay: yaylım (yelpaze atışı).
 */
export const CHARGE = {
  delay: 0.22, full: 0.6, minRelease: 0.15, speedMult: 0.5, cooldownMult: 1.5,
  /**
   * Kılıç: **360° şok dalgası**, shots kez, gap sn arayla; her dalga bir öncekinden growth kadar geniş (1x, 1.2x, 1.4x menzil),
   * vurduğunu knockMult kat iter. İlk dalgada kahraman lunge birim öne kayar.
   */
  sword: { shots: 3, gap: 0.14, growth: 0.2, knockMult: 3, lunge: 0.8 },
  // knockMult yalnızca son dalgada uygulanır (bkz. abilities.chargePulse): ara dalgalar itseydi hedef menzilden çıkardı.
  /**
   * Mızrak: **koridor dalgası**, shots kez, gap sn arayla; her dalga bir öncekinden growth kadar uzun (1x, 1.4x, 1.8x koridor),
   * her dalga en yakın hedefi pull ile kahramana çeker.
   */
  spear: { shots: 3, gap: 0.14, growth: 0.4, pull: 7 },
  /** Yay: normal yaylımı shots kez, gap sn arayla tekrarlar (tam şarjda 5 atış). */
  bow: { shots: 5, gap: 0.12 },
};

export const KIT = {
  /**
   * Girdap: çevrede 1 sn dönen bıçak çemberi (SPIN). Kılıç fırtınası: hortumla aynı alan sayıları (yarıçap, süre, tempo, hasar)
   * ama görselde durduğun yerde savrulan kılıçlar (blades tane, farklı yarıçap ve yüksekliklerde dönüp takla atar).
   */
  sword: { label: 'Kılıçlı', primary: 'Çevre kesik', secondary: 'Kılıç fırtınası', charge: 'Şok dalgası',
    fieldRadius: TORNADO.radius, fieldLife: TORNADO.duration, fieldTick: TORNADO.tick, fieldDamage: TORNADO.damageMult, fieldKnock: TORNADO.knockback, blades: 10,
    primaryDesc: '360° döner, menzildeki herkesi vurur (menzil seviyeyle büyür)',
    chargeDesc: '3 dalga, menzilin 1x/1.2x/1.4x katı, üç kat iter',
    secondaryDesc: `durduğun yerde ${TORNADO.duration} sn savrulan kılıçlar (${TORNADO.radius} birim, ${TORNADO.tick} sn'de bir vuruşun ${TORNADO.damageMult} katı)` },
  /**
   * Koridor: mızrak vuruşu yay değil, bakış yönünde corridorLen x menzil uzunluğunda, corridorWidth genişliğinde bir
   * koridordur; içindeki herkes vurulur (delip geçer). Kazık alanı: hortum gibi **durduğun yerde** açılır; yerden yükselen
   * kazıklar fieldLife sn boyunca fieldTick sn'de bir yarıçaptaki herkese vuruşun fieldDamage katını verir ve dışa iter.
   */
  spear: { label: 'Mızraklı', primary: 'Koridor', secondary: 'Kazık alanı', charge: 'Şok dalgası',
    corridorLen: 2, corridorWidth: 1.8,
    fieldRadius: 3.2, fieldLife: 2, fieldTick: 0.25, fieldDamage: 0.6, fieldKnock: 3, stakes: 16,
    primaryDesc: 'önünde 2 kat menzil boyu, 1.8 birim eni koridor; içindeki herkesi deler',
    chargeDesc: '3 koridor dalgası, 1x/1.4x/1.8x boy, en yakınını sana çeker',
    secondaryDesc: 'durduğun yerde 2 sn yerden kazık (3.2 birim, 0.25 sn\'de bir vuruşun 0.6 katı, dışa iter)' },
  /**
   * Yelpaze: seviye kadar ok fanMax dereceye kadar dağılır, her ok kendi yönündeki (homingDeg) düşmana kilitlenir.
   * Ok yağmuru: hortum gibi **durduğun yerde** açılır; fieldLife sn boyunca fieldTick sn'de bir yarıçaptaki herkese
   * vuruşun fieldDamage katı ok düşer (görselde her tick gökten oklar iner). Yarıçap dashMult ile büyür.
   */
  bow: { label: 'Okçu', primary: 'Yelpaze', secondary: 'Ok yağmuru', charge: 'Hızlı yaylım',
    chargeDesc: '5 yaylım, 0.12 sn arayla; nişan imleci izler',
    fanStep: 8, fanMax: 70, homingDeg: 10, arrowMult: 1,
    fieldRadius: 3.2, fieldLife: 2, fieldTick: 0.25, fieldDamage: 0.6, fieldKnock: 1,
    primaryDesc: 'seviyen kadar ok 70° yelpazede, her biri kendi yönündeki düşmana kilitlenir',
    secondaryDesc: 'durduğun yerde 2 sn ok yağmuru (3.2 birim, 0.25 sn\'de bir vuruşun 0.6 katı)' },
  /**
   * Atlı setler: sağ tık alan etkisi yayanınkiyle aynıdır (KIT[silah] alan sayıları) ve üstüne **vakum** gelir: tık anında
   * alanın merkezinden vacuum.radius (alan yarıçapının katı) içindeki düşmanlar vacuum.life sn boyunca merkeze çekilir
   * (vacuum.pull: çekme itmesi, kütleden bağımsız), böylece alanın içine toplanıp vuruşları yerler.
   */
  horsesword: { label: 'Kılıçlı Atlı', primary: 'Geniş kesik', secondary: 'Kılıç fırtınası + vakum', field: 'blades',
    charge: 'Şok dalgası', chargeDesc: '3 dalga, gitgide genişler',
    arcMult: 1.6, knockMult: 2, vacuum: { radius: 2.4, life: 0.6, pull: 42 },
    primaryDesc: 'vuruş yayı 180°, itme iki kat; önündeki kalabalığı savurur',
    secondaryDesc: 'durduğun yerde 2 sn savrulan kılıç; tıkta çevredekiler merkeze çekilir' },
  /** Hücum: vururken yavaşlamaz, hasar hıza göre artar (tam koşuda 1+chargeBonus). Mızrak hücumu: atılma bitince öne koni vuruşu. */
  horsespear: { label: 'Mızraklı Atlı', primary: 'Hücum', secondary: 'Kazık alanı + vakum', field: 'spikes',
    charge: 'Şok dalgası', chargeDesc: '3 koridor dalgası, gitgide uzar, en yakınını sana çeker',
    chargeBonus: 1, attackControl: 1, vacuum: { radius: 2.4, life: 0.6, pull: 42 },
    primaryDesc: 'vururken yavaşlamazsın, hasar hızınla artar (tam koşuda 2x)',
    secondaryDesc: 'durduğun yerde 2 sn yerden kazık; tıkta çevredekiler merkeze çekilir' },
  /** Koşarken atış: yavaşlamaz, ok sayısı arrowMult katı, dar yelpaze. Geriye yaylım: atılırken arkaya takipli oklar. */
  horsebow: { label: 'Atlı Okçu', primary: 'Koşarken atış', secondary: 'Ok yağmuru + vakum', field: 'rain',
    charge: 'Hızlı yaylım', chargeDesc: '5 yaylım, 0.12 sn arayla, seviyenin iki katı ok',
    attackControl: 1, arrowMult: 2, fanStep: 3, fanMax: 20, homingDeg: 8, vacuum: { radius: 2.4, life: 0.6, pull: 42 },
    primaryDesc: 'atarken yavaşlamazsın, seviyenin iki katı ok dar yelpazede',
    secondaryDesc: 'durduğun yerde 2 sn ok yağmuru; tıkta çevredekiler merkeze çekilir' },
};

/** Vuruşların hedefi itme çarpanı (asker ve kule vuruşları). 0 = itmez. */
export const KNOCKBACK_SCALE = 0;
/** Kahramanın vuruşları çevresindekileri biraz iter. */
export const HERO_KNOCKBACK = 0.5;

export const COMBAT = {
  /** Vuruş sonrası sersemleme (hareketi durdurur). 0 = vuruşlar hareketi etkilemez. */
  stunOnHit: 0,
  hitFlash: 0.18,
  /** Bu yükseklikten yukarıda yakın dövüş vuruşları ıskalar. */
  jumpDodgeHeight: 0.6,
  deathDuration: 1.1,
  sinkDuration: 0.7,
};

export const WEAPONS = {
  sword: { label: 'Kılıç', range: 2.2, arc: Math.PI * 0.62, damage: 26, cooldown: 0.46, windup: 0.13, duration: 0.4, knockback: 12 },
  spear: { label: 'Mızrak', range: 3.1, arc: Math.PI * 0.45, damage: 22, cooldown: 0.6, windup: 0.18, duration: 0.5, knockback: 9 },
  /**
   * Menzili birim tavanıdır (TOWER.range x TOWER.unitRangeMax = 9): oyundaki en uzun asker menzili budur, kuleyi
   * hiçbir asker dışarıdan dövemez. soldierMult: asker okçular kahramandan daha zayıf atar.
   */
  bow: { label: 'Yay', range: 9, arc: 0, damage: 18, cooldown: 0.85, windup: 0.25, duration: 0.45, knockback: 0, ranged: true, arrowSpeed: 17, soldierMult: 0.65 },
  /** İşçi aleti: saldırmaz. */
  tool: { label: 'Kazma', range: 1, arc: 0.5, damage: 0, cooldown: 1, windup: 0.1, duration: 0.3, knockback: 0 },
  /**
   * Mancınık: **uzaktan vurabilen tek birim**. Menzili kule menzilinin (27) 9 birim dışındadır (36), böylece kuşatma
   * kulenin atış alanına girmeden dövebilir; menzil tavanı (TOWER.unitRangeMax) yalnızca ona işlemez.
   * **Vuruş gücü artık normaldir**: 40 hasar, 2.2 sn'de bir — canlı hedefe olduğu gibi iner (dağılma çarpanı kalktı),
   * kuleye TOWER.siegeDamageMult katı geçer (40 x 2.5 = 100). Siege silahlara asker hasar çarpanı (0.55) uygulanmaz.
   */
  catapult: { label: 'Mancınık', range: 36, arc: 0, damage: 40, cooldown: 2.2, windup: 0.45, duration: 0.9, knockback: 0, ranged: true, arrowSpeed: 16, siege: true },
};

/** Mancınık gövdesi: askerlere karşı çok dayanıksız, yavaş, geniş. */
export const SIEGE = { hp: 40, speed: 2.4, radius: 0.9 };

export const PLAYER_BASE = { speed: 6.2, accel: 15, hp: 140, radius: 0.45, invMass: 1 };
/**
 * Kahramanlar (oyuncu ve rakip kahraman) kendi türündeki asker gibi vurur (asker hasar çarpanı, üstünlük matrisi, alan vuruşu);
 * farkları can, hız ve seviyeyle büyüyen vuruş alanı / ok sayısıdır. İşçiler dahil her düşmana vurur; yapılara
 * (bina, kule, sancak) türünün asker hasarıyla vurur, bu hasar seviye başına LEVEL.structureDamagePerLevel artar. Kafaları sarıdır.
 */
/** Kahraman kafası takıma göre: senin takımın (mavi) kahramanları sarı, rakip takımın kahramanları kırmızı kafalıdır. */
export const HERO = { damageLikeSoldier: true, headColor: '#ffd12e', enemyHeadColor: '#e0362b' };
export const SOLDIER_BASE = { speed: 3.8, accel: 9, hp: 100, radius: 0.45, invMass: 1.15, damageMult: 0.55 };
export const HORSE = { speedMult: 1.7, hpBonus: 50, radius: 0.62, invMassMult: 0.6, damageMult: 1.2 };
export const SHIELD = { hpBonus: 30, /** Kalkan taşıyan birim belirgin yavaştır. */ speedMult: 0.8, /** Yapay zekâ kalkanlıları önden gelen vuruşu pasif azaltır. */ passiveFrontMult: 0.7 };

/**
 * Birim üstünlükleri: **anti sistemi**. Her tür, antisi olduğu türleri **üç vuruşta** düşürür; asker tipi savaşın kendisidir.
 * **Tek atma yoktur**: anti vuruş çok sert ama hedefe en az üç vuruşluk yaşama hakkı bırakır, böylece kaçmak, karşılık
 * vermek ve destek almak mümkün olur (tek vuruşta ölmek oyunu okunmaz kılıyordu).
 * - Askere anti vuruş: hedef canının soldierMult katı (0.34x -> üçüncü vuruşta ölür; kalkan önden %30 emdiği için
 *   kalkanlı hedef önden beş vuruş dayanır, arkadan üç).
 * - Kahramana anti vuruş: sabit heroDamage (sv 1 kahraman 140 can -> dördüncü vuruşta düşer; her seviye +10 can
 *   verdiği için üst seviyelerde daha çok vuruş gerekir).
 *   Vuran kahramansa seviye çarpanı da biner. Dönerek vuruş (0.5x) ve hortum (0.6x) anti hasarı da aynı oranda ölçekler.
 * - Anti dışı eşleşmeler 1x; yalnızca ok zayıftır (weak): kalkana 0.15x, atlıya 0.5x.
 * Tablo karşılıklı üstünlük çifti oluşturmaz: atlı mızrak yaya mızrağına, atlı okçu yaya mızrak ile atlı kılıca üstün
 * değildir (onlar atlının antisidir). Kalkanlı atlıları yalnızca mızrak durdurur; bedelleri de en yüksektir.
 */
export const ANTI = {
  /** Anti vuruşun askere hasarı: hedefin azami canının bu katı (0.34 -> üç vuruş). */
  soldierMult: 0.34,
  /** Anti vuruşun kahramana hasarı (sabit): 140 canlı sv 1 kahraman dördüncü vuruşta düşer. */
  heroDamage: 45,
  weak: { bowVsShield: 0.15, bowVsHorse: 0.5 },
  /** Saldıran tür -> üstün olduğu, üç vuruşta düşürdüğü türler (SOLDIER_TYPES anahtarları). */
  table: {
    sword: ['spear', 'spearshield'],
    swordshield: ['spear', 'spearshield'],
    spear: ['horsebow', 'horsespear', 'horsesword', 'horseswordshield', 'horsespearshield'],
    spearshield: ['horsebow', 'horsespear', 'horsesword', 'horseswordshield', 'horsespearshield'],
    bow: ['sword', 'spear', 'bow'],
    horsespear: ['sword', 'swordshield', 'bow'],
    horsespearshield: ['sword', 'swordshield', 'bow'],
    horsesword: ['bow', 'horsebow'],
    horseswordshield: ['bow', 'horsebow'],
    horsebow: ['sword', 'bow', 'horsespear'],
  },
};

/** Donanımdan tür anahtarı (kahraman ve typeKey'siz birimler için): silah + kalkan + at eşleşen asker türü. */
const loadoutKeys = new Map();
export function loadoutKey(l) {
  if (!l) return null;
  const k = `${l.weapon}|${l.shield ? 1 : 0}|${l.horse ? 1 : 0}`;
  if (!loadoutKeys.has(k)) { const t = SOLDIER_TYPES.find(x => !x.worker && !x.siege && x.weapon === l.weapon && Boolean(x.shield) === Boolean(l.shield) && Boolean(x.horse) === Boolean(l.horse)); loadoutKeys.set(k, t ? t.key : null); }
  return loadoutKeys.get(k);
}
/** Bir türün üstün olduğu türler ve bu türe üstün olan türler (etiketleriyle). */
export function antiInfo(key) {
  const label = k => { const t = SOLDIER_TYPES.find(x => x.key === k); return t ? t.label : k; };
  const beats = (ANTI.table[key] || []).map(label);
  const beatenBy = Object.entries(ANTI.table).filter(([, v]) => v.includes(key)).map(([k]) => label(k));
  return { beats, beatenBy };
}

/**
 * Birimler: hangi binadan basıldığı `building`, üretim süresi `train` (kaliteli birim geç çıkar). Kısayol yok, düğmeyle basılır.
 * Askerler altın + yiyecek, işçiler yalnızca altın ister; sıraya alınarak basılır (bkz. QUEUE).
 * **Ordu büyüsün diye asker basımı ucuz ve çok hızlıdır**: maliyetler eski değerlerin ~%60'ı, üretim süreleri ilk
 * değerlerin ~**üçte biri** (kılıçlı 6 sn yerine 1 sn).
 * Mancınık (kuşatma) da artık öbür askerlerle aynı fiyat aralığındadır ve her hedefe saldırır. Aynı türden birden fazla
 * bina kurmak üretimi paralelleştirir (bkz. production.js).
 */
export const SOLDIER_TYPES = [
  // Kışla
  { key: 'sword', label: 'Kılıçlı', icon: '⚔', cost: 9, food: 3, train: 1, weapon: 'sword', shield: false, horse: false, building: 'barracks' },
  { key: 'swordshield', label: 'Kılıç Kalkan', icon: '🛡', cost: 15, food: 5, train: 1.5, weapon: 'sword', shield: true, horse: false, building: 'barracks' },
  { key: 'spear', label: 'Mızraklı', icon: '🔱', cost: 12, food: 4, train: 1.2, weapon: 'spear', shield: false, horse: false, building: 'barracks' },
  { key: 'spearshield', label: 'Mızrak Kalkan', icon: '🔰', cost: 18, food: 5, train: 1.7, weapon: 'spear', shield: true, horse: false, building: 'barracks' },
  // Okçuluk
  { key: 'bow', label: 'Okçu', icon: '🏹', cost: 15, food: 4, train: 1.3, weapon: 'bow', shield: false, horse: false, building: 'archery' },
  { key: 'horsebow', label: 'Atlı Okçu', icon: '🐎🏹', cost: 27, food: 7, train: 2.3, weapon: 'bow', shield: false, horse: true, building: 'archery' },
  // Ahır
  { key: 'horsespear', label: 'Mızraklı Atlı', icon: '🐎🔱', cost: 24, food: 7, train: 2.2, weapon: 'spear', shield: false, horse: true, building: 'stable' },
  { key: 'horsesword', label: 'Kılıçlı Atlı', icon: '🐎⚔', cost: 24, food: 7, train: 2.2, weapon: 'sword', shield: false, horse: true, building: 'stable' },
  { key: 'horseswordshield', label: 'Kılıç Kalkan Atlısı', icon: '🐎🛡', cost: 33, food: 9, train: 2.8, weapon: 'sword', shield: true, horse: true, building: 'stable' },
  { key: 'horsespearshield', label: 'Mızrak Kalkan Atlısı', icon: '🐎🔰', cost: 33, food: 9, train: 2.8, weapon: 'spear', shield: true, horse: true, building: 'stable' },
  // Savaş aletleri: yiyecek değil odun ister; fiyatı öbür askerlerle aynı aralıktadır. Her hedefe (birim, bina, kule)
  // saldırır: kuleye tam katlı, canlı hedefe düşük (WEAPONS.catapult.unitMult) hasar verir; gövdesi çok dayanıksızdır.
  { key: 'catapult', label: 'Mancınık', icon: '🪨', cost: 45, food: 0, wood: 30, train: 3.2, weapon: 'catapult', shield: false, horse: false, building: 'siege', siege: true },
  // Sancak (işçiler)
  { key: 'woodcutter', label: 'Oduncu', icon: '🪓', cost: 10, food: 0, train: 1, weapon: 'tool', shield: false, horse: false, worker: 'wood', building: 'banner' },
  { key: 'miner', label: 'Madenci', icon: '⛏', cost: 10, food: 0, train: 1, weapon: 'tool', shield: false, horse: false, worker: 'gold', building: 'banner' },
  { key: 'farmer', label: 'Çiftçi', icon: '🌾', cost: 10, food: 0, train: 1, weapon: 'tool', shield: false, horse: false, worker: 'food', building: 'banner' },
];

/**
 * Toplanma alanları binalara değil birim sınıflarına bağlıdır: hiçbir şey seçili değilken soldaki düğmeyle sınıfın
 * (piyade / okçu / süvari / savaş aleti) toplanma yeri haritada seçilir; o sınıftaki tüm askerler oraya yürür ve yeni
 * çıkanlar oraya gider. "Hepsi" tüm sınıfların toplanma yerini aynı noktaya alır.
 */
export const RALLY = {
  /** Birim sınıfları (HUD sayımı ve üretim binası eşlemesi için; ordu sınıf sınıf değil bütün olarak yönetilir). */
  classes: [
    { key: 'foot', label: 'Piyade', icon: '🛡', buildings: ['barracks'] },
    { key: 'archer', label: 'Okçu', icon: '🏹', buildings: ['archery'] },
    { key: 'cavalry', label: 'Süvari', icon: '🐎', buildings: ['stable'] },
    { key: 'siege', label: 'Mancınık', icon: '🪨', buildings: ['siege'] },
  ],
  /**
   * Tek toplanma bayrağı: **orta tık** imlecin (omuz üstünde artının) gösterdiği yere diker; bütün ordu oraya yürür.
   * Bayrak yalnızca boştaki askerin gideceği yerdir: görüşüne düşman giren asker yürüyüşü bırakıp savaşır (ARMY.holdMult).
   * Orta tık bir **düşmanın üstündeyse** (birim, kahraman, bina, kule; pickRadius kenar payı) bayrak oraya kırmızı dikilir ve
   * bütün ordu o hedefe saldırır: görüşünde dövüşecek bir şey yoksa hedefe yürüyüp onu döver (bkz. ai.js updateAggressive).
   */
  label: 'Toplanma alanı', color: '#ffd12e', attackColor: '#ff6a4a', attackLabel: 'Saldırı hedefi', pickRadius: 1.8,
};

/**
 * Nüfus sınırı (her **oyuncu** için ayrı ayrı işler; bkz. players.js limitsFor):
 *  - `army`: sahadaki bütün asker türlerinin **toplamı** (mancınık dahil, kahraman hariç) en fazla bu kadar olur.
 *    Takım oyununda oyuncu başı sınır min(army, armyTotal / oyuncu sayısı): 1v1'de 200, 3v3'te 100, 5v5'te 60; böylece
 *    haritadaki toplam asker armyTotal'ı aşmaz.
 *    Sınır **sıraya almayı engellemez** (Age of tarzı): doluyken de asker basılır, ücreti düşer ve emir sırada bekler;
 *    sahada yer açılınca (asker ölünce) sıradaki hemen çıkar. Sayım yalnızca **sahadaki** askerlerdir; sırada bekleyenler
 *    HUD'da ⏳ ile ayrı gösterilir (bkz. production.js updateProduction).
 *  - `workers`: bütün işçi türlerinin (madenci / oduncu / çiftçi) **toplamı** en fazla bu kadar olur; tür başına ayrı
 *    sınır yoktur. Takım oyununda oyuncu başı sınır min(workers, workersTotal / oyuncu sayısı): 1v1'de 100, 2v2'de 75,
 *    3v3'te 50, 4v4'te 38, 5v5'te 30. İşçiler birleştiği için sayım kademe (tier) toplamıdır: x3 bir madenci 3 işçi sayılır. Sınır dolunca
 *    üretim durmaz: yeni çıkan işçi **en kalabalık türden bir kademe eksiltir** ve onun yerine kendi türünde gelir
 *    (toplam sabit kalır, dağılım bastığın türe kayar; bkz. economy.js trimWorkers).
 *  - `towers` / `buildings`: ayakta duran kule sayısı ve kule dışındaki bina (kışla, okçuluk, ahır, kuşatma) sayısı
 *    **ayrı ayrı** en fazla bu kadar olur; sancak sayılmaz. İnşası süren yapı da sayılır.
 * Sırada bekleyen emirler de sayılır; sınır dolunca üretim / inşa düğmesi kapanır ve emir alınmaz (işçide düğme
 * kapanmaz, yeni işçi en kalabalık türün yerine geçer).
 * Sınıra takılınca yapı seçilip **yıkılabilir** (bilgi ızgarasındaki "Binayı yık" / "Kuleyi yık" düğmesi).
 */
export const LIMITS = { army: 200, armyTotal: 600, workers: 100, workersTotal: 300, towers: 10, buildings: 10 };

/**
 * Üretim kuyruğu: bina başına en fazla bu kadar emir. Altın sıraya alınırken düşer, iptalde geri gelir.
 * Toplu basımda emirler aynı türü basan **tüm hazır binalara** sırayla dağıtılır: iki kışlan varsa iki asker aynı anda çıkar.
 */
export const QUEUE = { max: 30, /** Üretim düğmesine Shift ile basınca 5, Ctrl ile 10 birim birden sıraya girer. */ batchShift: 5, batchCtrl: 10 };

/**
 * İşçi: savaşmaz, yalnızca kendi kaynağında çalışır; diğer birimlerle çarpışmaz. Sayı sınırı yok ama **işçi sayısı artmaz**:
 * her türden yalnızca ilk işçi sahada kalır. Sonraki işçiler de çıkar, o işçiye yürür ve mergeDist mesafesinde onunla
 * birleşir; birleşen her işçi kademeyi (tier) bir artırır ve işçi her çalışmada kademesi kadar ürün çıkarır.
 */
export const WORKER = { hp: 100, speed: 3.8, fleeRadius: 5, mergeDist: 1.4 };

export const ARMY = {
  /**
   * Bot askerinin bekleme / emir konumunda hedef arama yarıçapı. **Senin askerin** bunu kullanmaz: onun savaşa girme
   * mesafesi **görüşüdür** (e.vision; asker 10, okçu 10, mancınık silah menzili 36): görüşüne giren her düşman birimi,
   * kahramanı, binası ve kulesiyle savaşır, bayrağa gitmeyi bırakır (bkz. ai.js updateAggressive). Hedef görüşünün
   * holdMult katından uzağa kaçarsa bırakılır ve asker bayrağına döner.
   */
  aggro: 16, holdMult: 1.5,
  /** Bekleyen / emirli asker durduğu noktadan bu kadar uzaklaşmaz; bu yarıçapa girince varmış sayılır. */
  leash: 14, arrive: 3.0,
  /**
   * **Yolda dövüş**: bir yere yürüyen asker (emirle ya da toplanma noktasına) `sight` yarıçapında düşman görürse
   * durup saldırır; kendisine vuran olursa `retaliate` saniye boyunca, `retaliateRange` uzaklığa kadar ona karşılık
   * verir (uzaktan vuran okçu / mancınık da sayılır). Dövüşe başladığı noktadan `chase` birimden fazla uzaklaşırsa
   * hedefi bırakıp işine döner: kaçan düşmanın peşinde haritada sürüklenmez.
   */
  sight: 12, retaliate: 5, retaliateRange: 22, chase: 16,
};

/**
 * Kule atışı: ok hedefi takip eder ve mutlaka vurur (kaçış / zıplama / vurulmazlık savuşturamaz); askeri / işçiyi ve
 * (lethalVsHeroes) kahramanı tek atışta öldürür. Menzilde asker varsa önce askere, kahramana en son atar.
 * soldierDamageMult: askerlerin (kahraman dışı birimlerin) kuleye verdiği hasarın çarpanı.
 */
/** Kule menzili: kulenin hem atış hem görüş yarıçapı, ayrıca kuleler arası en az açıklığın yarısı. */
const TOWER_RANGE = 27;
export const TOWER = {
  range: TOWER_RANGE, damage: 14, cooldown: 1.3, arrowSpeed: 20, lethalVsSoldiers: 1.5,
  /**
   * **Menzil tavanı**: mancınık dışındaki her birimin (asker ve kahraman, seviye artışları dahil) vuruş mesafesi
   * en çok kule menzilinin bu katıdır — kule 27 iken tavan 9. Uzaktan dövmek yalnızca mancınığın işidir.
   */
  unitRangeMax: 1 / 3,
  /** Kule oku kahramanı da tek atışta öldürür (zıplayana değil). */
  lethalVsHeroes: true, soldierDamageMult: 0.4,
  /** Mancınık taşı kuleye bu katla vurur: kule kırmanın yolu kuşatmadır (220 x 2.5 = 550). */
  siegeDamageMult: 2.5,
  /**
   * Yerleştirme: yola bu kadar yakın olmalı; iki kule arası en az minGap = **menzilin iki katı** (54). Böylece
   * hiçbir kulenin atış alanı bir başkasınınkiyle **çakışmaz**: her kule kendi bölgesini korur, kule yığmak yoktur.
   * Kural kendi ve rakip kuleleri için birlikte işler (bkz. structures.js placementError). Oyunun her oyuncuya
   * kurduğu **başlangıç kulesi** bu kuraldan muaftır (takım oyununda müttefik üsler birbirine daha yakındır).
   */
  laneDist: 4.5, minGap: TOWER_RANGE * 2,
};

/**
 * Yapılar. Başlangıçta yalnızca sancak ve kışla vardır; diğerleri sancak seçilip
 * yalnızca odunla istenen yere dikilir. `produces` o yapıdan basılan birimler, `builds` sancağın kurabildiği yapılar.
 * Yıkılan yapı çevreye `loot` kadar odun bırakır (yalnızca kahramanlar toplar).
 */
export const BUILDINGS = {
  banner: { label: 'Sancak', from: 'sancaktan', icon: '⚑', hp: 10000, radius: 0.9, vision: 18, loot: 6, produces: ['woodcutter', 'miner', 'farmer'], builds: ['barracks', 'archery', 'stable', 'siege', 'tower'] },
  barracks: { label: 'Kışla', from: 'kışladan', icon: '🏯', cost: 0, wood: 60, loot: 3, hp: 260, radius: 1.7, vision: 11, buildTime: 6, produces: ['sword', 'swordshield', 'spear', 'spearshield'], desc: 'Kılıçlı, kılıç kalkan, mızraklı, mızrak kalkan basar' },
  archery: { label: 'Okçuluk', from: 'okçuluktan', icon: '🎯', cost: 0, wood: 80, loot: 3, hp: 220, radius: 1.6, vision: 11, buildTime: 6, produces: ['bow', 'horsebow'], desc: 'Okçu ve atlı okçu basar' },
  stable: { label: 'Ahır', from: 'ahırdan', icon: '🐴', cost: 0, wood: 100, loot: 3, hp: 280, radius: 1.9, vision: 11, buildTime: 8, produces: ['horsespear', 'horsesword', 'horseswordshield', 'horsespearshield'], desc: 'Dört tür atlı basar' },
  siege: { label: 'Kuşatma', from: 'kuşatma binasından', icon: '⚙', cost: 0, wood: 150, loot: 3, hp: 240, radius: 1.8, vision: 11, buildTime: 8, produces: ['catapult'], desc: 'Mancınık basar: kule menzili dışından her hedefi döver, kuleyi yeğler' },
  tower: { label: 'Kule', from: 'kuleden', icon: '🏰', cost: 0, wood: 1000, loot: 3, hp: 2000, radius: 1.0, /** Kule gördüğü kadar vurur: görüşü menzilinin tıpatıp aynısıdır. */ vision: TOWER.range, buildTime: 5, produces: [], desc: 'Menzile gireni okla vurur (gördüğü kadar vurur); kuleler ayaktayken sancak vurulamaz' },
  /** Tarafsız kamp: oyuncu dikemez, harita kurulurken yerleşir (bkz. CAMPS). Yıkılınca yıkıntısı kalır ve geri sayımla yeniden kurulur. */
  camp: { label: 'Yaratık Kampı', from: 'kamptan', icon: '⛺', cost: 0, wood: 0, loot: 4, hp: 900, radius: 2.2, vision: 12, buildTime: 0, produces: [], desc: 'Tarafsız kamp: çevresinde muhafızlar bekler, akıncı kamplar dakikada bir dalga çıkarır' },
};

/**
 * İnşa: her bina (iki taraf için de) kahramanın heroRadius yarıçapı içine dikilir. Kule dışındaki binalar ayrıca
 * kendi sancağının çemberi (bannerRadius, sancağın çevresindeki halka) içinde olmalıdır. Kuleler çemberle sınırlı
 * değildir ama yalnızca yollara ve birbirinden TOWER.minGap (menzilin iki katı) uzağa dikilebilir: atış alanları çakışmaz.
 */
export const BUILD = { heroRadius: 14, bannerRadius: 30 };

/** Görüş mesafeleri (birim) ve sis ızgarası hücre boyu. */
export const VISION = { hero: 15, soldier: 10, worker: 8, /** Mancınık uzağı görür ki kule menzili dışından hedef alsın. */ siege: 14, cell: 2 };
/** Askerin görüşü silah menzilinin altında kalmaz (bkz. economy.js spawnUnit): mancınık 36 birim görür ve vurur; senin askerin görüşüne giren her şeyle savaşır. */
/** Savaş sisi: keşfedilmiş ama görünmeyen alanın karartması; güncelleme aralığı. */
export const FOG = { exploredAlpha: 0.55, updateEvery: 0.15 };
/**
 * Performans (5v5 için). shadowBox: gölge kamerası arenayı değil kameranın baktığı yerin çevresini kaplar (yarı boy,
 * izometrik / omuz üstü; birim başına daha çok gölge pikseli ve ekran dışı binlerce parça gölge geçişinden düşer);
 * shadowMapSize: gölge haritası; cullMargin: ekran kenarı payı (birim) — bunun dışındaki birim, eşya ve efekt çizilmez;
 * effectsMax: aynı anda en çok parçacık; uiEvery: HUD / komut ızgarası bu sıklıkta (sn) yenilenir (her karede değil).
 */
export const PERF = { shadowMapSize: 2048, shadowBox: { iso: 60, tps: 100 }, cullMargin: 8, effectsMax: 400, uiEvery: 0.12 };

/**
 * Kamera. panSpeed: komutan modu kaydırma hızı (birim/sn).
 * tps: **omuz üstü (üçüncü şahıs) kamera**, V ile geçilir. dist: kahramana uzaklık; height: izlenen noktanın yüksekliği;
 * shoulder: kahramanın ekranda ortadan kayması (sağ omuz üstü); fov: görüş açısı (derece); sens: fare duyarlılığı
 * (radyan / piksel); pitch: başlangıç eğimi; pitchMin / pitchMax: yukarı-aşağı bakış sınırı (radyan); minY: kameranın
 * inebileceği en düşük yükseklik; follow: kameranın kahramanı izleme sertliği; aimFar: artı zemine değmezse nişanın
 * ileriye alındığı uzaklık; viewDist: omuz üstünde görüş mesafesi (birim); fogNear: sahne pusunun başladığı uzaklık.
 */
export const CAMERA = {
  panSpeed: 46,
  tps: { dist: 9, height: 2.4, shoulder: 0.9, fov: 62, sens: 0.0022, pitch: 0.42, pitchMin: -0.3, pitchMax: 1.15, minY: 0.9, follow: 18, aimFar: 40,
    /** Omuz üstünde savaş sisi düzlemi yok: düşman birim / yapı kahramana bu uzaklıktan yakınsa görünür, sahne pusu bu uzaklıkta tam kapanır. */
    viewDist: 90, fogNear: 30 },
  /** Ölüm kamerası: kahramanın ölümünden sonra katile odaklanılan süre (sn). */
  killcam: 3.5,
};

/**
 * Komut kısayolu yok: üretim, inşa, emirler, kahraman geliştirme ve mod geçişi yalnızca alt banttaki düğmelerle yapılır
 * (mod geçişi sancak seçiliyken, kahraman sancağa yakınken). Klavyede yalnızca WASD / ok tuşları, Shift, Boşluk ve Esc vardır.
 */
export const KEYS = {};

/**
 * Kahraman geliştirme (sancak seçiliyken, kahraman sancağa yakınken): altınla seviye atlar ya da bir asker türüne dönüşür.
 * Tür değişince seviye 1'e döner. Oyun sabit bir kahramanla (startLoadout) başlar; başlangıçta yalnızca zorluk seçilir.
 * Can **altınla doldurulmaz**: kahraman yalnızca **kendi sancağının alanında** (BUILD.bannerRadius) durdukça
 * yavaşça iyileşir (regenPerSecond can/sn). Başka hiçbir yol canı doldurmaz; yiyecek yalnızca envantere girer,
 * seviye atlamak da can doldurmaz. Yeniden doğunca can tabii ki dolu başlar.
 */
/** Sancaktaki kahraman menüsü: tür değişimi ve can doldurma altınla; **seviye altınla alınmaz** (exp ile gelir). */
export const HERO_UPGRADE = {
  /** Sancak alanında saniyede kazanılan can ve tepede çıkan can baloncuklarının aralığı (saniye). */
  range: 12, regenPerSecond: 9, bubbleEvery: 0.28, startLoadout: { weapon: 'sword', shield: false, horse: false },
  /**
   * Tür değiştirme bedeli **tür tür sabittir** (formül yok): yaya türler ucuz, kalkan belirgin pahalı, **atlılar çok
   * pahalı** — kahramanı ata bindirmek oyunun geç aşamasıdır ve uzun bir ekonomi kurmayı gerektirir. Kılıçlı
   * başlangıç türüdür, en ucuzu odur (ona geri dönmek kolay olsun diye).
   * Tablodaki sayılar **tek başına oyunun** (işçi sınırı LIMITS.workers) bedelidir; kalabalık oyunda işçi sınırıyla
   * birlikte düşer (bkz. heroConvertCost): kasan küçüldüğü kadar hedef de yaklaşır.
   * **Tavan 30.000 altındır** (kalkanlı atlılar); oranlar korunarak buna göre ölçeklenmiştir.
   */
  convertCost: {
    sword: 500, spear: 1000, bow: 2000, swordshield: 2000, spearshield: 4000,
    horsesword: 20000, horsespear: 20000, horsebow: 20000,
    horseswordshield: 30000, horsespearshield: 30000,
  },
};
/**
 * Kahramanın o türe dönüşme bedeli (altın); tabloda olmayan tür (mancınık / işçi) menüde çıkmaz.
 * Bedel **işçi sınırıyla oranlanır** (limits.workers / LIMITS.workers): oyuncu sayısı arttıkça herkesin işçi sınırı
 * düşer, kazanç da düşer; bedel aynı oranda ucuzlar ki atlı olmak her kadroda aynı uzaklıkta kalsın.
 * 1v1'de tam bedel, 5v5'te işçi sınırı 100 yerine 30 olduğu için bedelin %30'u (atlı 30.000 → 9.000).
 */
export const heroConvertCost = (t, limits = null) => {
  const base = HERO_UPGRADE.convertCost[t.key] ?? HERO_UPGRADE.convertCost.sword;
  const scale = limits && limits.workers ? limits.workers / LIMITS.workers : 1;
  return Math.round((base * scale) / 50) * 50;
};

export const ENEMY = {
  aggro: 16,
  /** Oyuncunun öldürdüğü düşman başına altın. */
  bounty: 2,
};

/**
 * Rakip kahraman: kaynak toplar, keşfe çıkar, bina yerine gider ve görüşüne giren düşman askerine saldırır
 * (alan vuruşu, asker hasarı); canı fightHpRatio'nun altına inince dövüşü bırakıp kaçar. Kendi öldürdüklerinden exp
 * kazanır; geride kalırsa her karar turunda bir seviye alarak oyuncunun seviyesine çekilir (bedeli yok).
 */
export const ENEMY_HERO = {
  /** `respawn`: rakip kahramanın ilk ölümündeki bekleme; sonraki ölümlerde RESPAWN.step kadar uzar. */
  hp: 200, speedMult: 1.15, respawn: 8, fightHpRatio: 0.35,
  /** Kaç saniyede bir harcama yapmayı dener; bir binada aynı anda en fazla kaç emir bekletir. */
  spawnCheck: 3, queueDepth: 2,
  /** Düşman bu mesafeye girince toplamayı bırakıp uzaklaşır. */
  fleeRadius: 5,
};

/**
 * Rakip yapay zekâsı: oyuncuyu bire bir taklit eder. Her karar turunda oyuncunun işçi (türe göre), asker
 * (canlı + sırada), bina (türe göre sayı) ve kule sayılarını okur; aynı sayıları hedefler ve asla aşmaz
 * (extra payı 0). Binalarını kendi kahramanının yanına diker: kahraman uzaktaysa oraya yollanır. Askerlerini
 * toplanma noktasında biriktirir; ordusu oyuncununkine ulaşınca topluca saldırır, eriyince geri çekilip yeniden birikir.
 */
export const ENEMY_AI = {
  /** Oyuncunun sayılarına eklenen pay (zorluğa göre). 0 = tam eşleme. */
  extra: { easy: { workers: 0, army: 0, towers: 0 }, normal: { workers: 0, army: 0, towers: 0 }, hard: { workers: 0, army: 0, towers: 0 } },
  minWorkersPerKind: 1,
  /**
   * Ordu hedefi: oyuncunun asker sayısının armyMult katı (canlı + sırada). Saldırıya kalkmak için en az minWave asker ve
   * oyuncununkine denk sayı gerekir. Saldırıdayken ordu oyuncununkinin altına inince, kalkış sayısının retreatRatio'suna
   * düşünce ya da ordu merkezinin crowdRadius çevresindeki mavi savaşçılar kendi sayısının crowdRatio katını aşınca
   * kulelerinin dibine çekilir (toplanma noktası: sancağa en yakın kule; kule yoksa sancak önü).
   */
  armyMult: 2, minWave: 4, retreatRatio: 0.35, crowdRadius: 18, crowdRatio: 1.2,
  /** Oyuncunun asker türlerini bu olasılıkla kopyalar; kalanında sırayla basar. */
  copyChance: 0.75,
  /** Önce bu olasılıkla oyuncunun **en kalabalık türünün antisini** basar (zorluğa göre); tutmazsa kopyala / sırayla. */
  counterChance: { easy: 0.2, normal: 0.5, hard: 0.8 },
  /** Toplanma noktası kule yoksa: sancaktan merkeze doğru uzaklık. Kule varsa en ileri kulenin oyuncuya doğru towerOffset önü. */
  rallyDist: 12, towerOffset: 3,
  /** Saldırıda olmayan asker toplanma noktasından bu kadar uzaksa geri çağrılır (kule zinciri ilerleyince öne toplanırlar). */
  regroupDist: 8,
  /**
   * **Kule savunması**: rakibin kulesi ya da sancağı vurulunca (vuruş `memory` saniye hatırlanır) o yapının
   * `recall` yarıçapındaki askerleri **ve rakip kahraman** oraya koşar. Savunma emri saldırı düzenini de keser:
   * yürüyen ordu geri döner. `hold`: yapıya bu kadar yaklaşan asker yerinde savunmaya geçer (kahraman için
   * `heroHold`); `check`: savunma kararı bu sıklıkta (sn) yenilenir.
   */
  defend: { memory: 10, recall: 70, hold: 6, heroHold: 7, check: 1 },
  /**
   * **Haydut avı**: rakip kahraman boşta kaldıkça `radius` yarıçapındaki en yakın haydudu / kamp muhafızını avlar;
   * yakında haydut kalmayınca `campRadius` içindeki haydut kampını yıkmaya gider. `first`: ilk avın zamanı,
   * `every`: avlar arası bekleme, `ttl`: bir avın en uzun süresi (sn; kampı yıkmak uzun sürdüğü için kampta
   * `campTtl`). Canı ENEMY_HERO.fightHpRatio'nun altına inince av biter, kahraman üssüne döner.
   */
  hunt: { radius: 60, campRadius: 120, first: 30, every: 35, ttl: 30, campTtl: 60 },
  /** Rakip kahramanın keşfi: ilk keşif, keşifler arası süre, bir keşfin en uzun süresi (sn). Rakip yalnızca gördüğü yapılara saldırır. */
  scoutFirst: 20, scoutEvery: 40, scoutTime: 30,
  /** Ek bina yerleri (sırayla, boş olan ilki). Ek kuleler yol üstüne kurulur (bkz. creep), sabit yer listesi yok. */
  buildSpots: [{ back: 4, side: 19 }, { back: 17, side: -11 }, { back: 22, side: 4 }, { back: 4, side: -19 }, { back: 24, side: -8 }, { back: 26, side: 12 }],
  /**
   * Kule zinciri: taklit hedefleri tamamsa rakip, en ileri kulesinden mavi sancağa doğru step adımla (kuleler arası en az
   * açıklıktan biraz büyük: atış alanları çakışamaz) yeni kule dikerek
   * ilerler (parite üstü, en çok maxTowers kule); mavi sancağın çemberine (stopDist = BUILD.bannerRadius) girmez:
   * rakip sancak çemberine kule dikmek iki taraf için de yasaktır (bkz. placementError). Mavi kule menzilinin (+ avoidTower)
   * içine kule dikmez (kahraman inşaya giderken ölmesin). Odun biriktirmek için oduncu hedefine extraWoodcutters ekler.
   */
  creep: { step: TOWER.minGap + 4, stopDist: 30, maxTowers: 10, avoidTower: 4, extraWoodcutters: 3 },
  /**
   * Kule kuralı: sende ayakta kule varken rakip, canlı bir mancınığı yoksa saldırıya kalkmaz, saldırıdaysa çekilir
   * (savaş aletleri kurup mancınık için kaynak biriktirir). Askerleri kulelere hiç vurmaz ve kule menzilinin
   * towerMargin kadar dışında kalır; mancınık varsa ordu onun yanında (escortDist) ilerler ve onu korur.
   */
  towerMargin: 2.5, escortDist: 4,
};

export const ECONOMY = {
  /** Başlangıç envanteri (her iki taraf). Kaynaklar envanterde birikir: altın + yiyecek asker, altın işçi, odun bina. */
  start: { gold: 50, wood: 60, food: 40 },
  /**
   * **Deneme ayarı**: yalnızca **insan oyuncuların** başlangıç altını (botlar her zaman start.gold ile başlar). Kahraman
   * türlerini, binaları ve orduyu beklemeden denemek içindir; null iken herkes start.gold ile başlar (normal oyun).
   */
  playerTestGold: null,
  /** Kaynak noktaları tükenmez: çalışan işçi çevreye bir ürün fırlatır, sonra onu alır. Bir altın ürünü bu kadar altın. */
  gold: { value: 7 },
  /** Yiyecek yalnızca envantere girer; kahramanı iyileştirmez (can yalnızca sancak alanında yenilenir). */
  /** Ölen asker çevreye bu kadar yiyecek bırakır; ganimet saçılma yarıçapı. Ganimeti yalnızca kahramanlar toplar. */
  /**
   * Yerdeki eşyanın ömrü (sn): toplanmayan ganimet (yiyecek / odun) ttl, exp küresi xpTtl, işçinin çıkardığı ürün ownedTtl
   * sonra kaybolur; sahneden kalkar, geometri ve malzemesi serbest bırakılır (bkz. economy.js removeItem).
   */
  loot: { soldierFood: 2, scatter: 2.2, ttl: 5, xpTtl: 5, ownedTtl: 5 },
  /** Çalışma süreleri (saniye) ve ürünün fırlatıldığı mesafe. */
  work: { time: 1.0, heroTime: 1.0, throwMin: 1.0, throwMax: 1.6, spotRadius: 0.9, /** Kahramanın aynı düğüme vuruşları arasındaki en az süre. */ hitCooldown: 0.5 },
  /** İşçilerin ve seviye 1 kahramanın ürün alma yarıçapı (birim); kahramanda seviyeyle büyür (bkz. LEVEL.pickPerLevel). */
  pickRadius: 2.5,
  /** Oyuncu ölünce kaybedilen altın oranı. */
  deathGoldLoss: 0.2,
};

export const POSITIONS = {
  playerBanner: { x: -88, z: 52 },
  enemyBanner: { x: 88, z: -52 },
  /** Üs yerleşimi sancağa göre: back = merkezden uzağa, side = ona dik. */
  base: {
    farm: { back: 9, side: 7 }, mine: { back: 9, side: -7 }, woods: { back: 12, side: 0, radius: 4.5, trees: 8 },
    /** Başlangıç kışlası ve rakibin sonradan kuracağı binaların yerleri. */
    barracks: { back: 0, side: 13 }, archery: { back: 0, side: -13 }, stable: { back: 17, side: 11 }, siege: { back: 21, side: 0 },
  },
  /**
   * Başlangıç kulesi: her oyuncuda **tek** kule, sancağın `dist` birim önünde, haritanın ortasına giden yolun üstünde
   * (sancak çemberinin içinde; 27 menzilli kule sancağı ve üssün önünü örter). Yıkılınca sancak kalkansız kalır.
   */
  towers: { dist: 14 },
  /**
   * Haritanın ortasındaki tarafsız madenler: bitişik bir küme. Küme merkezi, ana yolun dışında kalsın diye
   * harita merkezinden yola dik yönde offset kadar kaydırılır; üç maden spread yarıçaplı üçgende yan yana durur.
   */
  centerMines: { offset: 8, spread: 1.9 },
};

/**
 * Kahramanın yeniden doğuşu: **her ölümde süre uzar**. İlk ölüşte taban süre (oyuncu `base`, rakip kahraman
 * `ENEMY_HERO.respawn`), sonraki her ölümde üstüne `step` saniye eklenir, en çok `max`. Ölüm sayısı her iki
 * kahramanda ayrı sayılır (`e.deaths`) ve yeni oyunda sıfırlanır.
 */
export const RESPAWN = { base: 5, step: 4, max: 30 };
/** Kaçıncı ölümse (1 = ilk ölüm) o ölümün bekleme süresi. */
export const respawnDelay = (deaths, base = RESPAWN.base) => Math.min(RESPAWN.max, base + RESPAWN.step * Math.max(0, (deaths || 1) - 1));

/**
 * Tarafsız yaratıklar: iki tarafa da düşmandırlar (faction 'beast'), yollardan ve üslerden uzakta,
 * inlerin (den) çevresinde yaşarlar. İnlerinden leash kadar uzaklaşmaz, aggro yarıçapına gireni döverler.
 * Ölünce bol exp bırakırlar (LEVEL.xp.beast): kahramanın asker basmadan da gelişme yolu budur.
 * Her in respawn saniyede bir eksik yaratığını tamamlar; sayıları perDen'i geçmez.
 */
/**
 * Tarafsız kamplar (faction 'beast'): haritada yollardan ve iki üsten uzak `count` kamp kurulur. Her kampın
 * çevresinde **her türden** muhafız asker bekler; muhafızlar kamptan uzaklaşmaz, yalnızca yaklaşanı döverler.
 * Kampların `raidersPerSide` kadarı **maviye**, o kadarı da **kırmızıya** akıncıdır: kampın üstündeki geri sayım
 * (waveTime) dolunca bir dalga çıkarır — her türden asker + bir **mancınık** — ve o tarafın **kulelerine** saldırır.
 * Kamp yıkılınca yerinde yıkıntısı kalır ve `respawn` saniye sonra yeniden kurulur; kurulunca geri sayım baştan
 * başlar. Yani kampı yıkmak o taraftan `respawn` saniyelik rahatlık kazandırır.
 */
export const CAMPS = {
  /** İki kamp: **boş köşelerde** (senin ve botun üssünün olmadığı iki köşe) kurulur, biri sana biri bota akın eder. */
  count: 2, waveTime: 60, respawn: 300, hp: 900,
  /** Kampın çevresinde bekleyen muhafızlar (her türden); dakikada **bir** asker doğar (guardEvery). */
  guards: ['sword', 'spear', 'bow', 'swordshield', 'horsesword'], guardEvery: 60,
  /** Akın dalgası: bu askerler + bir mancınık. Kamp kurulduktan/yeniden kurulduktan 1 dk (waveTime) sonra başlar. */
  wave: ['sword', 'spear', 'bow', 'horsesword'],
  /** Köşe arayışı: köşeden bu kadar içeride, yoldan minLaneDist uzakta uygun bir yer aranır. */
  cornerSearch: 34, minLaneDist: 20, edge: 16,
  /** Muhafız kampını bu yarıçapta korur; bu mesafeye gireni kovalar, leash dışına çıkmaz. */
  aggro: 12, leash: 18,
};

/**
 * Haydutlar: araziye serpiştirilmiş, **yerinden kıpırdamayan** tarafsız askerler. Yollardan ve üslerden uzakta
 * dururlar, yalnızca `aggro` yarıçapına **yaklaşana** saldırırlar ve `leash` dışına çıkmazlar (kamp akınlarına
 * katılmazlar). Sayıları `max`'a ulaşana dek `spawnEvery` saniyede bir yenisi belirir.
 */
export const BANDITS = {
  initial: 8, max: 16, spawnEvery: 45,
  types: ['sword', 'spear', 'bow', 'swordshield', 'spearshield', 'horsesword'],
  minLaneDist: 22, minBannerDist: 45, minGap: 9, edge: 14,
  aggro: 9, leash: 11,
};

/**
 * Saldırı uyarısı: kendi **sancağın** ya da **kulen** vurulduğunda ekranın kenarları hafifçe kızarır, vurulan
 * yerde kırmızı bir halka belirip söner ve minimapte aynı noktada genişleyen kırmızı halkalar çıkar.
 * Aynı yapı için uyarı `cooldown` saniyede bir tazelenir; minimap halkası `mapLife` saniye yaşar.
 */
export const ALERT = { cooldown: 1.5, flash: 1.1, mapLife: 1.6, worldRing: 6 };

export const PLAYER_RESPAWN = RESPAWN.base;

export const COLORS = {
  blue: '#447dab', bluePlayer: '#3f8fd0', blueShield: '#356887', blueBanner: '#3f8fd0',
  red: '#ad5542', redBow: '#897048', redShield: '#934b38', redBanner: '#c9503e',
  /** Tarafsız yaratık: yosun yeşili gövde, koyu kafa. */
  beast: '#5f7a43', beastHead: '#33411f',
};

/** Kahramanın takipli okları: saniyede en fazla bu kadar radyan döner. */
export const HOMING_TURN = 5.5;

/** Otomatik vuruş: menzildeki en yakın düşmana kendiliğinden saldırır. */

/** Zorluk: rakip kahramanın topladığı kaynakların çarpanı. */
export const DIFFICULTY = {
  easy: { label: "Kolay", resourceMult: 0.5 },
  normal: { label: "Normal", resourceMult: 1 },
  hard: { label: "Zor", resourceMult: 2 },
};

/**
 * Kahraman seviyesi (öldürme ya da sancakta altın): yalnızca can ve vuruş alanı artar (hasar ve hız sabit).
 * Kılıç / mızrakta menzil seviye başına reachPerLevel, yay arcPerLevel büyür (en çok maxReachMult kat);
 * yaylı kahraman **seviyesi kadar** ok atar (sv 1: 1 ok, sv 12: 12 ok).
 */
export const LEVEL = {
  /** Seviye başına: +10 can ve **+%8 vuruş gücü** (yakın vuruş da ok da); hız değişmez. */
  hpPerLevel: 10, damagePerLevel: 0.08, speedPerLevel: 0,
  /**
   * Seviye **altınla alınmaz**: ölen her birim yere bir **exp küresi** bırakır; küreyi toplayan kahraman (kim öldürmüş
   * olursa olsun) tecrübe kazanır ve yeter sayıya ulaşınca kendiliğinden seviye atlar. Bir seviyenin bedeli xpBase + xpGrowth x (seviye - 1) exp'tir (sv 1→2: 30,
   * 2→3: 45, 3→4: 60 …), yani üst seviyeler gitgide daha çok öldürme ister. Artan exp bir sonraki seviyeye sayılır.
   */
  xpBase: 30, xpGrowth: 15,
  /**
   * Ölen birimin ve yıkılan yapının yere bıraktığı exp; küreyi toplayan kahraman kazanır.
   * **Kahraman ve kule en değerli hedeflerdir**: onları düşürmek seviye atlatır. Kendi yapını yıkmak exp vermez.
   */
  xp: { soldier: 10, cavalry: 24, worker: 4, siege: 14, hero: 120, tower: 90, building: 30, beast: 35, camp: 150 },
  /** Kahraman ne kadar yüksek seviyedeyse ölünce o kadar çok exp bırakır: hero + bu değer x (seviye - 1). */
  xpHeroPerLevel: 25,
  /** Büyük exp ödülleri tek kürede yığılmasın diye bu boyutta kürelere bölünür. */
  xpOrbMax: 30,
  /** Seviye sınırsız: altın yettikçe atlanır; rakip kahraman da oyuncunun seviyesine çıkar. */
  maxLevel: Infinity,
  /** Vuruş alanı seviyeyle büyür (kılıç / mızrak menzili, yay açısı), en çok maxReachMult kat. */
  reachPerLevel: 0.12, arcPerLevel: 0.1, maxReachMult: 3.0,
  /**
   * Yay: kahraman **seviyesi kadar** ok atar (sv 1: 1, sv 8: 8 ok); kademeli / modüler artış yok. Oklar dağılmaz,
   * hepsi aynı hedefe gider; yalnızca çıkış noktaları yan yana kaydırılır. arrowsMax çizim yükünü sınırlar.
   * Yay menzili ise her bowRangeEvery seviyede bowRangeStep kadar artar.
   */
  arrowsMax: 40, bowRangeEvery: 10, bowRangeStep: 0.2,
  /** Kahramanın yapılara vuruşu seviye başına bu kadar artar (sınırsız). */
  structureDamagePerLevel: 0.1,
  /** Kahramanın kaynak toplama yarıçapı seviye başına bu kadar büyür (en çok maxPickRadius). */
  pickPerLevel: 0.2, maxPickRadius: 14,
  /** Sağ tık hortumunun yarıçapı her dashEvery seviyede dashPerStep kadar büyür (sv 10: +%10, sv 20: +%20…). */
  dashEvery: 10, dashPerStep: 0.1,
};

/**
 * Karne ve skor (bkz. stats.js). Ortak birim **değer** = birimin / yapının altın + odun + yiyecek bedeli.
 *  - Askerî: yok edilen birim değeri + yıkılan yapı değeri − kaybedilen değer x lossPenalty.
 *  - Ekonomi: toplanan kaynak ile basılan birim değerinin küçüğü (+ toplananın küçük bir payı): toplayıp harcamayana tam puan yok.
 *  - İnşa: kurulan yapı değeri − kaybedilen yapı değeri x lossPenalty.
 *  - Kahraman: seviye x levelPoints + kahraman öldürmesi x heroKillPoints − ölüm x deathPenalty.
 * Alanlar ağırlıklarıyla toplanır. Zaman çizelgesi sampleEvery saniyede bir örnek alır (bitiş ekranındaki grafik).
 */
export const SCORE = {
  heroValue: 120, bannerValue: 400,
  weights: { military: 1, economy: 0.5, build: 0.6, lossPenalty: 0.5, gatherBonus: 0.1, levelPoints: 25, heroKillPoints: 30, deathPenalty: 15 },
  sampleEvery: 10,
};
