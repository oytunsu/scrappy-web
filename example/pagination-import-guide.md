# Rehber Sitesi İçin Sayfalı (Pagination) Import Klavuzu

Bu döküman, mevcut tekil JSON import mantığının, milyonlarca veriyi destekleyecek şekilde "Sayfalı (Chunked)" yapıya nasıl dönüştürüleceğini anlatır.

## 1. Sorun ve Çözüm
Mevcut sistem `.../api/v1/export/businesses` linkindeki tüm veriyi tek seferde çekmeye çalışmaktadır. Veri sayısı 10.000'i geçtiğinde bu durum timeout (zaman aşımı) ve RAM hatalarına yol açar.

**Çözüm:** Veriyi 500'erli paketler halinde sırayla çekmek.

## 2. API Parametreleri
Scrapper API artık şu parametreleri desteklemektedir:
- `limit`: Her istekte kaç işletme geleceği (Önerilen: 500)
- `skip`: Kaçıncı kayıttan başlanacağı (Offset)

Örnek Link: `http://5.175.136.12:8000/api/v1/export/businesses?skip=0&limit=500`

## 3. Uygulanacak Mantık (Pseudocode)

İmport fonksiyonunuzu şu döngüsel mantığa göre güncelleyin:

```typescript
async function startAutoImport() {
  let skip = 0;
  const limit = 500;
  let hasMore = true;

  while (hasMore) {
    console.log(`Çekiliyor: ${skip} - ${skip + limit} arası veriler...`);
    
    // API'den paketi iste
    const url = `http://5.175.136.12:8000/api/v1/export/businesses?skip=${skip}&limit=${limit}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data && data.length > 0) {
      // 1. Gelen 500'lük paketi veritabanına kaydet (UPSERT mantığıyla)
      await processAndSaveToDatabase(data);

      // 2. Bir sonraki paket için skip değerini artır
      skip += limit;
      
      // 3. (Opsiyonel) Sunucuyu yormamak için kısa bir bekleme ekle
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      // Veri kalmadıysa döngüden çık
      hasMore = false;
      console.log("Tüm veriler başarıyla eşitlendi.");
    }
  }
}
```

## 4. AI İçin Talimat (Prompt)
Eğer bu değişikliği başka bir AI'a yaptıracaksanız şu promptu kullanabilirsiniz:

> "Mevcut import fonksiyonumu, `http://5.175.136.12:8000/api/v1/export/businesses` adresinden verileri `skip` ve `limit` parametrelerini kullanarak (sayfalı şekilde) çekecek bir döngüye (while loop) dönüştür. Her seferinde 500 kayıt iste, gelen veriyi işle ve veri bitene kadar (`data.length === 0`) devam et."

## 5. Kritik Notlar
- **Upsert:** Kayıt yaparken `BusinessId` kontrolü yapmayı unutmayın. Veri zaten varsa sadece güncelleyin.
- **Background Task:** Bu işlem uzun süreceği için (2M veri için) bir "Background Job" veya "Cron" içerisinde çalıştırılmalıdır.
