/**
 * Polymarket Data API v2
 * Geliştirilmiş trader sinyalleri ve market verileri
 */

class PolymarketDataAPI {
    constructor() {
        this.gammaUrl = 'https://gamma-api.polymarket.com';
        this.cache = new Map();
        this.cacheTimeout = 15000; // 15 saniye
    }

    /**
     * Event/Market bilgisi çek - slug ile
     */
    async getEvent(slug) {
        if (!slug) {
            console.log('❌ Slug boş');
            return null;
        }

        const cacheKey = `event_${slug}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            // Try events endpoint
            console.log('🔍 Fetching event:', slug);
            const response = await fetch(`${this.gammaUrl}/events?slug=${slug}`);

            if (!response.ok) {
                console.log('❌ Events API yanıt vermedi:', response.status);
                return null;
            }

            const events = await response.json();

            if (events && events.length > 0) {
                const event = events[0];
                console.log('✅ Event bulundu:', event.title || event.question);
                this.cache.set(cacheKey, { data: event, timestamp: Date.now() });
                return event;
            }

            // If no event found, try markets endpoint
            console.log('🔍 Event bulunamadı, markets endpoint deneniyor...');
            const marketsResponse = await fetch(`${this.gammaUrl}/markets?slug=${slug}`);

            if (marketsResponse.ok) {
                const markets = await marketsResponse.json();
                if (markets && markets.length > 0) {
                    console.log('✅ Market bulundu');
                    return { markets };
                }
            }

            return null;
        } catch (error) {
            console.error('❌ Event fetch error:', error);
            return null;
        }
    }

    /**
     * Market activity çek (trades from event)
     */
    async getMarketActivity(eventId) {
        if (!eventId) return null;

        try {
            // Get recent activity for this event
            const response = await fetch(`${this.gammaUrl}/events/${eventId}/activity?limit=50`);

            if (!response.ok) {
                // Try alternative endpoint
                const altResponse = await fetch(`${this.gammaUrl}/activity?event=${eventId}&limit=50`);
                if (!altResponse.ok) return null;
                return await altResponse.json();
            }

            return await response.json();
        } catch (error) {
            console.log('Activity fetch error (not critical):', error);
            return null;
        }
    }

    /**
     * Top traders analizi - market içinden çıkar
     */
    analyzeMarketData(event) {
        if (!event) return null;

        const result = {
            available: true,
            yesBias: 50,
            noBias: 50,
            sentiment: 'neutral',
            details: []
        };

        try {
            // Markets array'den outcome'ları çek
            const markets = event.markets || [];

            if (markets.length === 0 && event.outcomes) {
                // Single market event
                this.analyzeOutcomes(event.outcomes, result);
            } else if (markets.length > 0) {
                // Multi-market event - first market usually main one
                const mainMarket = markets[0];

                if (mainMarket.outcomePrices) {
                    // Parse outcome prices
                    try {
                        const prices = JSON.parse(mainMarket.outcomePrices);
                        if (prices && prices.length >= 2) {
                            const yesPrice = parseFloat(prices[0]) * 100;
                            const noPrice = parseFloat(prices[1]) * 100;

                            result.yesBias = yesPrice;
                            result.noBias = noPrice;

                            result.details.push({
                                type: 'marketPrice',
                                sentiment: yesPrice > 55 ? 'bullish' : yesPrice < 45 ? 'bearish' : 'neutral',
                                text: `Market Fiyatı: YES ${yesPrice.toFixed(0)}% / NO ${noPrice.toFixed(0)}%`
                            });
                        }
                    } catch (e) {
                        console.log('Price parse error:', e);
                    }
                }

                // Volume bilgisi
                if (mainMarket.volume || mainMarket.volumeNum) {
                    const volume = mainMarket.volumeNum || parseFloat(mainMarket.volume) || 0;
                    const volumeFormatted = volume >= 1000000
                        ? (volume / 1000000).toFixed(1) + 'M'
                        : volume >= 1000
                            ? (volume / 1000).toFixed(1) + 'K'
                            : volume.toFixed(0);

                    result.details.push({
                        type: 'volume',
                        sentiment: 'neutral',
                        text: `İşlem Hacmi: $${volumeFormatted}`
                    });
                }

                // Liquidity/Open Interest
                if (mainMarket.liquidity || mainMarket.openInterest) {
                    const liquidity = mainMarket.liquidity || mainMarket.openInterest;
                    result.details.push({
                        type: 'liquidity',
                        sentiment: 'neutral',
                        text: `Likidite: $${parseFloat(liquidity).toLocaleString()}`
                    });
                }
            }

            // Sentiment hesapla
            if (result.yesBias > 55) result.sentiment = 'bullish';
            else if (result.yesBias < 45) result.sentiment = 'bearish';

        } catch (error) {
            console.error('Market data analysis error:', error);
            result.available = false;
        }

        return result;
    }

    /**
     * Outcomes analizi
     */
    analyzeOutcomes(outcomes, result) {
        if (!outcomes || outcomes.length === 0) return;

        outcomes.forEach(outcome => {
            const price = outcome.price || outcome.lastTradePrice;
            if (price) {
                const pricePct = parseFloat(price) * 100;
                const name = outcome.name || outcome.value || 'Unknown';

                if (name.toLowerCase() === 'yes' || name.toLowerCase() === 'up') {
                    result.yesBias = pricePct;
                    result.noBias = 100 - pricePct;
                }
            }
        });
    }

    /**
     * Ana fonksiyon - trader sinyalleri al
     */
    async getTraderSignals(market) {
        console.log('🔍 Trader sinyalleri alınıyor...', market.slug);

        const result = {
            available: false,
            yesBias: 50,
            noBias: 50,
            sentiment: 'neutral',
            details: []
        };

        if (!market.slug) {
            console.log('❌ Market slug yok');
            result.details.push('Market bilgisi eksik');
            return result;
        }

        try {
            // 1. Event verisi çek
            const event = await this.getEvent(market.slug);

            if (!event) {
                result.details.push('API\'den veri alınamadı');
                return result;
            }

            // 2. Market verisi analiz et
            const marketAnalysis = this.analyzeMarketData(event);

            if (marketAnalysis && marketAnalysis.available) {
                result.available = true;
                result.yesBias = marketAnalysis.yesBias;
                result.noBias = marketAnalysis.noBias;
                result.sentiment = marketAnalysis.sentiment;
                result.details = marketAnalysis.details;
            }

            // 3. Activity verisi çek (opsiyonel)
            const eventId = event.id || event._id;
            if (eventId) {
                const activity = await this.getMarketActivity(eventId);
                if (activity && activity.length > 0) {
                    const recentActivity = this.analyzeActivity(activity);
                    if (recentActivity) {
                        result.details.push(recentActivity);

                        // Activity'ye göre bias'ı hafifçe ayarla
                        if (recentActivity.sentiment === 'bullish') {
                            result.yesBias = Math.min(100, result.yesBias + 3);
                            result.noBias = Math.max(0, result.noBias - 3);
                        } else if (recentActivity.sentiment === 'bearish') {
                            result.yesBias = Math.max(0, result.yesBias - 3);
                            result.noBias = Math.min(100, result.noBias + 3);
                        }
                    }
                }
            }

            console.log('✅ Trader sinyalleri alındı:', result);

        } catch (error) {
            console.error('❌ Trader signals error:', error);
            result.details.push('Veri alınırken hata oluştu');
        }

        return result;
    }

    /**
     * Activity analizi
     */
    analyzeActivity(activity) {
        if (!activity || activity.length === 0) return null;

        let buyCount = 0;
        let sellCount = 0;
        let yesCount = 0;
        let noCount = 0;

        activity.slice(0, 20).forEach(act => {
            if (act.type === 'BUY' || act.side === 'BUY') buyCount++;
            if (act.type === 'SELL' || act.side === 'SELL') sellCount++;
            if (act.outcome === 'Yes' || act.outcome === 'YES') yesCount++;
            if (act.outcome === 'No' || act.outcome === 'NO') noCount++;
        });

        let sentiment = 'neutral';
        let text = '';

        if (buyCount > sellCount * 1.3) {
            sentiment = 'bullish';
            text = `Son ${activity.length} işlem: Alım ağırlıklı`;
        } else if (sellCount > buyCount * 1.3) {
            sentiment = 'bearish';
            text = `Son ${activity.length} işlem: Satım ağırlıklı`;
        } else {
            text = `Son ${activity.length} işlem: Dengeli`;
        }

        return {
            type: 'recentActivity',
            sentiment,
            text
        };
    }
}

// Export
window.PolymarketDataAPI = PolymarketDataAPI;
