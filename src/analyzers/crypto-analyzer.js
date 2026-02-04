/**
 * Gelişmiş Kripto Analiz Motoru
 * Multi-timeframe analiz, kalan süre stratejisi, gelişmiş göstergeler
 */

class CryptoAnalyzer {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 10000; // 10 saniye
    }

    /**
     * Ana analiz fonksiyonu
     */
    async analyze(market) {
        console.log('🔮 Gelişmiş kripto analizi başlıyor:', market.title);

        const result = {
            prediction: 'YES',
            confidence: 50,
            reasons: [],
            indicators: [],
            traderSignals: null,
            timeRemaining: null,
            strategy: null
        };

        try {
            // 1. Symbol ve strike price çıkar
            const { symbol, name, strikePrice } = this.parseMarket(market);

            // 2. Kalan süreyi hesapla
            const timeRemaining = this.calculateTimeRemaining(market.expiry);
            result.timeRemaining = timeRemaining;

            // 3. Strateji belirle
            result.strategy = this.determineStrategy(timeRemaining);

            // 4. Multi-timeframe veri çek
            const [data1m, data5m, data15m] = await Promise.all([
                this.fetchKlines(symbol, '1m', 100),
                this.fetchKlines(symbol, '5m', 50),
                this.fetchKlines(symbol, '15m', 30)
            ]);

            if (!data1m || data1m.length === 0) {
                throw new Error('Piyasa verisi alınamadı');
            }

            const currentPrice = data1m[data1m.length - 1].close;

            // 5. Tüm göstergeleri hesapla
            const indicators = this.calculateAllIndicators(data1m, data5m, data15m);

            // 6. Strike price gap analizi
            const gapAnalysis = this.analyzeStrikeGap(currentPrice, strikePrice);

            // 7. Volume analizi
            const volumeAnalysis = this.analyzeVolume(data1m, data5m);

            // 8. Final skor hesapla
            const scoring = this.calculateFinalScore(
                indicators,
                gapAnalysis,
                volumeAnalysis,
                result.strategy
            );

            result.prediction = scoring.prediction;
            result.confidence = scoring.confidence;

            // 9. Reasons oluştur
            result.reasons = this.buildReasons(
                name, currentPrice, strikePrice, gapAnalysis,
                indicators, volumeAnalysis, result.strategy, timeRemaining
            );

            // 10. Indicators for UI
            result.indicators = this.buildIndicatorsForUI(indicators);

        } catch (error) {
            console.error('Kripto analiz hatası:', error);
            result.reasons.push({
                sentiment: 'neutral',
                text: `Analiz hatası: ${error.message}`
            });
        }

        return result;
    }

    /**
     * Market bilgilerini parse et
     */
    parseMarket(market) {
        const title = market.title.toLowerCase();

        let symbol = 'BTCUSDT';
        let name = 'Bitcoin';

        if (title.includes('eth')) {
            symbol = 'ETHUSDT';
            name = 'Ethereum';
        } else if (title.includes('sol')) {
            symbol = 'SOLUSDT';
            name = 'Solana';
        } else if (title.includes('xrp')) {
            symbol = 'XRPUSDT';
            name = 'XRP';
        }

        // Strike price çıkar
        let strikePrice = market.strikePrice;
        if (!strikePrice) {
            const match = market.title.match(/\$?([\d,]+(?:\.\d+)?)/);
            if (match) {
                strikePrice = parseFloat(match[1].replace(/,/g, ''));
            }
        }

        return { symbol, name, strikePrice };
    }

    /**
     * Kalan süreyi hesapla (dakika)
     */
    calculateTimeRemaining(expiry) {
        if (!expiry) return null;

        console.log('⏱️ Expiry parsing:', expiry);

        const now = new Date();
        let expiryTime = null;

        // Format 1: "10:15AM" veya "10:15 AM"
        const ampmMatch = expiry.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (ampmMatch) {
            let hours = parseInt(ampmMatch[1]);
            const minutes = parseInt(ampmMatch[2]);
            const period = ampmMatch[3]?.toUpperCase();

            // AM/PM dönüşümü
            if (period === 'PM' && hours < 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;

            expiryTime = new Date();
            expiryTime.setHours(hours, minutes, 0, 0);

            // 15 dakikalık market kontrolü - eğer çok uzakta ise muhtemelen bugün değil
            // Kripto marketleri genellikle 15dk-1 saat içinde bitiyor
            const diffMs = expiryTime - now;
            const diffMinutes = diffMs / 60000;

            // Eğer negatif ise (geçmiş) ya da 24 saatten fazla ise
            if (diffMinutes < 0) {
                // Geçmiş, muhtemelen yarın
                expiryTime.setDate(expiryTime.getDate() + 1);
            } else if (diffMinutes > 60) {
                // 15-dakikalık marketler için 60 dk'dan fazla mantıklı değil
                // Muhtemelen yanlış gün, bugün aynı saate bakıyoruz
                console.log('⚠️ Çok uzun süre, 15dk market için normalize ediliyor');
                // 15 dakikalık market varsayımı - en yakın 15 dakikaya yuvarla
                const currentMinutes = now.getMinutes();
                const next15 = Math.ceil(currentMinutes / 15) * 15;
                expiryTime = new Date();
                expiryTime.setMinutes(next15, 0, 0);

                // Eğer şu anki dakikadan küçükse, sonraki 15dk bloğuna geç
                if (expiryTime <= now) {
                    expiryTime.setMinutes(expiryTime.getMinutes() + 15);
                }
            }
        }

        // Format 2: ISO date veya timestamp
        if (!expiryTime && expiry.includes('T')) {
            expiryTime = new Date(expiry);
        }

        // Format 3: Unix timestamp
        if (!expiryTime && /^\d{10,13}$/.test(expiry)) {
            expiryTime = new Date(parseInt(expiry) * (expiry.length === 10 ? 1000 : 1));
        }

        if (!expiryTime || isNaN(expiryTime.getTime())) {
            console.log('⚠️ Expiry parse edilemedi, tahmini 15 dk varsayılıyor');
            return 15; // Default 15 dakika
        }

        const diffMs = expiryTime - now;
        const diffMinutes = Math.floor(diffMs / 60000);

        console.log('✅ Kalan süre:', diffMinutes, 'dakika');
        return Math.max(0, Math.min(diffMinutes, 60)); // Max 60 dk (mantık kontrolü)
    }

    /**
     * Kalan süreye göre strateji belirle
     */
    determineStrategy(timeRemaining) {
        if (timeRemaining === null) {
            return { name: 'balanced', techWeight: 0.5, gapWeight: 0.35, volumeWeight: 0.15 };
        }

        if (timeRemaining > 10) {
            return { name: 'trend', techWeight: 0.60, gapWeight: 0.25, volumeWeight: 0.15 };
        } else if (timeRemaining > 5) {
            return { name: 'momentum', techWeight: 0.45, gapWeight: 0.40, volumeWeight: 0.15 };
        } else if (timeRemaining > 2) {
            return { name: 'gap_focus', techWeight: 0.25, gapWeight: 0.60, volumeWeight: 0.15 };
        } else {
            return { name: 'final', techWeight: 0.10, gapWeight: 0.80, volumeWeight: 0.10 };
        }
    }

    /**
     * Binance'den mum verisi çek
     */
    async fetchKlines(symbol, interval, limit) {
        const cacheKey = `${symbol}_${interval}`;
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
            const response = await fetch(url);
            const klines = await response.json();

            const data = klines.map(k => ({
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5])
            }));

            this.cache.set(cacheKey, { data, timestamp: Date.now() });
            return data;
        } catch (error) {
            console.error('Kline fetch error:', error);
            return null;
        }
    }

    /**
     * Tüm teknik göstergeleri hesapla
     */
    calculateAllIndicators(data1m, data5m, data15m) {
        const closes1m = data1m.map(d => d.close);
        const closes5m = data5m.map(d => d.close);
        const closes15m = data15m.map(d => d.close);

        return {
            // 1 dakikalık
            rsi_1m: this.calculateRSI(closes1m, 14),
            ema9_1m: this.calculateEMA(closes1m, 9),
            ema21_1m: this.calculateEMA(closes1m, 21),
            macd_1m: this.calculateMACD(closes1m),
            stochastic_1m: this.calculateStochastic(data1m, 14, 3),
            bollinger_1m: this.calculateBollinger(closes1m, 20, 2),

            // 5 dakikalık
            rsi_5m: this.calculateRSI(closes5m, 14),
            ema9_5m: this.calculateEMA(closes5m, 9),
            ema21_5m: this.calculateEMA(closes5m, 21),
            macd_5m: this.calculateMACD(closes5m),

            // 15 dakikalık
            rsi_15m: this.calculateRSI(closes15m, 14),
            ema9_15m: this.calculateEMA(closes15m, 9),
            ema21_15m: this.calculateEMA(closes15m, 21),

            // Son fiyat
            currentPrice: closes1m[closes1m.length - 1],
            momentum_5m: ((closes1m[closes1m.length - 1] - closes1m[closes1m.length - 6]) / closes1m[closes1m.length - 6]) * 100
        };
    }

    /**
     * RSI hesapla
     */
    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return 50;

        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change >= 0) gains += change;
            else losses -= change;
        }

        if (losses === 0) return 100;
        const rs = (gains / period) / (losses / period);
        return 100 - (100 / (1 + rs));
    }

    /**
     * EMA hesapla
     */
    calculateEMA(data, period) {
        if (data.length < period) return data[data.length - 1];

        const k = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

        for (let i = period; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
        }
        return ema;
    }

    /**
     * MACD hesapla (12, 26, 9)
     */
    calculateMACD(closes) {
        const ema12 = this.calculateEMA(closes, 12);
        const ema26 = this.calculateEMA(closes, 26);
        const macdLine = ema12 - ema26;

        // Signal line (9-period EMA of MACD)
        // Simplified: just use recent values
        const recentMacd = [];
        for (let i = Math.max(0, closes.length - 9); i < closes.length; i++) {
            const e12 = this.calculateEMA(closes.slice(0, i + 1), 12);
            const e26 = this.calculateEMA(closes.slice(0, i + 1), 26);
            recentMacd.push(e12 - e26);
        }
        const signalLine = recentMacd.reduce((a, b) => a + b, 0) / recentMacd.length;

        return {
            macd: macdLine,
            signal: signalLine,
            histogram: macdLine - signalLine
        };
    }

    /**
     * Stochastic hesapla (14, 3)
     */
    calculateStochastic(data, period = 14, smooth = 3) {
        if (data.length < period) return { k: 50, d: 50 };

        const recentData = data.slice(-period);
        const highs = recentData.map(d => d.high);
        const lows = recentData.map(d => d.low);
        const close = recentData[recentData.length - 1].close;

        const highestHigh = Math.max(...highs);
        const lowestLow = Math.min(...lows);

        const k = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;

        // D line (3-period SMA of K)
        const d = k; // Simplified

        return { k, d };
    }

    /**
     * Bollinger Bands hesapla
     */
    calculateBollinger(closes, period = 20, stdDev = 2) {
        if (closes.length < period) {
            return { upper: closes[closes.length - 1], middle: closes[closes.length - 1], lower: closes[closes.length - 1], position: 0.5 };
        }

        const recentCloses = closes.slice(-period);
        const sma = recentCloses.reduce((a, b) => a + b, 0) / period;

        const squaredDiffs = recentCloses.map(c => Math.pow(c - sma, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const std = Math.sqrt(variance);

        const upper = sma + (stdDev * std);
        const lower = sma - (stdDev * std);
        const current = closes[closes.length - 1];

        // Position: 0 = at lower, 0.5 = at middle, 1 = at upper
        const position = (current - lower) / (upper - lower);

        return { upper, middle: sma, lower, position };
    }

    /**
     * Strike price gap analizi
     */
    analyzeStrikeGap(currentPrice, strikePrice) {
        if (!strikePrice) {
            return { diff: 0, percentage: 0, direction: 'neutral', strength: 0 };
        }

        const diff = currentPrice - strikePrice;
        const percentage = (diff / strikePrice) * 100;
        const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';

        // Strength: 0-100 based on how confident the gap is
        // Closer to strike = less confident
        const strength = Math.min(100, Math.abs(percentage) * 20);

        return { diff, percentage, direction, strength };
    }

    /**
     * Volume analizi
     */
    analyzeVolume(data1m, data5m) {
        const recentVolume = data1m.slice(-5).reduce((a, d) => a + d.volume, 0);
        const avgVolume = data1m.slice(-30).reduce((a, d) => a + d.volume, 0) / 30;

        const volumeRatio = recentVolume / (avgVolume * 5);

        // Price direction with volume
        const priceChange = data1m[data1m.length - 1].close - data1m[data1m.length - 6].close;
        const volumeDirection = priceChange > 0 ? 'up' : 'down';

        return {
            ratio: volumeRatio,
            isHigh: volumeRatio > 1.2,
            isLow: volumeRatio < 0.8,
            direction: volumeDirection,
            strength: Math.min(100, volumeRatio * 50)
        };
    }

    /**
     * Final skor hesapla
     * KRİTİK: Son dakikalarda gap analizi çok dominant olmalı!
     */
    calculateFinalScore(indicators, gapAnalysis, volumeAnalysis, strategy) {
        console.log('📊 Skor hesaplanıyor...');
        console.log('📊 Gap analizi:', gapAnalysis);
        console.log('📊 Strateji:', strategy.name);

        let bullishScore = 0;
        let bearishScore = 0;

        // === PRICE GAP ÇOK ÖNEMLİ ===
        // Eğer fiyat strike'ın %0.3'ünden fazla üstündeyse ve az süre kaldıysa
        // Bu neredeyse kesin YES demek
        if (gapAnalysis.direction !== 'neutral' && strategy.name === 'final') {
            // Son 2 dakika - sadece gap'e bak!
            if (Math.abs(gapAnalysis.percentage) > 0.3) {
                // Fiyat farkı %0.3'ten fazla - çok güçlü sinyal
                if (gapAnalysis.direction === 'up') {
                    console.log('🎯 FINAL MODE: Fiyat strike üstünde, YES tahmin');
                    return {
                        prediction: 'YES',
                        confidence: Math.min(95, 70 + Math.abs(gapAnalysis.percentage) * 10),
                        bullishScore: 100,
                        bearishScore: 0
                    };
                } else {
                    console.log('🎯 FINAL MODE: Fiyat strike altında, NO tahmin');
                    return {
                        prediction: 'NO',
                        confidence: Math.min(95, 70 + Math.abs(gapAnalysis.percentage) * 10),
                        bullishScore: 0,
                        bearishScore: 100
                    };
                }
            }
        }

        // Gap odaklı stratejilerde de gap'e çok ağırlık ver
        if (strategy.name === 'gap_focus' && Math.abs(gapAnalysis.percentage) > 0.2) {
            const gapConfidence = Math.min(90, 60 + Math.abs(gapAnalysis.percentage) * 8);
            if (gapAnalysis.direction === 'up') {
                return {
                    prediction: 'YES',
                    confidence: gapConfidence,
                    bullishScore: 80,
                    bearishScore: 20
                };
            } else if (gapAnalysis.direction === 'down') {
                return {
                    prediction: 'NO',
                    confidence: gapConfidence,
                    bullishScore: 20,
                    bearishScore: 80
                };
            }
        }

        // === Normal scoring devam ===
        // Technical Analysis
        const techWeight = strategy.techWeight;

        // RSI (combine timeframes)
        const avgRsi = (indicators.rsi_1m * 0.3 + indicators.rsi_5m * 0.4 + indicators.rsi_15m * 0.3);
        if (avgRsi < 40) bullishScore += 15 * techWeight;
        else if (avgRsi > 60) bearishScore += 15 * techWeight;

        // EMA Cross (1m)
        if (indicators.ema9_1m > indicators.ema21_1m) bullishScore += 10 * techWeight;
        else bearishScore += 10 * techWeight;

        // EMA Cross (5m) - more weight
        if (indicators.ema9_5m > indicators.ema21_5m) bullishScore += 15 * techWeight;
        else bearishScore += 15 * techWeight;

        // MACD (1m)
        if (indicators.macd_1m.histogram > 0) bullishScore += 10 * techWeight;
        else bearishScore += 10 * techWeight;

        // Stochastic
        if (indicators.stochastic_1m.k < 30) bullishScore += 10 * techWeight;
        else if (indicators.stochastic_1m.k > 70) bearishScore += 10 * techWeight;

        // Bollinger position
        if (indicators.bollinger_1m.position < 0.3) bullishScore += 10 * techWeight;
        else if (indicators.bollinger_1m.position > 0.7) bearishScore += 10 * techWeight;

        // Momentum
        if (indicators.momentum_5m > 0.1) bullishScore += 15 * techWeight;
        else if (indicators.momentum_5m < -0.1) bearishScore += 15 * techWeight;

        // === Gap Analysis - daha yüksek puan ===
        const gapWeight = strategy.gapWeight;
        const gapScore = Math.min(100, Math.abs(gapAnalysis.percentage) * 30 + 20);

        if (gapAnalysis.direction === 'up') {
            bullishScore += gapScore * gapWeight;
        } else if (gapAnalysis.direction === 'down') {
            bearishScore += gapScore * gapWeight;
        }

        // === Volume Analysis ===
        const volumeWeight = strategy.volumeWeight;

        if (volumeAnalysis.isHigh) {
            if (volumeAnalysis.direction === 'up') bullishScore += 30 * volumeWeight;
            else bearishScore += 30 * volumeWeight;
        }

        // Calculate final
        const totalScore = bullishScore + bearishScore;
        const prediction = bullishScore >= bearishScore ? 'YES' : 'NO';
        const winningScore = Math.max(bullishScore, bearishScore);
        const losingScore = Math.min(bullishScore, bearishScore);

        // Confidence: fark ne kadar büyükse o kadar emin
        let confidence = 50;
        if (totalScore > 0) {
            const ratio = winningScore / totalScore;
            confidence = Math.round(50 + (ratio - 0.5) * 80);
        }

        console.log(`📊 Skor: Bullish=${bullishScore.toFixed(1)}, Bearish=${bearishScore.toFixed(1)}, Tahmin=${prediction}`);

        return {
            prediction,
            confidence: Math.max(50, Math.min(95, confidence)),
            bullishScore,
            bearishScore
        };
    }

    /**
     * Reasons oluştur
     */
    buildReasons(name, currentPrice, strikePrice, gapAnalysis, indicators, volumeAnalysis, strategy, timeRemaining) {
        const reasons = [];

        // 1. Fiyat ve hedef
        if (strikePrice) {
            const isUp = gapAnalysis.direction === 'up';
            reasons.push({
                sentiment: isUp ? 'bullish' : 'bearish',
                text: `<strong>${name}</strong> $${currentPrice.toLocaleString()} (hedef: $${strikePrice.toLocaleString()}, ${isUp ? '+' : ''}${gapAnalysis.percentage.toFixed(2)}%)`
            });
        } else {
            reasons.push({
                sentiment: indicators.momentum_5m > 0 ? 'bullish' : 'bearish',
                text: `<strong>${name}</strong> $${currentPrice.toLocaleString()} (${indicators.momentum_5m > 0 ? '+' : ''}${indicators.momentum_5m.toFixed(2)}%)`
            });
        }

        // 2. Kalan süre ve strateji
        if (timeRemaining !== null) {
            const strategyNames = {
                'trend': 'Trend analizi',
                'momentum': 'Momentum odaklı',
                'gap_focus': 'Hedef odaklı',
                'final': 'Son dakika',
                'balanced': 'Dengeli'
            };
            reasons.push({
                sentiment: 'neutral',
                text: `<strong>Strateji:</strong> ${strategyNames[strategy.name]} (${timeRemaining} dk kaldı)`
            });
        }

        // 3. RSI
        const avgRsi = (indicators.rsi_1m * 0.3 + indicators.rsi_5m * 0.4 + indicators.rsi_15m * 0.3);
        reasons.push({
            sentiment: avgRsi < 35 ? 'bullish' : avgRsi > 65 ? 'bearish' : 'neutral',
            text: `<strong>RSI:</strong> ${avgRsi.toFixed(0)} - ${avgRsi < 30 ? 'Aşırı satım' : avgRsi > 70 ? 'Aşırı alım' : 'Nötr'}`
        });

        // 4. Trend (EMA)
        const trend5m = indicators.ema9_5m > indicators.ema21_5m;
        const trend15m = indicators.ema9_15m > indicators.ema21_15m;
        const trendConsistent = trend5m === trend15m;

        reasons.push({
            sentiment: trend5m ? 'bullish' : 'bearish',
            text: `<strong>Trend:</strong> ${trend5m ? 'Yukarı' : 'Aşağı'} ${trendConsistent ? '(tüm zaman dilimlerinde)' : '(karışık sinyaller)'}`
        });

        // 5. MACD
        const macdBullish = indicators.macd_1m.histogram > 0;
        reasons.push({
            sentiment: macdBullish ? 'bullish' : 'bearish',
            text: `<strong>MACD:</strong> ${macdBullish ? 'Pozitif' : 'Negatif'} histogram`
        });

        // 6. Volume
        if (volumeAnalysis.isHigh) {
            reasons.push({
                sentiment: volumeAnalysis.direction === 'up' ? 'bullish' : 'bearish',
                text: `<strong>Hacim:</strong> Yüksek - ${volumeAnalysis.direction === 'up' ? 'alım' : 'satım'} baskısı`
            });
        }

        return reasons;
    }

    /**
     * UI için indicators oluştur
     */
    buildIndicatorsForUI(indicators) {
        return [
            {
                name: 'RSI',
                value: indicators.rsi_1m.toFixed(0),
                signal: indicators.rsi_1m < 40 ? 'bullish' : indicators.rsi_1m > 60 ? 'bearish' : 'neutral'
            },
            {
                name: 'MACD',
                value: indicators.macd_1m.histogram > 0 ? 'Pozitif' : 'Negatif',
                signal: indicators.macd_1m.histogram > 0 ? 'bullish' : 'bearish'
            },
            {
                name: 'Stoch',
                value: indicators.stochastic_1m.k.toFixed(0),
                signal: indicators.stochastic_1m.k < 30 ? 'bullish' : indicators.stochastic_1m.k > 70 ? 'bearish' : 'neutral'
            },
            {
                name: 'Trend',
                value: indicators.ema9_5m > indicators.ema21_5m ? 'Yukarı' : 'Aşağı',
                signal: indicators.ema9_5m > indicators.ema21_5m ? 'bullish' : 'bearish'
            }
        ];
    }
}

// Export for use
window.CryptoAnalyzer = CryptoAnalyzer;
