# Çayır Muhafızı

Three.js ile tarayıcıda çalışan, **Age of Empires 2 + DOTA** esintili, tam ekran izometrik kır savaşı.
Dövüş hissi (iki hızlı fizik, koni içi vuruş, prosedürel animasyon) üstüne Age of tarzı alt bant, üretim kuyruğu,
savaş sisi, 2B minimap, yapı inşası, ordu emirleri, birim üstünlükleri, rakip kahraman, **takım oyunu** (1v1 … 5v5,
botlarla), **çevrim içi co-op ve PvP** (oda koduyla takım başı en çok 5 insan; boş koltuklarda bot; sunucu otoriter)
ve maç sonu **karne**.

**Oyna**: https://cayirmuhafizi.josephuz.com · **Kaynak**: https://github.com/JosephUz/cayirmuhafizi

## Başlatma

```
git clone https://github.com/JosephUz/cayirmuhafizi.git
cd cayirmuhafizi
```

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
**Önbellek**: sunucu bütün oyun dosyalarını `no-store` ile verir, çünkü tek bir sürüm vardır ve güncelleme anında
geçmelidir. Cloudflare'ın **Browser Cache TTL** ayarı (varsayılan 4 saat) bunu ezebiliyordu; `no-store` ile artık
`cf-cache-status: BYPASS` döner. Yine de eski bir kopya takılı kalırsa **Ctrl+Shift+R** (Mac'te Cmd+Shift+R) ya da
Cloudflare panelinde Caching > Purge Everything. `/health` yanıtındaki `surum` alanı ayakta olan yapının damgasıdır.

Kalıcı Cloudflare Tunnel için `.env.example` dosyasını `.env` olarak kopyalayıp `TUNNEL_TOKEN=...` yaz ve `docker compose --profile tunnel up -d`:
`cloudflared` konteyneri oyunu sağlıklı görünce tünele bağlanır (Zero Trust panelinde tünelin hedefi `http://game:5173`).
Tünel rotası Zero Trust → Networks → Tunnels → tünel → **Published application routes**: alan adı, Path boş, Service `http://game:5173`.
Kök alan adı kullanılacaksa Cloudflare DNS sayfasındaki eski A / CNAME kaydı önce silinir; rota kaydedilince CNAME kendiliğinden oluşur.

## Telefon ve Android

**Dokunmatik** (telefon, tablet, uygulama; masaüstünde `?touch`): dokunmatik ekran algılanınca açılır, ekran yataydır. Sol yarıda **joystick** (sonuna kadar itmek koşu); sağ altta **SALDIR** (izometrikte en yakın düşmana kendiliğinden nişan alır, basılı tutunca güçlü vuruş), **ATIL** (hep gidiş yönüne; duruyorsan baktığın yöne), **ZIPLA**, **ORDU** (toplanma alanı kahramana), ZIPLA'nın üstünde **⚒** (alt bandı çekmece olarak açar; yapı seçilince kendiliğinden açılır, açıkken sahanın sağ altındaki **✕** kapatır). Sahaya kısa dokunuş kendi yapını seçer; basılı tutmak orduyu oraya (düşmansa ona) yollar. Sağ üstte **🎥** izometrik ↔ omuz üstü (omuz üstünde sağ yarıda parmak kaydırmak bakış, nişan artı), **☰** menü. İnşa: binayı seç, sahaya dokun (hayalet yeri ve hatayı gösterir), aynı yere tekrar dokun: dikilir; ⚒ vazgeçer. Telefonda kadraj yakın, grafik düşük başlar; bellek için kenar yumuşatma kapalı, piksel oranı 1 ve tek başına oyunda nüfus yarıdır (`LIMITS_LIGHT`: harita toplamı 300 asker / 150 işçi). Görüntü belleği dolup WebGL düşerse oyun durur, "toparlanıyor" şeridi çıkar, bağlam dönünce sürer; dönmezse "Yeniden yükle". Kod: `src/touch.js`, `src/input.js` (attachTouch), `src/platform.js`. Test: `node tests/touch-smoke.mjs` (telefon taklidi, `GAME_URL`).

**Telefonda üst kısım** (oda kodu tarayıcı çubuğunun / çentiğin altında kalmasın): üç ayrı parça birlikte çalışır. **1)** Pencereler (`.overlay`) kartı `place-items:safe center` ile ortalar ve kart `max-height` ile kabın içine tam sığar: asıl hata buydu — 5v5 lobi kartı yatay telefonda kaptan uzundu (844x390'da 397px / 390px), `center` taşmayı kartın **üstünden** çıkarıyor ve oraya kaydırılamıyordu, oda kodu kartın en üstünde olduğu için okunmuyordu. **2)** Üstten konumlanan her şeye (HUD, giriş üst şeridi, kart kapları, skor, kopma şeridi) `--mg-top` = `env(safe-area-inset-top)` eklenir: sayfa `viewport-fit=cover` ile açıldığı için içerik ekranın en tepesinden başlar, çentik / durum çubuğu payı verilmezse altında kalır. **3)** `src/gorunur-alan.js` oyun kökünü `visualViewport`'un bıraktığı dikdörtgene kilitler (`--vv-h` / `--vv-top`, style.css → `html.vv`, `vh` yerine `--mg-h`): görünür alanın **üste kaydığı** durumlar (klavye açılması, iki parmakla yakınlaştırma, iOS Safari'nin `overflow:hidden`a rağmen sayfayı kaydırması) için. Kilit **yalnız dokunmatikte** açılır; masaüstünde devreye girmez. Sahne zaten pencereyi değil **kabı** (`#mg-view`) doldurduğu için (`ResizeObserver`) kadraj kök kilitlenince kendiliğinden uyar. Doğrulama: `npm run test:mobil` (`npm test` içinde de var) — çentik payı tarayıcıya gerçekten verilir (CDP `Emulation.setSafeAreaInsetsOverride`) ve görüntü alanı gerçekten kısaltılır; ana ekran + **5v5 oda kurulmuş lobi** ölçülür, görüntüler `artifacts/mobil-*.png`.

**Çok oyunculu anahtarı**: `src/config.js` → `ONLINE = { web, app }`: tarayıcıda (`web`) ve Android uygulamasında (`app`) oda kur / odaya katıl açık mı. Uygulamada kapalı: sunucuya hiç bağlanılmaz, oda düğmelerinde **YAKINDA** yazar, tek başına oyun aynen oynanır. Tarayıcıda `?app` ile uygulama kipi denenir.

**Android APK (Android Studio gerekmez)**: JDK 21 ve Android SDK komut satırı araçları `%USERPROFILE%\android` altında taşınabilir kurulu (başka yerdeyse `JAVA_HOME` / `ANDROID_HOME`). `npm run apk` oyun dosyalarını `dist/`e toplar, Capacitor ile `android/` projesine kopyalar, Gradle ile derler: telefona kurulacak imzalı **`apk/CayirMuhafizi.apk`**, Play Store için `apk/CayirMuhafizi.aab`, incelemek için `apk/CayirMuhafizi-debug.apk`. USB hata ayıklama açık telefona doğrudan kurmak için `npm run apk -- --install`. Uygulama (`com.josephuz.cayirmuhafizi`) oyunu kendi içinden açar (internetsiz oynanır), yatay ve tam ekrandır, Android geri tuşu menü / geri olur. Yayın anahtarı `android/*-release.jks`, şifresi `android/keystore.properties` (git'e girmez; **yedeklenmeli**). Simge ve açılış görseli `node scripts/icons.mjs`; Play Store görselleri `store/`.

## Ekranlar

Hesap yok. **Giriş**: ad (tarayıcıda hatırlanır) ve üç düğme: **Tek başına** (kurulum ekranı, sonra oyun), **Oda kur**
(kurulum ekranı, sonra lobi ve oda kodu) ve **Odaya katıl** (tıklayınca oda kodu satırı açılır). `?oda=KOD` linkiyle gelen ad ekranından lobiye düşer.
**Kurulum**: kaça kaç (1v1 … 5v5) ve zorluk. **Lobi**: oda kodu, "Linki kopyala", iki takımın koltukları (boş koltuklara
bot oturur). Gelen oyuncu önce seçili büyüklükteki **boş koltuğa** oturur (önce mavi, sonra kırmızı; 1v1 odaya gelen
kırmızıya geçer, oda 1v1 kalır); iki takım da doluysa oda bir büyür. **Karşı takımdaki bir bot koltuğuna tıklayan oraya
geçer**; kuran oyuncuları **sürükleyip bırakır** (bkz. PvP). Kaça kaç ve zorluğu **yalnızca kuran** değiştirir ve **Başlat**'a basar, kimse
"hazır" basmaz; 1v1 seçilirse kuran tek başına botlarla oynar. **Bitiş**: karne (bkz. Karne ve skor). **Kontroller**
penceresi (F1, sağ alttaki ? ve giriş ekranındaki düğme) bütün tuşları ve kahramanın o anki yetenek setini yazar.
Ekranlarda anlatım cümlesi yoktur: her şey o pencerededir.

### STANDART üst araç çubuğu ve duraklatma menüsü

Bütün JosephUz oyunlarında aynı — yazılar ve sıra birebir budur, oyunlar arasında değişmez:

- **Giriş ekranı, sağ üst, tek satır**: `← josephuz.com` · `Ses: açık/kapalı` · `Müzik: açık/kapalı` · `Kontroller F1`.
  Eski adlar ("Kısayollar", "Nasıl oynanır") bu çubukta kullanılmaz. Dar ekranda `F1` tuş etiketi düşer, 480 px'in
  altında çubuk adın **altına** iner; sıra ve yazılar aynı kalır.
- **Esc menüsü**: `DEVAM ET →` · `Kontroller F1` · `Ses: …` · `Müzik: …` (altında müzik sesi sürgüsü) ·
  `Grafik: …` (oyuna özgü ek, standart sıranın ardında) · `Ana menü` / çevrim içinde `Odadan çık` ·
  `josephuz.com'a dön`. Pencere düğme sütunu kadar dar; alçak ekranda (yatay telefon) başlık düşer ve dokunma
  hedefleri 36 px'e iner ki kart kaydırmaya düşmeden sığsın.
- Çubuktaki ve menüdeki **Ses** / **Müzik** düğmeleri aynı durumu gösterir (`screens.js` → `sesYaz` / `muzikYaz`
  ikisine birden yazar) ve birbirinden bağımsızdır: `cm.sound` efektleri, `cm.muzik` müziği tutar.
- Test: `node tests/standart-cubuk.mjs` (`GAME_URL`, `PLAYWRIGHT_MODULE`) — üç ekran ölçüsünde sıra, yazılar,
  taşma ve menü kartının sığması ölçülür; görüntüler `artifacts/cubuk-*.png`.

**Esc** oyun içinde menüyü açar; tek başına oyunda menü oyunu durdurur, co-op'ta durdurmaz (başkasının oyununu
durduramazsın).

## Müzik

Üç parça, hepsi **bizim bestemiz** (enstrüman örnekleri VSCO 2 Community Edition, CC0; `muzik/LISANS.txt`), 128 kbps
mp3, dosya başına ~2 MB:

| Dosya | Parça | Nerede |
| --- | --- | --- |
| `muzik/cayir-2-cayirda-sabah.mp3` | Çayırda Sabah | **sakin**: giriş, kurulum, lobi, bitiş karnesi (tek parça, kendi kendine döner) |
| `muzik/cayir-1-kahramansiz-savas.mp3` | Kahramansız Savaş Olmaz | **maç**: ana tema |
| `muzik/cayir-3-sancak-dusmeden.mp3` | Sancak Düşmeden | **maç**: çatışma; ana temayla sırayla çalar · **doruk**: tek başına döner |

Üç sahne vardır: **sakin**, **maç** ve **doruk**. Doruk, oyunun kendi yenilgi koşuludur — maç sancak düşünce bittiği
için (`world.js` `onStructureDestroyed`) taraflardan birinin sancağı eriyorsa maç bıçak sırtındadır: o anda sıra
beklenmeden "Sancak Düşmeden"e geçilir ve tehlike geçene kadar orada kalınır. Giriş ve çıkış eşikleri ayrıdır
(**can %50'nin altına inince girilir, %65'in üstüne çıkınca çıkılır**, `main.js` `muzikSahnesi`): can eşiğin iki
yanında gezinirken müzik sürekli geçiş yapmaz. Zaten o parça çalıyorsa geçişte kesinti olmaz, yalnız kendi kendine
dönmeye başlar.

Çalar `src/muzik.js`'tedir ve `<audio>` kullanır (Web Audio yalnızca efekt "ping"leri ile aşağıdaki iOS kısıtı
içindir). Sahne her karede dünyanın durumundan okunur, aynı sahne verilince hiçbir şey
olmaz — ekran geçişlerini tek tek kancalamaya gerek yoktur. Sahne değişiminde ve parça bitmeden **1,8 sn çapraz
geçiş** yapılır, araya sessizlik girmez. Dosyalar gerektiğinde iner: menüde yalnız sakin parça, maç parçaları maç
başlarken. Yollar **görelidir** (`muzik/...`), bu yüzden aynı dosyalar Capacitor'ın `https://localhost/` kökünde de
çalar ve bir sonraki APK'ya kendiliğinden girer (`scripts/build-web.mjs` `dist/muzik/`e kopyalar).

Ses düzeyi efektlerin altındadır (**varsayılan %35**). Açık / kapalı iki yerdedir — giriş ekranının üst çubuğunda ve
Esc menüsünde; ses düzeyi sürgüsü yalnız Esc menüsündedir. İkisi de `localStorage`'da saklanır (`cm.muzik`,
`cm.muzik.ses`) ve efekt sesinden (`cm.sound`) bağımsızdır; sürgü **sıfıra** çekilebilir ve sıfır da saklanır
(yenilemeden sonra varsayılana dönmez). Tarayıcının otomatik oynatma kuralı gereği müzik **ilk dokunuş / tuştan
sonra** başlar; sekme gizlenince durur, dönünce sürer. İlk dokunuş yalnız tarayıcı `NotAllowedError` ile
engellerse geri alınır — `play()` bir `pause()` ile kesilince gelen `AbortError`'da müzik susup kalmaz.

**iOS Safari'de `audio.volume` salt okunurdur**: yazma sessizce yutulur, öğe hep tam sesle çalar. Orada ses düzeyi
sürgüsü ve çapraz geçiş işlemez, müzik efektlerin üstüne çıkardı. Bu yüzden ilk öğe kurulurken `volume`'un gerçekten
yazılabildiği ölçülür (`muzik.js` `yolSec`) ve yazılamıyorsa her öğe kendi Web Audio **`GainNode`**'undan geçirilir —
düzey oradan verilir. `durum().yol` hangi yolun seçildiğini (`oge` / `web`), `durum().duzey` de duyulan düzeyi söyler.
Web Audio'nun da olmadığı çok eski bir tarayıcıda öğe yoluna düşülür: müzik tam sesle çalar (bilinen kısıt).

**Müziğin hiç kurulmadığı yerler**: gösteri kipleri (`?gosteri=...` — klibin müziğini video betiği ekler) ve otomatik
tarayıcılar (`navigator.webdriver`: dumanı testleri 6 MB ses indirmesin). `?muzik=0` elle kapatır, `?muzik=1` otomatik
tarayıcıda açar (müziği ölçen test bunu kullanır; gösteriyi açamaz). Kapalıyken hiç `<audio>` öğesi yaratılmaz.
Sunucu ses dosyalarını bir hafta önbelleğe verir ve `Range` isteklerini yanıtlar (tarayıcı inmemiş bir yere sarabilsin).
Test: `node tests/muzik-smoke.mjs` (`GAME_URL`, `PLAYWRIGHT_MODULE`; `--mute-audio` ile koşar).

## Gösteri kipi (içerik klipleri)

`https://cayirmuhafizi.josephuz.com/?gosteri=1` **kendi kendine oynayan** bir maç açar: menü atlanır, hiç insan oyuncu yoktur, iki tarafı da mevcut bot yapay zekâsı yönetir. İki tarafa da başta bol kaynak ve hazır birlik verilir (birlikler iki üssün arasındaki cepheye dizilir), oyun **iki kat hızda** koşar; ilk saniyelerde ekranda çatışma olur. Kamera en kalabalık çatışmayı (düşmanı dibinde olan birimlerin ağırlık merkezini) yumuşak geçişle takip eder, kadraj biraz daha yakındır. **Arayüz gizlidir** (alt bant, minimap, üst sayaçlar, skor); yalnız oyun dünyası ve köşede küçük oyun adı görünür. Ölçüm olayı gitmez, sunucuya bağlanılmaz, Esc menüsü açılmaz; girdisiz döner, maç biterse birkaç saniye sonra yenisi başlar. Uygulamada (`isApp`) **açılmaz**, normal oyun davranışı hiç değişmez.

Gösteriye özgü üç kural (yalnızca `world.gosteri` açıkken): botlar hep saldırıdadır (çekilme yok), rakip kule menzilinden kaçınma kapalıdır — yoksa iki ordu da kulelerin çemberi önünde mancınık bekleyip yığılıyor, dakikalarca dövüş olmuyordu — ve `GOSTERI.bulusma` saniyede bir iki ordu da ağırlık merkezlerinin ortasına yürütülür ki birbirlerini ıskalamasınlar. Ayarlar `src/config.js` → `GOSTERI`, kod `src/gosteri.js`. Test: `node tests/gosteri-smoke.mjs` (`GAME_URL`, `PLAYWRIGHT_MODULE`). İçerik Üretici bu adresi `ajanlar/testci/hedefler.json` → `cayirmuhafizi.icerik` üzerinden kullanır.

### Kahramanların gücü (`?gosteri=kahraman`)

`https://cayirmuhafizi.josephuz.com/?gosteri=kahraman` maç değil, **sahnelenmiş** ve ~12 saniyede bir tekrarlanan tek bir gösteridir. Ortada **500 düşman** durur: hepsi seviye 1, **kalkansız kılıçlı** ve tur başında **beyinsizdir** (`brain = null`), yani kıpırdamaz, saldırmaz, kahraman gelmeden dağılmazlar. **Atlı Okçu** kahraman (seviye 85) kalabalığın kenarından koşar, **zıplar** (oyunda Boşluk; tepede ikinci zıplamayla kalabalığın üstünden tam ortaya süzülür), inişin son metresinde **sağ tık** atar (atılma + vakumlu **ok yağmuru**: iç halka merkeze çekilir ve yağmurun altında erir) ve ikinci zıplamadan sonra sol tıkı **havada** basılı tutar — şarj (`CHARGE.delay` + `full` = 0.82 sn) yere değerken dolduğu için **iner inmez** yayın şarjlı vuruşu çıkar: 5 atışlık **hızlı yaylım** (`CHARGE.bow`), atlı okçuda atış başına 80 ok. Nişan yaylım boyunca 120° süpürüldüğü için oklar çevreyi yelpaze gibi tarar.

Bu çevrim bir turda **dört kez** döner: her seferinde kahraman kalabalığın o anki **en sık** noktasına zıplar, yani yerde oyalanmaz. **İlk yaylımdan sonra kalabalığın beyni açılır** ve askerler kahramana koşup saldırır; beyin, kahramandan dışa doğru 1.6 saniyede büyüyen bir yarıçapla dalga dalga açılır (hem yük yayılır hem "uyanma dalgası" gibi görünür). Her asker hazır bir `attack` emri taşır, yani `ai.js`in pahalı hedef arama dalına hiç girilmez. Kahramanın canı her karede doldurulur: askerler ona gerçekten vurur ama "DÜŞTÜN!" ekranı içerik kurallarında yasaktır. Tur sonunda kalabalıktan ayakta **1-5 birim** kalır. Kamera **3B'dir** (izometrik değil): zıplamada kahramanı yakından izler, inişte biraz geri çekilip yaylımı ve yığını kadraja alır, yavaşça yörüngede döner; ağır çekim turda yalnız bir kez, ilk yaylımda ve kısadır. Ekranın orta yatay bandında oyundaki tuşları birebir söyleyen büyük bir yazı durur. Her turda geliş yönü, süpürme açısı ve kamera açısı değişir.

Hasar hesabı oyunun kendi mekaniğidir: Atlı Okçu kılıçlının **antisidir** (`ANTI.table.horsebow`), anti vuruş askere canının `ANTI.soldierMult` (0.34) katını verir ve bu **seviyeden bağımsızdır** — tek ok 34, ok yağmurunun her vuruşu (alan çarpanı 0.6) 20.4 hasar verir, yani yağmur seviye 1 kılıçlıyı 5. vuruşunda (1.0 sn) düşürür, alan 2 sn yaşar. Seviye 85 alanın büyüklüğü (yağmur 5.8, vakum 13.8 birim) ve ok sayısı (80) için seçilmiştir.

Kalabalık **1000 değil 500**: askerler artık koşup öldüğü için maliyet hareket eden birim sayısıyla büyüyor. Ölçüm (1280x720, d3d11): 1000'de ortalama 32 fps ve 20 fps'e kadar dalışlar, 750'de 50/29, 600'de 54/29, **500'de 57-59 ortalama ve en kötü yarım saniye 44** — takılmasız tek ayar budur, üstelik kalabalığı tamamen temizliyor. Ek olarak **yalnız bu sahnede**: grafik kalitesi orta (asker gölgesi yok), kadraj elemesi odaktan 54 birim, birim sadeleştirmesi 13 birim (normalde `PERF.lodDist` 42) ve uzak birimde göz de çizilmez (`setLodGoz`). Dokunmatikte kalabalık 220'ye düşer ve kalite düşüktür: içerik kaydı masaüstünde yapılır, telefonda sahne yalnız çökmeden açılsın yeter. Ayarlar `src/config.js` → `GOSTERI_KAHRAMAN`, kod `src/gosteri-kahraman.js`. Test: `node tests/gosteri-kahraman-smoke.mjs` (`GAME_URL`, `PLAYWRIGHT_MODULE`); zıplama / ok yağmuru / yaylım ekran görüntülerini `artifacts/` altına yazar, ortalama **ve en kötü yarım saniyelik** kare hızını ölçüp basar. `?gosteri=1` ve normal oyun bu sahneden etkilenmez.

### İki ordu (`?gosteri=savas`)

`https://cayirmuhafizi.josephuz.com/?gosteri=savas` da maç değil, **sahnelenmiş** ve ~15 saniyede bir tekrarlanan tek bir gösteridir: **1000'er kişilik iki ordu** haritanın iki ucundan birbirine hücum eder, tam birleşecekleri anda iki **Kılıçlı Atlı** kahraman kendi ordusunun içinden zıplayıp atılarak öne fırlar ve ortada peş peşe saldırı vurur. Kamera oyunun kendi 45°'lik izometrik açısıyla ama **geniş** bakar (dikey yarı kadraj 40 birim: 50 sütunluk, 90 birimlik cephe ekranın dikeyinde baştan başa taşar); kahraman düellosunda 30'a yaklaşır, sonra geri açılır. Odak hep iki ordunun (düelloda iki kahramanın) **ortasıdır**, yani dikey kesimde çarpışma noktası merkezde kalır.

Tur altı evredir: **hazir** (ordular karşılıklı dizili) → **hucum** (iki ordu 16.5 birim/sn kapatır, ~3.3 sn) → **ziplama** (cepheler 22 birime yaklaşınca kahramanlar zıplar, tepede bir daha zıplar ve rakibine **atılır**: kılıç fırtınası + vakum, kısa ağır çekim) → **dovus** (ortada `GOSTERI_SAVAS.betik` sırasıyla iki kılıç vuruşu, bir şarjlı **şok dalgası**, yeni bir atılma, iki vuruş daha, bir dalga daha; şok dalgasının son dalgası çevredeki askerleri üç kat iter) → **savas** (kamera geri çekilir, cephe dolar) → **bitis** (sahne sıfırlanır; her turda diziliş, yan kayma ve boylar değişir). Sayfa açılışından ~4.3 sn sonra cepheler birleşir, ~4.8 sn'de kahramanlar zıplar, ~5.4 sn'de atılırlar: 25 saniyelik bir klipte **en az bir** tam hücum + kahraman çarpışması olur.

**1000'er birim nasıl 60 fps koşuyor?** İki yerden. (1) **Çizim**: askerlerin oyundaki normal görünümü (asker başına ~15 mesh) hiç kurulmaz — `e.view` null kalır ve `main.js` o birimleri atlar; ordular taraf başına **tek bir InstancedMesh** ile çizilir (`src/view/ordu.js`), yani 2000 asker toplam **2 çizim çağrısıdır**. (2) **Simülasyon**: askerlerin `brain`i yoktur, yani `ai.js` hiç koşmaz; hedef arama ızgaralıdır ve her karede ordunun yalnız dörtte biri yeni hedef arar, vuruş çözümü de `combat.js`in sahayı tarayan `resolveSwing`i yerine doğrudan hedefe yazılır. Ölçüm (1280x720, d3d11): **60.0 fps ortalama, en kötü yarım saniye 58.8 fps**, ~490 çizim çağrısı. Ölen asker cesedi gömülünce (1.72 sn) ordusunun gerisinde **kendi sütununda** yeniden doğar: cephe incelmez ve varlık sayısı tur boyunca sabit kalır (2002), yani hiçbir karede yüzlerce görünüm kurulup yıkılmaz.

Kahramanlar ise **oyunun kendi sistemleridir**: girdileri `hero.js` `applyHeroInput`tan geçer; zıplama, havada ikinci zıplama, sağ tık atılması, kılıç fırtınası, vakum ve şarjlı şok dalgası oyundakinin birebir aynısıdır. Seviye 50'de kılıç vuruşu 360° ve 6.6 birimdir (`LEVEL.maxReachMult` tavanı). Canları her karede doldurulur ("DÜŞTÜN!" ekranı içerik kurallarında yasak). Yalnız bu sahnede: grafik kalitesi **düşük** (gölge yok — bu genişlikte kadrajda gölge haritası sahanın ancak yarısını kapsar ve yarısı gölgeli yarısı gölgesiz görünürdü), sahne pusu kamera uzaklığına göre açılır, askerler 1.5 kat, kahramanlar 2 kat çizilir (`characters.js` → `viewOlcek`) ve miğferler taraf rengindedir — tepeden bakışta askerin görünen yüzeyi neredeyse yalnız miğferin üstüdür. Dokunmatikte ordular 220'şer kişidir: içerik kaydı masaüstünde yapılır, telefonda sahne yalnız çökmeden açılsın yeter. Ayarlar `src/config.js` → `GOSTERI_SAVAS`, kod `src/gosteri-savas.js` ve `src/view/ordu.js`. Test: `node tests/gosteri-savas-smoke.mjs` (`GAME_URL`, `PLAYWRIGHT_MODULE`); hücum / zıplama / atılma / çarpışma ve telefon ekran görüntülerini `artifacts/` altına yazar, ortalama **ve en kötü yarım saniyelik** kare hızını ölçüp basar. `?gosteri=1`, `?gosteri=kahraman` ve normal oyun bu sahneden etkilenmez.

### Otopilot (`?otopilot=1`)

`https://cayirmuhafizi.josephuz.com/?otopilot=1` üç gösteri sahnesinden farklıdır: bu bir gösteri değil, **oyunun kendisidir**. Maç normal kurallarla kurulur ve bir **insan koltuğu** vardır — ama o koltuğun kahramanını da bir bot oynar. Müzik videolarının (JOS-902) orta bölümü bu kiple çekiliyor: videoda "gerçek bir oyuncunun oynadığı maç" görünsün isteniyor.

Kahraman **girdiyle** oynanır: `src/otopilot.js` her karede oyuncunun girdisini (`hero.js` → `createHeroInput`) doldurur — hareket yönü, koşu, nişan noktası, sol tık, **basılı tutulan şarjlı vuruş**, sağ tık atılma, zıplama. Simülasyon tarafında hiçbir ayrıcalığı yoktur: menzil, bekleme ve şarj süreleri oyuncununkiyle birebir aynıdır. Karar sırası da bir oyuncunun yaptığına yakındır: canı `OTOPILOT.kac` oranının altına düşünce sancağına çekilip iyileşir, görüşünde düşman varsa dövüşür (kalabalıkta şarjlı vuruş, 5-16 birim arası hedefe atılma, aralıklarla zıplama), sahada çatışma varsa oraya yürür, yerdeki ganimeti toplar, ordusu `orduAsgari`ye ulaşmadıysa üssünde **kaynak çıkarır** (oyunun kendi kuralı: çalışma yerinde hareketsiz duran kahraman ürün çıkarır). Duvara / ağaca takılırsa yana kaçar, ölünce oyunun kendi süresiyle doğup devam eder. Kasayı, işçiyi ve orduyu ise **bot komutan** sürer (`economy.js` → `updateBots`, `p.otopilot`), yani arkada gerçek bir maç akar.

Maç **"çatışma başlangıcı"ndan** açılır: bütün oyunculara **eşit olarak** dolu kasa, kurulu okçuluk + ahır, cephe hattına dizilmiş 6 kişilik bir bölük ve **seviye 12** kahraman verilir. Hile değildir (herkes aynısını alır, kurallar değişmez); video ekonomi kurulmasını beklemeden muharebeyle başlasın diyedir. Bir ödün var: bot komutan binayı kahramanın yanına diktirmek için ona şantiye görevi verir, otopilot bu görevi siler — yani otopilot koltuğu maç içinde **kule dikmez** (rakip bot kahramanlar diker) ve kuşatma gerektiğinde o turda atölyeye sıra gelmez. Kahramanın videoyu şantiye gezerek geçirmesindense bu yeğlendi; asker üretimi bundan etkilenmez.

Kamera **normal oyun kamerasıdır** (izometrik, kahramanı izler; kadraj 17 yerine `OTOPILOT.kadraj` = 15). **Arayüz gizlenmez** — gösteri kiplerinin aksine HUD, alt bant, minimap ve skor normal oyundaki gibi durur, çünkü bu gerçekten oynanan bir maçtır. Menü, lobi, Kontroller perdesi ve sonuç ekranı hiç açılmaz; maç bitince **başka takım boyu (yani başka harita) ve başka kahraman türüyle** yenisi başlar. Savaş sisi gösteri kiplerindeki gibi kapalıdır. Ölçüm olayı gitmez, sunucuya bağlanılmaz, uygulamada (`isApp`) **açılmaz**. Ayarlar `src/config.js` → `OTOPILOT`, kod `src/otopilot.js`. Test: `node tests/otopilot-smoke.mjs` (`GAME_URL`, `PLAYWRIGHT_MODULE`). Gösteri kipleri ve normal oyun bu kipten etkilenmez; `?gosteri=1` ile birlikte verilirse gösteri kazanır.

## Testler

`npm test` önce tarayıcısız birim testlerini (`tests/*.test.mjs`, şu an görünür alan kilidi), sonra tarayıcı testlerini sırayla koşturur: gösteri kipi, kahramanların gücü sahnesi, iki ordu sahnesi, otopilot, dokunmatik, telefonda üst alan (`tests/mobil-ust-alan.mjs`), oyun içi müzik (`tests/muzik-smoke.mjs`), standart üst araç çubuğu (`tests/standart-cubuk.mjs`). Betik (`scripts/test.mjs`) **kendi kendine yeter**: oyun sunucusunu boş bir portta açar, Playwright'ı bulur (önce `PLAYWRIGHT_MODULE`, sonra bu depodaki kurulum, sonra komşu depolardaki tarayıcısı inmiş kurulum) ve bitince sunucuyu kapatır — elle kurulum gerekmez. Playwright bu depoya bilerek kurulu değildir (oyun paketine girmesin diye); hiç bulunamazsa betik ne yapılacağını yazıp düşer. Tek bir testi koşturmak için `GAME_URL` ve `PLAYWRIGHT_MODULE` verip `node tests/<ad>.mjs` yeter. Kare hızı eşikleri donanıma bağlı olduğu için `FPS_ESIK` (ortalama) ve `FPS_DIP_ESIK` (en kötü yarım saniye) ile indirilebilir.

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
- **Akıcılık**: çizim saati paket varışına değil, yumuşatılmış bir sunucu saati farkına bakar (`NET.clockSmooth`);
  paket geç gelince birimler donup sıçramaz.
- **Kendi kahramanın beklemez (ileri kayma)**: başkaları 100 ms geriden ara değerle çizilir. Senin kahramanının
  çizim konumuna, **yalnızca yerel girdiden** üretilmiş yumuşak bir kayma eklenir (`NET.leadSmooth`, `NET.leadMax`):
  yürürken kayma hız x interpDelay'e oturur, yani ara değerin gecikmesini kapatır; tuşu bırakınca sıfırlanır.
  Kayma paketlerle **hiç konuşmaz**, bu yüzden paket başına düzeltme zonklaması yoktur. Sunucu yine tek yetkilidir;
  duvara dayanınca kahraman en çok `leadMax` kadar içeri taşmış görünür.
  Node'da gerçek istemci kodu 60 Hz koşturulup dönüşümlü A/B ile ölçülen (yerel sunucu, 1v1, 10 tur):

  | Ölçü | İleri kayma açık | Kapalı (düz ara değer) |
  | --- | --- | --- |
  | Tuştan harekete tepki (ortanca) | 0 ms | 92 ms |
  | Hız dalgalanması (ortanca, düşük = düzgün) | 0.010 | 0.015 |
  | Hız dalgalanması (en kötü tur) | 0.075 | 0.354 |

  `NET.predict` false yapılırsa kayma kapanır ve herkes gibi düz ara değerle çizilir.
- **Sis** her istemcide kendi takımının birimlerinden yerelde hesaplanır (sunucu da oyun kuralları için hesaplar).
- **Kopma ve ayrılma**: kimlik sekmeye özel bir token'dır; sayfa yenilenince ya da bağlantı kopunca aynı koltuğa geri
  dönülür (üstte "Yeniden bağlanıyor" şeridi). **Bot devralmaz ve koltuk süresiz tutulur**: ayrılanın kahramanı durur,
  askerleri ve binaları sahada kalır (düşman gelirse savaşırlar, ölürler, binaları yıkılır, sıradaki üretim çıkar) ama
  **yeni emir almazlar**. Oyuncu aynı kodla dönerse bıraktığı yerden devam eder; skor tablosunda o sırada çevrim dışı
  görünür. Oda ancak bağlı kimse kalmayınca kapanır. Odayı kuranın oyun içinde ayrıcalığı yoktur; kuran koparsa maç sürer.
- **Yenilgi kuralı co-op'ta**: sancağı düşen insan **elenir** (kahramanı bir daha doğmaz, ordusu yenilenmez, izlemeye devam
  eder); takımdaki **bütün insanların** sancağı düşünce yenilgi. Zafer kuralı aynıdır (rakip sancaklarının hepsi).
- **Çevrim içi sayısı**: siteyi açan her sekme (giriş ekranı ve tek başına oyun dahil) boşta bir bağlantı tutar; giriş
  ekranının sağ altında "● N çevrim içi" yazar (`S2C.ONLINE`, değişince en çok 2 sn'de bir). Boşta bağlantı 20 sn'de bir
  ping atar (Cloudflare sessiz soketi ~100 sn'de keser). `/health`: `online` açık sekme, `inRoom` bir odada oturan sekme.
  Oda kur / katıl aynı bağlantıyı kullanır (önce ad yenilenir).
- Kapsam dışı (bilerek): hesap, kalıcı istatistik, yabancılarla eşleştirme, izleyici. Yapı bunları engellemez.

## PvP (insanlar iki takımda)

Co-op ile aynı oda ve aynı sunucu; tek fark insanların **iki takıma** dağılması. Lobide karşı takımdaki bir bot koltuğuna
tıklayan o takıma geçer (`C2S.TEAM`, yalnızca boş koltuk varsa). **Kuran sürükle-bırakla** düzenler (`C2S.MOVE`):
öbür takımdaki bir oyuncunun üstüne bırakırsa ikisi yer değiştirir (takımlar doluyken, örneğin 5v5'te, tek yol budur),
bot koltuğuna bırakırsa oyuncu oraya geçer. Takım başı en çok 5 insan; kalan koltukları iki tarafta da botlar doldurur
(1v1 saf PvP, 2v2'de insan + bot karşısında insan + bot gibi karışık maçlar olur). Kaça kaç en kalabalık takımın insan
sayısından küçük seçilemez.

- **Her şey kendi takımının gözünden** (`world.side`): kırmızıda oynayan için sis kırmızı birimlerden açılır, kendi yapıları
  baştan bilinir, mavinin yapıları görülünce bilinir (`structures.js knownBy`); minimap, HUD sayımları, kamp akını
  uyarısı ("→ takımına"), kahraman kafası (takımın sarı, rakip kırmızı) ve orta tık (E) hedef seçimi de öyle. Gövde renkleri
  takımın gerçek rengidir (kırmızı takım kırmızı). Kamera çevrilmez: kırmızı üs ekranın sağ üstündedir.
- **Zafer ve yenilgi takıma göre** (`players.js teamDefeated`): insanlı takım insanlarının sancakları, insansız takım bütün
  sancakları yıkılınca yenilir. Karne kazanan takımı (`outcome.winner`) taşır, herkese kendi takımına göre ZAFER / YENİLGİ der.
- **Zorluk** yalnızca **insansız takımın** botlarına işler (co-op'ta rakip takım). İki takımda da insan varsa herkes 1x
  toplar ve lobide zorluk kapanır.
- Sonraki adım: sunucu her takıma yalnızca **gördüğünü** gönderecek (şu an bütün harita gider, sisi istemci çizer; konsoldan
  bakan rakibi görebilir). Bu aynı zamanda paket boyunu küçültecek.

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
  **Tavan 30.000 altındır** (kalkanlı atlılar, tek başına oyunda).
  Alt banttaki düğme o oyundaki gerçek bedeli yazar.

  | Tür | 1v1 | 2v2 | 3v3 | 4v4 | 5v5 |
  | --- | --- | --- | --- | --- | --- |
  | Kılıçlı | 500 | 400 | 250 | 200 | 150 |
  | Mızraklı | 1.000 | 750 | 500 | 400 | 300 |
  | Okçu, Kılıç Kalkan | 2.000 | 1.500 | 1.000 | 750 | 600 |
  | Mızrak Kalkan | 4.000 | 3.000 | 2.000 | 1.500 | 1.200 |
  | Atlı kılıç / mızrak / okçu | 20.000 | 15.000 | 10.000 | 7.600 | 6.000 |
  | Kalkanlı atlılar (tavan) | 30.000 | 22.500 | 15.000 | 11.400 | 9.000 |

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
Esc (menü / vazgeç) vardır. Bütün liste oyun içindeki **Kontroller** penceresindedir.

## Tek mod: kahraman

Komutan (RTS) modu **kaldırıldı**: oyun hep kahraman modunda oynanır, kamerayı kahraman sürükler. Ordu tek tek
yönetilmez; **orta tıkla** dikilen tek **toplanma alanı** bütün ordu için hem varış noktası hem savaş bölgesidir.

| Girdi | Etki |
| --- | --- |
| `WASD` / yön tuşları | Hareket (ekrana göre) |
| `Shift` | Koşu |
| `Boşluk` | Zıplama; havadayken hiçbir şeye takılmazsın, yakın vuruşlar ıskalar, oklar altından geçer. **Havadayken bir kez daha basarsan ikinci zıplama**: yere değmeden daha yükseğe çıkarsın (tepe 1.3 yerine ~2.5 birim). Yere değince hak yenilenir |
| Sol tık | Kendi yapına gelirse **seçer** (çift tık: o türdeki tüm binalar); inşa modunda yapıyı **diker**; yoksa **tıkladığın yöne vuruş**. Kahraman kendiliğinden vurmaz: her vuruş bir sol tıktır ve nişan tıklandığı noktada kilitlenir |
| Sol tık | **Vuruş + set etkisi**: silahın kendi vuruşunun (yakın dövüşte yay, okçuda ok) üstüne kahramanın **yetenek setine** özel ek etki (bkz. Kahraman yetenek setleri). Kahraman kendiliğinden vurmaz: her vuruş bir sol tıktır |
| Sağ tık | **İleri atılma + set etkisi**: imlece doğru fırlarsın. **Atılma mesafesi** başlangıçta **4.8 birim**, **seviye başına +0.12** (en çok 12); atılırken 0.5 sn vurulmazsın (kalkanlı setlerde 0.9 sn). Atılmaya silahına göre durduğun yerde 2 sn süren alan etkisi eşlik eder: kılıç fırtınası, kazık alanı ya da ok yağmuru; atlı setlerde alan açılırken **vakum** çevredeki düşmanları merkeze çeker. İki kullanım arası **1.4 sn** |
| Maden / ağaç / tarlaya vur | Kaynak düşer; üstünden geçince **doğrudan envantere** girer (ok da işler) |

**Yapı ve ordu komutası** (kahraman modunda, alt banttan):

| Girdi | Etki |
| --- | --- |
| Sol tık | Kendi yapını seç (üretim / menü); boşluğa tıklayınca seçim kalkar |
| Çift tık | Aynı türdeki **bütün** binaları seç: üretim emirleri aralarında paylaştırılır |
| **Orta tık** *veya* **E** | İmleç bir **düşmanın** (asker, kahraman, bina, kule, haydut kampı) üstündeyse bütün ordu **o hedefe saldırır**; boş yerdeyse oraya ordunun **toplanma alanını** diker. Tekrar basmak hedefi / bayrağı değiştirir. **E**, orta tuşu olmayan donanım (Mac dizüstü izleme yüzeyi, tek tuşlu fare) için birebir aynı emri verir |
| Sağ tık | Açık modu kapat (birim emri yok) |

İnşa (kışla, okçuluk, ahır, kuşatma, kule) **yalnızca hiçbir şey seçili değilken** soldaki düğmelerle (sancak menüsünde bina
düğmesi yoktur), birim üretimi bina ızgarasındaki düğmelerle, toplanma alanı her an orta tıkla;
`Esc` açık modu kapat / duraklat. Kahramanın yakın vuruşları çevresindekileri biraz iter; asker ve kule vuruşları itmez.

Oyuncunun askerleri **kafasına göre hareket etmez**: durduğu yeri tutar, yalnızca yakına gelen düşmanla dövüşür,
emirle yürür. Rakibin askerleri kendiliğinden hatlardan ilerler.

**Görüş = savaş (senin askerin)**: askerin savaşa girme mesafesi **görüşüdür** (asker ve okçu 10 birim, mancınık silah
menzili olan 36; görüş hiçbir zaman silah menzilinin altında kalmaz). Görüşüne giren **her** düşmanla — asker, kahraman, işçi,
haydut, **bina, kule, sancak** — savaşır ve bu sırada bayrağa gitmeye uğraşmaz. Öncelik: kendisine vuran ya da alarmla gelen saldıran (40 birime kadar,
uzaktan atan okçu / mancınık dahil; bkz. Alarm) → en yakın düşman birimi → kule → bina → sancak. Hedefi görüşünün **1.5 katına**
kadar kovalar; daha uzağa kaçarsa bırakır ve bayrağına döner (`ARMY.holdMult`). Hedef düşünce yeni hedef arar, yoksa bayrağa yürür.

**Bot askeri** emirle yürür: yolda 12 birim çevresinde düşman görürse durup saldırır, kendisine vuran olursa ona döner, dövüşe
başladığı noktadan 16 birimden fazla uzaklaşırsa hedefi bırakıp yoluna devam eder (saldırana karşılık verirken sınır 40 birimdir).

**Alarm (senin ve botların askeri için aynı kural)**: boş bekleyen asker yok (`src/alarm.js`, `ARMY.alarm`).
- **Asker vurulursa** 14 birim çevresindeki aynı takımdan askerler saldırana döner.
- **Kule vurulursa** kulenin menzilinde (27) duran bütün askerler saldırana döner; kule menzili dışından döven mancınık
  (menzil 36) dahil.
- Saldıran 5 saniye hatırlanır ve 40 birime kadar kovalanır; müttefik askerleri de yardıma koşar. Bot askeri rakip kule
  menzilindeki saldıranın peşine yine düşmez. Kule oku alarm yaymaz.
- Ölçüm: grubun kenarındaki asker 16 birim ötedeki okçudan ok yerken alarm kapalıyken 4 arkadaşının hiçbiri kıpırdamıyor,
  açıkken 4'ü de okçuya yürüyüp vuruyor; kule dövülünce menzilindeki 6 asker 0.6 saniyede harekete geçiyor.

## Alt bant (Age of tarzı)

- **Sol**: komut ızgarası; seçili yapının menüsünde **✖ Kapat** düğmesi seçimi ve menüyü kapatır (Esc ile aynı).
  **Hiçbir şey seçili değilken bina dikme düğmeleri** (kışla, okçuluk, ahır, kule; sancağa tıklamak gerekmez),
  seçili yapının üretimi / inşa menüsü ve sancakta **Geliştir** düğmesi. Her düğmede maliyet.
- **Orta**: bilgi kartı. Hiçbir şey seçili değilken **kahramanın durumu** (tür, seviye, can, exp, vuruş / menzil / hız)
  ve altında **sancağının durumu** (can çubuğu, kaç kulenin koruduğu) bir arada görünür.
  Yapı: can, üretim sırası (ilk emirde ilerleme, tıklayınca iptal + para iadesi).
  Birim: can ve vuruş / menzil / hız. Çoklu seçim: tür sayıları.
- **Sağ**: tamamen 2B baklava minimap (zemin, ağaçlar, sis, yapılar, birimler, kamera çerçevesi).
  Altında Menü (Esc) / kamera (V) / Kontroller (F1) / tam ekran düğmeleri.

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
Üretim düğmesine **Shift** ile basınca 5, **Ctrl** ile 10 birim birden sıraya girer (kaynak ya da sıra bitince durur). Ctrl basılıyken W'ye basmak tarayıcıda **Ctrl+W** (sekmeyi kapat) olur ve normal pencerede sayfa bunu engelleyemez: maç sürerken tarayıcı "ayrılmak istiyor musun?" diye sorar (giriş ekranında, maç bitince ve uygulamada sormaz); tam ekranda hareket tuşları klavye kilidiyle oyuna bağlanır (Chrome / Edge), Ctrl+W hiç çalışmaz.

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
yapıyı seçip ızgaradaki sağ alt yuvadaki **💀 Yık** düğmesine basarsın (yıkılan yapı enkazından odun düşer, sancak yıkılamaz).

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
**Asker tipi savaşın kendisidir**: her türün bir **anti listesi** vardır ve antisi olduğu türü **üç vuruşta düşürür**
(`config.js` → `ANTI`). **Tek atma yoktur**: anti vuruş çok sert ama hedefe kaçacak, karşılık verecek ve destek
alacak kadar yaşama hakkı bırakır.

| Saldıran | Üstün olduğu türler |
| --- | --- |
| **Kılıç** (yaya, ±kalkan) | Yaya mızrak, mızrak kalkan |
| **Mızrak** (yaya, ±kalkan) | **Bütün atlılar** (atlı okçu, mızraklı, kılıçlı, kalkanlıları dahil) |
| **Okçu** | Kalkansız yayalar: kılıçlı, mızraklı, okçu |
| **Atlı mızrak** (±kalkan) | Yaya kılıç sınıfı (kalkanlısı dahil) ve okçu — yaya mızrak hariç (o atlının antisidir) |
| **Atlı kılıç** (±kalkan) | Okçu ve atlı okçu |
| **Atlı okçu** | Kalkansızlar: kılıçlı, okçu, atlı mızrak — yaya mızrak ve atlı kılıç hariç (onlar atlı okçunun antisidir) |

- **Anti vuruşun gücü**: askere canının **0.34 katı**, yani **üçüncü vuruşta ölür** (kalkan önden %30 emdiği için kalkanlı
  hedef önden beş, arkadan üç vuruş dayanır). Normal vuruş canın ~%14'ünü götürdüğüne göre anti vuruş yaklaşık **2.4 kat**
  serttir. Kahramana sabit **45 hasar**: sv 1 kahraman (140 can) **dördüncü vuruşta** düşer, her seviye +10 can verdiği için
  üst seviyelerde daha çok vuruş gerekir. Vuran kahramansa seviye çarpanı (+%8 / sv) da biner. Dönerek vuruş (0.5x) ve
  alan etkileri (0.6x) anti hasarı aynı oranda ölçekler.
- Anti dışı eşleşmeler **1x**; yalnızca **ok zayıftır**: kalkanlıya 0.15x, atlıya 0.5x. Okçu dışındaki silahlar alan vuruşu yapar
  (kılıç 112°, mızrak 81°): yayın içindeki her antisi aynı sert vuruşu yer.
- Tablo **karşılıklı üstünlük çifti** içermez: kim kimin antisiyse tek yönlüdür. Kalkanlı atlıları yalnızca mızrak durdurur, bedelleri de en yüksektir.
- **Her türe üstün olanlar**: kılıçlı → okçu, atlı mızrak, atlı okçu · kılıç kalkan → atlı mızrak · mızraklı → kılıç, okçu · mızrak kalkan → kılıç ·
  okçu → okçu, atlı mızrak, atlı kılıç, atlı okçu · atlı okçu → mızrak, atlı kılıç · atlı mızrak → mızrak, atlı okçu · atlı kılıç → mızrak ·
  kalkanlı atlılar → yalnızca mızrak. Üretim düğmelerinin ipucu ve birim bilgi kartı bu iki listeyi (Üstün / Zayıf) gösterir.
- **Rakip anti basar**: her karar turunda senin en kalabalık türünün antisini seçme olasılığı kolayda %20, normalde %50, zorda %80;
  tutmazsa eskisi gibi tür dağılımını kopyalar. Kahramanların vuruşları da bu tabloya uyar: kılıçlı kahraman mızraklıları üç
  vuruşta düşürür, okçular onu dört vuruşta düşürür (seviye arttıkça daha çok).

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

Başlangıç ekranında **Takımlar** seçilir: 1v1 (eski oyun) ya da 2v2 … 5v5. Tek başına oyunda ve co-op'ta **mavi** takımdasın (PvP'de kırmızı da olabilirsin); kalan
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
  yalnızca **insansız** takımın botlarına işler (co-op'ta rakip takım); müttefikler senin gibi 1x toplar.
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

## Grafik kalitesi (Esc menüsü)

Geç safhada sahada **yüzlerce asker** olur. Her asker ~15 ayrı kutudan oluşur ve gölge geçişi bunların hepsini bir
kez daha çizer, yani gölge maliyeti çizimin yarısıdır. Esc menüsündeki **Grafik** düğmesi üç kademe arasında döner ve
o anki kare hızını da yazar (`config.js` → `QUALITY`, seçim `localStorage`'da kalır):

| Kademe | Gölge | Harita | Yenileme | Asker gölgesi |
| --- | --- | --- | --- | --- |
| Yüksek | var | 2048 | her kare | var |
| **Orta** (varsayılan) | var | 1024 | 2 karede bir | yok |
| Düşük | yok | — | — | yok |

Orta kademede yapılar, ağaçlar ve arazi gölge düşürmeye devam eder, yani sahne yassılaşmaz; kalkan yalnızca en pahalı
kalemdir (yüzlerce asker kutusu). Sunucu simülasyonu kademelerden etkilenmez.

## Performans (5v5)

Büyük takım oyunlarında yüzlerce birim aynı anda sahadadır; oyun şu yollarla akıcı kalır (ayarlar `config.js` → `PERF`):

- **Ekran dışı eleme**: ekranın zemin izdüşümünün (+8 birim pay) dışındaki birimler, **yapılar**, eşyalar ve efektler
  çizilmez, canlandırılmaz ve matrisleri güncellenmez; ekran dışında parçacık ve halka hiç yaratılmaz (en çok 400 parçacık).
  Omuz üstü kamerada sınır görüş mesafesidir (90 birim). Ölçüm (5v5, 300 birim, izometrik): sahadaki 300 birimin **34'ü**
  çiziliyor, 267'si gizli; çizim çağrısı 130, üçgen 234 bin.
- **Uzak birim sadeleştirmesi** (`PERF.lodDist` = 42 birim): uzaktaki birimde kol, bacak, silah, kalkan ve at bacakları
  gizlenir, uzuv animasyonu hiç koşmaz; gövde, kafa ve can çubuğu durur. İzometrikte ekran köşesi ~35 birim olduğu için
  görünürde değişiklik olmaz, kazanç omuz üstü kamerada belirir: aynı sahnede çizim çağrısı birim başına **3.2'den 1.8'e** indi.
- **Ölçüm satırı**: Esc menüsünün altında `kare hızı · çizim çağrısı · üçgen · çizilen birim / sahadaki birim` yazar.
  Takılma bildirirken bu satır okunur; "çizilen birim" sahadakinden çok küçükse eleme çalışıyor demektir.
- **Gölge kutusu** arenayı değil kameranın baktığı yerin çevresini kaplar (izometrikte 60, omuz üstünde 100 birim yarı boy):
  gölgeler daha keskin, ekran dışı birimler gölge geçişine girmez. Kutu ışık uzayında tam piksel adımlarıyla kayar.
  Harita çözünürlüğü, yenileme sıklığı ve asker gölgesi **Grafik kalitesi** kademesine bağlıdır (bkz. yukarısı);
  varsayılan orta kademede asker gölgesi kapalıdır ve harita iki karede bir yenilenir.
- **Simülasyon**: birim çarpışmaları uzaysal ızgarayla (4 birimlik hücre) çözülür; engel ızgarası yalnızca yapı kurulup yıkılınca
  yeniden kurulur; askerin hedef araması önce uzaklık süzgecinden geçer, rakip kule menzili denetimi yalnızca en yakın adaylar
  için yapılır; bot askerinin boşta planı (mancınığa eşlik, yapı, keşif) 0.3 sn'de bir, toplayıcıların düşman taraması 0.1 sn'de bir yenilenir.
- **Dekor**: yol parçaları, tarla sapları, ağaçlar, çalılar ve çim yamaları InstancedMesh; serbest ağaç sayısı azaltıldı (1v1 arenasında ~500),
  dekor evler ve koyunlar kaldırıldı; dekor matrisleri bir kez hesaplanır (5v5'te bütün süslerin konum verisi ~370 KB, oyun boyunca büyümez).
  Süsler **48x48 birimlik karelere** bölünür (`environment.js chunked`): tek parça olsaydı sınır küresi bütün haritayı
  kaplar, ekran ve gölge kamerası dışındaki süsler de her karede çizilirdi. Ölçüm (5v5, izometrik, Yüksek kalite, gölge dahil):
  üçgen **~230 binden ~30 bine**, çizim çağrısı 109 → 173.
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
| `src/gosteri.js` | Gösteri kipi (`?gosteri=1`): bot-bot maç kurulumu, hazır birlikler, buluşma emri, çatışmayı izleyen kamera |
| `src/gosteri-kahraman.js` | Sahnelenmiş gösteri (`?gosteri=kahraman`): Atlı Okçu + 500 kişilik kalabalık, 3B kamera |
| `src/gosteri-savas.js` | Sahnelenmiş gösteri (`?gosteri=savas`): 1000'er kişilik iki ordu, ucuz ordu beyni, iki Kılıçlı Atlı kahramanın düellosu, geniş izometrik kamera |
| `src/otopilot.js` | Otopilot kipi (`?otopilot=1`): gerçek maç, kahramanı girdiyle süren bot beyni, çatışma başlangıcı
| `src/view/ordu.js` | Kalabalık ordu çizimi (yalnız `?gosteri=savas`): taraf başına tek InstancedMesh, birleşik asker geometrisi |
| `src/screens.js`, `src/report.js` | Ekran akışı (giriş / kurulum / lobi / menü / kısayollar) ve bitiş karnesi (sekmeler, grafik, kopyala) |
| `src/muzik.js`, `muzik/` | Oyun içi müzik: sahne seçimi (sakin / maç / doruk), çapraz geçiş, ayar ve saklama; parçalar ve lisans notu |
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
| `src/gorunur-alan.js` | Telefonda oyun kökünü `visualViewport`'un görünür alanına kilitler (üst kısım adres çubuğunun altında kalmaz); dört oyunda da aynı dosya |
| `Dockerfile`, `compose.yaml`, `.dockerignore` | Konteyner: tek imaj (statik + WebSocket), sağlık denetimi, isteğe bağlı `tunnel` profili (cloudflared) |
| `server.mjs`, `server/rooms.mjs` | Tek süreç: statik dosyalar + WebSocket odaları (lobi, otoriter simülasyon, durum paketi, geri bağlanma, bot devralma) |

Oyun dünyası tarayıcı konsolunda `__meadow` olarak erişilebilir; tek başına oyunda `__meadow.simulate(30)` oyunu
30 saniye ileri sarar (hata ayıklama için). Sunucuda `/health` oda ve bağlantı sayısını verir. Kayıt sistemi yoktur.
