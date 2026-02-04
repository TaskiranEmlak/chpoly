/**
 * Polymarket Tahmin Asistanı - Technical Indicators Utility
 * Teknik analiz hesaplamaları
 */

/**
 * Calculate Simple Moving Average (SMA)
 */
export function SMA(data, period) {
    if (data.length < period) return null;

    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function EMA(data, period) {
    if (data.length < period) return data[data.length - 1];

    const k = 2 / (period + 1);
    let ema = SMA(data.slice(0, period), period);

    for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }

    return ema;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function RSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
        const change = closes[closes.length - period - 1 + i] - closes[closes.length - period - 1 + i - 1];
        if (change >= 0) {
            gains += change;
        } else {
            losses -= change;
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export function MACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEMA = EMA(closes, fastPeriod);
    const slowEMA = EMA(closes, slowPeriod);
    const macdLine = fastEMA - slowEMA;

    // For signal line, we'd need historical MACD values
    // Simplified calculation
    const signalLine = macdLine * 0.85;
    const histogram = macdLine - signalLine;

    return {
        macdLine,
        signalLine,
        histogram,
        signal: histogram > 0 ? 'bullish' : histogram < 0 ? 'bearish' : 'neutral'
    };
}

/**
 * Calculate Bollinger Bands
 */
export function BollingerBands(closes, period = 20, stdDevMultiplier = 2) {
    if (closes.length < period) {
        const last = closes[closes.length - 1];
        return { upper: last, middle: last, lower: last, percentB: 50 };
    }

    const slice = closes.slice(-period);
    const middle = slice.reduce((sum, val) => sum + val, 0) / period;

    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = middle + (stdDev * stdDevMultiplier);
    const lower = middle - (stdDev * stdDevMultiplier);

    const currentPrice = closes[closes.length - 1];
    const percentB = ((currentPrice - lower) / (upper - lower)) * 100;

    return { upper, middle, lower, percentB };
}

/**
 * Calculate Stochastic Oscillator
 */
export function Stochastic(highs, lows, closes, period = 14) {
    if (closes.length < period) return { k: 50, d: 50 };

    const highSlice = highs.slice(-period);
    const lowSlice = lows.slice(-period);

    const highest = Math.max(...highSlice);
    const lowest = Math.min(...lowSlice);

    const currentClose = closes[closes.length - 1];
    const k = ((currentClose - lowest) / (highest - lowest)) * 100;

    // %D is typically a 3-period SMA of %K
    const d = k; // Simplified

    return {
        k,
        d,
        signal: k < 20 ? 'oversold' : k > 80 ? 'overbought' : 'neutral'
    };
}

/**
 * Calculate ATR (Average True Range)
 */
export function ATR(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return 0;

    const trueRanges = [];

    for (let i = 1; i < closes.length; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );

        trueRanges.push(tr);
    }

    return SMA(trueRanges.slice(-period), period);
}

/**
 * Calculate momentum
 */
export function Momentum(closes, period = 10) {
    if (closes.length < period + 1) return 0;

    const current = closes[closes.length - 1];
    const past = closes[closes.length - 1 - period];

    return ((current - past) / past) * 100;
}

/**
 * Detect support and resistance levels
 */
export function SupportResistance(highs, lows, period = 20) {
    if (highs.length < period) {
        return { support: lows[lows.length - 1], resistance: highs[highs.length - 1] };
    }

    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);

    return {
        resistance: Math.max(...recentHighs),
        support: Math.min(...recentLows)
    };
}

/**
 * Generate overall signal from multiple indicators
 */
export function generateSignal(closes, highs, lows) {
    const signals = {
        bullish: 0,
        bearish: 0,
        neutral: 0
    };

    // RSI
    const rsi = RSI(closes);
    if (rsi < 30) signals.bullish++;
    else if (rsi > 70) signals.bearish++;
    else signals.neutral++;

    // MACD
    const macd = MACD(closes);
    if (macd.histogram > 0) signals.bullish++;
    else if (macd.histogram < 0) signals.bearish++;
    else signals.neutral++;

    // Bollinger Bands
    const bb = BollingerBands(closes);
    if (bb.percentB < 20) signals.bullish++;
    else if (bb.percentB > 80) signals.bearish++;
    else signals.neutral++;

    // Momentum
    const momentum = Momentum(closes, 5);
    if (momentum > 0.5) signals.bullish++;
    else if (momentum < -0.5) signals.bearish++;
    else signals.neutral++;

    // EMA Cross
    const ema9 = EMA(closes, 9);
    const ema21 = EMA(closes, 21);
    if (ema9 > ema21) signals.bullish++;
    else signals.bearish++;

    // Determine overall signal
    const total = signals.bullish + signals.bearish + signals.neutral;
    let overallSignal = 'neutral';
    let confidence = 50;

    if (signals.bullish > signals.bearish && signals.bullish > signals.neutral) {
        overallSignal = 'bullish';
        confidence = Math.round((signals.bullish / total) * 100);
    } else if (signals.bearish > signals.bullish && signals.bearish > signals.neutral) {
        overallSignal = 'bearish';
        confidence = Math.round((signals.bearish / total) * 100);
    }

    return {
        signal: overallSignal,
        confidence,
        details: {
            bullish: signals.bullish,
            bearish: signals.bearish,
            neutral: signals.neutral
        }
    };
}
