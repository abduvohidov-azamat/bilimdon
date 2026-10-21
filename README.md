# Bilimdon 🎓

Kahoot uslubidagi oʻzbekcha viktorina platformasi. Oʻqituvchi savollarni katta ekranda koʻrsatadi, oʻquvchilar telefonidan PIN-kod orqali qoʻshilib javob beradi. Uy vazifasi sifatida havola orqali ham topshirish mumkin.

---

## 1-qadam. Kompyuterga oʻrnatish

1. **Node.js** oʻrnating: <https://nodejs.org> → “LTS” versiyasini yuklab oling → oddiy dastur kabi oʻrnating (hamma joyda “Next”).
2. `Bilimdon` papkasini oching va **`start.bat`** faylini ikki marta bosing.
   - Birinchi marta kerakli kutubxonalarni oʻzi oʻrnatadi (1–2 daqiqa, internet kerak).
   - Brauzerda oʻqituvchi paneli avtomatik ochiladi: `http://localhost:3000/host.html`
3. Windows **“Firewall”** oynasi chiqsa → **Private networks** (Xususiy tarmoqlar) belgisini qoʻyib, **Allow** (Ruxsat berish) bosing. Busiz telefonlar ulana olmaydi.

> Qora oyna (server) ochiq turishi kerak. Uni yopsangiz, platforma toʻxtaydi.

## 2-qadam. Roʻyxatdan oʻtish

1. Oʻqituvchi panelida **“Roʻyxatdan oʻtish”** ni tanlang.
2. Ism-familiya, **email yoki telefon raqam** (masalan `90 123 45 67`) va parol kiriting.
3. Har bir oʻqituvchi faqat **oʻz** viktorinalari va natijalarini koʻradi. Namunaviy viktorinalar hammaga koʻrinadi.

## 3-qadam. Viktorina yaratish

1. **“+ Yangi viktorina”** tugmasini bosing.
2. Nom va tavsif yozing. **Viktorina tili**ni tanlang:
   - *Oʻzbek tili* — oʻquvchi lotin yoki kirill yozuvida koʻra oladi.
   - *Boshqa til (rus, ingliz…)* — matn qanday yozilgan boʻlsa, shunday qoladi.
3. Savol qoʻshing:
   - **Test savoli** — 2–4 ta javob. Toʻgʻri javob(lar) yonidagi **✓** doirani bosing (bir nechtasi ham boʻlishi mumkin).
   - **Toʻgʻri / Notoʻgʻri** savoli.
   - ⏱ vaqt (5–120 soniya), ⚡ *ikki baravar ball* yoki *ballsiz* (isinish uchun).
   - 🖼 **Rasm yuklash** — kompyuter yoki telefondan rasm tanlang (katta rasmlar avtomatik kichraytiriladi).
4. **“Saqlash”** ni bosing.

Namunadan foydalanish: namunaviy viktorinadagi **⧉** tugmasi uning nusxasini sizning roʻyxatingizga qoʻshadi — keyin xohlagancha tahrirlang.
Hamkasb bilan almashish: muharrirda **⬇ Eksport** → JSON fayl → hamkasb **⬆ Import** qiladi.

## 4-qadam. Sinfda jonli oʻyin oʻtkazish

1. Kompyuterni proyektor yoki katta ekranga ulang. Kompyuter va oʻquvchilar telefonlari **bir xil Wi-Fi** tarmogʻida boʻlsin.
2. Viktorina kartasida **▶ Boshlash** ni bosing. Ekranda **PIN-kod**, manzil va **QR-kod** chiqadi.
3. Oʻquvchilar telefonida QR-kodni skanerlaydi (yoki manzilni yozib, PIN kiritadi) va ismini yozadi.
   - Ism ustiga bosish — oʻsha oʻquvchini chiqarib yuborish.
   - **🔒 Qulflash** — yangi ishtirokchilar qoʻshila olmaydi.
   - **👥 Jamoa rejimi** — 2–4 jamoa (Lochinlar, Burgutlar, Qoplonlar, Arslonlar). Oʻquvchilar teng taqsimlanadi, jamoa bali — aʼzolar balining oʻrtachasi.
4. **Boshlash ▶**. Har savoldan keyin: javoblar diagrammasi → **Keyingi** → reyting → keyingi savol.
   - **Oʻtkazish** — vaqtni kutmasdan natijani koʻrsatish. Hamma javob bersa, natija oʻzi chiqadi.
   - **Yakunlash** — oʻyinni muddatidan oldin tugatish.
5. Oxirida shohsupa va **⬇ Natijalarni yuklab olish** — Excel’da ochiladigan fayl (har bir oʻquvchining har bir javobi va vaqti bilan).

**Ball qanday hisoblanadi:** toʻgʻri javob 500–1000 ball (qanchalik tez — shuncha koʻp) + ketma-ket toʻgʻri javoblar uchun bonus (+100 dan +500 gacha).

Sahifa tasodifan yangilansa yoki internet uzilsa — oʻqituvchi ham, oʻquvchilar ham oʻyinga qaytadi.

## 5-qadam. Uy vazifasi berish

1. Viktorina kartasida **📝** tugmasini bosing.
2. Muddatni tanlang (*Bugun 23:59*, *Ertaga*, *1 hafta* yoki muddatsiz) → **Yaratish**.
3. Havolani yuboring: **✈ Telegramda ulashish** (sinf guruhiga) yoki **📋 Nusxa olish**.
4. Oʻquvchi havolani ochadi → ism-familiyasini yozadi → oʻz tezligida topshiradi. Har savoldan keyin toʻgʻri javobni koʻradi.
5. **📝 Uy vazifalari** boʻlimida natijalar oʻz-oʻzidan yangilanib turadi:
   - kim topshirdi, kim hali jarayonda;
   - **Savollar tahlili** — qaysi savol qiyin boʻlgani (qizil = koʻpchilik xato qilgan);
   - **⬇ Excel/CSV** — jurnal uchun.

> ⚠️ Uy vazifasi telefondan **uyda** ochilishi uchun platforma internetga joylangan boʻlishi kerak (7-qadam). Kompyuteringizda ishlayotganda havola faqat maktab Wi-Fi tarmogʻida ochiladi.

## 6-qadam. Lotin / Kirill

Har bir sahifada **Кирилл / Lotin** tugmasi bor. Har bir foydalanuvchi oʻzi tanlaydi — tanlov eslab qolinadi. Savollar ham oʻgiriladi (formulalar, raqamlar, inglizcha soʻzlar va “Boshqa til” viktorinalari oʻzgarmaydi).

## 7-qadam. Internetga joylash (ixtiyoriy)

Uy vazifasi va boshqa maktablar bilan ishlash uchun platformani serverga joylang.

### A) VPS (Ubuntu) — eng arzon va ishonchli

```bash
# 1. Serverga Node.js oʻrnatish
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Fayllarni koʻchirish (node_modules va data papkasisiz) va oʻrnatish
cd /opt/bilimdon && npm install --omit=dev

# 3. Doimiy ishlashi uchun pm2
sudo npm install -g pm2
PORT=3000 pm2 start server.js --name bilimdon
pm2 save && pm2 startup
```

Keyin domen va **HTTPS** uchun Nginx + Certbot (yoki Caddy) ni `localhost:3000` ga yoʻnaltiring. HTTPS boʻlganda kirish cookie’lari avtomatik himoyalanadi.

### B) Docker

```bash
docker build -t bilimdon .
docker run -d -p 3000:3000 -v bilimdon-data:/data --restart unless-stopped bilimdon
```

### Muhim sozlamalar (environment)

| Oʻzgaruvchi | Vazifasi |
|---|---|
| `PORT` | Port (standart 3000) |
| `DATA_DIR` | Maʼlumotlar papkasi. Hosting “disk/volume” bersa, shu papkani unga ulang — aks holda qayta ishga tushganda maʼlumotlar yoʻqoladi |
| `SESSION_SECRET` | Kirish cookie’larini imzolash kaliti (berilmasa, `data/secret.key` avtomatik yaratiladi) |

## 8-qadam. Zaxira nusxa

Barcha maʼlumot **`data`** papkasida: viktorinalar, oʻqituvchilar, uy vazifalari natijalari va yuklangan rasmlar. Haftasiga bir marta shu papkani fleshka yoki Google Drive’ga nusxalab qoʻying.

## Muammolar

| Muammo | Yechim |
|---|---|
| Telefonlar ulana olmayapti | Bir xil Wi-Fi’dami? Firewall’da ruxsat berilganmi (1-qadam)? Mehmon (guest) Wi-Fi qurilmalarni bir-biridan ajratib qoʻyishi mumkin |
| Oʻqituvchi parolini unutdi | Serverni toʻxtating → `npm run reset-password -- "90 123 45 67" yangiParol` → serverni qayta yoqing |
| Port band | `start.bat` ichida yoki terminalda `set PORT=3001` qilib ishga tushiring |

## Fayllar tuzilishi

| Fayl | Vazifasi |
|---|---|
| `server.js` | Server: hisoblar, viktorinalar, jonli oʻyin, uy vazifasi, ball hisoblash |
| `seed.js` | Namunaviy viktorinalar |
| `public/index.html`, `play.js` | Oʻquvchi: jonli oʻyin (telefon) |
| `public/hw.html`, `hw.js` | Oʻquvchi: uy vazifasi |
| `public/host.html`, `host.js`, `host.css` | Oʻqituvchi paneli va katta ekran |
| `public/translit.js` | Lotin ↔ Kirill |
| `tools/reset-password.js` | Parolni tiklash |
| `data/` | Barcha maʼlumotlar (zaxiralang!) |
