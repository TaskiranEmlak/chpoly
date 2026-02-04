/**
 * Polymarket Tahmin Asistanı - Crypto API Client
 * Binance ve diğer kripto API'leri
 */

const BINANCE_API = 'https://api.binance.com/api/v3';

/**
 * Get current price
 */
export async function getPrice(symbol) {
    const response = await fetch(`${BINANCE_API}/ticker/price?symbol=${symbol}`);
    if (!response.ok) throw new Error('Fiyat alınamadı');

    const data = await response.json();
    return {
        symbol: data.symbol,
        price: parseFloat(data.price)
    };
}

/**
 * Get 24h ticker info
 */
export async function get24hTicker(symbol) {
    const response = await fetch(`${BINANCE_API}/ticker/24hr?symbol=${symbol}`);
    if (!response.ok) throw new Error('Ticker alınamadı');

    const data = await response.json();
    return {
        symbol: data.symbol,
        priceChange: parseFloat(data.priceChange),
        priceChangePercent: parseFloat(data.priceChangePercent),
        weightedAvgPrice: parseFloat(data.weightedAvgPrice),
        lastPrice: parseFloat(data.lastPrice),
        volume: parseFloat(data.volume),
        quoteVolume: parseFloat(data.quoteVolume),
        highPrice: parseFloat(data.highPrice),
        lowPrice: parseFloat(data.lowPrice)
    };
}

/**
 * Get klines/candlestick data
 */
export async function getKlines(symbol, interval = '1m', limit = 100) {
    const response = await fetch(
        `${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!response.ok) throw new Error('Kline verisi alınamadı');

    const data = await response.json();

    return data.map(k => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
        quoteVolume: parseFloat(k[7]),
        trades: k[8]
    }));
}

/**
 * Get multiple prices
 */
export async function getPrices(symbols) {
    const prices = {};

    for (const symbol of symbols) {
        try {
            const data = await getPrice(symbol);
            prices[symbol] = data.price;
        } catch (error) {
            console.error(`${symbol} fiyatı alınamadı:`, error);
        }
    }

    return prices;
}

/**
 * Get orderbook
 */
export async function getOrderbook(symbol, limit = 20) {
    const response = await fetch(
        `${BINANCE_API}/depth?symbol=${symbol}&limit=${limit}`
    );
    if (!response.ok) throw new Error('Orderbook alınamadı');

    const data = await response.json();

    return {
        lastUpdateId: data.lastUpdateId,
        bids: data.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
        asks: data.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }))
    };
}

/**
 * Get recent trades
 */
export async function getRecentTrades(symbol, limit = 50) {
    const response = await fetch(
        `${BINANCE_API}/trades?symbol=${symbol}&limit=${limit}`
    );
    if (!response.ok) throw new Error('İşlemler alınamadı');

    const data = await response.json();

    return data.map(t => ({
        id: t.id,
        price: parseFloat(t.price),
        qty: parseFloat(t.qty),
        time: t.time,
        isBuyerMaker: t.isBuyerMaker
    }));
}

/**
 * Analyze buy/sell pressure from recent trades
 */
export async function analyzeTradePressure(symbol) {
    const trades = await getRecentTrades(symbol, 100);

    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of trades) {
        if (trade.isBuyerMaker) {
            sellVolume += trade.qty * trade.price;
        } else {
            buyVolume += trade.qty * trade.price;
        }
    }

    const total = buyVolume + sellVolume;
    const buyPercent = total > 0 ? (buyVolume / total * 100) : 50;

    return {
        buyVolume,
        sellVolume,
        buyPercent,
        sellPercent: 100 - buyPercent,
        pressure: buyPercent > 55 ? 'buy' : buyPercent < 45 ? 'sell' : 'neutral'
    };
}
