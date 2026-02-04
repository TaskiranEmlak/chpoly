/**
 * Polymarket Market Scanner
 * Aktif 15-dakika marketlerini tarar ve takip eder
 */

class MarketScanner {
    constructor() {
        this.gammaUrl = 'https://gamma-api.polymarket.com';
        this.activeMarkets = new Map();
        this.scanInterval = null;
        this.onSignal = null; // Callback for signals
    }

    /**
     * Taramayı başlat
     */
    start(intervalMs = 10000) {
        console.log('🔍 Market Scanner başlatıldı');
        this.scan(); // İlk tarama
        this.scanInterval = setInterval(() => this.scan(), intervalMs);
    }

    /**
     * Taramayı durdur
     */
    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        console.log('⏹️ Market Scanner durduruldu');
    }

    /**
     * Ana tarama fonksiyonu
     */
    async scan() {
        try {
            // BTC, ETH, SOL 15-dakika marketlerini bul
            const markets = await this.findActiveMarkets();

            for (const market of markets) {
                await this.evaluateMarket(market);
            }
        } catch (error) {
            console.error('Scan error:', error);
        }
    }

    /**
     * Aktif 15-dakika marketlerini bul
     */
    async findActiveMarkets() {
        const markets = [];

        // Polymarket'te 15-dakika crypto marketlerini ara
        const searchTerms = ['btc-updown-15m', 'eth-updown-15m', 'sol-updown-15m'];

        for (const term of searchTerms) {
            try {
                const response = await fetch(`${this.gammaUrl}/events?active=true&slug_contains=${term}&limit=5`);
                if (response.ok) {
                    const events = await response.json();
                    markets.push(...events);
                }
            } catch (e) {
                // Alternatif arama
                try {
                    const response = await fetch(`${this.gammaUrl}/events?active=true&limit=50`);
                    if (response.ok) {
                        const allEvents = await response.json();
                        const filtered = allEvents.filter(e =>
                            e.slug?.includes('15m') &&
                            (e.slug?.includes('btc') || e.slug?.includes('eth') || e.slug?.includes('sol'))
                        );
                        markets.push(...filtered);
                    }
                } catch (e2) {
                    console.error('Market search error:', e2);
                }
            }
        }

        // Duplicate'leri kaldır ve işle
        const uniqueMarkets = [];
        const seen = new Set();

        for (const event of markets) {
            if (!seen.has(event.id)) {
                seen.add(event.id);

                const processed = this.processEvent(event);
                if (processed) {
                    uniqueMarkets.push(processed);
                }
            }
        }

        return uniqueMarkets;
    }

    /**
     * Event'i işlenebilir market formatına dönüştür
     */
    processEvent(event) {
        try {
            const slug = event.slug || '';

            // Coin türünü belirle
            let coin = 'BTC';
            let binanceSymbol = 'BTCUSDT';

            if (slug.includes('eth')) {
                coin = 'ETH';
                binanceSymbol = 'ETHUSDT';
            } else if (slug.includes('sol')) {
                coin = 'SOL';
                binanceSymbol = 'SOLUSDT';
            }

            // Bitiş zamanını çıkar (slug'dan veya event'ten)
            let endTime = null;

            // Slug'dan timestamp çıkar: btc-updown-15m-1770217800
            const timestampMatch = slug.match(/(\d{10,13})$/);
            if (timestampMatch) {
                const ts = parseInt(timestampMatch[1]);
                endTime = ts.toString().length === 10 ? ts * 1000 : ts;
            } else if (event.endDate) {
                endTime = new Date(event.endDate).getTime();
            }

            // Strike price çıkar
            let strikePrice = null;

            // Markets array'den çıkar
            if (event.markets && event.markets.length > 0) {
                const market = event.markets[0];

                // Description'dan strike price çıkar
                const desc = market.description || event.description || '';
                const priceMatch = desc.match(/\$?([\d,]+\.?\d*)/);
                if (priceMatch) {
                    strikePrice = parseFloat(priceMatch[1].replace(/,/g, ''));
                }

                // Veya question/title'dan
                if (!strikePrice) {
                    const titleMatch = (event.title || event.question || '').match(/\$?([\d,]+\.?\d*)/);
                    if (titleMatch) {
                        strikePrice = parseFloat(titleMatch[1].replace(/,/g, ''));
                    }
                }
            }

            if (!endTime) {
                console.log('⚠️ End time bulunamadı:', slug);
                return null;
            }

            return {
                id: event.id,
                slug: slug,
                title: event.title || event.question,
                coin: coin,
                binanceSymbol: binanceSymbol,
                strikePrice: strikePrice,
                endTime: endTime,
                url: `https://polymarket.com/event/${slug}`,
                markets: event.markets
            };
        } catch (error) {
            console.error('Process event error:', error);
            return null;
        }
    }

    /**
     * Market'i değerlendir ve gerekirse sinyal oluştur
     */
    async evaluateMarket(market) {
        const now = Date.now();
        const timeRemaining = market.endTime - now;

        // Sadece son 2 dakika içindeki marketlere bak
        if (timeRemaining <= 0 || timeRemaining > 120000) {
            return;
        }

        console.log(`⏱️ ${market.coin} market: ${Math.round(timeRemaining / 1000)} saniye kaldı`);

        // Strike price yoksa atla
        if (!market.strikePrice) {
            console.log('⚠️ Strike price yok, atlanıyor');
            return;
        }

        // Güncel fiyatı al
        const currentPrice = await this.getCurrentPrice(market.binanceSymbol);
        if (!currentPrice) {
            console.log('⚠️ Fiyat alınamadı');
            return;
        }

        // Gap hesapla
        const gapPercent = ((currentPrice - market.strikePrice) / market.strikePrice) * 100;
        const timeSeconds = Math.round(timeRemaining / 1000);

        console.log(`📊 ${market.coin}: $${currentPrice.toLocaleString()} vs $${market.strikePrice.toLocaleString()} = ${gapPercent.toFixed(3)}%`);

        // Sinyal kontrolü
        const signal = this.calculateSignal(timeSeconds, gapPercent, market, currentPrice);

        if (signal && this.onSignal) {
            this.onSignal(signal);
        }
    }

    /**
     * Sinyal hesapla
     */
    calculateSignal(timeSeconds, gapPercent, market, currentPrice) {
        const absGap = Math.abs(gapPercent);
        const direction = gapPercent > 0 ? 'YES' : 'NO';

        let confidence = 0;
        let shouldSignal = false;

        // Son 30 saniye + %0.2+ fark = %95 güven
        if (timeSeconds <= 30 && absGap >= 0.2) {
            confidence = 95;
            shouldSignal = true;
        }
        // 30-60 saniye + %0.4+ fark = %90 güven
        else if (timeSeconds <= 60 && absGap >= 0.4) {
            confidence = 90;
            shouldSignal = true;
        }
        // 1-2 dakika + %0.6+ fark = %85 güven
        else if (timeSeconds <= 120 && absGap >= 0.6) {
            confidence = 85;
            shouldSignal = true;
        }

        if (!shouldSignal) {
            return null;
        }

        return {
            type: 'TRADE_SIGNAL',
            market: market,
            action: direction,
            confidence: confidence,
            currentPrice: currentPrice,
            strikePrice: market.strikePrice,
            gapPercent: gapPercent,
            timeRemaining: timeSeconds,
            timestamp: Date.now(),
            reason: `${timeSeconds} saniye kaldı, fiyat hedefin ${gapPercent > 0 ? 'üstünde' : 'altında'} (%${absGap.toFixed(2)})`
        };
    }

    /**
     * Binance'den güncel fiyat al
     */
    async getCurrentPrice(symbol) {
        try {
            const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
            const data = await response.json();
            return parseFloat(data.price);
        } catch (error) {
            console.error('Price fetch error:', error);
            return null;
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.MarketScanner = MarketScanner;
}
if (typeof self !== 'undefined') {
    self.MarketScanner = MarketScanner;
}
