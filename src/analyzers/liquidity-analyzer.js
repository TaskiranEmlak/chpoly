/**
 * Polymarket Likidite Analyzer
 * Order book analizi, slippage hesaplama ve max trade size tavsiyesi
 */

class LiquidityAnalyzer {
    constructor() {
        this.clobUrl = 'https://clob.polymarket.com';
    }

    /**
     * Market için likidite analizi yap
     * @param {string} tokenId - Market token ID
     * @returns {Object} Likidite raporu
     */
    async analyze(tokenId) {
        try {
            const orderBook = await this.getOrderBook(tokenId);
            if (!orderBook) {
                return { available: false, reason: 'Order book alınamadı' };
            }

            const bidLiquidity = this.calculateLiquidity(orderBook.bids);
            const askLiquidity = this.calculateLiquidity(orderBook.asks);

            const spread = this.calculateSpread(orderBook);
            const slippage = this.calculateSlippage(orderBook);
            const safeTrade = this.calculateSafeTradeSize(orderBook);

            return {
                available: true,
                bids: bidLiquidity,
                asks: askLiquidity,
                spread: spread,
                slippage: slippage,
                safeTradeSize: safeTrade,
                recommendation: this.getRecommendation(spread, safeTrade)
            };
        } catch (error) {
            console.error('Liquidity analysis error:', error);
            return { available: false, reason: error.message };
        }
    }

    /**
     * CLOB API'den order book çek
     */
    async getOrderBook(tokenId) {
        try {
            const response = await fetch(`${this.clobUrl}/book?token_id=${tokenId}`);
            if (!response.ok) return null;

            const data = await response.json();
            return {
                bids: this.parseOrders(data.bids || []),
                asks: this.parseOrders(data.asks || [])
            };
        } catch (error) {
            console.error('Order book fetch error:', error);
            return null;
        }
    }

    /**
     * Order'ları parse et
     */
    parseOrders(orders) {
        return orders.map(o => ({
            price: parseFloat(o.price),
            size: parseFloat(o.size)
        })).sort((a, b) => b.price - a.price); // en iyi fiyattan başla
    }

    /**
     * Toplam likiditeyi hesapla
     */
    calculateLiquidity(orders) {
        let totalSize = 0;
        let totalValue = 0;

        for (const order of orders) {
            totalSize += order.size;
            totalValue += order.size * order.price;
        }

        return {
            totalSize: Math.round(totalSize),
            totalValue: Math.round(totalValue),
            orderCount: orders.length,
            avgPrice: orders.length > 0 ? (totalValue / totalSize).toFixed(2) : 0
        };
    }

    /**
     * Bid-Ask spread hesapla
     */
    calculateSpread(orderBook) {
        if (!orderBook.bids.length || !orderBook.asks.length) {
            return { value: null, percent: null, status: 'unknown' };
        }

        const bestBid = orderBook.bids[0].price;
        const bestAsk = orderBook.asks[orderBook.asks.length - 1]?.price || orderBook.asks[0].price;

        const spreadValue = bestAsk - bestBid;
        const spreadPercent = (spreadValue / bestAsk) * 100;

        let status = 'good';
        if (spreadPercent > 5) status = 'poor';
        else if (spreadPercent > 2) status = 'fair';

        return {
            value: spreadValue.toFixed(3),
            percent: spreadPercent.toFixed(2),
            bestBid: bestBid,
            bestAsk: bestAsk,
            status: status
        };
    }

    /**
     * Slippage tahmini ($100, $500, $1000 için)
     */
    calculateSlippage(orderBook) {
        const amounts = [100, 500, 1000, 5000];
        const slippage = {};

        for (const amount of amounts) {
            slippage[`$${amount}`] = {
                buy: this.estimateSlippage(orderBook.asks, amount, 'buy'),
                sell: this.estimateSlippage(orderBook.bids, amount, 'sell')
            };
        }

        return slippage;
    }

    /**
     * Belirli tutar için slippage hesapla
     */
    estimateSlippage(orders, targetAmount, side) {
        if (!orders.length) return { percent: null, executable: false };

        let remainingAmount = targetAmount;
        let totalCost = 0;
        let filledSize = 0;

        // Satın alma için en düşük fiyattan başla, satış için en yüksek
        const sortedOrders = side === 'buy'
            ? [...orders].sort((a, b) => a.price - b.price)
            : [...orders].sort((a, b) => b.price - a.price);

        const startPrice = sortedOrders[0]?.price || 0;

        for (const order of sortedOrders) {
            const orderValue = order.size * order.price;

            if (orderValue >= remainingAmount) {
                // Bu order yeterli
                const neededSize = remainingAmount / order.price;
                totalCost += order.price * neededSize;
                filledSize += neededSize;
                remainingAmount = 0;
                break;
            } else {
                // Bu order'ı tamamen kullan
                totalCost += orderValue;
                filledSize += order.size;
                remainingAmount -= orderValue;
            }
        }

        if (remainingAmount > 0) {
            return {
                percent: null,
                executable: false,
                reason: `Yetersiz likidite (${Math.round((1 - remainingAmount / targetAmount) * 100)}% doldurulabilir)`
            };
        }

        const avgPrice = totalCost / filledSize;
        const slippagePercent = Math.abs((avgPrice - startPrice) / startPrice) * 100;

        return {
            percent: slippagePercent.toFixed(2),
            avgPrice: avgPrice.toFixed(3),
            executable: true
        };
    }

    /**
     * Güvenli işlem tutarını hesapla (%1 max slippage)
     */
    calculateSafeTradeSize(orderBook) {
        const maxSlippage = 1; // %1
        const sides = ['buy', 'sell'];
        let safeSizes = {};

        for (const side of sides) {
            const orders = side === 'buy' ? orderBook.asks : orderBook.bids;

            if (!orders.length) {
                safeSizes[side] = 0;
                continue;
            }

            const startPrice = orders[0].price;
            let accumulated = 0;
            let safeAmount = 0;

            for (const order of orders) {
                const slippage = Math.abs((order.price - startPrice) / startPrice) * 100;

                if (slippage <= maxSlippage) {
                    const orderValue = order.size * order.price;
                    accumulated += orderValue;
                    safeAmount = accumulated;
                } else {
                    break;
                }
            }

            safeSizes[side] = Math.round(safeAmount);
        }

        return {
            buy: safeSizes.buy,
            sell: safeSizes.sell,
            recommended: Math.min(safeSizes.buy, safeSizes.sell)
        };
    }

    /**
     * Tavsiye mesajı oluştur
     */
    getRecommendation(spread, safeTrade) {
        const messages = [];

        if (spread.status === 'poor') {
            messages.push(`⚠️ Spread çok yüksek (${spread.percent}%). Dikkatli ol!`);
        }

        if (safeTrade.recommended < 100) {
            messages.push(`🚨 Düşük likidite! Max $${safeTrade.recommended} işlem önerilir.`);
        } else if (safeTrade.recommended < 500) {
            messages.push(`⚠️ Orta likidite. Max $${safeTrade.recommended} işlem önerilir.`);
        } else {
            messages.push(`✅ İyi likidite. $${safeTrade.recommended}'a kadar güvenli.`);
        }

        return messages;
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.LiquidityAnalyzer = LiquidityAnalyzer;
}
