# TrelloMCP

Trello için Model Context Protocol (MCP) server. Claude AI ve diğer MCP-uyumlu AI sistemleri ile Trello'yu entegre edin.

**Developer:** Cem Aydın  
**Company:** [OrbisLabs.ai](https://orbislabs.ai)

## 🚀 Özellikler

- **Power-Up Desteği**: Story Points, Epic, Sprint ve custom field'lar
- **20 MCP Tool**: Kapsamlı Trello entegrasyonu
- **Cache Sistemi**: Gelişmiş performans optimizasyonu
- **Rate Limiting**: Otomatik API limit yönetimi
- **Bulk Operations**: Çoklu kart işlemleri

## 🤖 Claude'a Ekleme

### 0. Gerekli Programlar
TrelloMCP'nin çalışması için bilgisayarınızda aşağıdaki programların yüklü olması gerekiyor:

#### Windows için:
- **Node.js** (v18 veya üzeri): https://nodejs.org/
- **Git** (opsiyonel): https://git-scm.com/
- **Claude Desktop**: https://claude.ai/download

#### macOS için:
- **Node.js** (v18 veya üzeri): `brew install node` veya https://nodejs.org/
- **Git** (opsiyonel): `brew install git` veya https://git-scm.com/
- **Claude Desktop**: https://claude.ai/download

#### Linux için:
- **Node.js** (v18 veya üzeri): 
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- **Git** (opsiyonel): `sudo apt-get install git`
- **Claude Desktop**: https://claude.ai/download

### 1. Kurulum
```bash
git clone <repository-url>
cd TrelloMCP
npm install
npm run build
```

### 2. Trello API Bilgileri
1. **API Key**: https://trello.com/app-key
2. **Token**: Aşağıdaki URL'yi kullanın (API_KEY'i değiştirin):
```
https://trello.com/1/authorize?expiration=never&scope=read,write,account&response_type=token&name=TrelloMCP&key=YOUR_API_KEY
```

### 3. Claude Desktop Konfigürasyonu

#### Claude Desktop'ta MCP Server Ekleme:
1. **Claude Desktop'ı açın**
2. **Settings** (⚙️) menüsüne gidin
3. **MCP Servers** sekmesini seçin
4. **Add Server** butonuna tıklayın
5. Aşağıdaki konfigürasyonu yapıştırın:

```json
{
  "trello-mcp": {
    "command": "node",
    "args": ["/path/to/your/TrelloMCP/dist/server.js"],
    "cwd": "/path/to/your/TrelloMCP",
    "env": {
      "TRELLO_API_KEY": "your_api_key_here",
      "TRELLO_TOKEN": "your_token_here",
      "LOG_LEVEL": "info",
      "CACHE_TTL": "300",
      "CACHE_MAX_KEYS": "1000"
    }
  }
}
```

**Not:** `/path/to/your/TrelloMCP` kısmını kendi proje dizininizle değiştirin.

### 4. Kurulum Kontrolü
Kurulumun başarılı olup olmadığını kontrol etmek için:

```bash
# Node.js versiyonunu kontrol et
node --version

# npm versiyonunu kontrol et
npm --version

# Projeyi test et
npm run test:trello
```

### 5. Test
Claude Desktop'ta TrelloMCP'yi test etmek için şu komutu verin:
```
Trello panolarımı listele
```

## 🛠️ MCP Tools

### 📊 Pano İşlemleri (4 adet)
- `get_boards` - Panoları listele
- `get_board` - Pano detayları
- `get_board_lists` - Pano listeleri
- `get_board_stats` - Pano istatistikleri

### 📝 Liste İşlemleri (6 adet)
- `get_list` - Liste detayları
- `create_list` - Liste oluştur
- `update_list` - Liste güncelle
- `archive_list` - Liste arşivle
- `move_list` - Liste taşı
- `get_list_card_count` - Liste kart sayısı

### 🎯 Kart İşlemleri (6 adet)
- `get_card` - Kart detayları
- `create_card` - Kart oluştur
- `update_card` - Kart güncelle
- `move_card` - Kart taşı
- `delete_card` - Kart sil
- `archive_card` - Kart arşivle

### 🔥 Power-Up İşlemleri (1 adet)
- `get_list_cards_powerups` - Kartları Power-Up verileriyle getir

**Power-Up Verileri:**
- ✅ Story Points
- ✅ Epic bilgileri
- ✅ Sprint bilgileri
- ✅ Custom Fields
- ✅ Plugin Data

### 📦 Bulk İşlemler (3 adet)
- `bulk_create_cards` - Çoklu kart oluştur
- `bulk_move_cards` - Çoklu kart taşı
- `bulk_archive_cards` - Çoklu kart arşivle

## 🔥 Power-Up Desteği

### Kullanım Örneği
```typescript
// Power-Up verileriyle kartları getir
const result = await get_list_cards_powerups({
  listId: "your_list_id",
  includePowerUps: true,
  limit: 10,
  useCache: true
});
```

### Sonuç Formatı
```
📋 Liste Kartları (10 adet)

1. 🎯 User Story (ID: abc123)
   📝 Kullanıcı girişi ekranı tasarımı
   ⏰ Son tarih: 2024-01-15
   🏷️ Etiketler: Frontend, High Priority
   👥 Üyeler: John Doe
   📊 Story Points: 8
   🎯 Epic: Authentication System
   🚀 Sprint: Sprint 3
   📎 2 ek dosya
   💬 5 yorum
   ☑️ 3/5 görev tamamlandı
```

## ⚙️ Konfigürasyon

### Environment Variables
```env
# Trello API (Zorunlu)
TRELLO_API_KEY=your_api_key_here
TRELLO_TOKEN=your_token_here

# Cache (Opsiyonel)
CACHE_TTL=300
CACHE_MAX_KEYS=1000

# Logging (Opsiyonel)
LOG_LEVEL=info
```

## 🚀 Geliştirme

### Kurulum
```bash
npm install
npm run build
```

### Development
```bash
npm run dev    # Auto-reload
npm start      # Production
npm test       # Test
```

### Proje Yapısı
```
src/
├── core/              # Cache, logger, config
├── trello/            # API client, rate limiting
├── tools/             # MCP tools
│   ├── base-tool.ts
│   ├── board-tools.ts
│   ├── list-tools.ts
│   ├── card-tools.ts
│   ├── card-tools-optimized.ts
│   └── bulk-tools.ts
├── services/          # İş mantığı
└── server.ts          # Ana MCP server
```

## 🐛 Sorun Giderme

### Yaygın Sorunlar
- **Authentication Error**: API key ve token'ı kontrol edin
- **Rate Limiting**: API call sıklığını azaltın
- **Power-Up Verileri Gelmiyor**: `includePowerUps: true` kullanın

### Debug
```bash
LOG_LEVEL=debug npm run dev
```

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open Pull Request

---

**Developer:** Cem Aydın  
**Company:** [OrbisLabs.ai](https://orbislabs.ai)

*Empowering AI-driven productivity solutions*