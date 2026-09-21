# Çayır Muhafızı

Three.js ile yerel tarayıcıda çalışan, **Age of Empires 2 + DOTA** esintili, tam ekran izometrik kır savaşı.
`demo`daki dövüş hissi (iki hızlı fizik, koni içi vuruş, prosedürel animasyon) bu sahnenin üstüne
taşındı; üstüne Age of tarzı alt bant, üretim kuyruğu, savaş sisi,
2B minimap, yapı inşası, ordu emirleri, birim üstünlükleri ve rakip kahraman eklendi.

## Başlatma

`Baslat.cmd` dosyasına çift tıklayın. Oyun tarayıcıda açılır; alt bandın sağındaki ⛶ ile tarayıcı tam ekranı.
Alternatif: bu klasörde `npm install` ve `npm start`, ardından http://127.0.0.1:5173.
Node.js gerekir. İlk kurulumdan sonra internet bağlantısı gerekmez.
Port değiştirmek için PowerShell'de `$env:PORT=5174; npm start`.

## Kahraman

Oyun sabit bir **Kılıçlı** kahramanla başlar; başlangıçta yalnızca zorluk seçilir. Kahraman sancakta gelişir:
sancağı seç, **Geliştir** düğmesiyle menüyü aç (kahraman sancağa 12 birimden yakın olmalı).

- Kahramanlar (sen ve rakip) **kendi türündeki asker gibi vurur**: aynı hasar, aynı üstünlük matrisi, aynı alan vuruşu; farkları
  can, hız ve seviyeyle büyüyen vuruş alanı. Kafaları **sarıdır**, iki tarafta da kahraman olduğu anlaşılır. Kahramanlar
  işçiler dahil **her düşmana** vurabilir; binalara, kulelere ve sancağa türünün asker hasarıyla vurur, bu hasar
  **seviye başına +%10** artar (kuleye askerlerin 0.4x çarpanı kahramana uygulanmaz). Kaynak düğümlerine vurmak serbesttir.
  **Zıplarken** ne birlikler ne de kuleler kahramana vurabilir.
- **Seviye (exp)**: altınla alınmaz ve öldürmek tek başına yetmez. **Ölen her birim ve yıkılan her yapı yere mor exp
  küreleri bırakır**: yaya asker 10, **atlı 24**, işçi 4, mancınık 14, **kahraman 120 + seviye başına 25** (sv 10 bir kahraman 345 exp bırakır), **kule 90**, diğer binalar 30 exp,
  tarafsız yaratık 35 — kendi
  askerlerin ve rakibin kayıpları da dahil. Büyük ödüller 30'luk kürelere bölünür; kendi yapını yıkmak exp vermez. Küreyi **toplayan kahraman** tecrübeyi
  alır (kim öldürdüğü önemsiz), toplama yarıçapı kaynaklardaki ile aynıdır ve seviyeyle büyür. Yeter sayıya ulaşınca
  seviye kendiliğinden atlar. Bir seviyenin bedeli **30 + 15 × (seviye − 1)** exp
  (sv 1→2: 30, 2→3: 45, 3→4: 60 …), artan exp bir sonrakine sayılır; **sınırsız** (üst seviye yok). HUD'da `★ 3 · 24/60 exp`
  görünür. Her seviye **+10 can**,
  **+%8 vuruş gücü** (yakın vuruş ve ok; sv 10'da 1.72x, sv 20'de 2.52x), **+%10 yapı hasarı** ve **vuruş alanı**: kılıç / mızrak menzili +%12, yay açısı +%10 (en çok 3 kat); okçu kahraman
  **seviyesi kadar ok** atar (sv 1: 1 ok, sv 12: 12 ok; en çok 40 — oklar dağılmaz, hepsi aynı hedefe yan yana gider) ve **yay menzili de her 10 seviyede +%20** büyür. Seviye başına **kaynak toplama yarıçapı da +0.2** büyür
  (2.5'ten başlar, en çok 14) ve **her 10 seviyede kaynak vuruşu başına bir ürün daha** düşer (sv 1-9: 1, 10-19: 2, 20-29: 3…);
  aynısı kahramanın bir çalışma yerinde durarak ürettiğinde de geçerlidir. Vuruş anında beliren şeffaf yay, kahramanın **gerçek vuruş alanını** (menzil ve açı) birebir
  gösterir; kenarı altın çizgiyle vurgulanır ve seviye atladıkça büyür. Hız seviyeyle değişmez; bilgi kartı seviyeli hasarı (x çarpanıyla) yazar. Geniş alan vuran yüksek seviye kahraman kalabalığa karşı koyar: oyun strateji ile de, kahramanı geliştirerek
  de kazanılabilir. **Rakip kahraman da seni izler**: kendi öldürdüklerinden exp kazanır, geride kalırsa her karar turunda bir seviye alarak senin seviyene çıkar (bedelsiz).
- **Can yenilenmesi**: altınla can doldurma **yok**. Kahraman **kendi sancağının alanında** (sancak çemberi, 30 birim)
  durdukça saniyede **9 can** kazanır ve tepesinden **yeşil can baloncukları** çıkıp yükselerek söner; alandan çıkınca durur. **Başka hiçbir yol canı doldurmaz**: yiyecek
  yalnızca envantere girer, seviye atlamak azami canı artırır ama mevcut canı doldurmaz. Yeniden doğan kahraman dolu başlar.
  Aynı kural rakip kahraman için kendi sancağında geçerlidir.
- **Türe dönüş**: 10 asker türünden birine dönüş, **en az 1000 altın**: taban 1000 + **yay 600** + **kalkan 800** +
  **at 1200** (yaya kılıç/mızrak 1000, okçu 1600, kalkanlı yaya 1800, atlı 2200, atlı okçu 2800, kalkanlı atlı 3000).
  **Seviyen ve exp'in korunur**
  (yeni türün taban canına seviyelerinin can artışı eklenir). Donanım (silah, kalkan, at) ve
  görünüm değişir, **seviye 1'e döner**. Yetenek seti silah x at ile değişir (bkz. Kahraman yetenek setleri); kalkan can (+30), üstünlük
  bonusu ve atılmada daha uzun vurulmazlık verir.
- Kahraman yerdeyken hiçbir komut verilemez: üretim, inşa, seçim, emir, mod değişimi kilitlenir.
- **Her ölümde yeniden doğuş uzar**: ilk ölümde 5 sn, sonraki her ölümde **+4 sn** (5 · 9 · 13 · 17 …), en çok **30 sn**.
  Rakip kahramanda da aynı kural işler, tabanı 8 sn'dir (8 · 12 · 16 …). Sayaç yeni oyunda sıfırlanır; ölüm mesajı kaçıncı
  ölüm olduğunu ve beklemeyi yazar.
- **İnşa kahramana bağlıdır**: her bina kahramanın 14 birim çevresine (yerleştirmede sarı halka) dikilir; uzağı kırmızı hayalet gösterir.

## Kahraman yetenek setleri

Asker türü seçimi kahramanın **sol ve sağ tık yeteneklerini** belirler. Set **silah x at** ile seçilir (6 set); kalkan her sette
atılma vurulmazlığını 0.5 sn'den 0.9 sn'ye uzatır. Sol tık her zaman silahın kendi vuruşudur (yakın dövüşte yay, okçuda ok) ve
setin ek etkisi bunun üstüne biner; sağ tık her zaman **ileri atılma**dır ve setin ikinci etkisi ona eşlik eder. Sayılar
`config.js` → `KIT` içinde; hasarlar vuruşun katı, alanlar seviyeyle büyür (yarıçaplar her 10 seviyede +%10, ok sayısı seviye kadar).

| Set | Sol tık: vuruş + … | Sağ tık: atılma + … |
| --- | --- | --- |
| **Kılıçlı** | **Üçlü kesik**: peş peşe vuruşlar (1.2 sn içinde) zincir kurar; 2. vuruş %35 geniş yay, 3. vuruşta **girdap** (çevrende 1 sn dönen bıçak çemberi, 360°, 0.2 sn'de bir vuruşun 0.5 katı). **Basılı tut → Ağır kesik**: 180° tek vuruş, 2x hasar, üç kat itme, yarım adım öne | **Kılıç fırtınası**: durduğun yerde 2 sn boyunca savrulan kılıçlar; 3.2 birim yarıçap, 0.25 sn'de bir vuruşun 0.6 katı |
| **Mızraklı** | **Saplama**: bakış yönünde menzilin 2.2 katı uzunlukta ince şerit, yayın ötesindeki herkesi tam hasarla deler. **Basılı tut → Delici saplama**: şerit menzilin 3 katına uzar, 2x hasar, en yakın hedefi sana çeker | **Kazık alanı**: hortum gibi durduğun yerde açılır, 2 sn boyunca yerden kazıklar yükselir; 3.2 birim yarıçap, 0.25 sn'de bir vuruşun 0.6 katı, dışa iter |
| **Okçu** | **Yelpaze**: seviyen kadar ok en çok 70° yelpaze açar (ok başına 8°), her ok kendi yönündeki düşmana kilitlenir. **Basılı tut → Delici ok**: tek kalın ok, 2.5x hasar, 1.5x menzil, çarptığı her düşmanı delip geçer | **Ok yağmuru**: hortum gibi durduğun yerde açılır, 2 sn boyunca gökten ok yağar; 3.2 birim yarıçap, 0.25 sn'de bir vuruşun 0.6 katı |
| **Kılıçlı Atlı** | **Geniş kesik**: vuruş yayı 180°, itme iki kat | **Kılıç fırtınası + vakum**: yayanınkiyle aynı alan; tık anında alan yarıçapının 2.4 katı içindeki düşmanlar 0.6 sn boyunca merkeze çekilir |
| **Mızraklı Atlı** | **Hücum**: vururken yavaşlamazsın, hasar hızınla artar (tam koşuda 2x) | **Kazık alanı + vakum**: yayanınkiyle aynı alan; tık anında çevredeki düşmanlar merkeze çekilir |
| **Atlı Okçu** | **Koşarken atış**: atarken yavaşlamazsın, seviyenin iki katı ok dar (20°) yelpazede | **Ok yağmuru + vakum**: yayanınkiyle aynı alan; tık anında çevredeki düşmanlar merkeze çekilir |

**Şarjlı vuruş (sol tık basılı tutma)**: tık anında normal vuruş iner; fare 0.22 sn'den uzun basılı kalırsa kahramanın üstünde bir
çubuk 0.6 sn'de dolar (dolunca altın), bu sırada hız yarıya iner ve yüz imleci izler. Bırakınca silaha özgü güçlü vuruş çıkar; hasar şarj
oranıyla büyür (yarım şarj = çarpanın yarısı). Şarjlı vuruştan sonra bekleme 1.5 kat. Atlı setler silahının şarjlı vuruşunu aynen alır.
Sayılar `config.js` → `CHARGE` ve `COMBO`.

Anti kuralı bütün set etkilerinde geçerlidir: antisi olduğun türe girdap, saplama, kılıç fırtınası, kazık alanı, ok yağmuru da tek atar (yarım güçlü etkiler
hasarı aynı oranda ölçekler, bkz. Birim üstünlükleri). Rakip kahraman sol tık etkilerini kullanır (sağ tık yetenekleri yalnızca oyuncuda).
Bilgi kartı seçili setin iki yeteneğini yazar; sancaktaki **Geliştir** menüsünde her türün düğmesi setini gösterir.

## Kamera: izometrik ↔ omuz üstü (V)

Oyun izometrik kamerayla başlar; **V** tuşu ya da minimap altındaki **🎥** düğmesi **omuz üstü (üçüncü şahıs) kameraya**
geçirir, tekrar basınca izometriğe döner. Omuz üstünde:

- Geçişte **fare kilitlenir** ve imleç kaybolur; fare hareketi bakışı döndürür (sağa-sola sınırsız, yukarı-aşağı sınırlı).
- **Orta tuş (tekerlek) fareyi serbest bırakır**: imleç görünür, kamera son açısında kalır ve tıklar **izometrikteki gibi** işler:
  imleçle yapı seç, bina dik, toplanma noktası kur, tıkladığın yöne vur, alt banttaki düğmelere bas. **Tekrar orta tuş** bakışı
  kaldığı açıdan kilitler. **Esc** de kilidi bırakır (oyunu duraklatmaz); duraklatma, oyun sonu ve yeni oyun ekranı kilidi kendiliğinden bırakır.
- **WASD kameraya göredir**: W baktığın yöne, S geri, A / D yana. Kahramanın yüzü hep kameranın baktığı yöne döner.
- **Kilitliyken nişan ekran ortasındaki artıdır**: sol tık artının zemine değdiği noktaya vuruş (okçuda oklar oraya gider), sağ tık o yöne atılma + set etkisi,
  inşa ve toplanma noktası da artının gösterdiği yere konur, kendi yapına nişan alıp tıklamak onu seçer. Serbest farede nişan imleçtir.
- Kamera kahramanın sağ omzunun üstünden bakar (sayılar `config.js` → `CAMERA.tps`: uzaklık 9, yükseklik 2.4, açı 62°, fare duyarlılığı).
  **Savaş sisi düzlemi bu modda yoktur**: görünürlük **görüş mesafesiyle** işler (`CAMERA.tps.viewDist`, 90 birim): düşman birim ve yapılar
  kahramana bu uzaklıktan yakınsa görünür, sahne pusu 30 birimde başlayıp 90'da tam kapanır, ufuk arka plana karışır. Sis ızgarası arka planda
  hesaplanmaya devam eder (minimap ve izometriğe dönüş için); askerlerin savaş kuralları değişmez. Zıplamada kamera yarı yarıya yükselir.
- Alt banttaki düğmeler tık sonrası odağı bırakır: Space zıplar, düğmeyi yeniden tetiklemez.

## Kısayol yok

Üretim, inşa, emirler ve kahraman geliştirme **yalnızca alt banttaki düğmelerle** yapılır; komut ızgarasında
kısayol harfi yoktur. Klavyede yalnızca hareket (WASD / ok tuşları), Shift (koşu), Boşluk (zıplama) ve Esc (açık modu kapat / duraklat) vardır.

## Tek mod: kahraman

Komutan (RTS) modu **kaldırıldı**: oyun hep kahraman modunda oynanır, kamerayı kahraman sürükler. Ordu tek tek
yönetilmez; **toplanma alanları** (soldaki ⚑ düğmeleri) hem varış noktası hem savaş bölgesidir.

| Girdi | Etki |
| --- | --- |
| `WASD` / yön tuşları | Hareket (ekrana göre) |
| `Shift` | Koşu |
| `Boşluk` | Zıplama; havadayken hiçbir şeye takılmazsın, yakın vuruşlar ıskalar, oklar altından geçer |
| Sol tık | Kendi yapına gelirse **seçer** (çift tık: o türdeki tüm binalar); inşa modunda yapıyı **diker**; yoksa **tıkladığın yöne vuruş**. Kahraman kendiliğinden vurmaz: her vuruş bir sol tıktır ve nişan tıklandığı noktada kilitlenir |
| Sol tık | **Vuruş + set etkisi**: silahın kendi vuruşunun (yakın dövüşte yay, okçuda ok) üstüne kahramanın **yetenek setine** özel ek etki (bkz. Kahraman yetenek setleri). Kahraman kendiliğinden vurmaz: her vuruş bir sol tıktır |
| Sağ tık | **İleri atılma + set etkisi**: imlece doğru fırlarsın. **Atılma mesafesi** başlangıçta **4.8 birim**, **seviye başına +0.12** (en çok 12); atılırken 0.5 sn vurulmazsın (kalkanlı setlerde 0.9 sn). Atılmaya silahına göre durduğun yerde 2 sn süren alan etkisi eşlik eder: kılıç fırtınası, kazık alanı ya da ok yağmuru; atlı setlerde alan açılırken **vakum** çevredeki düşmanları merkeze çeker. İki kullanım arası **1.4 sn** |
| Maden / ağaç / tarlaya vur | Kaynak düşer; üstünden geçince **doğrudan envantere** girer (ok da işler) |

**Yapı ve ordu komutası** (kahraman modunda, alt banttan):

| Girdi | Etki |
| --- | --- |
| Sol tık | Kendi yapını seç (üretim / menü); boşluğa tıklayınca seçim kalkar |
| Çift tık | Aynı türdeki **bütün** binaları seç: üretim emirleri aralarında paylaştırılır |
| ⚑ **Piyade / Okçu / Süvari / Mancınık / Hepsi** + sol tık | O sınıfın **toplanma alanını** kur: hem varış noktası hem hedef bölgesi |
| Sağ tık | Açık modu kapat (birim emri yok) |

Her iki modda: inşa (kışla, okçuluk, ahır, kuşatma, kule) ve sınıf toplanma alanları **yalnızca hiçbir şey seçili değilken**
soldaki düğmelerle (sancak menüsünde bina düğmesi yoktur), birim üretimi bina ızgarasındaki düğmelerle;
`Esc` açık modu kapat / duraklat. Kahramanın yakın vuruşları çevresindekileri biraz iter; asker ve kule vuruşları itmez.

Oyuncunun askerleri **kafasına göre hareket etmez**: durduğu yeri tutar, yalnızca yakına gelen düşmanla dövüşür,
emirle yürür. Rakibin askerleri kendiliğinden hatlardan ilerler.

## Alt bant (Age of tarzı)

- **Sol**: komut ızgarası; seçili yapının menüsünde **✖ Kapat** düğmesi seçimi ve menüyü kapatır (Esc ile aynı).
  **Hiçbir şey seçili değilken bina dikme düğmeleri** (kışla, okçuluk, ahır, kule; sancağa tıklamak gerekmez),
  seçili yapının üretimi / inşa menüsü ve sancakta **Geliştir** düğmesi. Her düğmede maliyet.
- **Orta**: bilgi kartı. Hiçbir şey seçili değilken **kahramanın durumu** (tür, seviye, can, exp, vuruş / menzil / hız)
  ve altında **sancağının durumu** (can çubuğu, kaç kulenin koruduğu) bir arada görünür.
  Yapı: can, üretim sırası (ilk emirde ilerleme, tıklayınca iptal + para iadesi).
  Birim: can ve vuruş / menzil / hız. Çoklu seçim: tür sayıları.
- **Sağ**: tamamen 2B baklava minimap (zemin, ağaçlar, sis, yapılar, birimler, kamera çerçevesi). Sol tık kamera, sağ tık yürüme emri.
  Altında duraklat / yeni oyun / tam ekran düğmeleri.

## Üretim kuyruğu

Birimler anında çıkmaz: binanın sırasına alınır (bina başına en fazla **30 emir**), süre dolunca binanın yanında,
sınıfının toplanma yeri varsa oraya yürüyerek çıkar. Kaliteli birim geç çıkar. Maliyet sıraya alınırken düşer.

**Toplanma alanları** binalara değil sınıflara bağlıdır ve aynı zamanda **hedef tayinidir**: hiçbir şey seçili değilken soldaki
⚑ **Piyade / Okçu / Süvari / Mancınık** düğmesine bas, haritada bir yere tıkla (bina diker gibi). O sınıftaki **tüm askerler**
oraya yürür, yeni çıkanlar da oraya gider ve **yalnızca bayrağın 22 birim çevresinde**, sisin kalktığı yerde dövüşürler:
haritada başıboş gezmezler. Bayrağı düşman kulesinin yanına dikersen ordu oraya yürüyüp orayı döver. ⚑ **Hepsi** bütün sınıfları
aynı noktaya alır. Her sınıfın kendi renkli bayrağı vardır. **Kahraman toplanma alanlarına hiç gitmez**: onu sen yürütürsün.

**Hedef önceliği** (her iki taraf): görünen düşman **birimleri** → **kuleler** → **binalar** → **sancak**. Sancak, o tarafın
ayakta kulesi kaldıkça can kaybetmez (vuruş yine iner ve kuleleri ele verir); diğer binalar sancağı korumaz.
Askerler kalkanlı sancağı ancak başka hedef yokken döver: önce kuleler, sonra binalar.
Üretim düğmesine **Shift** ile basınca 5, **Ctrl** ile 10 birim birden sıraya girer (kaynak ya da sıra bitince durur).

**Asker basımı kolaydır, ordu büyür**: maliyetler eski değerlerin ~%60'ı, üretim süreleri ~yarısı. Emir, bir bina seçili
değilse o türü basan binalardan **sırası en kısa olanına** gider; **aynı türden ikinci bir kışla / okçuluk / ahır kurmak
üretimi paralelleştirir** (toplu basımda emirler binalara dağılır, mesaj "2 binada paralel" der). Mancınık da artık aynı
fiyat aralığındadır.

| Bina | Birim | Altın | Yiyecek | Süre |
| --- | --- | --- | --- | --- |
| Kışla | Kılıçlı · Kılıç Kalkan · Mızraklı · Mızrak Kalkan | 9 · 15 · 12 · 18 | 3 · 5 · 4 · 5 | 1 · 1.5 · 1.2 · 1.7 sn |
| Okçuluk | Okçu · Atlı Okçu | 15 · 27 | 4 · 7 | 1.3 · 2.3 sn |
| Ahır | Mızraklı Atlı · Kılıçlı Atlı · Kılıç Kalkan Atlısı · Mızrak Kalkan Atlısı | 24 · 24 · 33 · 33 | 7 · 7 · 9 · 9 | 2.2 · 2.2 · 2.8 · 2.8 sn |
| Sancak | Oduncu · Madenci · Çiftçi | 10 | 0 | 1 sn |
| Kuşatma (savaş aletleri) | Mancınık | 45 | **30 odun** (yiyecek yok) | 3.2 sn |

**Mancınık**: kule menzilinin (9) **iki katı** uzaktan — 18 menzille — **2.2 saniyede bir** taş atar ve **öbür askerler gibi
her hedefe saldırır** (birim, bina, kule); hedef seçerken kuleyi yeğler, yanındaki düşman birimini de döver.
Kuleye hasarı **2.5 katına** çıkar (220 × 2.5 = **550**, yani 2000 canlı kule 4 taşta düşer) ve askerlerin 0.4x kule çarpanı
ona uygulanmaz; canlı hedefte taş dağıldığı için hasarın **0.35 katı** (**77**) iner. 40 canla askerlere karşı çok
dayanıksızdır, korunması gerekir. Rakip de sende görürse savaş aletleri kurup mancınık basar. **Asker mancınığının taşı hedefi takip etmez**: atış anındaki
konuma düz uçar, yer değiştiren birimi ıskalayabilir (binalar ve kuleler durduğu için onları hep bulur). Hedef takip eden
mermiler yalnızca **kahramanın** (okçu ve mancınık türlerinde) ve **kulelerin** atışlarıdır.

**Kendi birliklerin engel değildir**: kahramanın, askerlerin ve işçilerin durduğu yere de bina dikilebilir (kurulunca
kenara itilirler); yalnızca **düşman birimi**, başka yapı, çalışma yeri ve engeller yeri kapatır.

**Nereye dikilir**: kule dışındaki binalar kendi **sancağının çemberi** (sancağın çevresindeki 30 birimlik halka) içine ve
kahramanın 14 birim yakınına dikilir. **Kuleler** kendi çemberine bağlı değildir ama yalnızca **yollara**, başka kulelerden (kendi ya da rakip) en az
**18 birim** uzağa ve **rakibin sancak çemberinin (30 birim) dışına** dikilir; böylece atış alanları üst üste binmez
ve kimse düşman üssünün dibine kule dikemez. Aynı kural bot'un ilerleyen kule zinciri için de geçerlidir: zincir
rakip çemberinin kenarında durur.

**Yapı sınırı**: ayakta **en fazla 10 kule** ve **en fazla 10 bina** (kışla / okçuluk / ahır / kuşatma; sancak sayılmaz),
ayrı ayrı sayılır ve HUD'da `🏰 3/10 🏠 1/10` olarak görünür. Sınır dolunca o türün inşa düğmesi kapanır; yer açmak için
yapıyı seçip ızgaradaki **🧨 Binayı yık / Kuleyi yık** düğmesine basarsın (yıkılan yapı enkazından odun düşer, sancak yıkılamaz).

**Nüfus sınırı**: bütün asker türlerinin toplamı en fazla **200** (mancınık dahil, kahraman hariç), işçiler ise
**toplam en fazla 100** (tür başına ayrı sınır yok). İşçiler birleştiği için sayım kademe toplamıdır (x3 madenci = 3
işçi). Sırada bekleyen emirler de sayılır. Asker sınırı dolunca o türün düğmesi kapanır, sıraya alınmaz ve **asker
çıkışı durur**: sırada bekleyen emir de asker ölüp yer açılana kadar bekler ("Asker sınırı dolu (200): üretim bekliyor"),
yer açılınca hemen çıkar. **İşçide
düğme kapanmaz**: 100 doluyken çıkan yeni işçi **en kalabalık türden bir kademe eksiltir** ve onun yerine kendi türünde
gelir (toplam 100'de kalır, dağılım bastığın türe kayar — "İşçi sınırı dolu: 1 madenci azaldı, yerine çiftçi geldi").
Aynı sınırlar rakip için de geçerlidir (rakip sınır dolunca yeni işçi basmaz).

Yapılar yalnızca odun ister: Kışla 60, Okçuluk 80, Ahır 100, Kuşatma 150, Kule **1000** (**2000 can**; askerlerin kuleye hasarı 0.4x, kahraman yapılara vuramaz).
Kule oku **hedefi takip eder ve mutlaka vurur** (kaçış, zıplama, vurulmazlık savuşturamaz); **askeri, işçiyi ve kahramanı tek atışta
öldürür**. Menzilde asker varsa **önce askere**, kahramana en son atar. Kuleleri mancınık, ordu (0.4x) ya da kahraman yıkar; kahraman kule menziline (9) girmemeli. Başlangıçta her tarafta
sancak, kışla ve üç hat kulesi vardır; diğerleri sancak menüsünden seçilip yeşil / kırmızı hayaletle kahramanın 14 birim çevresine dikilir.

**Sancak ve kuleler**: sancakların canı **10000**'dir. Bir tarafın en az bir kulesi ayaktayken (inşası sürse bile) sancağının
**canı azalmaz**: vuruş sancağa **iner** ama kalkana çarpar, hasar yazılmaz. Her vuruş kuleleri **ele verir**: o tarafın bütün
kuleleri haritada açılır, yerleri turuncu / altın halkalarla işaretlenir ve **minimapte kalıcı olarak görünür**. Kuleler düşünce
sancak can kaybetmeye başlar; **sancak yıkılınca oyun biter**: kırmızı sancak düşerse zafer, senin sancağın düşerse yenilgi.

## Birim üstünlükleri: anti sistemi

Askerler 100 can (at ve kalkan can bonusu yalnızca kahramanda: +50 / +30). Kalkan hızı %20 düşürür, **at %70 artırır**, kalkan önden gelen vuruşun %30'unu emer.
**Asker tipi savaşın kendisidir**: her türün bir **anti listesi** vardır ve antisi olduğu türü **tek vuruşta öldürür**
(`config.js` → `ANTI`):

| Saldıran | Tek attığı türler |
| --- | --- |
| **Kılıç** (yaya, ±kalkan) | Yaya mızrak, mızrak kalkan |
| **Mızrak** (yaya, ±kalkan) | **Bütün atlılar** (atlı okçu, mızraklı, kılıçlı, kalkanlıları dahil) |
| **Okçu** | Kalkansız yayalar: kılıçlı, mızraklı, okçu |
| **Atlı mızrak** (±kalkan) | Yaya kılıç sınıfı (kalkanlısı dahil) ve okçu — yaya mızrak hariç (o atlının antisidir) |
| **Atlı kılıç** (±kalkan) | Okçu ve atlı okçu |
| **Atlı okçu** | Kalkansızlar: kılıçlı, okçu, atlı mızrak — yaya mızrak ve atlı kılıç hariç (onlar atlı okçunun antisidir) |

- **Anti vuruşun gücü**: askere canının **1.5 katı** (kalkanın %30 emişini de deler, yine tek vuruşta ölür); kahramana sabit
  **150 hasar**: sv 1 kahraman (140 can) antisi olan **askere bile tek vuruşta** düşer; her seviye +10 can verdiği için sv 3'ten sonra
  iki vuruş gerekir. Vuran kahramansa seviye çarpanı (+%8 / sv) da biner. Dönerek vuruş (0.5x) ve alan etkileri (0.6x) anti hasarı aynı oranda ölçekler.
- Anti dışı eşleşmeler **1x**; yalnızca **ok zayıftır**: kalkanlıya 0.15x, atlıya 0.5x. Okçu dışındaki silahlar alan vuruşu yapar
  (kılıç 112°, mızrak 81°): yayın içindeki her antisi tek vuruşta ölür.
- Tablo **karşılıklı tek atma çifti** içermez: kim kimin antisiyse tek yönlüdür. Kalkanlı atlıları yalnızca mızrak durdurur, bedelleri de en yüksektir.
- **Her türü tek atanlar**: kılıçlı → okçu, atlı mızrak, atlı okçu · kılıç kalkan → atlı mızrak · mızraklı → kılıç, okçu · mızrak kalkan → kılıç ·
  okçu → okçu, atlı mızrak, atlı kılıç, atlı okçu · atlı okçu → mızrak, atlı kılıç · atlı mızrak → mızrak, atlı okçu · atlı kılıç → mızrak ·
  kalkanlı atlılar → yalnızca mızrak. Üretim düğmelerinin ipucu ve birim bilgi kartı bu iki listeyi gösterir.
- **Rakip anti basar**: her karar turunda senin en kalabalık türünün antisini seçme olasılığı kolayda %20, normalde %50, zorda %80;
  tutmazsa eskisi gibi tür dağılımını kopyalar. Kahramanların vuruşları da bu tabloya uyar: kılıçlı kahraman mızraklıları tek atar,
  okçular onu tek atar (sv 3'e kadar).

## Üst bant (HUD)

Sol tarafta **senin** bilgilerin: can, seviye, altın, odun / yiyecek, **işçilerin** (👷 toplam **0/100** · ardından
tür tür sayılar: ⛏ madenci · 🪓 oduncu · 🌾 çiftçi, kademeleri toplanarak) ve **ordun sınıf sınıf** (⚔ toplam **0/200** · 🛡 piyade · 🏹 okçu · 🐎 süvari · 🪨 mancınık),
ayakta kule / bina sayın ve sancağının canı. Sağ tarafta rakipten yalnızca **kule sayısı** ve **sancak canı** görünür
(saldırıya kalkışınca sancağının yanında ⚡ çıkar).

## Yapı seçimi ve toplu üretim

Kendi yapına **sol tık** onu seçer. **Çift tık** aynı türdeki **bütün** binalarını birden seçer (Age of tarzı):
seçili binaların hepsi altın halkayla işaretlenir, bilgi kartı "3 × Kışla · toplam sırada N emir" der ve soldaki
üretim düğmesi emirleri **en boş binaya** verir; Shift (5) / Ctrl (10) ile basınca emirler binalara dağılır ve
askerler paralel çıkar. Hiçbir şey seçili değilken düğme yine o türü basan en boş binayı bulur.

## Saldırı uyarısı

Kendi **sancağın** ya da bir **kulen** vuruş aldığında: ekranın kenarları **kısa süre kızarır** (1.1 sn), vurulan
yapının çevresinde dünyada kırmızı bir halka belirip söner ve **minimapte aynı noktada genişleyen kırmızı halkalar**
çıkar (1.6 sn). Aynı yapı için uyarı 1.5 saniyede bir tazelenir; mesaj barında "Sancağın saldırı altında!" /
"Kulen saldırı altında!" yazısı 4 saniyede birden sık tekrarlanmaz. Kuleler ayaktayken sancağa inen (hasarsız)
vuruşlar da uyarı verir.

## Can çubukları

Her birimin ve her yapının (bina, kule, sancak) üstünde **Age of tarzı can çubuğu** vardır: **arka plan kırmızı**,
kalan canı gösteren dolgu **yeşil**. Çubuk yalnızca **darbe alınca** görünür; canı tam olan birim ve binada hiç çıkmaz.
Sis altındaki düşman yapı ve birimlerinin çubuğu da gizlenir.

## Tarafsız kamplar

Haritanın **boş iki köşesinde** (senin ve botun üssünün olmadığı köşeler) birer **haydut kampı** vardır — toplam **2 kamp**
(900 can, çadırlı palisad modeli). Her kampın çevresinde **her türden birer muhafız** bekler: kılıçlı, mızraklı, okçu,
kalkanlı ve atlı. Muhafızlar **iki tarafa da düşmandır** ama kamplarından ayrılmaz: 12 birim çevresine gireni döver,
18 birimden fazla uzaklaşmazlar. Kamp **dakikada bir** eksik muhafızından birini doğurur.

**Akın**: kampın üstünde **geri sayım** görünür; kurulduktan (ya da yeniden kurulduktan) **1 dakika** sonra her türden
asker + **bir mancınık** çıkarıp en yakın tarafın **kulelerine** saldırır (kule kalmazsa öbür yapılara) ve bunu dakikada
bir tekrarlar. Köşelerden biri sana, öbürü bota yakın olduğu için her iki taraf da akın yer.

**Haydutlar**: araziye serpiştirilmiş, **yerinden kıpırdamayan** tarafsız askerler (başlangıçta 8, en çok 16).
Yollardan 22, üslerden 45 birim uzakta dururlar; yalnızca **9 birim yaklaşana** saldırır ve 11 birimden fazla
uzaklaşmazlar — akınlara katılmazlar. 45 saniyede bir araziye yenisi eklenir.

**Kampı yıkmak**: kamp yıkılınca yerinde **yıkıntısı** kalır ve üstündeki geri sayım yeniden kurulmaya kalan süreyi
gösterir — **5 dakika**. Yeniden kurulunca dalga geri sayımı baştan (60 sn) başlar: yani kampı yıkmak sana 5 dakika
rahatlık kazandırır, kamp geri geldiğinde 1 dakikan olur. Kamp yıkmak **150 exp** bırakır; muhafız ve akıncılar da
normal exp verir (yaya 10, atlı 24, mancınık 14). Minimapte kamplar yeşil (yıkıntı kahverengi) nokta olarak görünür.

## Ekonomi ve envanter

Üç kaynak envanterde birikir: **altın** (maden), **odun** (odunluk / ağaçlar), **yiyecek** (tarla).
Askerler altın + yiyecek, işçiler altın, binalar yalnızca odun. Her iki taraf 60 altın, 60 odun, 40 yiyecekle başlar.
Ordunun sürekli büyüyebilmesi için ekonomi cömerttir: bir altın ürünü **7 altın**, bir çalışma **1.0 sn** sürer ve
**ölen her asker 2 yiyecek** bırakır (kahramanların topladığı ganimet).

- **İşçi sayısı artmaz, üretim artar**: her türden yalnızca ilk işçi sahada kalır. Sonraki işçiler de kışladan çıkar, o işçiye
  yürür ve yanına varınca onunla **birleşir**; işçinin kademesi (x2, x3…) ve her çalışmada çıkardığı ürün sayısı artar.
  HUD ve bilgi kartı kademeyi gösterir; rakip de toplam kademeyi taklit eder.
- Ürün alma yarıçapı işçilerde 2.5 birim; kahramanlarda seviye başına +0.2 büyür (en çok 14). İşçiler yalnızca kendi kaynağında çalışır, hiç beklemez, birbirinin içinden geçer, aynı noktada üst üste çalışabilir (çalışma yerinde sınır yok), düşman yaklaşınca kaçar; ürün alınınca anında envantere girer.
- Kahramanın topladığı her şey (altın, odun, yiyecek, exp) **kahramanın üstünde "+N ◉ / 🪵 / 🌾 / exp" yazısı** olarak belirir.
- Kahraman kaynak düğümlerine vurarak ürün düşürür ve toplar. **Ölen asker yiyecek**, **yıkılan yapı odun** bırakır (kule 2, bina 3, sancak 6);
  bu ganimeti yalnızca kahramanlar (sen ve rakip kahraman) toplar, sancağa taşımak gerekmez.
- **Koyunlar** da tükenmez birer yiyecek düğümüdür: kahraman vurunca ölmezler, ürküp zıplar ve çevreye yiyecek düşer.
  Yiyecek yalnızca envantere girer; kahramanı iyileştirmez.
- **Haritanın ortasında**, iki ana kule arasında **bitişik üç tarafsız maden** (tek bir kaya kümesi hâlinde, ana yolun hemen yanında).
  İşçiler orada çalışmaz; yalnızca kahramanlar vurup altın çıkarır, seviye yükseldikçe vuruş başına daha çok altın alırlar.
- Kaynak noktaları tükenmez.

## Savaş sisi ve görüş

Harita başta karanlıktır. Kahraman (15), asker (10), işçi (8), sancak (18), kule (14) ve binalar (11) çevresini görür;
görülen alan kalıcı olarak keşfedilmiş sayılır (loş). Sisin içindeki düşman birimleri görünmez ve emir verilemez;
düşman yapıları bir kez görülünce haritada kalır. Minimap da aynı sisi gösterir.

## Rakip ve zorluk

- Kırmızı sancakta bir **rakip kahraman** (mızrak kalkan atlısı, sarı kafa): kaynak toplar, ganimet alır, keşfe çıkar, bina yerine
  gider ve **görüşüne giren düşman askerine saldırır** (alan vuruşu, asker hasarı); canı %35'in altına inince kaçar, ölürse 8 sn sonra doğar.
  Rakibin askerleri toplanma noktasına (sancağa en yakın kulenin önü) çıkar.
- Rakip **seni taklit eder**: her 3 saniyede işçi (türe göre), asker (canlı + sırada), bina (türe göre sayı) ve kule
  sayılarını okur; işçi, bina ve kulede aynısını, askerde **senin 2 katını** hedefler. Sen okçuluk kurarsan o da kurar, iki kışlan varsa iki kışla diker,
  asker türlerini %75 olasılıkla kopyalar. Binalarını kendi kahramanının yanına diker: kahraman uzaktaysa oraya yollanır.
  Bedava dalga yok; her şeyi topladığıyla kuyruğa koyar.
- **Kule kuralı**: sende ayakta kule varken rakip, canlı bir **mancınığı yoksa saldırıya kalkmaz**, saldırıdaysa kulelerine
  **çekilir**; savaş aletleri kurup mancınık için kaynak biriktirir (ordusu sana denkse başka asker basmaz). Askerleri kulelere
  hiç vurmaz, kule menzilinin 2.5 birim dışında kalır ve menzildeki düşmanı kovalamaz; mancınık varsa ordu onun yanında (4 birim)
  ilerler ve onu korur, kuleleri mancınık döver.
- Rakip **kule zinciriyle sana doğru ilerler**: taklit hedefleri tamamsa en ileri kulesinden sancağına doğru 16 birim adımla
  yeni kule diker (kahramanı yerine gider), sancağına 14 birim kalınca durur; senin kulelerinin menziline kule dikmez.
  Bunun için oduncu hedefine +3 ekler. Zincirdeki kuleleri kırmak için ordunu (kuleye 0.4x) yollamak gerekir.
- Rakip de sisle oynar: yalnızca **gördüğü** yapılara saldırır. Rakip kahraman 20. saniyeden sonra her 40 saniyede keşfe çıkar
  (kule yerleri, üssün binaları, sancak), gördüğünü orduya bildirir; ordu bilinen hedef yoksa hat kulesi yerlerine yürüyerek keşfeder.
- Rakip ordusu **en ileri kulesinin dibinde birikir** (sana en yakın kırmızı kule) ve saldırıya oradan çıkar; kule zinciri
  ilerledikçe toplanma noktası da öne kayar. Nokta senin kule menziline düşerse kulenin arkasına çekilir. sayısı senin orduna denk olmadan
  saldırmaz, denk olunca (en az 4) topluca saldırır (HUD'da ⚡). Saldırıdayken ordusu seninkinin altına düşünce, kalkışın
  %35'ine eriyince ya da karşısında kalabalık görünce (ordu merkezinin 18 birim çevresinde mavi savaşçılar kendi sayısının
  1.2 katını aşınca) kulelerine çekilir ve yeniden birikir.
- Zorluk (Kolay / Normal / Zor): rakibin altın çarpanı 0.5x / 1x / 2x (taklit payı `ENEMY_AI.extra` ile ayarlanabilir, varsayılan 0).
- Kırmızı sancak yıkılınca zafer; kendi sancağın düşerse kaybedersin (kuleler ayaktayken sancakların canı azalmaz).

## Dosyalar

| Dosya | Sorumluluk |
| --- | --- |
| `index.html`, `style.css` | Tam ekran düzen: sahne, üst HUD, Age of alt bandı, seçim ekranı |
| `game.js` | Giriş; `src/main.js`'i yükler |
| `src/config.js` | Tüm ayar sayıları (birimler, yapılar, maliyetler, üstünlük matrisi, görüş, sis, kamera) |
| `src/main.js` | Sahne, izometrik + omuz üstü kamera (V), sabit adımlı döngü, sis / görünürlük, kuleler, ganimet, yaşam döngüsü |
| `src/environment.js` | Çayır, hatlar, üsler, kaynak düğümleri, evler; ağaçlar InstancedMesh |
| `src/structures.js` | Yapılar: görünüm, kurma, yerleştirme denetimi, inşa, yıkım, sınıf toplanma bayrağı |
| `src/production.js` | Üretim kuyruğu: sıraya alma, iptal, ilerleme, çıkış |
| `src/fog.js` | Savaş sisi ızgarası ve karartma düzlemi |
| `src/minimap.js` | 2B baklava minimap ve tıklamaları |
| `src/characters.js` | Donanıma göre stat ve kutu rig, prosedürel animasyon, seçim halkası |
| `src/physics.js` | `vel` + `push` entegrasyonu, çarpışmalar (havada yok), engeller, sınır |
| `src/combat.js` | Saldırı zamanlaması, koni vuruşu, üstünlük çarpanı, kalkan, takipli oklar, kaynak düğümü vuruşu |
| `src/ai.js` | Asker beyni (emirli / bekleyen / rakip otonom), toplayıcı beyni |
| `src/economy.js` | Çalışma yerleri, ürünler, envanter, ganimet, bina kurma, rakip ekonomisi |
| `src/input.js` | Klavye / fare: hareket, nişan, seçim, fare kilidi ve omuz üstü kamera (updateTpsCamera) |
| `src/ui.js` | HUD, alt bant (komut ızgarası, bilgi kartı), seçim ekranı, mesajlar, ses |
| `server.mjs` | Yalnızca yerel bilgisayara hizmet veren statik sunucu |

Oyun dünyası tarayıcı konsolunda `__meadow` olarak erişilebilir; `__meadow.simulate(30)` oyunu
30 saniye ileri sarar (hata ayıklama için). Kayıt sistemi yoktur; sayfa yenilenince oyun sıfırlanır.
