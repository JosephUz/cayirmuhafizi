# Çayır Muhafızı

Three.js ile tarayıcıda çalışan, **Age of Empires 2 + DOTA** esintili, tam ekran izometrik kır savaşı.
`demo`daki dövüş hissi (iki hızlı fizik, koni içi vuruş, prosedürel animasyon) bu sahnenin üstüne
taşındı; üstüne Age of tarzı alt bant, üretim kuyruğu, savaş sisi,
2B minimap, yapı inşası, ordu emirleri, birim üstünlükleri, rakip kahraman, **takım oyunu** (1v1 … 5v5, botlarla),
**çevrim içi co-op** (oda koduyla en çok 5 insan, botlara karşı; sunucu otoriter) ve maç sonu **karne** eklendi.

## Başlatma

`Baslat.cmd` dosyasına çift tıklayın. Oyun tarayıcıda açılır; alt bandın sağındaki ⛶ ile tarayıcı tam ekranı.
Alternatif: bu klasörde `npm install` ve `npm start`, ardından http://127.0.0.1:5173.
Node.js gerekir. İlk kurulumdan sonra internet bağlantısı gerekmez.
Port değiştirmek için PowerShell'de `$env:PORT=5174; npm start`.

**Arkadaşlarla (co-op)**: aynı sunucu odaları da yürütür. Aynı ağdaki arkadaşlar için sunucuyu dışa aç:
`$env:HOST='0.0.0.0'; npm start` ve arkadaşlara `http://<senin-ip>:5173` ver. İnternetten oynamak için
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) ile
`cloudflared tunnel --url http://127.0.0.1:5173` (ya da kalıcı bir tünelle kendi alan adın); WebSocket tünelden geçer,
sayfa https ile açılınca istemci kendiliğinden wss kullanır. Aynı tarayıcıda iki sekme iki ayrı oyuncudur (kimlik sekmeye özeldir).

**Docker ile (compose)**: Node kurmadan, deploy edilmiş gibi çalıştırmak için `docker compose up -d --build`; oyun
http://localhost:5173 adresinde, dış ağa `0.0.0.0` ile açıktır. `docker compose logs -f` oda kayıtlarını izler,
`docker compose down` kapatır (SIGTERM ile yarım saniyede temiz kapanır). Port için `PORT=5174 docker compose up -d`.
İmaj `node:22-alpine` üstünde ~300 MB; kaynak değişince yalnızca `--build` yeter, bağımlılık katmanı önbellekten gelir.
Kalıcı Cloudflare Tunnel için `.env` dosyasına `TUNNEL_TOKEN=...` yaz ve `docker compose --profile tunnel up -d`:
`cloudflared` konteyneri oyunu sağlıklı görünce tünele bağlanır (Zero Trust panelinde tünelin hedefi `http://game:5173`).
Tünel rotası Zero Trust → Networks → Tunnels → tünel → **Published application routes**: alan adı, Path boş, Service `http://game:5173`.
Kök alan adı kullanılacaksa Cloudflare DNS sayfasındaki eski A / CNAME kaydı önce silinir; rota kaydedilince CNAME kendiliğinden oluşur.

## Ekranlar

Hesap yok. **Giriş**: ad (tarayıcıda hatırlanır) ve üç düğme: **Tek başına** (kurulum ekranı, sonra oyun), **Oda kur**
(kurulum ekranı, sonra lobi ve oda kodu) ve **Koda katıl**. `?oda=KOD` linkiyle gelen ad ekranından lobiye düşer.
**Kurulum**: kaça kaç (1v1 … 5v5) ve zorluk. **Lobi**: oda kodu, "Linki kopyala", mavi takımın koltukları (boş koltuklara
bot oturur), kırmızı takım tamamen bot; kaça kaç ve zorluğu **yalnızca kuran** değiştirir ve **Başlat**'a basar, kimse
"hazır" basmaz; 1v1 seçilirse kuran tek başına botlarla oynar. **Bitiş**: karne (bkz. Karne ve skor). **Kısayollar**
penceresi (F1, sağ alttaki ? ve giriş ekranındaki bağlantı) bütün tuşları ve kahramanın o anki yetenek setini yazar.
**Esc** oyun içinde menüyü açar (Devam, Kısayollar, Ses, Oyundan çık); tek başına oyunda menü oyunu durdurur, co-op'ta
durdurmaz (başkasının oyununu durduramazsın). Ekranlarda anlatım cümlesi yoktur: her şey kısayol penceresindedir.

## Çevrim içi co-op

Sunucu **otoriterdir**: her oda kendi dünyasını (`src/world.js`) saniyede 20 adım koşturur; istemciler yalnızca girdi ve
komut yollar, olay ve durum paketi alır. Aynı simülasyon kodu tek başına oyunda tarayıcıda, co-op'ta sunucuda koşar;
görseller `world.fx` kancalarından geçer (tarayıcıda mesh, sunucuda olay).

- **Girdi** saniyede 20 kez: dünya uzayında hareket yönü (kamera moduna göre istemci çözer), nişan noktası, tuş bayrakları.
  **Komutlar** (asker bas, iptal, bina dik, yık, toplanma alanı / saldırı hedefi, kahraman türü) anında gider, sunucuda
  yeniden denetlenir; istemci ücret ve yer denetimini yerelde yapar ki geri bildirim anında olsun.
- **Durum paketi** (ikili, 10 Hz): yalnızca **değişen** birimler (konum, yön, can, bayraklar, seviye), bütün yapılar
  (can, inşa, sıra), oklar ve bölgeler. Birimler 100 ms geriden ara değerle çizilir. Doğuş / silinme / efekt olayları JSON.
  5v5'te ölçülen: adım 0.8 ms, paket ortalama 1.8 KB, istemci başına ~17 KB/s.
- **Sis** her istemcide kendi takımının birimlerinden yerelde hesaplanır (sunucu da oyun kuralları için hesaplar).
- **Kopma**: kimlik sekmeye özel bir token'dır; sayfa yenilenince ya da bağlantı kopunca aynı koltuğa geri dönülür
  (üstte "Yeniden bağlanıyor" şeridi). 120 saniyede dönmeyenin kahramanını **bot devralır**; hiç insan kalmazsa oda kapanır.
  Odayı kuranın oyun içinde ayrıcalığı yoktur; kuran koparsa maç sürer.
- **Yenilgi kuralı co-op'ta**: sancağı düşen insan **elenir** (kahramanı bir daha doğmaz, ordusu yenilenmez, izlemeye devam
  eder); mavi takımdaki **bütün insanların** sancağı düşünce yenilgi. Zafer kuralı aynıdır (rakip sancaklarının hepsi).
- Kapsam dışı (bilerek): hesap, kalıcı istatistik, yabancılarla eşleştirme, PvP, izleyici. Yapı bunları engellemez.

## Karne ve skor

Her oyuncu (insan ve bot) için maç boyunca sayılır: toplanan kaynak (tür tür), harcanan değer, basılan / kaybedilen /
öldürülen birimler (tür tür), verilen / alınan hasar, kurulan / yıkılan / kaybedilen yapılar, kahraman seviyesi, exp,
öldürme, ölüm, asker sınırının dolu kaldığı süre. Ortak birim **değer** = birimin ya da yapının altın + odun + yiyecek bedeli.
**Skor** dört alandan toplanır (`config.js` → `SCORE`): **Askerî** (yok edilen birim + yıkılan yapı değeri, eksi kaybın
yarısı), **Ekonomi** (toplanan ile basılan değerin küçüğü; toplayıp harcamayana tam puan yok), **İnşa** (kurulan yapı değeri,
yıkılanlar yarım), **Kahraman** (seviye x 25 + kahraman öldürmesi x 30 − ölüm x 15). Oyun içinde sağ üstte **canlı sıralama**
(tıkla: katla). Bitişte dört sekme: **Özet** (sonuç, süre, alan şampiyonları), **Sıralama** (sütuna tıkla sırala, takım
toplamları), **Zaman çizelgesi** (10 saniyede bir örnek: skor / asker / kaynak / seviye / yapı eğrileri, oyuncu başına), **Ordu**
(tür başına basılan, kaybedilen, öldürülen; hasar). **Sonucu kopyala** sıralamayı metin olarak panoya alır (Discord'a yapıştır).

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
  **seviyesi kadar ok** atar (sv 1: 1 ok, sv 12: 12 ok; en çok 40 — oklar dağılmaz, hepsi aynı hedefe yan yana gider) ve **yay menzili de her 10 seviyede +%20** büyür (menzil tavanı 9'a kadar). Seviye başına **kaynak toplama yarıçapı da +0.2** büyür
  (2.5'ten başlar, en çok 14) ve kaynak vuruşu başına **seviyesi kadar ürün** düşer (sv 1: 1, sv 7: 7);
  aynısı kahramanın bir çalışma yerinde durarak ürettiğinde de geçerlidir. Vuruş anında beliren şeffaf yay, kahramanın **gerçek vuruş alanını** (menzil ve açı) birebir
  gösterir; kenarı altın çizgiyle vurgulanır ve seviye atladıkça büyür. Hız seviyeyle değişmez; bilgi kartı seviyeli hasarı (x çarpanıyla) yazar. Geniş alan vuran yüksek seviye kahraman kalabalığa karşı koyar: oyun strateji ile de, kahramanı geliştirerek
  de kazanılabilir. **Rakip kahraman da seni izler**: kendi öldürdüklerinden exp kazanır, geride kalırsa her karar turunda bir seviye alarak senin seviyene çıkar (bedelsiz).
- **Can yenilenmesi**: altınla can doldurma **yok**. Kahraman **kendi sancağının alanında** (sancak çemberi, 30 birim)
  durdukça saniyede **9 can** kazanır ve tepesinden **yeşil can baloncukları** çıkıp yükselerek söner; alandan çıkınca durur. **Başka hiçbir yol canı doldurmaz**: yiyecek
  yalnızca envantere girer, seviye atlamak azami canı artırır ama mevcut canı doldurmaz. Yeniden doğan kahraman dolu başlar.
  Aynı kural rakip kahraman için kendi sancağında geçerlidir.
- **Türe dönüş**: 10 asker türünden birine dönüş, bedeli tür tür sabittir (`config.js` → `HERO_UPGRADE.convertCost`) ama
  **kadroya göre oranlanır**: bedel **işçi sınırıyla** birlikte iner (`limits.workers / 100`), çünkü kalabalık oyunda herkesin
  işçi sınırı ve kazancı düşer. Tek başına oyunda tam bedel, 5v5'te işçi sınırı 30 olduğu için bedelin **%30'u** geçerlidir.
  Alt banttaki düğme o oyundaki gerçek bedeli yazar.

  | Tür | 1v1 | 2v2 | 3v3 | 4v4 | 5v5 |
  | --- | --- | --- | --- | --- | --- |
  | Kılıçlı | 750 | 550 | 400 | 300 | 250 |
  | Mızraklı | 1.500 | 1.150 | 750 | 550 | 450 |
  | Okçu, Kılıç Kalkan | 3.000 | 2.250 | 1.500 | 1.150 | 900 |
  | Mızrak Kalkan | 6.000 | 4.500 | 3.000 | 2.300 | 1.800 |
  | Atlı kılıç / mızrak / okçu | 30.000 | 22.500 | 15.000 | 11.400 | 9.000 |
  | Kalkanlı atlılar | 45.000 | 33.750 | 22.500 | 17.100 | 13.500 |

  Atlı olmak yine oyunun geç aşamasıdır: uzun süre işçi, maden ve ganimet biriktirmeyi gerektirir.
  **Seviyen ve exp'in korunur**
  (yeni türün taban canına seviyelerinin can artışı eklenir). Donanım (silah, kalkan, at) ve
  görünüm değişir, **seviye 1'e döner**. Yetenek seti silah x at ile değişir (bkz. Kahraman yetenek setleri); kalkan can (+30), üstünlük
  bonusu ve atılmada daha uzun vurulmazlık verir.
- Kahraman yerdeyken hiçbir komut verilemez: üretim, inşa, seçim, emir, mod değişimi kilitlenir.
- **Her ölümde yeniden doğuş uzar**: ilk ölümde 5 sn, sonraki her ölümde **+4 sn** (5 · 9 · 13 · 17 …), en çok **30 sn**.
  Rakip kahramanda da aynı kural işler, tabanı 8 sn'dir (8 · 12 · 16 …). Sayaç yeni oyunda sıfırlanır; ekranın ortasındaki geri sayım
  kalan süreyi gösterir.
- **İnşa kahramana bağlıdır**: her bina kahramanın 14 birim çevresine (yerleştirmede sarı halka) dikilir; uzağı kırmızı hayalet gösterir.

## Kahraman yetenek setleri

Asker türü seçimi kahramanın **sol ve sağ tık yeteneklerini** belirler. Set **silah x at** ile seçilir (6 set); kalkan her sette
atılma vurulmazlığını 0.5 sn'den 0.9 sn'ye uzatır. Sol tık her zaman silahın kendi vuruşudur (yakın dövüşte yay, okçuda ok) ve
setin ek etkisi bunun üstüne biner; sağ tık her zaman **ileri atılma**dır ve setin ikinci etkisi ona eşlik eder. Sayılar
`config.js` → `KIT` içinde; hasarlar vuruşun katı, alanlar seviyeyle büyür (yarıçaplar her 10 seviyede +%10, ok sayısı seviye kadar).

| Set | Sol tık: vuruş + … | Sağ tık: atılma + … |
| --- | --- | --- |
| **Kılıçlı** | **Çevre kesik**: kılıç çevrende 360° döner, menzilindeki (2.2, seviyeyle büyür) her düşman vurulur. **Basılı tut → Şok dalgası**: peş peşe **3 kez** 360° vuruş (menzilin 1x, 1.2x, 1.4x katı), her biri normal güçte, üç kat iter | **Kılıç fırtınası**: durduğun yerde 2 sn boyunca savrulan kılıçlar; 3.2 birim yarıçap, 0.25 sn'de bir vuruşun 0.6 katı |
| **Mızraklı** | **Koridor**: yay yok; mızrak önüne menzilin 2 katı (6.2; menzil tavanıyla en çok 9) uzunlukta, 1.8 birim genişlikte bir koridor açar, içindeki herkes vurulur. **Basılı tut → Şok dalgası**: peş peşe **3 koridor dalgası** (koridorun 1x, 1.4x, 1.8x katı), her biri normal güçte, en yakın hedefi sana çeker | **Kazık alanı**: hortum gibi durduğun yerde açılır, 2 sn boyunca yerden kazıklar yükselir; 3.2 birim yarıçap, 0.25 sn'de bir vuruşun 0.6 katı, dışa iter |
| **Okçu** | **Yelpaze**: seviyen kadar ok en çok 70° yelpaze açar (ok başına 8°), her ok kendi yönündeki düşmana kilitlenir. **Basılı tut → Hızlı yaylım**: normal sol tık atışını peş peşe **5 kez**, 0.12 sn arayla yapar (yarım şarj = yarı atış); yaylım sürerken nişan imleci izler, süpürebilirsin | **Ok yağmuru**: hortum gibi durduğun yerde açılır, 2 sn boyunca gökten ok yağar; 3.2 birim yarıçap, 0.25 sn'de bir vuruşun 0.6 katı |
| **Kılıçlı Atlı** | **Geniş kesik**: vuruş yayı 180°, itme iki kat | **Kılıç fırtınası + vakum**: yayanınkiyle aynı alan; tık anında alan yarıçapının 2.4 katı içindeki düşmanlar 0.6 sn boyunca merkeze çekilir |
| **Mızraklı Atlı** | **Hücum**: vururken yavaşlamazsın, hasar hızınla artar (tam koşuda 2x) | **Kazık alanı + vakum**: yayanınkiyle aynı alan; tık anında çevredeki düşmanlar merkeze çekilir |
| **Atlı Okçu** | **Koşarken atış**: atarken yavaşlamazsın, seviyenin iki katı ok dar (20°) yelpazede | **Ok yağmuru + vakum**: yayanınkiyle aynı alan; tık anında çevredeki düşmanlar merkeze çekilir |

**Şarjlı vuruş (sol tık basılı tutma)**: tık anında normal vuruş iner; fare 0.22 sn'den uzun basılı kalırsa kahramanın üstünde bir
çubuk 0.6 sn'de dolar (dolunca altın), bu sırada hız yarıya iner ve yüz imleci izler. Bırakınca silahın **normal vuruşu peş peşe** iner:
kılıç ve mızrakta **3 dalga** (0.14 sn arayla), yayda **5 yaylım** (0.12 sn arayla). Her dalga normal güçtedir (hasar çarpanı yok), ama
kılıçta çember, mızrakta koridor her dalgada büyür. Şarj yarımsa dalga sayısı da yarıdır (en az 1). Dalgalar sürerken **nişan imleci izler**,
yani vuruşları süpürebilirsin. Şarjlı vuruştan sonra bekleme 1.5 kat. Atlı setler silahının şarjlı vuruşunu aynen alır.
Sayılar `config.js` → `CHARGE`.

Anti kuralı bütün set etkilerinde geçerlidir: antisi olduğun türe çevre kesik, koridor, kılıç fırtınası, kazık alanı, ok yağmuru da tek atar (yarım güçlü etkiler
hasarı aynı oranda ölçekler, bkz. Birim üstünlükleri). Rakip kahraman sol tık etkilerini kullanır (sağ tık yetenekleri yalnızca oyuncuda).
Bilgi kartı seçili setin iki yeteneğini yazar; sancaktaki **Geliştir** menüsünde her türün düğmesi setini gösterir.

## Kamera: izometrik ↔ omuz üstü (V)

Oyun izometrik kamerayla başlar; **V** tuşu ya da minimap altındaki **🎥** düğmesi **omuz üstü (üçüncü şahıs) kameraya**
geçirir, tekrar basınca izometriğe döner. Omuz üstünde:

- Geçişte **fare kilitlenir** ve imleç kaybolur; fare hareketi bakışı döndürür (sağa-sola sınırsız, yukarı-aşağı sınırlı).
- **Tab fareyi serbest bırakır**: imleç görünür, kamera son açısında kalır ve tıklar **izometrikteki gibi** işler:
  imleçle yapı seç, bina dik, orta tıkla toplanma alanı kur, tıkladığın yöne vur, alt banttaki düğmelere bas. **Tekrar Tab** bakışı
  kaldığı açıdan kilitler. **Esc** de kilidi bırakır (oyunu duraklatmaz); duraklatma, oyun sonu ve yeni oyun ekranı kilidi kendiliğinden bırakır.
- **WASD kameraya göredir**: W baktığın yöne, S geri, A / D yana. Kahramanın yüzü hep kameranın baktığı yöne döner.
- **Kilitliyken nişan ekran ortasındaki artıdır**: sol tık artının zemine değdiği noktaya vuruş (okçuda oklar oraya gider), sağ tık o yöne atılma + set etkisi,
  inşa ve (orta tıkla) toplanma alanı da artının gösterdiği yere konur, kendi yapına nişan alıp tıklamak onu seçer. Serbest farede nişan imleçtir.
- Kamera kahramanın sağ omzunun üstünden bakar (sayılar `config.js` → `CAMERA.tps`: uzaklık 9, yükseklik 2.4, açı 62°, fare duyarlılığı).
  **Savaş sisi düzlemi bu modda yoktur**: görünürlük **görüş mesafesiyle** işler (`CAMERA.tps.viewDist`, 90 birim): düşman birim ve yapılar
  kahramana bu uzaklıktan yakınsa görünür, sahne pusu 30 birimde başlayıp 90'da tam kapanır, ufuk arka plana karışır. Sis ızgarası arka planda
  hesaplanmaya devam eder (minimap ve izometriğe dönüş için); askerlerin savaş kuralları değişmez. Zıplamada kamera yarı yarıya yükselir.
- Alt banttaki düğmeler tık sonrası odağı bırakır: Space zıplar, düğmeyi yeniden tetiklemez.

## Tuşlar

Üretim, inşa ve kahraman geliştirme **alt banttaki düğmelerle** yapılır; komut ızgarasında kısayol harfi yoktur. Klavyede
hareket (WASD / ok tuşları), Shift (koşu), Boşluk (zıplama), V (kamera), Tab (omuz üstünde fare kilidi), F1 (kısayollar) ve
Esc (menü / vazgeç) vardır. Bütün liste oyun içindeki **Kısayollar** penceresindedir.

## Tek mod: kahraman

Komutan (RTS) modu **kaldırıldı**: oyun hep kahraman modunda oynanır, kamerayı kahraman sürükler. Ordu tek tek
yönetilmez; **orta tıkla** dikilen tek **toplanma alanı** bütün ordu için hem varış noktası hem savaş bölgesidir.

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
| **Orta tık** | İmleç bir **düşmanın** (asker, kahraman, bina, kule, haydut kampı) üstündeyse bütün ordu **o hedefe saldırır**; boş yerdeyse oraya ordunun **toplanma alanını** diker. Tekrar orta tık hedefi / bayrağı değiştirir |
| Sağ tık | Açık modu kapat (birim emri yok) |

İnşa (kışla, okçuluk, ahır, kuşatma, kule) **yalnızca hiçbir şey seçili değilken** soldaki düğmelerle (sancak menüsünde bina
düğmesi yoktur), birim üretimi bina ızgarasındaki düğmelerle, toplanma alanı her an orta tıkla;
`Esc` açık modu kapat / duraklat. Kahramanın yakın vuruşları çevresindekileri biraz iter; asker ve kule vuruşları itmez.

Oyuncunun askerleri **kafasına göre hareket etmez**: durduğu yeri tutar, yalnızca yakına gelen düşmanla dövüşür,
emirle yürür. Rakibin askerleri kendiliğinden hatlardan ilerler.

**Görüş = savaş (senin askerin)**: askerin savaşa girme mesafesi **görüşüdür** (asker ve okçu 10 birim, mancınık silah
menzili olan 36; görüş hiçbir zaman silah menzilinin altında kalmaz). Görüşüne giren **her** düşmanla — asker, kahraman, işçi,
haydut, **bina, kule, sancak** — savaşır ve bu sırada bayrağa gitmeye uğraşmaz. Öncelik: kendisine vuran (22 birime kadar,
uzaktan atan okçu / mancınık dahil) → en yakın düşman birimi → kule → bina → sancak. Hedefi görüşünün **1.5 katına**
kadar kovalar; daha uzağa kaçarsa bırakır ve bayrağına döner (`ARMY.holdMult`). Hedef düşünce yeni hedef arar, yoksa bayrağa yürür.

**Bot askeri** emirle yürür: yolda 12 birim çevresinde düşman görürse durup saldırır, kendisine vuran olursa ona döner, dövüşe
başladığı noktadan 16 birimden fazla uzaklaşırsa hedefi bırakıp yoluna devam eder.

## Alt bant (Age of tarzı)

- **Sol**: komut ızgarası; seçili yapının menüsünde **✖ Kapat** düğmesi seçimi ve menüyü kapatır (Esc ile aynı).
  **Hiçbir şey seçili değilken bina dikme düğmeleri** (kışla, okçuluk, ahır, kule; sancağa tıklamak gerekmez),
  seçili yapının üretimi / inşa menüsü ve sancakta **Geliştir** düğmesi. Her düğmede maliyet.
- **Orta**: bilgi kartı. Hiçbir şey seçili değilken **kahramanın durumu** (tür, seviye, can, exp, vuruş / menzil / hız)
  ve altında **sancağının durumu** (can çubuğu, kaç kulenin koruduğu) bir arada görünür.
  Yapı: can, üretim sırası (ilk emirde ilerleme, tıklayınca iptal + para iadesi).
  Birim: can ve vuruş / menzil / hız. Çoklu seçim: tür sayıları.
- **Sağ**: tamamen 2B baklava minimap (zemin, ağaçlar, sis, yapılar, birimler, kamera çerçevesi).
  Altında Menü (Esc) / kamera (V) / Kısayollar (F1) / tam ekran düğmeleri.

## Üretim kuyruğu

Birimler anında çıkmaz: binanın sırasına alınır (bina başına en fazla **30 emir**), süre dolunca binanın yanında,
toplanma alanı varsa oraya yürüyerek çıkar. Kaliteli birim geç çıkar. Maliyet sıraya alınırken düşer.

**Toplanma alanı** tektir ve bütün ordu içindir: haritada boş bir yere **orta tıkla** (fare tekerleği), imlecin yerine sarı bayrak
dikilir. **Boştaki tüm askerler** (piyade, okçu, süvari, mancınık) oraya yürür, yeni çıkanlar da oraya gider; yolda ya da bayrakta
görüşüne düşman giren asker **savaşı yeğler**, bayrak yalnızca görecek düşmanı kalmayanın gideceği yerdir. Omuz üstü kamerada orta tık
artının gösterdiği yere diker. Sınıf sınıf bayrak yoktur: ordu bir bütün olarak yönetilir. **Kahraman toplanma alanına hiç gitmez**: onu sen yürütürsün.

**Saldırı hedefi**: orta tıkladığın yerde bir **düşman** varsa (asker, kahraman, işçi, haydut, **bina, kule, sancak, haydut kampı**;
imleç hedefin 1.8 birim yakınında olmalı) ordu oraya yürümekle yetinmez, **o hedefe kilitlenir**: bayrak hedefin üstüne **kırmızı**
dikilir ve bütün askerler görüşlerinde dövüşecek bir şey kalmayınca hedefe yürüyüp onu döver. Yolda karşılarına çıkan düşmanla yine
savaşırlar (görüş = savaş kuralı), hedef düşünce bayrağın yerinde tutunurlar ve yeni çıkan askerler de oraya akar. Sisin altındaki
düşman hedef seçilemez: önce görmen gerekir.

**Hedef önceliği** (her iki taraf): görünen düşman **birimleri** → **kuleler** → **binalar** → **sancak**. Sancak, o tarafın
ayakta kulesi kaldıkça can kaybetmez (vuruş yine iner ve kuleleri ele verir); diğer binalar sancağı korumaz.
Askerler kalkanlı sancağı ancak başka hedef yokken döver: önce kuleler, sonra binalar.
Üretim düğmesine **Shift** ile basınca 5, **Ctrl** ile 10 birim birden sıraya girer (kaynak ya da sıra bitince durur).

**Asker basımı kolaydır, ordu büyür**: maliyetler eski değerlerin ~%60'ı, üretim süreleri ~yarısı. Emir, bir bina seçili
değilse o türü basan binalardan **sırası en kısa olanına** gider; **aynı türden ikinci bir kışla / okçuluk / ahır kurmak
üretimi paralelleştirir** (toplu basımda emirler binalara dağılır). Mancınık da artık aynı
fiyat aralığındadır.

| Bina | Birim | Altın | Yiyecek | Süre |
| --- | --- | --- | --- | --- |
| Kışla | Kılıçlı · Kılıç Kalkan · Mızraklı · Mızrak Kalkan | 9 · 15 · 12 · 18 | 3 · 5 · 4 · 5 | 1 · 1.5 · 1.2 · 1.7 sn |
| Okçuluk | Okçu · Atlı Okçu | 15 · 27 | 4 · 7 | 1.3 · 2.3 sn |
| Ahır | Mızraklı Atlı · Kılıçlı Atlı · Kılıç Kalkan Atlısı · Mızrak Kalkan Atlısı | 24 · 24 · 33 · 33 | 7 · 7 · 9 · 9 | 2.2 · 2.2 · 2.8 · 2.8 sn |
| Sancak | Oduncu · Madenci · Çiftçi | 10 | 0 | 1 sn |
| Kuşatma (savaş aletleri) | Mancınık | 45 | **30 odun** (yiyecek yok) | 3.2 sn |

**Mancınık**: **uzaktan vurabilen tek birim**. Kule menzilinin (27) **9 birim dışından** — 36 menzille — **2.2 saniyede bir**
taş atar ve **öbür askerler gibi her hedefe saldırır** (birim, bina, kule); hedef seçerken kuleyi yeğler, yanındaki düşman
birimini de döver. **Vuruş gücü artık normaldir**: 40 hasar, canlı hedefe olduğu gibi iner (eski 0.35x dağılma çarpanı
kalktı, eski 220 hasar da yok). Kuleye hasarı **2.5 katına** çıkar (40 × 2.5 = **100**, yani 2000 canlı kule 20 taşta
düşer — tek mancınıkla ~44 sn, dört mancınıkla ~11 sn) ve askerlerin 0.4x kule çarpanı ona uygulanmaz. 40 canla askerlere karşı çok
dayanıksızdır, korunması gerekir. Rakip de sende görürse savaş aletleri kurup mancınık basar. **Asker mancınığının taşı hedefi takip etmez**: atış anındaki
konuma düz uçar, yer değiştiren birimi ıskalayabilir (binalar ve kuleler durduğu için onları hep bulur). Hedef takip eden
mermiler yalnızca **kahramanın** (okçu ve mancınık türlerinde) ve **kulelerin** atışlarıdır.

**Kendi birliklerin engel değildir**: kahramanın, askerlerin ve işçilerin durduğu yere de bina dikilebilir (kurulunca
kenara itilirler); yalnızca **düşman birimi**, başka yapı, çalışma yeri ve engeller yeri kapatır.

**Nereye dikilir**: kule dışındaki binalar kendi **sancağının çemberi** (sancağın çevresindeki 30 birimlik halka) içine ve
kahramanın 14 birim yakınına dikilir. **Kuleler** kendi çemberine bağlı değildir ama yalnızca **yollara**, başka kulelerden (kendi ya da rakip) en az
**54 birim** uzağa ve **rakibin sancak çemberinin (30 birim) dışına** dikilir; kimse düşman üssünün dibine kule dikemez.
Bu aralık **menzilin (27) tam iki katıdır**: hiçbir kulenin atış alanı bir başkasınınkiyle **çakışmaz**, kule yığmak yoktur,
her kule kendi bölgesini korur. İnşa hayaletindeki menzil halkası yer uygunsa yeşil, çakışma varsa kırmızı yanar.
Aynı kural bot'un ilerleyen kule zinciri için de geçerlidir (adımı bu aralıktan biraz büyüktür); zincir rakip çemberinin
kenarında durur. Oyunun her oyuncuya kurduğu **başlangıç kulesi** bu kuraldan muaftır.

**Yapı sınırı**: ayakta **en fazla 10 kule** ve **en fazla 10 bina** (kışla / okçuluk / ahır / kuşatma; sancak sayılmaz),
ayrı ayrı sayılır ve HUD'da `🏰 3/10 🏠 1/10` olarak görünür. Sınır dolunca o türün inşa düğmesi kapanır; yer açmak için
yapıyı seçip ızgaradaki **🧨 Binayı yık / Kuleyi yık** düğmesine basarsın (yıkılan yapı enkazından odun düşer, sancak yıkılamaz).

**Nüfus sınırı**: bütün asker türlerinin toplamı en fazla **200** (mancınık dahil, kahraman hariç), işçiler ise
**toplam en fazla 100** (tür başına ayrı sınır yok). İki sınır da takım oyununda oyuncu sayısına bölünür: asker 1v1 200 /
2v2 150 / 3v3 100 / 4v4 75 / 5v5 60, işçi 1v1 100 / 2v2 75 / 3v3 50 / 4v4 38 / 5v5 30 (`LIMITS.armyTotal`, `LIMITS.workersTotal`). İşçiler birleştiği için sayım kademe toplamıdır (x3 madenci = 3
işçi). **Asker sınırı üretimi engellemez (Age of tarzı)**: sınır doluyken de düğmeler açıktır, emir sıraya girer ve ücreti
düşer; yalnızca **çıkış** bekler ("Asker sınırı dolu (200): sıradakiler sahada yer açılınca çıkar"). Sahada bir asker ölür
ölmez sıradaki hemen çıkar. Sayım **sahadaki** askerlerdir; sırada bekleyenler nüfusa girmez ve HUD'da ⏳ ile ayrı görünür
(`⚔ 60/60 ⏳7`). **İşçide
düğme kapanmaz**: 100 doluyken çıkan yeni işçi **en kalabalık türden bir kademe eksiltir** ve onun yerine kendi türünde
gelir (toplam 100'de kalır, dağılım bastığın türe kayar — "İşçi sınırı dolu: 1 madenci azaldı, yerine çiftçi geldi").
Aynı sınırlar rakip için de geçerlidir (rakip sınır dolunca yeni işçi basmaz).

Yapılar yalnızca odun ister: Kışla 60, Okçuluk 80, Ahır 100, Kuşatma 150, Kule **1000** (**2000 can**; askerlerin kuleye hasarı 0.4x, kahraman yapılara vuramaz).
Kule oku **hedefi takip eder ve mutlaka vurur** (kaçış, zıplama, vurulmazlık savuşturamaz); **askeri, işçiyi ve kahramanı tek atışta
öldürür**. Menzilde asker varsa **önce askere**, kahramana en son atar.
**Ok menzil çemberini aşmaz**: yerde çizili çember kulenin gerçek erişimidir; hedef çemberden çıkarsa takipli ok sınırda yere
düşer. Çemberin dışında kalan hiçbir şey kuleden zarar görmez, yani menzili gözle ölçebilirsin. Kuleleri mancınık, ordu (0.4x) ya da kahraman yıkar; kahraman kule menziline (**27**) girmemeli. Başlangıçta her oyuncuda
sancak, kışla ve sancağın 14 birim önünde **tek kule** vardır (çemberin içinde, merkeze giden yolun üstünde); diğerleri sancak menüsünden seçilip yeşil / kırmızı hayaletle kahramanın 14 birim çevresine dikilir.

**Menzil tavanı**: mancınık dışında hiçbir birim **kule menzilinin üçte birinden** (27 / 3 = **9**) uzağa vuramaz —
kılıç 2.2, mızrak 3.1, **yay 9** ve kahramanın seviyeyle büyüyen menzili de bu tavanda durur (mızraklı kahramanın
koridoru dahil). Yani kuleyi **yalnızca mancınık** dışarıdan dövebilir; öbür herkes kulenin atış alanına girmek zorundadır.

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
ayakta kule / bina sayın ve sancağının canı (bir rakip saldırıya kalkışınca yanında ⚡); takım oyununda 🤝 müttefik sayısı ve
toplam askerleri. **Rakip hakkında HUD'da bilgi yok** (Age of gibi): rakiplerin durumu yalnızca sağ alttaki, haritanın üstündeki
**canlı skor sıralamasından** okunur. Reddedilen komutun ve dikilemeyen binanın **nedeni imlecin yanında** kısa bir yazıyla çıkar.

## Yapı seçimi ve toplu üretim

Kendi yapına **sol tık** onu seçer. **Çift tık** aynı türdeki **bütün** binalarını birden seçer (Age of tarzı):
seçili binaların hepsi altın halkayla işaretlenir, bilgi kartı "3 × Kışla · toplam sırada N emir" der ve soldaki
üretim düğmesi emirleri **en boş binaya** verir; Shift (5) / Ctrl (10) ile basınca emirler binalara dağılır ve
askerler paralel çıkar. Hiçbir şey seçili değilken düğme yine o türü basan en boş binayı bulur.

## Saldırı uyarısı

Kendi **sancağın** ya da bir **kulen** vuruş aldığında: ekranın kenarları **kısa süre kızarır** (1.1 sn), vurulan
yapının çevresinde dünyada kırmızı bir halka belirip söner ve **minimapte aynı noktada genişleyen kırmızı halkalar**
çıkar (1.6 sn). Aynı yapı için uyarı 1.5 saniyede bir tazelenir; uyarı sesi 4 saniyede birden sık çalmaz. Kuleler ayaktayken sancağa inen (hasarsız)
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
Askerler altın + yiyecek, işçiler altın, binalar yalnızca odun. Herkes **50 altın, 60 odun, 40 yiyecekle** başlar
(`ECONOMY.start`; deneme için yalnızca insanlara bol altın vermek istersen `ECONOMY.playerTestGold`, varsayılan kapalı).
Ordunun sürekli büyüyebilmesi için ekonomi cömerttir: bir altın ürünü **7 altın**, bir çalışma **1.0 sn** sürer ve
**ölen her asker 2 yiyecek** bırakır (kahramanların topladığı ganimet).

- **İşçi sayısı artmaz, üretim artar**: her türden yalnızca ilk işçi sahada kalır. Sonraki işçiler de kışladan çıkar, o işçiye
  yürür ve yanına varınca onunla **birleşir**; işçinin kademesi (x2, x3…) ve her çalışmada çıkardığı ürün sayısı artar.
  HUD ve bilgi kartı kademeyi gösterir; rakip de toplam kademeyi taklit eder.
- Ürün alma yarıçapı işçilerde 2.5 birim; kahramanlarda seviye başına +0.2 büyür (en çok 14). İşçiler yalnızca kendi kaynağında çalışır, hiç beklemez, birbirinin içinden geçer, aynı noktada üst üste çalışabilir (çalışma yerinde sınır yok), düşman yaklaşınca kaçar; ürün alınınca anında envantere girer.
- Kahramanın topladığı her şey (altın, odun, yiyecek, exp) **kahramanın üstünde "+N ◉ / 🪵 / 🌾 / exp" yazısı** olarak belirir.
- Kahraman kaynak düğümlerine vurarak ürün düşürür ve toplar. **Ölen asker yiyecek**, **yıkılan yapı odun** bırakır (kule 2, bina 3, sancak 6);
  bu ganimeti yalnızca kahramanlar (sen ve rakip kahraman) toplar, sancağa taşımak gerekmez. **Toplanmayan ganimet 5 sn sonra
  kaybolur**; exp küreleri ve işçinin çıkardığı ürünler de 5 sn'de (`ECONOMY.loot.ttl / xpTtl / ownedTtl`). Kaybolan eşya
  sahneden kalkar, geometri ve malzemesi bellekten silinir: yerde yüzlerce eşya birikmez.
  Yiyecek yalnızca envantere girer; kahramanı iyileştirmez.
- **Haritanın ortasında**, iki ana kule arasında **bitişik üç tarafsız maden** (tek bir kaya kümesi hâlinde, ana yolun hemen yanında).
  İşçiler orada çalışmaz; yalnızca kahramanlar vurup altın çıkarır, seviye yükseldikçe vuruş başına daha çok altın alırlar.
- Kaynak noktaları tükenmez.

## Savaş sisi ve görüş

Harita başta karanlıktır. Takımının her birimi ve yapısı görüş açar: kahraman (15), asker (10), işçi (8), sancak (18), **kule (27: menzilinin tıpatıp aynısı, gördüğü kadar vurur)** ve binalar (11);
görülen alan kalıcı olarak keşfedilmiş sayılır (loş). Sisin içindeki düşman birimleri görünmez ve emir verilemez;
düşman yapıları bir kez görülünce haritada kalır. Minimap da aynı sisi gösterir.

## Takım oyunu (1v1 … 5v5)

Başlangıç ekranında **Takımlar** seçilir: 1v1 (eski oyun) ya da 2v2 … 5v5. Sen her zaman **mavi** takımdasın; kalan
yuvalar iki takımda da **botlarla** dolar (yanında n-1 müttefik, karşında n rakip bot). Düşmanlık **takıma** göredir,
komuta ve kasa **sahibe**: her oyuncunun (sen ve her bot) kendi sancağı, üssü (tarla / maden / odunluk), kasası,
ordusu, sınırları ve kahramanı vardır.

- **Askerler sahibine aittir.** Toplanma bayrağın yalnızca **kendi** askerlerini yürütür; müttefik bot kendi
  askerine kendi emrini verir, kendi kasasıyla basar, kendi kahramanıyla haydut avlar ve kendi kulesini savunur
  (bkz. aşağıda "Rakip ve zorluk": aynı bot döngüsü iki takımda da çalışır, senin takımındaki botlar rakip takımı
  taklit eder). Sen yalnızca kendi yapını seçebilir ve yıkabilirsin.
- **Sahip rengi.** Gövde takım rengindedir (mavi / kırmızı); birimin ayağındaki halka ve yapının direğindeki bant
  **sahibinin** rengidir: sen altın, botlar kendi renginde (minimapte sancak çerçevesi ve kahraman noktası da öyle).
  HUD'da 🤝 müttefik sayısı ve askerleri; rakip tarafta kule toplamı ve ayakta sancak sayısı (⚑ 3/3).
- **Görüş takımın ortak malıdır**: müttefik birimin gördüğü yeri sen de görürsün. Rakip takım da yapılarını takımca hatırlar.
- **Kaynak sahibe özeldir**: işçi yalnızca sahibinin ürününü alır, kahraman kendi ürünü + ganimeti. Zorluk çarpanı
  yalnızca **rakip** takımın botlarına işler; müttefikler senin gibi 1x toplar.
- **Sınırlar oyuncu başınadır**: asker sınırı min(200, 600 / oyuncu sayısı) — 1v1'de 200, 2v2'de 150, 3v3'te 100,
  5v5'te 60; işçi 100, kule 10, bina 10 her oyuncuda ayrı.
- **Arena büyür**: yarı boy 120 + 25 × (n - 1) (1v1 240×240, 5v5 440×440). Üsler takımın köşesinde, hatta dik bir
  çizgi üzerinde 46 birim arayla dizilir; çapadaki üs (senin ve rakip takımın 0. yuvası) üç hattın başıdır, öbür üslerden
  haritanın ortasına birer yol çıkar; her üs sancağının 14 birim önünde **tek kuleyle** başlar; takımın üslerini
  bir **takım yolu** bağlar. Ağaç, çalı ve haydut sayısı alanla ölçeklenir; kamplar yine iki boş köşede.
- **Zafer** rakip takımın **bütün** sancakları yıkılınca (aradaki her sancak yalnızca ses verir); **yenilgi** mavi takımdaki
  **insanların hepsinin** sancağı düşünce (tek başına oyunda: senin sancağın; müttefik botlar ayakta olsa da). Sancağı düşen
  oyuncunun (insan ya da bot) kahramanı bir daha doğmaz, ordusu yenilenmez.

## Rakip ve zorluk

Aşağıdaki her şey **her bot** için (rakip ya da müttefik) kendi sancağı, kasası ve ordusuyla ayrı ayrı işler; taklit
edilen "sen", takım oyununda **rakip takımın toplamının takımdaki oyuncu sayısına bölümüdür**.

- Kırmızı sancakta bir **rakip kahraman** (mızrak kalkan atlısı, **kırmızı kafa**; senin takımının kahramanları sarı kafalıdır): kaynak toplar, ganimet alır, keşfe çıkar, bina yerine
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
- **Kule savunması**: rakibin bir **kulesi ya da sancağı** vurulunca, o yapının **70 birim** çevresindeki askerleri
  **ve kahramanı** savunmaya koşar; bu çağrı **saldırı düzenini bile keser** (yürüyen ordu geri döner). Savunma, son
  vuruştan **10 saniye** sonra biter: asker oradaki nöbetine, kahraman işine döner. Akın eden haydutlar da bu savunmayı
  tetikler.
- **Haydut avı**: rakip kahraman boşta kaldıkça (savunma ve inşa görevi önce gelir) çevrede dolaşıp **60 birim**
  içindeki en yakın **haydudu / kamp muhafızını** avlar; yakında haydut kalmayınca **120 birim** içindeki **haydut
  kampını yıkmaya** gider. Bir av 30 saniye (kampta 60 sn) sürer, arada 35 saniye işine döner; canı %35'in altına
  inince avı bırakır. Kamp 900 canlı olduğu için genelde birkaç sefer sürer.
- Rakip de sisle oynar: yalnızca **gördüğü** yapılara saldırır. Rakip kahraman 20. saniyeden sonra her 40 saniyede keşfe çıkar
  (kule yerleri, üssün binaları, sancak), gördüğünü orduya bildirir; ordu bilinen hedef yoksa rakip kule yerlerine yürüyerek keşfeder.
- Rakip ordusu **en ileri kulesinin dibinde birikir** (sana en yakın kırmızı kule) ve saldırıya oradan çıkar; kule zinciri
  ilerledikçe toplanma noktası da öne kayar. Nokta senin kule menziline düşerse kulenin arkasına çekilir. sayısı senin orduna denk olmadan
  saldırmaz, denk olunca (en az 4) topluca saldırır (HUD'da ⚡). Saldırıdayken ordusu seninkinin altına düşünce, kalkışın
  %35'ine eriyince ya da karşısında kalabalık görünce (ordu merkezinin 18 birim çevresinde mavi savaşçılar kendi sayısının
  1.2 katını aşınca) kulelerine çekilir ve yeniden birikir.
- Zorluk (Kolay / Normal / Zor): rakibin altın çarpanı 0.5x / 1x / 2x (taklit payı `ENEMY_AI.extra` ile ayarlanabilir, varsayılan 0).
- Rakip takımın bütün sancakları yıkılınca zafer; kendi sancağın düşerse kaybedersin (sahibinin kuleleri ayaktayken sancağın canı azalmaz).

## Performans (5v5)

Büyük takım oyunlarında yüzlerce birim aynı anda sahadadır; oyun şu yollarla akıcı kalır (ayarlar `config.js` → `PERF`):

- **Ekran dışı eleme**: ekranın zemin izdüşümünün (+8 birim pay) dışındaki birimler, eşyalar ve efektler çizilmez, canlandırılmaz
  ve matrisleri güncellenmez; ekran dışında parçacık ve halka hiç yaratılmaz (en çok 400 parçacık). Omuz üstü kamerada sınır
  görüş mesafesidir (90 birim).
- **Gölge kutusu** arenayı değil kameranın baktığı yerin çevresini kaplar (izometrikte 60, omuz üstünde 100 birim yarı boy,
  2048² harita): gölgeler daha keskin, ekran dışı birimler gölge geçişine girmez. Kutu ışık uzayında tam piksel adımlarıyla kayar.
- **Simülasyon**: birim çarpışmaları uzaysal ızgarayla (4 birimlik hücre) çözülür; engel ızgarası yalnızca yapı kurulup yıkılınca
  yeniden kurulur; askerin hedef araması önce uzaklık süzgecinden geçer, rakip kule menzili denetimi yalnızca en yakın adaylar
  için yapılır; bot askerinin boşta planı (mancınığa eşlik, yapı, keşif) 0.3 sn'de bir, toplayıcıların düşman taraması 0.1 sn'de bir yenilenir.
- **Dekor**: yol parçaları, tarla sapları, ağaçlar ve çalılar InstancedMesh; serbest ağaç sayısı azaltıldı (1v1 arenasında ~500),
  dekor evler ve koyunlar kaldırıldı; dekor matrisleri bir kez hesaplanır.
- **HUD** 0.12 sn'de bir yenilenir; minimap sis katmanı yalnızca sis yeniden hesaplanınca çizilir; ganimet 5 sn'de kaybolur.

## Dosyalar

Simülasyon ile görünüm ayrıdır: `src/world.js` ve ona bağlı modüller render'sız (Node'da da) koşar; görsel her şey
`world.fx` kancalarından geçer (`src/fx.js`). Tarayıcıda `src/view/` bu kancaları mesh'e çevirir, sunucuda
`src/net/netfx.js` olaya çevirir.

| Dosya | Sorumluluk |
| --- | --- |
| `index.html`, `style.css` | Tam ekran düzen: sahne, üst HUD, canlı skor, Age of alt bandı, ekranlar (giriş, kurulum, lobi, bitiş, kısayollar, menü) |
| `game.js` | Giriş; `src/main.js`'i yükler (import map: `three` → `/vendor/three.module.js`) |
| `src/config.js` | Tüm ayar sayıları (birimler, yapılar, maliyetler, üstünlük matrisi, görüş, sis, kamera, skor) |
| `src/world.js` | **Simülasyon**: dünya, oyun kurulumu (insanlar + botlar), sabit adım, kurallar (ölüm, yıkım, exp, zafer), komutlar (oyuncu adına) |
| `src/hero.js` | Kahraman kontrolü, simülasyon tarafı: çözülmüş girdiyi uygular (yerel ya da ağdan) |
| `src/stats.js` | Karne: sayaçlar, değer, skor, zaman çizelgesi, bitiş raporu |
| `src/fx.js` | Görsel kanca arayüzü (boş uygulama ve tamamlayıcı) |
| `src/main.js` | **İstemci**: sahne, kameralar (V), arayüz ve ekranlar, iki kip (yerel simülasyon / çevrim içi kopya), görünüm eşitleme, çizim döngüsü |
| `src/view/` | Görünümler: sahne fx (`scenefx.js`), yapı (`structview.js`), eşya / ok / bayrak (`itemview.js`), bölgeler (`zones.js`), parçacıklar (`effects.js`) |
| `src/net/protocol.js` | Ağ sözlüğü: mesaj ve olay adları, hızlar, oda kodu |
| `src/net/snapshot.js` | İkili durum paketi (kodla / çöz; yalnızca değişen birimler) |
| `src/net/netfx.js` | Sunucu fx'i: görsel istekleri olaya çevirir; tam durum olayları |
| `src/net/client.js` | Çevrim içi istemci: bağlantı, lobi, dünya kopyası, olaylar, ara değer, girdi gönderimi, geri bağlanma |
| `src/screens.js`, `src/report.js` | Ekran akışı (giriş / kurulum / lobi / menü / kısayollar) ve bitiş karnesi (sekmeler, grafik, kopyala) |
| `src/environment.js` | Arena verisi (tohumlu: sunucu ve istemci aynı araziyi kurar) ve dekor görünümü (InstancedMesh) |
| `src/players.js` | Oyuncular (insanlar + botlar): takım, sahip, kasa, bot durumu, sınırlar |
| `src/structures.js` | Yapılar (veri): kurma, yerleştirme denetimi, inşa, yıkım |
| `src/production.js` | Üretim kuyruğu: sıraya alma, iptal, ilerleme, çıkış |
| `src/fog.js` | Savaş sisi ızgarası (sunucu + istemci) ve karartma düzlemi (istemci) |
| `src/minimap.js` | 2B baklava minimap |
| `src/characters.js` | Donanıma göre stat, kutu rig, prosedürel animasyon; `addEntity` |
| `src/physics.js` | `vel` + `push` entegrasyonu, çarpışmalar, engeller, sınır |
| `src/combat.js` | Saldırı zamanlaması, vuruş çözümü, hasar (karne), oklar, çemberler, hortumlar (veri) |
| `src/abilities.js` | Kahraman yetenek setleri: yaylım, şarj, atılma alanları (veri) |
| `src/ai.js` | Asker beyni (emirli / bekleyen / bot otonom), toplayıcı beyni (bot kahramanları ve işçiler) |
| `src/economy.js` | Çalışma yerleri, eşyalar (veri), kasalar, ganimet, bina kurma, bot ekonomisi / saldırı / savunma |
| `src/input.js` | Klavye / fare (istemci): ham girdi, nişan, seçim, fare kilidi, omuz üstü kamera, girdi çözümü |
| `src/ui.js` | HUD, canlı skor, alt bant (komut ızgarası, bilgi kartı), ses. **Metin mesaj barı yoktur** |
| `Dockerfile`, `compose.yaml`, `.dockerignore` | Konteyner: tek imaj (statik + WebSocket), sağlık denetimi, isteğe bağlı `tunnel` profili (cloudflared) |
| `server.mjs`, `server/rooms.mjs` | Tek süreç: statik dosyalar + WebSocket odaları (lobi, otoriter simülasyon, durum paketi, geri bağlanma, bot devralma) |

Oyun dünyası tarayıcı konsolunda `__meadow` olarak erişilebilir; tek başına oyunda `__meadow.simulate(30)` oyunu
30 saniye ileri sarar (hata ayıklama için). Sunucuda `/health` oda ve bağlantı sayısını verir. Kayıt sistemi yoktur.
