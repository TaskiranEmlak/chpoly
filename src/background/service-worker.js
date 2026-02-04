/**
 * Polymarket AI - Background Service Worker v2
 * Market tarama ve sinyal sistemi entegre
 */

console.log('🚀 Polymarket AI Background Service Worker v2 başlatıldı');

// State
let scannerEnabled = false;
let marketScanner = null;
let notificationManager = null;

// === MARKET SCANNER ===

class MarketScanner {
    constructor() {
        this.gammaUrl = 'https://gamma-api.polymarket.com';
        this.activeMarkets = new Map();
        this.scanInterval = null;
        this.onSignal = null;
    }

    start(intervalMs = 10000) {
        console.log('🔍 Market Scanner başlatıldı');
        this.scan();
        this.scanInterval = setInterval(() => this.scan(), intervalMs);
    }

    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        console.log('⏹️ Market Scanner durduruldu');
    }

    async scan() {
        try {
            const markets = await this.findActiveMarkets();

            for (const market of markets) {
                await this.evaluateMarket(market);
            }
        } catch (error) {
            console.error('Scan error:', error);
        }
    }

    async findActiveMarkets() {
        const markets = [];
        const seenIds = new Set();

        // Helper to fetch and process
        const fetchAndProcess = async (params) => {
            try {
                const response = await fetch(`${this.gammaUrl}/events?active=true&${params}`);
                if (response.ok) {
                    const events = await response.json();
                    for (const event of events) {
                        if (!seenIds.has(event.id)) {
                            seenIds.add(event.id);
                            // Ekstra kontrol: slug içinde 15m yoksa atla
                            if (!event.slug?.includes('15m')) continue;

                            const processed = this.processEvent(event);
                            if (processed) markets.push(processed);
                        }
                    }
                }
            } catch (e) {
                console.error('Fetch error:', params, e);
            }
        };

        // Paralel aramalar: BTC, ETH, 15m tagleri
        await Promise.all([
            fetchAndProcess('slug_contains=btc-updown-15m'), // Spesifik BTC 15m
            fetchAndProcess('slug_contains=eth-updown-15m'), // Spesifik ETH 15m
            fetchAndProcess('limit=50&slug_contains=15m')    // Genel 15m araması
        ]);

        return markets;
    }

    processEvent(event) {
        try {
            const slug = event.slug || '';

            let coin = 'BTC';
            let binanceSymbol = 'BTCUSDT';

            if (slug.includes('eth')) {
                coin = 'ETH';
                binanceSymbol = 'ETHUSDT';
            } else if (slug.includes('sol')) {
                coin = 'SOL';
                binanceSymbol = 'SOLUSDT';
            }

            // Timestamp'i slug'dan çıkar
            let endTime = null;
            const timestampMatch = slug.match(/(\d{10,13})$/);
            if (timestampMatch) {
                const ts = parseInt(timestampMatch[1]);
                endTime = ts.toString().length === 10 ? ts * 1000 : ts;
            } else if (event.endDate) {
                endTime = new Date(event.endDate).getTime();
            }

            // Strike price
            let strikePrice = null;

            if (event.markets && event.markets.length > 0) {
                const market = event.markets[0];
                const desc = market.description || event.description || '';
                const priceMatch = desc.match(/\$?([\d,]+\.?\d*)/);
                if (priceMatch) {
                    strikePrice = parseFloat(priceMatch[1].replace(/,/g, ''));
                }
            }

            if (!endTime) return null;

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
            return null;
        }
    }

    async evaluateMarket(market) {
        const now = Date.now();
        const timeRemaining = market.endTime - now;

        // Son 2 dakika
        if (timeRemaining <= 0 || timeRemaining > 120000) return;

        console.log(`⏱️ ${market.coin}: ${Math.round(timeRemaining / 1000)} sn kaldı`);

        if (!market.strikePrice) return;

        const currentPrice = await this.getCurrentPrice(market.binanceSymbol);
        if (!currentPrice) return;

        const gapPercent = ((currentPrice - market.strikePrice) / market.strikePrice) * 100;
        const timeSeconds = Math.round(timeRemaining / 1000);

        console.log(`📊 ${market.coin}: $${currentPrice.toLocaleString()} vs $${market.strikePrice.toLocaleString()} = ${gapPercent.toFixed(3)}%`);

        const signal = this.calculateSignal(timeSeconds, gapPercent, market, currentPrice);

        if (signal && this.onSignal) {
            this.onSignal(signal);
        }
    }

    calculateSignal(timeSeconds, gapPercent, market, currentPrice) {
        const absGap = Math.abs(gapPercent);
        const direction = gapPercent > 0 ? 'YES' : 'NO';

        let confidence = 0;
        let shouldSignal = false;

        if (timeSeconds <= 30 && absGap >= 0.2) {
            confidence = 95;
            shouldSignal = true;
        } else if (timeSeconds <= 60 && absGap >= 0.4) {
            confidence = 90;
            shouldSignal = true;
        } else if (timeSeconds <= 120 && absGap >= 0.6) {
            confidence = 85;
            shouldSignal = true;
        }

        if (!shouldSignal) return null;

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
            reason: `${timeSeconds}sn, ${gapPercent > 0 ? '+' : ''}${gapPercent.toFixed(2)}% fark`
        };
    }

    async getCurrentPrice(symbol) {
        try {
            const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
            const data = await response.json();
            return parseFloat(data.price);
        } catch (error) {
            return null;
        }
    }
}

// === NOTIFICATION MANAGER ===

class NotificationManager {
    constructor() {
        this.recentNotifications = new Map();
        this.notificationTimeout = 30000;
    }

    async sendSignal(signal) {
        const key = `${signal.market.id}_${signal.action}`;
        const lastNotification = this.recentNotifications.get(key);

        if (lastNotification && Date.now() - lastNotification < this.notificationTimeout) {
            return;
        }

        this.recentNotifications.set(key, Date.now());

        const title = `🚨 ${signal.action} - ${signal.market.coin}`;
        const message = `💰 %${signal.confidence} | $${signal.currentPrice.toLocaleString()} | ⏱️ ${signal.timeRemaining}sn`;

        try {
            await chrome.notifications.create(`signal_${Date.now()}`, {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: title,
                message: message,
                priority: 2,
                requireInteraction: true
            });

            await chrome.storage.local.set({
                lastSignal: signal,
                lastSignalUrl: signal.market.url
            });

            // Badge güncelle
            chrome.action.setBadgeText({ text: signal.action });
            chrome.action.setBadgeBackgroundColor({
                color: signal.action === 'YES' ? '#10B981' : '#EF4444'
            });

            console.log('✅ Bildirim:', title);

        } catch (error) {
            console.error('Notification error:', error);
        }
    }
}

// === INITIALIZE ===

marketScanner = new MarketScanner();
notificationManager = new NotificationManager();

marketScanner.onSignal = (signal) => {
    console.log('🚨 SİNYAL:', signal);
    notificationManager.sendSignal(signal);

    // Storage'a kaydet
    chrome.storage.local.get('signalHistory', (data) => {
        const history = data.signalHistory || [];
        history.unshift(signal);
        if (history.length > 50) history.length = 50;
        chrome.storage.local.set({ signalHistory: history });
    });
};

// === MESSAGE HANDLERS ===

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message:', message);

    if (message.type === 'TOGGLE_SCANNER') {
        if (message.enabled) {
            marketScanner.start(10000);
            scannerEnabled = true;
        } else {
            marketScanner.stop();
            scannerEnabled = false;
            chrome.action.setBadgeText({ text: '' });
        }
        sendResponse({ success: true, enabled: scannerEnabled });
        return true;
    }

    if (message.type === 'GET_SCANNER_STATUS') {
        sendResponse({ enabled: scannerEnabled });
        return true;
    }

    if (message.type === 'GET_SIGNAL_HISTORY') {
        chrome.storage.local.get('signalHistory', (data) => {
            sendResponse({ history: data.signalHistory || [] });
        });
        return true;
    }

    if (message.type === 'CONTENT_SCRIPT_READY') {
        return true;
    }
});

// === NOTIFICATION CLICK ===

chrome.notifications.onClicked.addListener(async (notificationId) => {
    const data = await chrome.storage.local.get('lastSignalUrl');
    if (data.lastSignalUrl) {
        chrome.tabs.create({ url: data.lastSignalUrl });
    }
    chrome.notifications.clear(notificationId);
});

// === KEEP ALIVE ===

chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        console.log('💓 Service worker aktif');
    }
});

// === AUTO START ===

chrome.storage.local.get('autoScan', (data) => {
    if (data.autoScan) {
        console.log('🔄 Auto-scan aktif, başlatılıyor...');
        marketScanner.start(10000);
        scannerEnabled = true;
    }
});

console.log('✅ Background service hazır');
