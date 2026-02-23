# Scrappy Pro - Modern Veri Kazıma & Dashboard Sistemi Roadmap

Bu döküman, mevcut Python/Raspberry Pi tabanlı yapıyı modern bir **Next.js + Playwright + MySQL** ekosistemine taşıma planını içerir.

## 🚀 Proje Vizyonu
Raspberry Pi'nin yükünü hafifleterek, tüm süreci bir Web Browser üzerinden yönetilebilir, verileri ilişkisel bir veritabanında (MySQL) güvenli bir şekilde saklayan ve şık bir dashboard sunan "anahtar teslim" bir sistem kurmak.

---

## 📅 Uygulama Planı (Roadmap)

### Faz 1: Altyapı ve Hazırlık
1.  **Next.js Proje Kurulumu:** `/Users/oytunsu/Desktop/dev/tool/scrappy-web` dizininde modern bir Next.js projesi (Tailwind CSS, TypeScript) başlatılacak.
2.  **Git Bağlantısı:** Proje, `git@github.com:oytunsu/scrappy-web.git` reposuna bağlanacak.
3.  **Port Yapılandırması:** 3000 portu dolu olduğu için uygulama **3001** (veya senin tercih edeceğin başka bir boş port) üzerinden çalışacak şekilde ayarlanacak.
4.  **MySQL & Prisma Kurulumu:** Hostinger üzerindeki MySQL veritabanı için gerekli olan Prisma şeması (BusinessId anahtarlı) oluşturulacak.

### Faz 2: Scraper Motoru (The Engine)
1.  **Playwright Entegrasyonu:** Python'daki `local_scraper.py` mantığı (Google Maps akışı) Node.js/Playwright ortamına taşınacak.
2.  **Worker Mimarisi:** Arka planda kesintisiz çalışması için PM2 ile uyumlu bir worker script'i hazırlanacak.
3.  **Akıllı Kayıt:** Veriler doğrudan MySQL'e `BusinessId` kontrolü yapılarak (Duplicate Prevention) kaydedilecek.

### Faz 3: Yönetim Paneli (The Dashboard - Premium UI)
1.  **📊 İstatistik Paneli:** Toplam kaç firma toplandı, bugün kaç yeni veri geldi, ilçelere göre dağılım.
2.  **📍 Canlı İzleme:** Scraper o an ne yapıyor? Terminal loglarını web arayüzünde canlı akıtacağız.
3.  **⚙️ Kontrol Paneli:** Kazıma işlemini tek tuşla başlatma/durdurma, kategori ve ilçe seçim arayüzü.
4.  **📥 Veri Yönetimi:** Toplanan verileri Excel/CSV olarak indirme ve gelişmiş arama özellikleri.

### Faz 4: Yayına Alma ve Entegrasyon
1.  **Build & PM2:** Uygulamanın sunucu üzerinde 7/24 ayakta kalması için PM2 konfigürasyonu yapılacak.
2.  **Eski Verilerin Aktarımı:** Pi üzerindeki mevcut `businesses.json` verileri bir defaya mahsus yeni MySQL veritabanına import edilecek.

---

## 🛠 Kullanılacak Teknolojiler
- **Frontend/Backend:** Next.js 14+ (App Router)
- **Scraper:** Node.js + Playwright
- **Veritabanı:** MySQL (MariaDB) + Prisma ORM
- **Stil:** Tailwind CSS + Framer Motion (Mikro animasyonlar için)
- **Yönetim:** PM2

---

## ✅ Teslim Edilecekler
- Tamamen fonksiyonel bir Web Uygulaması.
- Otomatik çalışan kazıma motoru.
- Verilerin düzenli tutulduğu MySQL veritabanı yapısı.
- GitHub reposuna itilmiş, güncel ve temiz bir codebase.

**Bu roadmap senin için uygunsa, Faz 1'den ("Proje Kurulumu ve Git Bağlantısı") hemen başlayabilirim.**
