/**
 * Arbitrage Scanner
 * Polymarket vs Binance fiyat karşılaştırması ile arbitraj fırsatları tespit eder
 * 
 * Polymarket: Chainlink Data Streams (3+ CEX LWBA ortalaması)
 * Binance: Tek borsa anlık spot fiyat
 * 
 * Fark %0.3+ ise arbitraj sinyali üretir
 */

class ArbitrageScanner {
    constructor() {
        this.binanceApiUrl = 'https://api.binance.com/api/v3';
        this.gammaApiUrl = 'https://gamma-api.polymarket.com';
        this.minArbitragePercent = 0.3; // %0.3 minimum fark
        this.lastSignals = new Map();
        this.signalCooldown = 60000; // 1 dakika cooldown
    }

    /**
     * Binance'ten anlık spot fiyat çek
     * @param {string} symbol - BTCUSDT, ETHUSDT vb.
     */
    async getBinancePrice(symbol = 'BTCUSDT') {
        try {
            const response = await fetch(`${this.binanceApiUrl}/ticker/price?symbol=${symbol}`);
            if (!response.ok) throw new Error('Binance API error');

            const data = await response.json();
            return parseFloat(data.price);
        } catch (error) {
            console.error('Binance price error:', error);
            return null;
        }
    }

    /**
     * Binance'ten 24h high/low çek (volatilite için)
     */
    async getBinance24hStats(symbol = 'BTCUSDT') {
        try {
            const response = await fetch(`${this.binanceApiUrl}/ticker/24hr?symbol=${symbol}`);
            if (!response.ok) return null;

            const data = await response.json();
            return {
                high: parseFloat(data.highPrice),
                low: parseFloat(data.lowPrice),
                change: parseFloat(data.priceChangePercent),
                volume: parseFloat(data.volume)
            };
        } catch (error) {
            console.error('Binance 24h stats error:', error);
            return null;
        }
    }

    /**
     * Polymarket'ten aktif kripto marketlerini çek
     */
    async getActiveMarkets() {
        try {
            const response = await fetch(`${this.gammaApiUrl}/events?active=true&closed=false`);
            if (!response.ok) return [];

            const events = await response.json();

            // Sadece BTC/ETH kripto marketlerini filtrele
            const cryptoMarkets = [];

            for (const event of events) {
                const title = (event.title || '').toLowerCase();

                // BTC veya ETH içeren kısa vadeli marketler
                if ((title.includes('btc') || title.includes('bitcoin') ||
                    title.includes('eth') || title.includes('ethereum')) &&
                    (title.includes('above') || title.includes('below') ||
                        title.includes('up') || title.includes('down'))) {

                    // Strike price çıkar
                    const strikeMatch = event.title.match(/\$?([\d,]+)/);
                    const strikePrice = strikeMatch ? parseFloat(strikeMatch[1].replace(/,/g, '')) : null;

                    if (strikePrice && strikePrice > 1000) {
                        const coin = title.includes('btc') || title.includes('bitcoin') ? 'BTC' : 'ETH';

                        cryptoMarkets.push({
                            id: event.id,
                            slug: event.slug,
                            title: event.title,
                            coin: coin,
                            strikePrice: strikePrice,
                            endDate: event.endDate,
                            markets: event.markets || []
                        });
                    }
                }
            }

            return cryptoMarkets;
        } catch (error) {
            console.error('Active markets error:', error);
            return [];
        }
    }

    /**
     * Tek market için YES/NO oranlarını çek
     */
    async getMarketOdds(market) {
        try {
            if (market.markets && market.markets.length > 0) {
                const subMarket = market.markets[0];
                return {
                    yesPrice: parseFloat(subMarket.outcomePrices?.[0] || 0.5) * 100,
                    noPrice: parseFloat(subMarket.outcomePrices?.[1] || 0.5) * 100
                };
            }
            return { yesPrice: 50, noPrice: 50 };
        } catch (error) {
            console.error('Market odds error:', error);
            return { yesPrice: 50, noPrice: 50 };
        }
    }

    /**
     * Arbitraj fırsatı hesapla
     * @param {Object} market - Polymarket market bilgisi
     * @param {number} binancePrice - Binance spot fiyat
     */
    calculateArbitrage(market, binancePrice) {
        const strikePrice = market.strikePrice;
        const odds = market.odds || { yesPrice: 50, noPrice: 50 };

        // Binance fiyatının strike'a göre pozisyonu
        const priceDiffPercent = ((binancePrice - strikePrice) / strikePrice) * 100;

        // Market tahmininde örtük olasılık
        const impliedYes = odds.yesPrice; // Piyasanın YES olasılığı tahmini

        // Binance bazlı tahmin (basit yaklaşım)
        // Strike'a yakınsa ~50%, uzaksa yöne göre artar
        let binanceImpliedYes;
        if (priceDiffPercent > 0.5) {
            // Fiyat strike'ın %0.5 üstünde = YES muhtemel
            binanceImpliedYes = Math.min(90, 50 + (priceDiffPercent * 10));
        } else if (priceDiffPercent < -0.5) {
            // Fiyat strike'ın %0.5 altında = NO muhtemel
            binanceImpliedYes = Math.max(10, 50 + (priceDiffPercent * 10));
        } else {
            // Çok yakın = 50/50
            binanceImpliedYes = 50;
        }

        // Arbitraj farkı
        const arbitrageDiff = Math.abs(impliedYes - binanceImpliedYes);

        return {
            strikePrice: strikePrice,
            binancePrice: binancePrice,
            priceDiffPercent: priceDiffPercent.toFixed(2),
            marketYes: impliedYes.toFixed(1),
            binanceYes: binanceImpliedYes.toFixed(1),
            arbitrageDiff: arbitrageDiff.toFixed(1),
            hasOpportunity: arbitrageDiff >= this.minArbitragePercent * 100,
            suggestedAction: binanceImpliedYes > impliedYes ? 'YES' : 'NO',
            confidence: Math.min(95, 50 + arbitrageDiff)
        };
    }

    /**
     * Ana tarama fonksiyonu
     */
    async scan() {
        console.log('🔄 Arbitraj taraması başlıyor...');

        const markets = await this.getActiveMarkets();
        const opportunities = [];

        for (const market of markets.slice(0, 10)) { // İlk 10 market
            const symbol = market.coin === 'BTC' ? 'BTCUSDT' : 'ETHUSDT';
            const binancePrice = await this.getBinancePrice(symbol);

            if (!binancePrice) continue;

            // Odds çek
            market.odds = await this.getMarketOdds(market);

            // Arbitraj hesapla
            const arb = this.calculateArbitrage(market, binancePrice);

            if (arb.hasOpportunity) {
                opportunities.push({
                    market: market,
                    arbitrage: arb,
                    timestamp: Date.now()
                });

                console.log(`💰 Arbitraj fırsatı: ${market.title}`);
                console.log(`   Binance: $${binancePrice.toLocaleString()} | Strike: $${market.strikePrice.toLocaleString()}`);
                console.log(`   Market YES: ${arb.marketYes}% | Binance YES: ${arb.binanceYes}%`);
                console.log(`   Fark: ${arb.arbitrageDiff}% → ${arb.suggestedAction}`);
            }
        }

        return opportunities;
    }

    /**
     * Sinyal üret (service-worker entegrasyonu için)
     */
    generateSignal(opportunity) {
        const key = opportunity.market.id;
        const lastSignal = this.lastSignals.get(key);

        if (lastSignal && Date.now() - lastSignal < this.signalCooldown) {
            return null; // Cooldown
        }

        this.lastSignals.set(key, Date.now());

        return {
            type: 'ARBITRAGE_SIGNAL',
            market: {
                id: opportunity.market.id,
                title: opportunity.market.title,
                coin: opportunity.market.coin,
                strikePrice: opportunity.market.strikePrice,
                url: `https://polymarket.com/event/${opportunity.market.slug}`
            },
            action: opportunity.arbitrage.suggestedAction,
            confidence: opportunity.arbitrage.confidence,
            urgency: parseFloat(opportunity.arbitrage.arbitrageDiff) > 10 ? 'HIGH' : 'MEDIUM',
            currentPrice: opportunity.arbitrage.binancePrice,
            strikePrice: opportunity.market.strikePrice,
            gapPercent: parseFloat(opportunity.arbitrage.priceDiffPercent),
            timeRemaining: 900, // 15dk varsayım
            timestamp: Date.now(),
            reason: `📊 Arbitraj: Binance ${opportunity.arbitrage.binanceYes}% vs Market ${opportunity.arbitrage.marketYes}%`
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ArbitrageScanner = ArbitrageScanner;
}
if (typeof self !== 'undefined') {
    self.ArbitrageScanner = ArbitrageScanner;
}
