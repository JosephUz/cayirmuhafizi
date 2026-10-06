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
/**
 * Havada ikinci zıplama: yere değmeden bir kez daha zıplanır ve kahraman **daha yükseğe** çıkar (yeni hız,
 * kalan yükselmenin üstüne biner). count kaç ek zıplama, speedMult ikinci zıplamanın gücü.
 */
export const JUMP_AIR = { count: 1, speedMult: 1 };
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
 * Sınıra takılınca yapı seçilip **yıkılabilir** (komut ızgarasının sağ alt yuvasındaki "Yık" düğmesi).
 */
export const LIMITS = { army: 200, armyTotal: 600, workers: 100, workersTotal: 300, towers: 10, buildings: 10 };
/**
 * Telefonda (dokunmatik, tek başına oyun) nüfus yarıdır: tarayıcı belleği sahadaki birim sayısıyla büyür (birim başı
 * ~40 sahne nesnesi; 5v5'te 330 birimde ~460 MB) ve az RAM'li telefonda uzun maçta sekme kapanıyordu. Çevrim içi
 * oyunda sınırı sunucu koyar, orada değişmez.
 */
export const LIMITS_LIGHT = { army: 100, armyTotal: 300, workers: 50, workersTotal: 150 };

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
  sight: 12, retaliate: 5,
  /**
   * retaliateRange: kendisine (ya da alarmla arkadaşına / kulesine) vurana bu uzaklığa kadar gidilir. Mancınık
   * menzilinin (36) üstündedir: uzaktan dövülen asker yerinde beklemez, saldırana yürür.
   */
  retaliateRange: 40, chase: 16,
  /**
   * Alarm (bkz. alarm.js): asker vurulunca radius içindeki, kule vurulunca kule menzilindeki aynı takım askerleri
   * saldırana döner. every: bir kurbanın / kulenin alarm yayma aralığı (sn). keep: taze alarmı olan asker bu süre
   * hedef değiştirmez.
   */
  alarm: { radius: 14, every: 0.4, keep: 1.5 },
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
export const PERF = { shadowMapSize: 2048, shadowBox: { iso: 60, tps: 100 }, cullMargin: 8, effectsMax: 400, uiEvery: 0.12,
  /**
   * **Uzak birim sadeleştirmesi**: kahramandan bu uzaklıktan öteki birimlerde kol, bacak, silah, kalkan ve at
   * bacakları gizlenir; uzuv animasyonu da koşmaz. Gövde, kafa ve can çubuğu durur, yani birim yine görünür ve
   * seçilebilir. Omuz üstü kamerada 90 birime kadar saha görülüyor; asıl kazanç oradadır (birim başına ~15 mesh
   * yerine ~4). İzometrikte ekranın köşesi ~35 birim olduğu için görünürde neredeyse hiçbir şey değişmez.
   */
  lodDist: 42 };
/**
 * Grafik kalitesi (Esc menüsünden seçilir, localStorage'da saklanır). Geç safhada sahada yüzlerce asker olur ve
 * **gölge geçişi** çizim maliyetini ikiye katlar: her asker ~15 kutudan oluşur, hepsi ayrı çizim çağrısıdır.
 * - map: gölge haritası çözünürlüğü. every: gölge haritası kaç karede bir yenilenir (2 = yarı maliyet).
 * - units: askerler gölge düşürsün mü (kapalıyken yapılar ve ağaçlar düşürmeye devam eder).
 * Varsayılan **orta**: gölgeler duruyor ama asker gölgesi yok ve harita iki karede bir yenileniyor.
 */
export const QUALITY = {
  order: ['low', 'medium', 'high'],
  labels: { low: 'Düşük', medium: 'Orta', high: 'Yüksek' },
  low: { shadows: false, map: 1024, every: 3, units: false },
  medium: { shadows: true, map: 1024, every: 2, units: false },
  high: { shadows: true, map: 2048, every: 1, units: true },
  default: 'medium',
};

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
  /**
   * Ölüm kamerası: kahramanın ölümünden sonra katile odaklanılan süre (sn). Ardından kamera kendi sancağına geçer ve
   * yeniden doğuş geri sayımı orada akar; sancakta en az killcamBanner sn kalsın diye ölüm kamerası gerekirse kısalır
   * (en az killcamMin): ilk ölümde (5 sn) 2 sn katil + 3 sn sancak. Toplam bekleme değişmez.
   */
  killcam: 3.5, killcamMin: 1.5, killcamBanner: 3,
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

/**
 * **Otopilot** (yalnız web, `?otopilot=1`; bkz. src/otopilot.js): içerik videoları için **gerçek bir maç**, ama
 * oyuncunun kahramanını bir bot oynar. Gösteriden (`?gosteri=1`) farkı: burada bir insan koltuğu vardır — maç
 * normal kurallarla kurulur, kasası ve ordusu bot kararlarıyla sürülür (bkz. economy.js updateBots) ve kahramana
 * her karede **girdi** üretilir (hareket, nişan, sol tık, şarj, atılma, zıplama; bkz. hero.js applyHeroInput), yani
 * kahraman oyunun kendi kabiliyetlerini oyuncunun kullandığı yoldan kullanır. Kamera da normal oyun kamerasıdır:
 * kahramanı izler. Menü, lobi, yardım ve sonuç ekranı açılmaz; maç bitince yenisi başlar. Ölçüm olayı gitmez,
 * sunucuya bağlanılmaz, uygulamada (isApp) hiç açılmaz. Normal oyun bu ayarlardan etkilenmez.
 */
export const OTOPILOT = {
  /** Maç başına takım büyüklüğü bu listeden sırayla seçilir: art arda çekilen maçlar aynı haritada geçmez. */
  takimlar: [2, 3, 2],
  difficulty: 'normal',
  /** Kahraman türü maç maç değişir (bkz. HERO_UPGRADE.convertCost anahtarları): her maç başka bir oynanış. */
  loadoutlar: [
    { weapon: 'sword', shield: false, horse: false },
    { weapon: 'bow', shield: false, horse: true },
    { weapon: 'spear', shield: true, horse: false },
    { weapon: 'sword', shield: true, horse: true },
  ],
  /** Maç biterse bu kadar saniye sonra yenisi başlar (sonuç ekranı hiç açılmaz). */
  yenidenBasla: 1.5,
  /**
   * **Çatışma başlangıcı**: maç sıfırdan değil, ekonomisi kurulmuş bir noktadan açılır — her oyuncuya dolu kasa ve
   * hazır bir bölük verilir, bölükler iki üssün arasındaki hatta dizilir. Kurallar değişmez (bütün oyuncular aynı
   * şeyi alır, üretim ve savaş normal işler); yalnız videonun ilk saniyesinden itibaren sahada gerçek bir muharebe
   * olur, kahraman üssünde ekonomi kurarken beklenmez.
   */
  kasa: { gold: 4000, wood: 3000, food: 2500 },
  /** Başta her oyuncuya verilen bölük (sırayla basılır, hatta dizilir). */
  birlikler: ['sword', 'spearshield', 'bow', 'horsesword', 'swordshield', 'spear'],
  /** Bölük sancakla en yakın rakip sancak arasında bu oranda (0.5 = tam orta) ve bu yarıçapa dağıtılır. */
  hat: 0.42, hatYayilma: 8,
  /** Maç başında herkese kurulu gelen üretim binaları (kışla setupGame'de zaten kuruluyor; bkz. POSITIONS.base). */
  binalar: ['archery', 'stable'],
  /**
   * Başlangıç kahraman seviyesi (**bütün** kahramanlara, otopilota da rakiplerine de eşit verilir). Maç ekonomisi
   * kurulmuş bir noktadan açıldığı için kahramanlar da o safhanın seviyesindedir: seviye 1 kahraman kalabalık bir
   * muharebede birkaç saniyede düşer ve video kahramanın üsse yürüyüşünden ibaret kalırdı. Seviye oyunun kendi
   * artışlarını verir (bkz. LEVEL): can, vuruş gücü, vuruş alanı ve yayda ok sayısı.
   */
  seviye: 12,
  /** Kahramanın düşman aradığı yarıçap (birim); bulduğu hedefi bu yarıçapın `birak` katına kadar kovalar. */
  gorus: 26, birak: 1.7,
  /**
   * Can oranı `kac`ın altına düşünce kahraman kendi sancağına çekilir (orada iyileşir, bkz. HERO_UPGRADE), `don`a
   * çıkınca savaşa döner. `don` yüksek tutulursa kahraman videonun yarısını sancağının dibinde geçirir: yarıdan
   * biraz fazla cana gelince cepheye dönmesi hem oyuncu davranışına hem de klibe daha uygun.
   */
  kac: 0.33, don: 0.6,
  /** Bu uzaklıktan öteye koşarak (Shift) gider. */
  kos: 7,
  /** Yakın dövüşte menzilin bu katına sokulur; yaylı kahraman `yayYakin` biriminden yaklaşanı geri çekilerek döver. */
  yanas: 0.82, yayYakin: 7,
  /** Sağ tık atılma: hedef bu aralıktaysa atılıp mesafeyi kapatır (oyunun kendi atılma mesafesi seviyeyle büyür). */
  atilma: { enAz: 5, enCok: 16 },
  /** Dövüşte zıplama aralığı (sn, aralıktan rastgele): kahraman yerde sabit durmaz. */
  ziplama: [3.5, 7.5],
  /**
   * Şarjlı vuruş (sol tık basılı): çevrede `kalabalik` düşman varken `olasilik` ile denenir, `bekle` sn arayla.
   * Şarj hedefe **yaklaşırken** de başlatılır (menzilin `baslaKat` katı): oyuncu da tıkı basılı tutarak girer.
   */
  sarj: { kalabalik: 1, yaricap: 8, olasilik: 0.7, bekle: 2, baslaKat: 1.8 },
  /** Ganimet: dövüş yokken bu yarıçaptaki yerdeki eşyayı toplamaya gider. */
  ganimet: 11,
  /**
   * Görüşünde düşman yokken avlanacak hedefin arandığı yarıçap: haydutlar ve yakındaki rakip birimler. Kahramanı
   * meşgul eder ve seviye kazandırır; `gorus`ten geniştir ama haritayı boydan boya geçirtmez.
   */
  av: 55,
  /** "Dövüşüyor" sayılan uzaklık (birim): kahraman çatışmanın içindeki düşmanı yeğler, boş çayırda dolaşmaz. */
  temas: 11,
  /**
   * İzometrik kadraj yarı boyu (normal oyunda 17): otopilot biraz daha yakından bakar ki kahraman ve çevresindeki
   * dövüş kadrajı doldursun.
   */
  kadraj: 15,
  /**
   * Cepheye yalnızca ordusu bu sayıya ulaşınca gider. Daha azken kendi üssünde **kaynak çıkarır** (bkz. economy.js
   * updateEconomy: insan kahramanı çalışma yerinde hareketsiz durunca ürün çıkarır) — tek başına rakip üssüne
   * koşup ölmesin, oyuncunun yaptığı gibi önce ekonomisini kursun.
   */
  orduAsgari: 3,
  /**
   * Cephe noktası: ordunun ağırlık merkezinden rakip sancağa doğru bu oranda ileride. Küçük tutulur — kahraman
   * ordusunun önüne geçip tek başına kalmasın, onunla birlikte ilerlesin.
   */
  cepheIleri: 0.1,
  /** Hedef / karar tazeleme aralığı (sn): her karede bütün sahayı taramamak için. */
  tazele: 0.25,
  /** Takılma: `sure` saniyede `mesafe` biriminden az ilerlediyse `kurtul` saniye yana kaçılır. */
  takilma: { sure: 1.2, mesafe: 1.1, kurtul: 0.9 },
};

/**
 * **Gösteri kipi** (yalnız web, `?gosteri=1`; bkz. src/gosteri.js): içerik klipleri için bot-bot maç. Menü atlanır, iki
 * tarafı da bot yapay zekâsı yönetir, arayüz gizlenir, ölçüm olayı gitmez ve sunucuya bağlanılmaz. Uygulamada (isApp)
 * açılmaz. Normal oyun bu ayarlardan etkilenmez.
 */
export const GOSTERI = {
  teamSize: 2, difficulty: 'normal',
  /** Her karede kaç simülasyon adımı atılır: 2 = iki kat oyun hızı. */
  hiz: 2,
  /** Başlangıç kasası (her oyuncuya): üretim ilk saniyeden başlar ve hiç durmaz. */
  kasa: { gold: 4000, wood: 3000, food: 2500 },
  /** Başta her oyuncuya verilen hazır birlikler (sırayla basılır, cephe hattına dizilir). */
  birlikler: ['sword', 'spearshield', 'bow', 'horsesword', 'swordshield', 'bow', 'spear', 'horsespear'],
  /** Hazır birlikler sancakla en yakın rakip sancak arasında bu oranda (0.5 = tam orta) ve bu yarıçapa dağıtılır. */
  hat: 0.46, hatYayilma: 7,
  /** İzometrik kadraj yarı boyu (normal oyunda 17, telefonda 12): gösteri biraz daha yakından bakar. */
  kadraj: 13,
  /**
   * Kamera: `tara` saniyede bir en kalabalık çatışma aranır, seçilen çatışmada en az `tut` saniye kalınır (yeni çatışma
   * `ustunluk` katı kalabalıksa ya da elindeki bittiyse hemen geçilir), `yumusatma` geçişin yumuşaklığıdır (1/sn).
   * `hucre` çatışma aranırken kullanılan ızgara hücresinin boyu, `temas` ise "dövüşüyor" sayılan uzaklıktır (birim):
   * kamera yığının değil, düşmanı dibinde olan birimlerin ağırlık merkezine bakar.
   */
  /** `kalabalik`: dövüşmeyen yığının puana katkısı (küçük tutulur; gerçek çatışma her zaman öne geçsin). */
  kamera: { tara: 1, tut: 4.5, ustunluk: 1.6, yumusatma: 1.5, hucre: 16, temas: 9, kalabalik: 0.05 },
  /**
   * Buluşma emri aralığı (sn): iki ordu da ağırlık merkezlerinin ortasına yürütülür ki birbirini ıskalayıp ayrı ayrı
   * üs kuşatmaya gitmesin — klipte ekranda sürekli çarpışma olsun.
   */
  bulusma: 8,
  /** Maç biterse bu kadar saniye sonra yeni maç başlar: gösteri girdisiz sürer gider. */
  yenidenBasla: 4,
};

/**
 * **Kahramanların gücü gösterisi** (yalnız web, `?gosteri=kahraman`; bkz. src/gosteri-kahraman.js): maç değil,
 * sahnelenmiş ve durmadan tekrarlanan tek bir gösteri. **Atlı Okçu** kahraman kalkansız kılıçlı bir kalabalığın
 * kenarından koşar, **zıplar** (oyunda Boşluk), havada inerken **sağ tık** atar (atılma + vakumlu **ok yağmuru**) ve
 * yere iner inmez **sol tıkı basılı tutup bırakır** (yayda 5 atışlık hızlı yaylım, bkz. CHARGE.bow). Bu çevrim bir
 * turda `tekrar` kez üst üste koşar: kahraman yerde oyalanmaz, hep havada ya da koşuyordur. İlk yaylımdan sonra
 * kalabalığın beyni açılır ve askerler kahramana saldırır. Sayılar oyunun kendi mekaniklerini kullanır;
 * `?gosteri=1` ve normal oyun bu ayarlardan etkilenmez.
 */
export const GOSTERI_KAHRAMAN = {
  /**
   * Kahraman: oyundaki **Atlı Okçu** seti (at + yay, kalkansız). Oyunun kendi seviye ölçeği işler, uydurma bir çarpan
   * yoktur (LEVEL.maxLevel sınırsızdır). Hesap (vuruş gücü 18 x 0.55 asker çarpanı x 0.65 soldierMult x 1.2 at = 7.72;
   * seviye 85'te damageMult 1 + 0.08 x 84 = 7.72, yani bir ok 59.6 taban hasar taşır):
   *  - Atlı Okçu kılıçlının **antisidir** (ANTI.table.horsebow). Anti vuruşun askere hasarı hedefin azami canının
   *    ANTI.soldierMult (0.34) katıdır, **şarj oranıyla ölçeklenir ve seviyeden bağımsızdır**: tek ok 100 canlı
   *    seviye 1 kılıçlıya 34 hasar verir (üç okta ölür), ok yağmurunun her vuruşu KIT.bow.fieldDamage 0.6 oranında
   *    olduğu için 100 x 0.34 x 0.6 = **20.4** verir. Yağmur 0.25 sn'de bir vurur (fieldTick), yani **5. vuruşta
   *    (1.0 sn)** askeri düşürür; alan 2 sn yaşadığı için (fieldLife) 8 vuruş yapar. Yani ok yağmuru seviye 1
   *    kılıçlıyı gerçekten öldürür — seviye bunu değiştirmez, **alanın büyüklüğünü ve ok sayısını** değiştirir.
   *  - Alan / vakum yarıçapı her 10 seviyede %10 büyür (LEVEL.dashEvery): 85'te 1.8 kat, yani ok yağmuru 5.8 birim
   *    ve vakum 13.8 birimdir — sağ tıkta kalabalığın iç halkası tek seferde merkeze çekilir.
   *  - Yaylımdaki ok sayısı seviye kadardır, en çok LEVEL.arrowsMax 40; atlı okçuda iki katı (KIT.horsebow.arrowMult),
   *    yani 80 ok. Şarjlı yaylım bunu CHARGE.bow.shots (5) kez tekrarlar.
   *  - Yay menzili birim tavanındadır (9 birim, bkz. rangeCap): seviye onu artırmaz.
   * Seviye 85 seçilmesinin tek nedeni budur: en geniş yağmur alanı ve en kalabalık yaylım.
   */
  kahraman: { loadout: { weapon: 'bow', shield: false, horse: true }, seviye: 85 },
  /**
   * Kalabalık: `sayi` düşman, hepsi **seviye 1 kalkansız kılıçlı**. Tek tür olmasının iki nedeni var: Atlı Okçu
   * kılıçlının antisidir (üç okta düşürür) ve yayın **kalkana karşı hasarı yok sayılır** (ANTI.weak.bowVsShield 0.15),
   * yani kalkanlı bir kalabalık ok yağmurunu yutardı. Tur başında beyinleri kapalıdır (brain = null): kıpırdamaz,
   * saldırmaz, dağılmazlar — böylece zıplayış ve ilk vuruş temiz görünür. Kahraman **ilk yaylımını** yaptıktan sonra
   * beyinleri açılır ve kahramana koşup saldırırlar (bkz. `beyin`).
   * Yerler altıgen ızgaradan merkeze en yakın `sayi` tanesi seçilir; ağaç / kaya gibi engele düşen yerler atlanır
   * (kalabalıkta doğal boşluklar olur, kimse engele sıkışmaz). 500 birim 15.2 birim yarıçaplı sıkı bir blok olur.
   * `carpismaYaricap` yalnız **fizik** yarıçapıdır (görünüm değişmez): kutular birbirine değecek kadar sık dursun diye
   * normal 0.45 yerine küçültülür, yoksa PHYSICS.unitSpacing ile 1.71 birimden sık dizilemezlerdi.
   *
   * **Neden 1000 değil 500?** Askerlerin beyni açılınca kalabalık artık durmuyor: yürüyor, çarpışıyor ve dalga dalga
   * ölüyor. Maliyet **koşan ve ölen** birim sayısıyla büyüyor (duran 1000 birim bedava: 60 fps). Ölçülen (1280x720,
   * d3d11): 1000 birimde ortalama 32 fps ve çevrim aralarında 20 fps'e kadar dalışlar; 750'de ortalama ~50, dip 29;
   * 600'de ortalama 54, dip 29; **500'de ortalama 57-59, en kötü yarım saniye 44** — yani tek takılmasız ayar budur.
   * 500 ayrıca tur sonunda kalabalığı **tamamen** temizliyor (ayakta 1-5), Yusuf'un "hepsini öldürsün" isteği birebir
   * oluyor. Dumanı testi bu iki sayıyı da ölçer (bkz. tests/gosteri-kahraman-smoke.mjs).
   */
  kalabalik: { sayi: 500, turler: ['sword'], aralik: 1.25, yaricap: 30, carpismaYaricap: 0.3,
    /**
     * Dokunmatikte (telefon / tablet) kalabalık bu kadardır: içerik kaydı masaüstünde yapılır, telefonda sahne yalnız
     * **çökmeden** açılsın yeter. Kalabalık birim telefon tarayıcısının görüntü belleğini doldurup sekmeyi kapatıyor
     * (birim başına ~20 sahne nesnesi; bkz. LIMITS_LIGHT'in aynı gerekçesi).
     */
    telefon: 220 },
  /**
   * Askerlerin beyni (ilk yaylımdan sonra açılır). Her askere hazır bir `attack` emri verilir: hedefi doğrudan
   * kahramandır, yani ai.js'in **hedef arama** dalına hiç girilmez (findTarget her birim için bütün sahayı tarar;
   * yüzlerce birimde kare başına milyonlarca denetim ederdi). Böylece birim başına maliyet sabittir: yönel, yürü,
   * menzile girince vur. Üstüne bir de **uzaklık kapısı** vardır: kahramandan `yaricap` biriminden uzaktaki askerin
   * beyni geçici olarak kapanır (yerinde durur) ve yaklaşınca yeniden açılır — kadrajın dışındaki kalabalık için
   * yapay zekâ koşturulmaz. 500 birimlik kalabalık 15.2 birime sığdığı için `yaricap` 34 pratikte hepsini kapsar;
   * kapı asıl kalabalık büyütülürse işe yarar (ölçümde yarıçapı kısmak fps'i artırıyor ama kalabalık kahramana
   * gelmediği için ölüm sayısı düşüyordu, bu yüzden tercih kalabalığı küçültmek oldu).
   * `uyanma`: yarıçap sıfırdan bu kadar saniyede büyür. Bütün kalabalık aynı karede yürümeye başlayınca kare hızı o
   * anda çöküyordu; yavaş büyüyen yarıçap hem yükü yayar hem de dışa yayılan bir "uyanma dalgası" gibi görünür.
   */
  beyin: { yaricap: 34, uyanma: 1.6 },
  /** Kahraman kalabalığın merkezine bu uzaklıktan, kenarın dışından başlar (ilk zıplama tam ortaya düşsün diye). */
  baslangic: 27,
  /** Bir turda kaç **zıpla → ok yağmuru → in → yaylım** çevrimi koşar (ilki kalabalığın dışından gelen zıplamadır). */
  tekrar: 4,
  /**
   * Evre süreleri (simülasyon saniyesi; ağır çekimde gerçek süre uzar).
   *  hazir: kahraman kenarda bekler · kosu: koşarak yaklaşır · ucusEnCok: havadaki üst sınır (güvenlik)
   *  inisEnCok: yere değdikten sonra şarjın dolmasını bekleme sınırı (şarj havada başlar, çoğu zaman inişte doludur)
   *  yaylim: şarjlı yaylımın beş atışının süresi (CHARGE.bow: 5 x 0.12 sn) · ara: iki çevrim arası koşu (yerde
   *  oyalanma yok, bir sonraki zıplamaya hazırlık) · bitis: son kadraj, ardından sahne yeniden kurulur.
   */
  evre: { hazir: 0.9, kosu: 0.45, ucusEnCok: 2.2, inisEnCok: 0.55, yaylim: 0.66, ara: 0.4, bitis: 1.6 },
  /** Sağ tık: ikinci zıplamadan sonra, alçalırken yere bu kadar yaklaşınca atılır (yağmur kalabalığın üstünde açılsın). */
  sagTikYukseklik: 1.1,
  /**
   * Yaylımın süpürmesi: şarjın beş atışı o anki nişanı izlediği için (bkz. abilities.chargePulse) nişan `genislik`
   * derece boyunca `sure` saniyede taranır, yani oklar çevreyi yelpaze gibi tarar. `ilk` ilk çevrimin başlangıç açısı
   * (kahramanın bakış yönüne göre), `adim` her çevrimde başlangıcın kaç derece döndüğüdür (art arda gelen yaylımlar
   * kalabalığın başka bir yanını tarasın).
   */
  supurme: { ilk: -60, adim: 95, genislik: 120, sure: 0.6 },
  /**
   * Ağır çekim: `olcek` zaman çarpanı; `ilkYaylim` turun **yalnız ilk** yaylımında kaç **gerçek** saniye sürer.
   * Yusuf "daha hareketli" istediği için ağır çekim bir tura tek, kısa bir vurgu olarak bırakıldı; inişte hiç yok.
   */
  agir: { olcek: 0.45, ilkYaylim: 0.3 },
  /**
   * Kamera (3B, yarı yüksek omuz üstü). `yaklasma` zıplama / uçuş evresinde (kahramanı yakından izler), `genis` iniş ve
   * yaylımda. `genis` eski sahneden belirgin **daha yakın ve daha alçaktır** (31 / 0.55 yerine 15.5 / 0.34): kahraman
   * kalabalığın ortasında artık kafa denizinde kaybolmasın, ok yağmuru ve yaylım kadraja girsin.
   * `dist` odağa uzaklık, `pitch` eğim (radyan),
   * `bakisY` bakılan noktanın yüksekliği, `yumusatma` geçiş sertliği (1/sn), `donus` yaylım sırasında yavaş yörünge
   * (radyan/sn), `sapma` her turda açının rastgele değişimi (radyan).
   */
  kamera: {
    yaklasma: { dist: 13, pitch: 0.3, bakisY: 2.4 },
    genis: { dist: 15.5, pitch: 0.34, bakisY: 2.1 },
    yumusatma: 3.2, odakYumusatma: 3.8, donus: 0.12, sapma: 0.5,
  },
  /** Ekrandaki büyük açıklama yazısı (yalnız bu sahnede; yeri için bkz. style.css `#mg-gosteri-yazi`). */
  yazi: { zipla: 'Boşluk: zıpla · Sağ tık: ok yağmuru', dalga: 'Sol tık basılı: hızlı yaylım' },
  /**
   * Yalnız bu sahnenin çizim ayarı (kalabalıkla 60 fps için): `lod` birim sadeleştirme uzaklığı (normalde
   * PERF.lodDist 42) — bu uzaklıktan öteki birimlerde uzuv ve silah çizilmez; `gorus` kadraj elemesinin yarıçapı
   * (odaktan bu kadar uzaktaki hiçbir şey çizilmez); `kalite` grafik kalitesi (asker gölgesi kapalı, bkz. QUALITY).
   */
  lod: 13, gorus: 54, kalite: 'medium',
};

/**
 * **İki ordu gösterisi** (yalnız web, `?gosteri=savas`; bkz. src/gosteri-savas.js): içerik videosu için sahnelenmiş,
 * her turda sıfırlanan tek bir sahne. 1000'er kişilik iki ordu haritanın iki ucundan birbirine hücum eder, tam
 * birleşecekleri anda iki **Kılıçlı Atlı** kahraman kendi ordusunun içinden zıplayıp atılarak öne fırlar ve ortada
 * peş peşe saldırı vurur.
 *
 * **Neden 1000 gerçekten 1000?** Askerlerin oyunun normal görünümü (asker başına ~15 mesh) ve normal yapay zekâsı
 * yoktur; bu sahne kendi ordu beynini (bu dosyada `dovus`) ve kendi **örnekli çizicisini** (view/ordu.js, taraf
 * başına tek çizim çağrısı) kullanır. Kahraman gösterisindeki 500 sınırı buradan gelmiyordu: orada her asker normal
 * görünümle çizilip ai.js ile sürülüyordu.
 */
export const GOSTERI_SAVAS = {
  /**
   * Ordu: `sayi` taraf başına asker (dokunmatikte `telefon`), `sutun` cephedeki asker sayısı, `aralik` cephedeki
   * yan yana mesafe, `sira` arkadaki sıralar arası mesafe, `hiz` hücum hızı (SOLDIER_BASE.speed 3.8 yerine; sinema
   * hücumu koşar adımdır), `carpismaYaricap` yalnız **fizik** yarıçapıdır (görünüm değişmez): PHYSICS.unitSpacing
   * ile sıkı bir cephe ancak böyle durur. `boy` her askerin rastgele boy çarpanı aralığıdır — kutu askerler
   * birbirinin kopyası görünmesin.
   * 50 sütun x 2 birim = 100 birimlik cephe: `kamera.genis` kadrajının dikeyi 88 birimdir, yani cephe ekranın
   * **dışına taşar** — Yusuf'un istediği "haritayı kaplayan dalga" görüntüsü budur. 1000 / 50 = 20 sıra x 2.4 =
   * 48 birim derinlik.
   */
  ordu: { sayi: 1000, telefon: 220, sutun: 50, aralik: 1.8, sira: 2.4, hiz: 5, carpismaYaricap: 0.42, boy: [0.92, 1.08],
    /**
     * Askerin çizim boyu çarpanı (yalnız görünüm; fizik yarıçapı değişmez). Bu kadraj tepeden ve geniştir, asker
     * 1280x720'de ~12 piksele düşüyordu ve ağaçlardan ayırt edilemiyordu; 1.5 kat büyütülünce hem asker hem taraf
     * rengi okunur hâle geliyor. Çarpışma aralığı (PHYSICS.unitSpacing x carpismaYaricap = 1.6 birim) olduğu gibi
     * kaldığı için cephe sıkı kalır — askerler birbirine değecek kadar yakın durur, tam da istenen "duvar" görüntüsü.
     */
    olcek: 1.5 },
  /**
   * Ordu merkezlerinin tur başındaki merkeze uzaklığı (birim). Cephe arası boşluk = 2 x 60 - 48 = 72 birim; iki
   * ordu 2 x 5 x 1.65 = 16.5 birim/sn kapattığı için hücum ~3.3 sn sürer ve ordular hiç kadraj dışına çıkmaz.
   */
  baslangic: 60,
  /**
   * Hücum ekseni: iki ordu bu doğrultuda birbirine koşar. İzometrik kamerada (bakış açısı 45°) bu yön **ekranın
   * yatayına** düşer, yani ordular soldan ve sağdan gelir; cephe hattı ekranın dikeyine oturur. Birim vektör.
   */
  eksen: { x: 0.7071, z: -0.7071 },
  /**
   * Ordu beyni (ai.js değil; yüzlerce birimde findTarget bütün sahayı tarar ve kare hızını yere indirir):
   *  `tara` hedef arama ızgarasının göz boyu, `dilim` ordunun kaçta kaçı her karede yeni hedef arar (4 = dörtte
   *  biri, yani arama maliyeti dörde bölünür), `kopma` hedefin bırakıldığı uzaklık, `menzil` vuruş mesafesi,
   *  `hasar` bir vuruşun hasarı (100 can = 3 vuruş), `itme` vuruşun savurma gücü, `saparma` hücumda her askerin
   *  yönüne eklenen rastgele sapma (cephe tek sıra gibi değil, dalga gibi görünsün).
   */
  dovus: { tara: 5, dilim: 4, kopma: 12, menzil: 2.2, hasar: 34, itme: 7, sapma: 0.12 },
  /**
   * Ölen asker `bekle` saniye sonra (cesedi yere gömüldükten sonra) ordusunun **gerisinde** yeniden doğar: cephe
   * incelmez, tur boyunca taze dalgalar gelir ve — asıl önemlisi — varlık sayısı sabit kalır, yani hiçbir kare
   * yüzlerce görünüm kurup yıkmaz. `geri` ordunun o anki ağırlık merkezinin kaç birim gerisi olduğudur.
   * `bekle` world.js updateLifecycle'ın cesedi sahneden kaldırma eşiğinden (1.9 sn) küçük olmalı.
   */
  takviye: { bekle: 1.72, geri: 22, yayilma: 2.5 },
  /**
   * Kahraman: oyundaki **Kılıçlı Atlı** seti (at + kılıç, kalkansız) ve sahne seviyesi. Seviye vuruş menzilini
   * (levelReachMult), şok dalgasının çapını, atılma mesafesini (dashDistance) ve itmeyi büyütür: kahraman ortada
   * dövüşürken çevresindeki askerler gerçekten savrulur. Can her karede doldurulur (kahraman düşmez).
   * Seviye 50'de kılıçlı kahramanın vuruşu **360°** ve 6.6 birimdir (LEVEL.maxReachMult tavanı), atılma 10.7 birim.
   * `hiz`: kahramanın hareket hızı ordunun hücum hızına eşitlenir (normalde 6.2 x 1.7 = 10.5 ile ordusunu geçer ve
   * hücumun önünde tek başına kalırdı); kahraman böylece kendi ordusunun **içinde** gelir.
   * `oncu`: kahramanın ordusunun cephe hattına göre yeri (eksi = **cephenin gerisinde**, yani ordunun içinde):
   * Yusuf "kendi ordusunun içinden zıplayıp atılsınlar" dedi, bu yüzden kahraman ön safın 4 birim gerisinde durur.
   * `olcek`: kahramanın çizim boyu (bkz. characters.js `viewOlcek`). Askerler bu sahnede 1.5 kat çizildiği için
   * kahraman normal boyunda kalsaydı kendi askerinden küçük görünürdü.
   */
  kahraman: { loadout: { weapon: 'sword', shield: false, horse: true }, seviye: 50, hiz: 8.25, oncu: -4, olcek: 2 },
  /**
   * Evre süreleri (simülasyon saniyesi; ağır çekimde gerçek süre uzar).
   *  hazir: ordular karşılıklı dizili bekler · hucumEnCok: hücumun güvenlik üst sınırı (cepheler `temas` birime
   *  yaklaşınca evre kendiliğinden biter) · ziplama: kahramanların havada kalma süresi (zıpla → havada bir daha
   *  zıpla → atıl) · dovus: kahramanların ortada peş peşe saldırdığı süre · savas: kamera geri çekilir, iki ordu
   *  cepheyi doldurur · bitis: son kadraj, ardından sahne yeniden kurulur.
   * Toplam ~14 sn: istenen 12-16 sn aralığının ortası.
   */
  evre: { hazir: 1, hucumEnCok: 4.6, temas: 22, ziplama: 1.5, dovus: 4.6, savas: 3.4, bitis: 0.5 },
  /** Sağ tık: ikinci zıplamadan sonra, alçalırken yere bu kadar yaklaşınca atılır (atılma kalabalığın üstünden geçsin). */
  sagTikYukseklik: 1.6,
  /**
   * Kahramanların **peş peşe saldırı** betiği (evre başından itibaren saniye; `dovus` ve `savas` evrelerinde
   * başa sarar): `aq` sol tık (kılıç vuruşu, 360°), `tut` sol tıkı basılı tutmaya başla, `birak` bırak (şarjlı
   * **şok dalgası**: 3 dalga, gitgide genişler, son dalga üç kat iter), `dq` sağ tık (atılma + kılıç fırtınası +
   * vakum: çevredeki askerler önce merkeze çekilir, sonra savrulur).
   * Tempo silahın kendi bekleme süresine uyar (kılıç cooldown 0.46 sn; şarjdan sonra 1.5 katı) ve atılmalar
   * TORNADO.cooldown (1.4 sn) aralığını aşar — hiçbir komut boşa gitmez.
   */
  betik: [
    { t: 0.05, k: 'aq' }, { t: 0.6, k: 'aq' }, { t: 1.2, k: 'tut' }, { t: 2.06, k: 'birak' },
    { t: 2.4, k: 'dq' }, { t: 2.95, k: 'aq' }, { t: 3.5, k: 'aq' }, { t: 4, k: 'tut' }, { t: 4.86, k: 'birak' },
  ],
  /**
   * Betiğin başa sarma süresi (sn), kahramanların birbirine bu kadar yaklaşınca durup çevresinde döndüğü mesafe
   * ve bunun `yakinOran` katından da yakınsa geri çekildikleri sınır. Atılma havada olduğu için (havadaki gövde
   * hiçbir şeye çarpmaz, bkz. physics.js) iki kahraman birbirinin içine girebiliyordu; bu üç bölgeli kural ikisini
   * de kadrajda ayrı ayrı tutar.
   */
  betikSure: 5.2, dovusMesafe: 4.2, yakinOran: 0.6,
  /**
   * Ağır çekim: `olcek` zaman çarpanı; `atilma` kahramanların fırlayıp ilk çarpıştıkları anda kaç **gerçek**
   * saniye sürer. Kısa tutuldu: klip 25 sn ve ağır çekim turun temposunu düşürmemeli.
   */
  agir: { olcek: 0.45, atilma: 1.1 },
  /**
   * Kamera (izometrik, tepeden; oyunun kendi 45° bakışıyla aynı açı). `uzaklik` kameranın odaktan uzaklık çarpanı
   * (oyundaki (24, 29, 24) yönü korunur, yalnız ölçeklenir), `genis` / `yakin` dikey yarı kadraj: `genis` 44'te
   * ekranın dikeyi 88 birimdir, yani 80 birimlik cephe baştan başa görünür; `yakin` kahraman düellosunda hafifçe
   * yaklaşır ama ordular kadrajda kalır. `yumusatma` kadraj ve odak geçişinin sertliği (1/sn).
   */
  kamera: { uzaklik: 3.6, genis: 40, yakin: 30, yumusatma: 2.4, odakYumusatma: 2.6 },
  /**
   * Yalnız bu sahnenin çizim ayarı: `gorus` kadraj elemesinin yarıçapı (odaktan bu kadar uzaktaki ağaç / eşya
   * çizilmez; ordular örnekli çizildiği için bundan etkilenmez), `kalite` grafik kalitesi — **düşük**: gölge
   * haritası kamera odağının 60 birim çevresini kapsar (PERF.shadowBox), bu kadar geniş bir kadrajda sahanın
   * yarısı gölgeli yarısı gölgesiz görünürdü. `sis` sahne pusunun kameraya uzaklık aralığı (çarpan; kameranın
   * odağa uzaklığıyla çarpılır): varsayılan 70-125 bu kadrajda ordunun yarısını yutardı.
   */
  gorus: 150, kalite: 'low', sis: { yakin: 0.75, uzak: 1.9 },
  /** Vuruş parlamasının gücü (örnek rengi çarpanı; bkz. view/ordu.js). */
  parlama: 0.8,
  /**
   * Asker renkleri (taraf başına tunik ve **miğfer**). Tepeden bakışta askerin görünen yüzeyi neredeyse yalnız
   * miğferin üstüdür, bu yüzden miğfer de taraf rengindedir ve tunikten belirgin daha açıktır: 1280x720'de bile
   * hangi askerin hangi orduda olduğu bir bakışta okunur. Oyunun kendi asker renkleri (COLORS.blue / COLORS.red)
   * değişmez; bu yalnız bu sahnenin örnekli çiziminde geçerlidir.
   */
  renk: { blue: { tunik: '#3f8fd0', migfer: '#7fcdff' }, red: { tunik: '#c9503e', migfer: '#ff9a52' } },
};

/**
 * **Mancınık düellosu gösterisi** (yalnız web, `?gosteri=mancinik`; bkz. src/gosteri-mancinik.js): haritanın orta
 * alanında, kulelerin kaldırıldığı bomboş çayırda karşılıklı dizilmiş iki mancınık sırası birbirini döver; kızıl
 * taraf düşünce kızılın süvarisi **kanattan** mavinin mancınıklarına akın eder. Sahnede **kahraman yoktur**.
 *
 * Sahne **short müziğine göre** zamanlanmıştır (`short-cayir-muhafizi-mancinik-savasi`, 126 BPM → bir bar 1.9 sn):
 * her taşın **indiği an** bir barın başına denk gelir, son kızıl mancınık `isaret.yikilis`te yıkılır, süvari
 * `isaret.akin`de kanattan çıkar ve `isaret.sonDarbe`de mavi mancınıklara çarpar. Bu yüzden atışlar oyunun
 * yapay zekâsına bırakılmaz, buradaki `atislar` betiğiyle verilir — ama **taşın kendisi, uçuşu, isabeti ve
 * hasarı oyunun kendi kurallarıdır** (combat.js startAttack → shootArrow → updateArrows → damageEntity).
 * `?gosteri=1`, `?gosteri=kahraman`, `?gosteri=savas` ve normal oyun bu ayarlardan hiç etkilenmez.
 */
export const GOSTERI_MANCINIK = {
  /**
   * Sahnenin iki ekseni (birim vektör, dünya XZ). Oyunun izometrik kamerası 45°'den baktığı için:
   *  - `eksen` **ekranın yatayına** düşer: iki mancınık sırası bunun iki ucunda karşılıklı durur, taşlar bu
   *    doğrultuda uçar. Dikey videoda (1080x1920) ekranın dar kenarı budur, bu yüzden sıralar arası `aralik`
   *    kısa tutulur.
   *  - `kanat` **ekranın dikeyine** düşer (+ yukarı): sıralar bu doğrultuda dizilir ve **süvari akını bu
   *    doğrultuda gelir**. Dikey kadrajın uzun kenarı budur: atlılar kadrajın altından girip boydan boya
   *    dörtnala geçer. Dünya uzunluğunun ekrandaki dikey karşılığı 0.6496 katıdır (izometrik kısalma).
   */
  eksen: { x: 0.7071, z: -0.7071 },
  kanat: { x: -0.7071, z: -0.7071 },
  /**
   * Mancınık sıraları: `aralik` her sıranın sahne merkezine `eksen` üstündeki uzaklığı (iki sıra arası 2x9 = 18
   * birim — mancınık menzili 36, yani rahat erişir), `yer` sıradaki mancınıkların `kanat` üstündeki yerleridir.
   * Dört mancınık 21 birime yayılır: dikey kadrajın üst yarısını doldurur, altı süvariye kalır.
   */
  mancinik: { aralik: 7, yer: [-10.5, -3.5, 3.5, 10.5] },
  /**
   * Muhafızlar: her tarafın arka hattı — sahneye derinlik katan, dikey kadrajın alt ve üst ucunu dolduran kısa
   * piyade sıraları. `kanat` ekseninde `b` birim ötede, **kendi tarafının karşı kanadında** dururlar (mavininki
   * yukarıda, kızılınki aşağıda — yani kızılın piyadesi süvarisinin çıktığı kanatta). Yerleri üç kuralla
   * belirlendi:
   *  1. Taş yolu `eksen` doğrultusundadır ve en çok ±13.6 birim `kanat`a yayılır (bkz. `atislar` sapmaları);
   *     muhafızlar o kuşağın dışında durur, yani karşı tarafa giden taşı yolda kesmez ve betiğin zamanlamasını
   *     bozmaz.
   *  2. En yakın rakip mancınığa uzaklıkları 13.5 birimdir, askerin görüşünden (VISION.soldier 10) uzak:
   *     ai.js'e göre görüşünde düşman olmayan asker yerinde durur, yani hat **kendiliğinden** mevzisini korur.
   *     (17 birimde denendi: muhafızlar rakip mancınık sırasını görüp üstüne yürüyor ve düelloyu kendileri
   *     bitiriyordu.)
   *  3. `eksen` üstünde sahnenin ortasına yayılırlar — süvari sütununun koridoru (-11.5 ... -4.5) boş kalsın,
   *     akın kendi piyadesine takılmasın.
   */
  muhafiz: { b: 24, sayi: 5, yayilma: 8, tur: { blue: 'spearshield', red: 'sword' } },
  /**
   * Taş betiği. Her satır bir taşın **indiği an**dır (sahne saati, sn; fırlatma anı buradan geri sayılır):
   *  `iner` inme anı · `atan` atan mancınık (`[taraf, sıra indeksi]`) · `hedef` hedef mancınık ya da `'akin'`
   *  (o anda dörtnala gelen süvari sütunu) · `sapma` hedefin yanına kaçırma (`[eksen, kanat]` birim; sıfırdan
   *  farklıysa taş **ıskalar** — her atış öldürmez, düello sürer).
   * Mancınık gövdesi 40 can, taş 40 hasar: **isabet eden taş mancınığı yıkar** (oyunun kendi sayıları, bkz.
   * SIEGE ve WEAPONS.catapult). Betik bu yüzden "kim kimi ne zaman yıkar"ı doğrudan yazar.
   * İnme anları 1.9 sn'lik barlara oturur: 1.9 · 3.8 · 5.7 · 7.6 · 9.5 · 11.4 · 13.3 (yıkılış), sonra akın
   * bombardımanı 17.1 · 19.0 · 20.9. Aynı mancınık en az 2.2 sn (WEAPONS.catapult.cooldown) arayla atar.
   */
  atislar: [
    { iner: 1.9, atan: ['blue', 1], hedef: ['red', 2], sapma: [0, 2.6] },
    { iner: 1.9, atan: ['red', 2], hedef: ['blue', 1], sapma: [0, -2.9] },
    // Mavi de bir mancınık kaybeder (düello tek taraflı görünmesin) — ama **sıranın uzak ucundan** (3): yakın
    // uç (0) ayakta kalsın ki süvari akını ona varsın ve son darbe tam `isaret.sonDarbe` saniyesine düşsün.
    { iner: 3.8, atan: ['red', 0], hedef: ['blue', 3], sapma: [0, 0] },
    { iner: 3.8, atan: ['blue', 0], hedef: ['red', 1], sapma: [0, 3.1] },
    { iner: 5.7, atan: ['blue', 2], hedef: ['red', 0], sapma: [0, 0] },
    { iner: 5.7, atan: ['red', 3], hedef: ['blue', 2], sapma: [0, 2.7] },
    { iner: 7.6, atan: ['blue', 1], hedef: ['red', 3], sapma: [0, -2.8] },
    { iner: 7.6, atan: ['red', 1], hedef: ['blue', 0], sapma: [0, 3.0] },
    { iner: 9.5, atan: ['blue', 0], hedef: ['red', 1], sapma: [0, 0] },
    { iner: 11.4, atan: ['blue', 1], hedef: ['red', 2], sapma: [0, 0] },
    { iner: 11.4, atan: ['red', 2], hedef: ['blue', 2], sapma: [0, -3.2] },
    { iner: 13.3, atan: ['blue', 2], hedef: ['red', 3], sapma: [0, 0] },
    // Akın bombardımanı: kazanan mancınıklar dörtnala gelen sütunun üstüne taş yağdırır (atlı 150 canlı,
    // 40 hasarlı taş düşürmez ama savurur ve tozu kaldırır — 15-23 sn'lik dörtnala bölümü boş kalmasın).
    { iner: 17.1, atan: ['blue', 1], hedef: 'akin', sapma: [2.5, 0] },
    { iner: 19.0, atan: ['blue', 2], hedef: 'akin', sapma: [-2.2, 1.5] },
    { iner: 20.9, atan: ['blue', 0], hedef: 'akin', sapma: [1.8, -1.2] },
  ],
  /**
   * Taşın yola çıkışı: `hazirlik` fırlatma kolunun hazırlık süresidir (WEAPONS.catapult.windup — `startAttack`
   * ile taşın çıkışı arasındaki gecikme), `cikis` taşın mancınığın merkezinden ne kadar önde doğduğu,
   * `degme` ise taşın hedefin **merkezine** değil gövdesine (yarıçap + pay) değdiği için kazanılan süredir.
   * Fırlatma anı = `iner - hazirlik - (uzaklık - cikis) / taşHızı + degme`.
   */
  ucus: { hazirlik: 0.45, cikis: 0.6, degme: 0.07 },
  /**
   * Süvari akını (kızıl taraf, **Kılıçlı Atlı**). Atlının hızı **oyunun kendi hızıdır** (SOLDIER_BASE.speed 3.8
   * x HORSE.speedMult 1.7 = 6.46 birim/sn) — burada ezilmez, sahne onu birimin kendi `stats.speed`inden okur ve
   * yola **o hıza göre** dizer. `sayi` atlı sayısı, `yayilma` sütunun `eksen` üstündeki genişliği, `derinlik`
   * arka arkaya gelen sıralar arası, `temas` atlının hedefine bu kadar yaklaşınca sahnenin elinden çıkıp
   * **oyunun kendi yapay zekâsına** (ai.js) devredildiği uzaklık. `pay` fiziğin hızlanma payıdır (birim): atlı
   * ilk karede tam hıza çıkmaz, yola bu kadar yakından başlar ki `isaret.sonDarbe` anında mancınığa varsın.
   * `sutun` bir sıradaki atlı sayısı (15 atlı = 3 sıra x 5), `daginik` her atlıya **indisinden türetilen**
   * küçük kaydırma (birim; rastgele değil — çekim kare kare tekrarlanabilir kalmalı): sütun cetvelle çizilmiş
   * bir blok gibi değil, dalga gibi görünsün.
   */
  akin: { sayi: 15, sutun: 5, yayilma: 7, derinlik: 3.4, temas: 4, pay: 1.25, daginik: { a: 0.45, b: 0.8 } },
  /**
   * Müziğin işaretleri (sn; bkz. calisma/icerik/muzik/short/liste.json `isaretler`). Sahne bu saniyelere
   * kilitlidir: `yikilis` son kızıl mancınığın yıkıldığı an (betiğin son düello atışı buraya iner), `akin`
   * atlıların kanattan çıktığı an, `sonDarbe` atlıların mancınıklara vardığı an, `son` müziğin bittiği an.
   */
  isaret: { yikilis: 13.3, akin: 15.2, sonDarbe: 22.9, son: 25.35 },
  /**
   * Mavinin arka hattının savunma mevzisi: akın başlayınca (`isaret.akin`) muhafızlar buraya yürür — `a`
   * her askerin kendi `eksen` yerine eklenen kaydırma (sıra bozulmadan mancınıkların önüne geçsinler),
   * `b` hattın `kanat` üstündeki yeni yeri. Mevzi mancınık sırasının yanıdır: 24 birimlik yolu Mızrak
   * Kalkanlı asker (3.8 x 0.8 = 3.04 birim/sn) akın süresi boyunca yürür ve son darbeye yetişir.
   */
  savunma: { a: -4, b: 0 },
  /**
   * Kızılın arka hattının ikinci dalgası: `basla` saniyesinde (sahne saati) piyade de yürüyüşe geçer ve
   * `b` hattına iner. Geç başlar — süvariden **önce** varmamalı: yaya 3.8 birim/sn ile 14 birimi 3.7 sn'de
   * alır, yani `isaret.sonDarbe`den hemen sonra yetişir ve son çarpışmayı kalabalıklaştırır. Erken
   * başlatıldığında (akınla birlikte) piyade mancınıkları süvariden önce buluyor ve müziğin son darbesi
   * boşa düşüyordu.
   */
  takip: { basla: 19.9, a: 0, b: -10 },
  /** Müzik bittikten sonra sahne bu kadar saniye daha koşar, sonra tur baştan kurulur (gösteri döngüsü). */
  tekrar: 2.5,
  /**
   * Kamera: oyunun **kendi izometrik açısı** (24, 29, 24) ve kahraman kamerasının uzaklığı (`uzaklik` 1)
   * korunur — yani bakış "kahramanın görebildiği kadar"dır. Değişen yalnız dikey yarı kadrajdır (normal oyunda
   * 17): `duello` 19 — iki mancınık sırası, aralarındaki taş yolu ve iki muhafız hattı kadraja ancak böyle
   * sığar; `akin` 24 — dörtnala gelen sütun kadrajın altından görünsün; `darbe` 18 — son çarpışmada yaklaşılır.
   *
   * `odak` kameranın baktığı noktadır (`a` = ekranın yatayı, `b` = ekranın dikeyi). Düelloda bakış sahnenin
   * **tam ortasındadır** (`duello` 0,0): iki mancınık sırası kadrajın iki yanında, muhafız hatları alt ve üst
   * uçta, simetrik durur. Kızıl sıra yıkılınca sahnenin ağırlığı mavi tarafa kayar, bu yüzden bakış hem
   * **yavaşça aşağı** iner (`akin.b` -28: atlıların kanattan girişi kadraja girsin) hem de mavi sıraya doğru
   * kayar (`akin.a` -4: boşalan kızıl yarısı kadrajın yarısını kaplamasın). Akın boyunca `b` atlılarla
   * birlikte yavaşça yukarı döner ve son darbede mancınıkların üstünde durur (`darbe`).
   * Kameranın en hızlı kaydığı an saniyede ekran boyunun onda birinden azdır. `yumusatma` kadraj,
   * `odakYumusatma` bakış noktası geçişinin sertliğidir (1/sn): ikisi de düşük, yani kamera hiç kesmez.
   */
  kamera: {
    uzaklik: 1, duello: 19, akin: 24, darbe: 18, yumusatma: 0.9, odakYumusatma: 0.8,
    odak: { duello: { a: 0, b: 0 }, akin: { a: -4, b: -28 }, darbe: { a: -5, b: -9 } },
  },
  /**
   * `gorus` kadraj elemesinin yarıçapı (odaktan bu kadar uzaktaki ağaç / eşya çizilmez; en geniş kadrajda
   * görünen yarıçap ~46 birimdir, pay bırakıldı), `kalite` sahnenin çizim ayarı — bu kadraj kahraman
   * kadrajına yakın olduğu için **yüksek**: gölgeler ve ayrıntılı birimler açık kalır, short gerçek oyun
   * görüntüsü gibi dursun.
   */
  gorus: 90, kalite: 'high',
  /**
   * Arazi tohumu (setupGame `seed`). Sabittir, yani aynı adresten çekilen her video kare kare aynıdır. Bu
   * değer **taranarak** seçildi (bkz. scripts/mancinik-tohum.mjs): betik 40 tohumda mancınıkların, taş
   * yollarının ve son çarpışma bölgesinin engellere (ağaç, kaya) uzaklığını ölçer; 47202 bu ölçütte en
   * yükseğidir — altı mancınığın da, akının vardığı yerin de üstü açıktır, ağaçlar kadrajın kenarlarında
   * kalır. Haritanın ortasındaki kaya öbeği tohumdan bağımsızdır (her turda aynı yerdedir) ve sahnenin
   * ortasında duran tek engeldir: iki sıranın arasındaki doğal nişan taşı gibi durur.
   */
  tohum: 47202,
};

/**
 * **"Ya Allah Hücum" gösterisi** (yalnız web, `?gosteri=hucum`; bkz. src/gosteri-hucum.js): iki ordunun geniş bir
 * savaş alanında karşılıklı dizildiği, uzaktan bakan sahnelenmiş tek bir savaş. Dikey short için kurulmuştur:
 * ekranda **Kuzey üstte, Güney altta**, iki kanat sağda ve solda.
 *
 * Sahne `short-cayir-muhafizi-ya-allah-hucum` müziğine (33.59 sn) kilitlidir; işaretler `isaret` altındadır ve
 * calisma/icerik/muzik/short/liste.json ile birebir aynıdır. Akış:
 *   0-3 diziliş (Güney mancınıkları uzaktan atar) → 3-15 kanat savaşı (Güney'in menzilli kanatları erir) →
 *   15-19 Kuzey kanatları Güney'in kılıçlılarını ezer → 19 "Ya Allah" nidası, Güney merkezi hücuma kalkar →
 *   19.74-27 mehter marşı: Mızrak Kalkan Atlıları ve seviye 100 kahraman Kuzey merkezini çiğner →
 *   ~27 Kuzey kahramanı ölür → 27-29.6 bütün Kuzey ordusu bozulup ekran dışına kaçar.
 *
 * **Kanat disiplini** bu sahnenin temel kuralıdır (Yusuf: "kanatlardaki askerler merkezlere salça olmasınlar"):
 * her bölük bir **şeride** (sol / merkez / sağ) bağlıdır ve sahne ona yalnız **kendi şeridindeki** düşmanı hedef
 * olarak verir (bkz. gosteri-hucum.js `hedefleriTazele`). Vuruş, hasar, ok, itme ve ölüm yine oyunun kendi
 * kurallarıdır (ai.js `engage` → combat.js); sahne yalnızca **kimin kimi hedeflediğini** söyler.
 * `?gosteri=1`, `?gosteri=kahraman`, `?gosteri=savas`, `?gosteri=mancinik` ve normal oyun bundan etkilenmez.
 */
export const GOSTERI_HUCUM = {
  /**
   * Sahnenin iki ekseni (birim vektör, dünya XZ); oyunun izometrik kamerası 45°'den baktığı için:
   *  - `eksen` **ekranın yatayına** düşer (dünya uzunluğu ekranda birebir): **kanatlar** bu doğrultuda ayrılır.
   *    1080x1920'de ekranın dar kenarı budur, bu yüzden şerit merkezleri ±13 birimde kalır.
   *  - `kanat` **ekranın dikeyine** düşer (+ yukarı = **Kuzey**): iki ordu bu doğrultuda karşı karşıyadır ve
   *    hücum bu doğrultuda akar. Dünya uzunluğunun ekrandaki dikey karşılığı 0.6496 katıdır (izometrik kısalma),
   *    yani dikey kadrajda bol yer vardır — ordular arası 50 birimlik açıklık buraya rahat sığar.
   */
  eksen: { x: 0.7071, z: -0.7071 },
  kanat: { x: -0.7071, z: -0.7071 },
  /**
   * **Şeritler**: bölüklerin `eksen` üstündeki merkezleri ve bir şeridin yarı genişliği. Bir birim yalnız kendi
   * şeridindeki düşmanı hedefler; `yari` şeritler arasındaki sınırdır (13 - 6.5 = 6.5, yani sol şerit
   * [-19.5, -6.5], merkez [-6.5, 6.5], sağ [6.5, 19.5] bandıdır);  hedefsiz kalan birimin şeridin içine
   * çekildiği emniyet payıdır. Merkezle kanat arasındaki boşluk askerin
   * görüşünden (VISION.soldier 10) küçüktür, bu yüzden disiplin **kadrajla değil hedeflemeyle** sağlanır.
   */
  serit: { sol: -13, merkez: 0, sag: 13, yari: 6.5, pay: 1.5 },
  /**
   * **Saha**: sahnenin oynandığı dikdörtgen (`a` yarı genişlik, `kuzey` / `guney` `kanat` sınırları). Dizilişin
   * tamamı buna rahat sığar (a ±17, b -33 ... +26) ve kadrajın içindedir.
   *
   * Sahanın bir de **işlevi** var: sahanın dışına çıkan birim ne hedeflenir ne de hedefler, sahaya geri yürür.
   * Bu kural olmadan oyunun kendi itmesi (WEAPONS.sword.knockback 12) sahneyi bozuyordu: vuruşla geri savrulan
   * bir piyadeyi kovalayan atlı, her vuruşta onu biraz daha iterek **haritanın ucuna kadar** sürüklüyor ve
   * ikisi de kadrajın dışında, bitmeyen bir kovalamacada takılı kalıyordu. Sınır o kovalamacayı keser: piyade
   * sahanın kenarına sıkışır ve dövüş sahnenin içinde biter. (Normal oyunda bu sorun yok: oradaki asker
   * ARMY.chase ile kendiliğinden vazgeçer, bu sahnede ise hedefi sahne veriyor.)
   */
  saha: { a: 24, kuzey: 40, guney: -44 },
  /**
   * **Kanat cephesi**: kanat bölüklerinin dövüştüğü `kanat` ekseni bandı, evreye göre. `taban` iki tarafın da
   * geçemediği güney sınırı, `tavan` Güney birimlerinin geçemediği kuzey sınırıdır (Kuzey birimlerinin kuzeye
   * gitmesi serbesttir — zaten geri çekilmezler).
   *  - `kanatlar` (3-15 sn): kanat savaşı **yolun iki yanında**, sahanın ortasında geçer.
   *  - `ezme` (15 sn sonrası): taban Güney'in Kılıçlı hattına kadar iner — "Kuzey kanatları Güney'in Kılıçlı
   *    bölüklerine dikine saldırır".
   *
   * **İki sınır da gerekli.** Tavan olmasa Güney'in menzilli bölükleri Kuzey'in okçu hattına kadar çıkardı.
   * Taban olmasa iki ayrı sorun çıkıyordu: (1) Kuzey'in kanatları, geri çekilen menzilli bölükleri kovalaya
   * kovalaya Güney'in mancınıklarının dibine iniyor ve Yusuf'un istemediği şey oluyordu — kanat askeri
   * merkezdeki çatışmanın içinde; (2) tek taraflı bir taban konunca da menzilli bölükler tabanın bir tık
   * güneyine çekilip yay menzilinden (9 birim) dövüşü dondurdu — piyade onlara yetişemedi, dövüş 9. saniyede
   * kilitlendi. Ortak taban ikisini birden çözer: menzilli bölük duvara sıkışır, piyade yetişir, dövüş biter.
   */
  cephe: { kanatlar: { taban: -12, tavan: 4 }, ezme: { taban: -18, tavan: 4 } },
  /**
   * Diziliş (Yusuf'un çizimi: calisma/icerik/short-dizilis-ya-allah-hucum.png). Her satır bir **bölük**tür:
   *  `taraf` kuzey / güney · `serit` sol / merkez / sağ · `tur` oyunun kendi asker türü (SOLDIER_TYPES anahtarı) ·
   *  `sayi` asker · `b` bölüğün **ön safının** `kanat` üstündeki yeri (+ = kuzey) · `sutun` bir saftaki asker ·
   *  `aralik` yan yana mesafe · `sira` saflar arası mesafe. Arka saflar hep **düşmandan uzağa** dizilir.
   * `uyanma` bölüğün **beyninin açıldığı** müzik işaretidir (o ana kadar bölük yerinde durur, hiçbir şeye
   * karışmaz — merkezin kanat savaşına karışmamasını sağlayan ilk kural budur):
   *  `kanatlar` 3. sn'de kanat savaşı başlar · `menzilliEriyor` 11. sn'de Güney'in kılıçlıları öne çıkar ·
   *  `hucumda` Kuzey'in okçuları yalnız hücum dibine gelince (bkz. `hucum.okcuUyan`) uyanır ·
   *  `nida` 19. sn'de Güney merkezi hücuma kalkar · `null` bölüğü hep sahne sürer (mancınıklar).
   * `hedefAcilir` bölüğün **hedef olarak görünür olduğu** işarettir (yoksa baştan görünür). Güney'in Kılıçlı
   * bölükleri 15. sn'ye kadar hedef değildir: kanat savaşının ilk 12 saniyesi menzilli bölüklerin dövüşüdür
   * (müzikte 3-11), 11-15 arası iki kanat da soluklanır ("karanlık koyulaşır") ve 15'teki tek darbeyle Kuzey
   * kanatları kılıçlıların üstüne yürür. Kılıçlılar bu sırada zaten 20 birim geridedir, yani kapı yalnızca
   * sahnenin sırasını müziğin sırasına kilitler.
   * `menzilli` olan bölükler kanat savaşının ilk dalgasıdır (müzikte 3-11 sn: "öne çıkıp saldırır, sonra erir").
   */
  boluk: [
    // Kuzey (mavi): merkezde iki okçu bölüğü (kahraman aralarında), kanatlarda Mızrak Kalkan + atlı.
    { taraf: 'kuzey', serit: 'merkez', tur: 'bow', sayi: 15, b: 14, sutun: 5, aralik: 2.0, sira: 2.2, uyanma: 'hucumda' },
    { taraf: 'kuzey', serit: 'merkez', tur: 'bow', sayi: 15, b: 24, sutun: 5, aralik: 2.0, sira: 2.2, uyanma: 'hucumda' },
    { taraf: 'kuzey', serit: 'sol', tur: 'spearshield', sayi: 16, b: 8, sutun: 5, aralik: 2.0, sira: 2.2, uyanma: 'kanatlar' },
    { taraf: 'kuzey', serit: 'sol', tur: 'horsespear', sayi: 14, b: 16, sutun: 5, aralik: 2.4, sira: 2.6, uyanma: 'kanatlar' },
    { taraf: 'kuzey', serit: 'sag', tur: 'spearshield', sayi: 16, b: 8, sutun: 5, aralik: 2.0, sira: 2.2, uyanma: 'kanatlar' },
    { taraf: 'kuzey', serit: 'sag', tur: 'horsesword', sayi: 16, b: 16, sutun: 5, aralik: 2.4, sira: 2.6, uyanma: 'kanatlar' },
    // Güney (kızıl): merkezde mancınık + Mızrak Kalkan Atlısı (kahraman en arkada), kanatlarda menzilli + Kılıçlı.
    { taraf: 'guney', serit: 'merkez', tur: 'catapult', sayi: 4, b: -20, sutun: 4, aralik: 4.2, sira: 4.0, uyanma: null },
    { taraf: 'guney', serit: 'merkez', tur: 'horsespearshield', sayi: 16, b: -26, sutun: 4, aralik: 2.8, sira: 3.0, uyanma: 'nida', akinci: true },
    { taraf: 'guney', serit: 'sol', tur: 'horsebow', sayi: 12, b: -8, sutun: 4, aralik: 2.8, sira: 3.0, uyanma: 'kanatlar', menzilli: true },
    { taraf: 'guney', serit: 'sol', tur: 'sword', sayi: 10, b: -15, sutun: 5, aralik: 2.0, sira: 2.2, uyanma: 'enKotu', hedefAcilir: 'enKotu' },
    { taraf: 'guney', serit: 'sag', tur: 'bow', sayi: 12, b: -8, sutun: 5, aralik: 2.0, sira: 2.2, uyanma: 'kanatlar', menzilli: true },
    { taraf: 'guney', serit: 'sag', tur: 'sword', sayi: 10, b: -15, sutun: 5, aralik: 2.0, sira: 2.2, uyanma: 'enKotu', hedefAcilir: 'enKotu' },
  ],
  /**
   * Kahramanlar. Kuzeyinki **seviye 1** ve okçudur (iki okçu bölüğünün arasında durur, nidadan sonra kendi
   * okçularının **arkasına kaçar**); Güney'inki **seviye 100** Mızrak Kalkan Atlısıdır (merkez bölüğünün en
   * arkasında başlar, hücumun önünde gider). `b` tur başındaki yeri, `kacis` Kuzey kahramanının sığınacağı yer.
   * Seviye oyunun kendi seviye sistemidir (characters.js applyLevelUp): can ve vuruş alanı seviyeyle büyür.
   */
  kahraman: {
    kuzey: { loadout: { weapon: 'bow', shield: false, horse: false }, seviye: 1, b: 20, kacis: 30 },
    guney: { loadout: { weapon: 'spear', shield: true, horse: true }, seviye: 100, b: -34 },
  },
  /**
   * Müziğin işaretleri (sn; calisma/icerik/muzik/short/liste.json `isaretler` ile birebir). Sahne bunlara
   * kilitlidir:
   *  `kanatlar` kanat bölüklerinin harekete geçtiği an · `menzilliEriyor` Güney'in menzilli kanat bölüklerinin
   *  tükendiği an · `enKotu` Kuzey kanatlarının Güney'in kılıçlılarına yüklendiği an · `nida` "Ya Allah" nidası,
   *  Güney merkezi hücuma kalkar · `marsBaslar` mehter marşının girdiği an (hücum dörtnala) · `carpisma`
   *  atlıların Kuzey okçu hattına vardığı an · `kahramanOlur` Kuzey kahramanının düştüğü an · `kapanis` oyun
   *  görüntüsünün bittiği an (sonrası josephuz.com kapanışı) · `son` müziğin bittiği an.
   */
  isaret: {
    kanatlar: 3, menzilliEriyor: 11, enKotu: 15, nida: 19, marsBaslar: 19.74,
    carpisma: 23.7, kahramanOlur: 27, kapanis: 29.59, son: 33.59,
  },
  /**
   * Hedefleme: `tazele` sahnenin hedefleri yenileme aralığı (sn; ai.js'in kendi `retarget`i 0.3 sn, bundan sık
   * yenilemek boşuna), `menzil` bir birimin **şeridindeki** düşmanı hedef kabul ettiği en uzak mesafe — kanatta
   * geniştir (bölükler birbirine yürüsün), merkezde okçular için dardır (`okcuMenzil`: yay menzili 9 + pay, yani
   * okçu hücum dibine gelmeden yerinden kıpırdamaz).
   */
  hedef: { tazele: 0.25, menzil: 46, okcuMenzil: 11, cephePayi: 6 },
  /**
   * Güney mancınıklarının **atış pencereleri** (sahne saati, sn). Mancınık oyunun kendi kuşatma birimidir
   * (menzil 36, hasar 40, bekleme 2.2) ve sahne yalnız **ne zaman, kime** nişan aldığını söyler. İki pencere
   * var: açılış bombardımanı (karamsar girişte uzaktan atılan taşlar) ve hücum bombardımanı ("arkadan yetişen
   * mancınıklar da atış yapar"). Arada susarlar: kanat savaşı boyunca durmadan atsalardı Kuzey'in okçu hattını
   * 19. saniyeden önce eritirlerdi. `ilerleme` hücumda mancınıkların kendi hızıyla (SIEGE.speed 2.4) kuzeye
   * yürüdüğü mesafedir.
   */
  mancinik: { pencere: [[0.4, 7], [20.2, 27.5]], ilerleme: 14 },
  /**
   * Hücum (Güney merkezi). `sprint` atlıların ve kahramanın koşusu oyunun kendi koşusudur (SPRINT_MULT 1.65):
   * Mızrak Kalkan Atlısı 3.8 x 1.7 x 0.8 x 1.65 = 8.53 birim/sn. `temas` atlının hedefine bu kadar yaklaşınca
   * sahnenin yol sürüşünden çıkıp **oyunun dövüşüne** bırakıldığı uzaklık. `okcuUyan` Kuzey okçularının beyni
   * açılan an (hücum bu kadar yaklaşınca): daha erken açılsaydı okçular mancınıklara yürür, merkez dağılırdı.
   */
  hucum: { sprint: true, temas: 3.2, okcuUyan: 16 },
  /**
   * **Bozgun** (oyunda yoktur, sahneye özeldir): Kuzey kahramanı düşünce bütün Kuzey birlikleri beyinlerini
   * bırakır, dönüp kuzeye ve yanlara kaçar. `hiz` kaçış hız çarpanı (oyunun kendi koşusu), `yan` kaçarken
   * `eksen` üstünde dışa açılma payı, `sil` birimin bu kadar `kanat` birimi kuzeye geçince sahadan kaldırıldığı
   * sınır (kadrajın üstü ~+46 birimdedir, yani silinme ekran dışında olur).
   */
  bozgun: { hiz: 2.1, yan: 0.55, sil: 62 },
  /**
   * Kuzey kahramanı müziğin `kahramanOlur` işaretine kadar **ayakta kalır**: canı 1'in altına düşmez, o andan
   * sonra ilk vuruş onu düşürür (düşmezse sahne onu Güney kahramanının vuruşuyla düşürür). Atlıların ve seviye
   * 100 kahramanın arasında kalan seviye 1 kahraman yoksa 24. saniyede ölür ve marş boşa akardı; bu kural
   * **yalnızca ölüm anını** müziğe oturtur, dövüşün kendisine karışmaz.
   */
  kahramanKalkani: true,
  /**
   * Kamera: oyunun **kendi izometrik açısı** (24, 29, 24), `uzaklik` ile geriye çekilmiş. Dikey yarı kadraj
   * (`genis` 33) normal oyunun (17) iki katıdır — Yusuf'un istediği "belirgin uzak" bakış budur: dikeyde
   * 33 / 0.6496 = ±50.8 birim, yatayda 0.5625 x 33 = ±18.6 birim görünür, yani iki ordu ve iki kanat aynı anda
   * kadrajdadır. Hücumda (`hucum` 29) merkeze hafifçe yaklaşılır. Kamera kahramanı izlemez: `odak` yalnız evreye
   * göre **çok yavaş** kayar (`odakYumusatma` 0.7 → saniyede ekran boyunun onda birinden az).
   */
  kamera: {
    uzaklik: 2.2, genis: 33, hucum: 29, yumusatma: 0.6, odakYumusatma: 0.7,
    odak: { dizilis: { a: 0, b: -3 }, kanatlar: { a: 0, b: -3 }, hucum: { a: 0, b: 8 }, bozgun: { a: 0, b: 14 } },
  },
  /**
   * `gorus` kadraj elemesinin yarıçapı (odaktan bu kadar uzaktaki ağaç / eşya çizilmez; kadrajın köşesi
   * ~54 birimdedir, pay bırakıldı), `sis` sahne pusunun kameraya uzaklık aralığı (çarpan; kameranın odağa
   * uzaklığıyla çarpılır — bu kadrajda varsayılan pus ordunun yarısını yutardı), `kalite` çizim ayarı:
   * **orta** — gölge haritası bu genişlikte sahanın bir kısmını açıkta bırakıyor, orta kalitede gölge geçişi
   * birkaç karede bir yenilenir ve 150 askerlik sahada kare hızı düşmez.
   */
  gorus: 110, sis: { yakin: 0.8, uzak: 2.0 }, kalite: 'medium',
  /** Müzik bittikten sonra sahne bu kadar saniye daha koşar, sonra tur baştan kurulur (gösteri döngüsü). */
  tekrar: 2.5,
  /**
   * Arazi tohumu (setupGame `seed`). Sabittir: aynı adresten çekilen her video kare kare aynıdır. Bu değer
   * **taranarak** seçildi (bkz. scripts/hucum-tohum.mjs): betik 150 tohumda sahanın içindeki ağaç / kaya
   * sayısını, bölüklerin üstünün açıklığını ve merkez şeridin hücum koridorunu ölçer; 93858 sahada yalnız
   * 17 engel bırakır ve koridoru baştan sona açık tutar — kadraj iki orduyu birden aldığı için en kritik
   * ölçüt budur. Haritanın ortasındaki kaya öbeği tohumdan bağımsızdır (her turda aynı yerdedir) ve iki
   * ordunun arasında, yolun hemen altında durur: sahnenin doğal nişan taşı.
   */
  tohum: 93858,
};

/**
 * Çevrim içi (oda kur / odaya katıl, çevrim içi sayısı): `web` tarayıcıda, `app` Android uygulamasında açık mı. Kapalıyken
 * sunucuya hiç bağlanılmaz, oda düğmeleri "Yakında" yazar; tek başına oyun aynen oynanır (bkz. src/platform.js).
 */
export const ONLINE = Object.freeze({ web: true, app: false });
/**
 * Çevrim içi oyun sunucusu (WebSocket, Cloudflare Tunnel ile evdeki PC). Oyun dosyaları Cloudflare'deki statik siteden
 * (cayirmuhafizi.josephuz.com) gelir; sayfa sunucunun kendisinden açıldıysa (yerelde, Docker, aynı ağ) aynı adres kullanılır.
 */
export const SERVER = 'cayirmuhafizi-sunucu.josephuz.com';
/** Kullanım ölçümü uç noktası (josephuz.com Worker → Analytics Engine). Yerelde / IP adresinden açılınca kapalı (platform.js → olcumUrl). */
export const OLCUM = 'https://www.josephuz.com/api/olay';
