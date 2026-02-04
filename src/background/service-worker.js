/**
 * Polymarket AI - Background Service Worker v2
 * Market tarama ve sinyal sistemi entegre
 */

console.log('🚀 Polymarket AI Background Service Worker v2 başlatıldı');

// State
let scannerEnabled = false;
let marketScanner = null;
let whaleScanner = null;
let arbitrageScanner = null;
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
        let urgency = 'LOW'; // LOW, MEDIUM, HIGH, CRITICAL

        // SON 10 SANİYE - CRITICAL 🔴
        if (timeSeconds <= 10 && absGap >= 0.1) {
            confidence = 98;
            urgency = 'CRITICAL';
            shouldSignal = true;
        }
        // SON 30 SANİYE - HIGH 🟠
        else if (timeSeconds <= 30 && absGap >= 0.2) {
            confidence = 95;
            urgency = 'HIGH';
            shouldSignal = true;
        }
        // SON 1 DAKİKA - MEDIUM 🟡
        else if (timeSeconds <= 60 && absGap >= 0.4) {
            confidence = 90;
            urgency = 'MEDIUM';
            shouldSignal = true;
        }
        // SON 2 DAKİKA - LOW 🟢
        else if (timeSeconds <= 120 && absGap >= 0.6) {
            confidence = 85;
            urgency = 'LOW';
            shouldSignal = true;
        }

        if (!shouldSignal) return null;

        return {
            type: 'TRADE_SIGNAL',
            market: market,
            action: direction,
            confidence: confidence,
            urgency: urgency,
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

        // Urgency renkleri
        this.urgencyColors = {
            'CRITICAL': '#DC2626', // Kırmızı
            'HIGH': '#F97316',     // Turuncu
            'MEDIUM': '#EAB308',   // Sarı
            'LOW': '#22C55E'       // Yeşil
        };

        this.urgencyEmojis = {
            'CRITICAL': '🔴',
            'HIGH': '🟠',
            'MEDIUM': '🟡',
            'LOW': '🟢'
        };
    }

    async sendSignal(signal) {
        const key = `${signal.market.id}_${signal.action}`;
        const lastNotification = this.recentNotifications.get(key);

        // CRITICAL uyarılar için timeout'u kısa tut
        const timeout = signal.urgency === 'CRITICAL' ? 10000 : this.notificationTimeout;

        if (lastNotification && Date.now() - lastNotification < timeout) {
            return;
        }

        this.recentNotifications.set(key, Date.now());

        const urgencyEmoji = this.urgencyEmojis[signal.urgency] || '🔔';
        const title = `${urgencyEmoji} ${signal.action} - ${signal.market.coin} | ${signal.timeRemaining}sn!`;

        // CRITICAL için daha acil mesaj
        let message = `💰 %${signal.confidence} | $${signal.currentPrice.toLocaleString()}`;
        if (signal.urgency === 'CRITICAL') {
            message = `⚡ HEMEN İŞLEM YAP! ${message}`;
        }

        try {
            await chrome.notifications.create(`signal_${Date.now()}`, {
                type: 'basic',
                iconUrl: 'assets/icons/icon128.png',
                title: title,
                message: message,
                priority: signal.urgency === 'CRITICAL' ? 2 : 1,
                requireInteraction: signal.urgency === 'CRITICAL' || signal.urgency === 'HIGH'
            });

            await chrome.storage.local.set({
                lastSignal: signal,
                lastSignalUrl: signal.market.url
            });

            // Badge: Urgency'ye göre renk
            const badgeColor = this.urgencyColors[signal.urgency] || '#10B981';
            const badgeText = signal.timeRemaining <= 10 ? `${signal.timeRemaining}s` : signal.action;

            chrome.action.setBadgeText({ text: badgeText });
            chrome.action.setBadgeBackgroundColor({ color: badgeColor });

            console.log(`✅ ${signal.urgency} Uyarı:`, title);

        } catch (error) {
            console.error('Notification error:', error);
        }
    }

    // Countdown badge güncellemesi
    updateBadgeCountdown(seconds, urgency) {
        const color = this.urgencyColors[urgency] || '#22C55E';
        chrome.action.setBadgeText({ text: `${seconds}s` });
        chrome.action.setBadgeBackgroundColor({ color: color });
    }
}

// === WHALE SCANNER ===

class WhaleScanner {
    constructor() {
        this.dataApiUrl = 'https://data-api.polymarket.com';
        this.activeMarkets = new Set(); // ID'leri tut
        this.lastAlerts = new Map(); // Son uyarı zamanları
        this.threshold = 10000; // $10,000 üzeri işlemler
    }

    start(interval = 60000) {
        console.log('🐋 Whale scanner başlatıldı...');
        this.intervalId = setInterval(() => this.scan(), interval);
        this.scan(); // İlk tarama
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
    }

    async scan() {
        // MarketScanner'dan aktif marketleri al
        if (!marketScanner || !marketScanner.lastMarkets) return;

        const markets = marketScanner.lastMarkets;
        for (const market of markets) {
            await this.checkMarket(market);
        }
    }

    async checkMarket(market) {
        try {
            // Data API'den pozisyonları çek
            const response = await fetch(`${this.dataApiUrl}/markets/${market.id}/positions?limit=20&orderBy=shares&order=desc`);
            if (!response.ok) return;

            const positions = await response.json();

            for (const pos of positions) {
                const value = (pos.shares || 0) * (pos.price || 0.5); // Yaklaşık değer

                if (value >= this.threshold) {
                    this.processWhalePosition(market, pos, value);
                }
            }
        } catch (error) {
            console.error('Whale scan error:', error);
        }
    }

    processWhalePosition(market, pos, value) {
        const key = `${market.id}_${pos.proxyWallet}_${pos.outcome}`;
        const lastAlert = this.lastAlerts.get(key);

        // 1 saat içinde aynı pozisyon için tekrar uyarı verme
        if (lastAlert && Date.now() - lastAlert < 3600000) return;

        this.lastAlerts.set(key, Date.now());

        const signal = {
            type: 'WHALE_ALERT',
            market: market,
            action: pos.outcome === 'Yes' ? 'YES' : 'NO',
            confidence: 90, // Balina işlemi önemlidir
            urgency: value > 50000 ? 'CRITICAL' : 'HIGH',
            currentPrice: value, // Burada işlem hacmini gösteriyoruz
            strikePrice: market.strikePrice,
            gapPercent: 0,
            timeRemaining: Math.round((market.endTime - Date.now()) / 1000),
            timestamp: Date.now(),
            reason: `🐋 BALİNA ALARMI: $${value.toLocaleString()} pozisyon!`
        };

        if (notificationManager) {
            notificationManager.sendSignal(signal);
        }
    }
}

// === INITIALIZE ===

marketScanner = new MarketScanner();
whaleScanner = new WhaleScanner();
arbitrageScanner = new ArbitrageScanner();
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
        (async () => {
            if (message.enabled) {
                await startAlarmScanning();
            } else {
                await stopAlarmScanning();
            }
            sendResponse({ success: true, enabled: scannerEnabled });
        })();
        return true; // async response
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

// === ALARM-BASED SCANNING ===
// Chrome Manifest V3'te setInterval güvenilir değil, chrome.alarms kullanıyoruz

const ALARM_NAMES = {
    MARKET_SCAN: 'marketScan',
    WHALE_SCAN: 'whaleScan',
    KEEP_ALIVE: 'keepAlive'
};

// Alarm tetiklendiğinde
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log(`⏰ Alarm: ${alarm.name}`);

    if (alarm.name === ALARM_NAMES.MARKET_SCAN && scannerEnabled) {
        try {
            await marketScanner.scan();
        } catch (e) {
            console.error('Market scan error:', e);
        }
    }

    if (alarm.name === ALARM_NAMES.WHALE_SCAN && scannerEnabled) {
        try {
            await whaleScanner.scan();
        } catch (e) {
            console.error('Whale scan error:', e);
        }
    }

    if (alarm.name === ALARM_NAMES.KEEP_ALIVE) {
        console.log('💓 Service worker aktif');
    }
});

// Alarmları başlat
async function startAlarmScanning() {
    console.log('🚀 Alarm-based scanning başlatılıyor...');

    // Mevcut alarmları temizle
    await chrome.alarms.clearAll();

    // Market tarama: Her 15 saniyede bir (0.25 dakika)
    // NOT: Chrome minimum 1 dakika zorunlu tutuyor, ama ilk taramayı hemen yapıyoruz
    chrome.alarms.create(ALARM_NAMES.MARKET_SCAN, {
        delayInMinutes: 0.5, // 30 saniye sonra ilk alarm
        periodInMinutes: 0.5 // Her 30 saniyede
    });

    // Balina tarama: Her 1 dakikada
    chrome.alarms.create(ALARM_NAMES.WHALE_SCAN, {
        delayInMinutes: 1,
        periodInMinutes: 1
    });

    // Keep alive: Her 1 dakikada
    chrome.alarms.create(ALARM_NAMES.KEEP_ALIVE, {
        periodInMinutes: 1
    });

    scannerEnabled = true;

    // İlk taramayı hemen yap
    marketScanner.scan();

    // Durumu kaydet
    await chrome.storage.local.set({ autoScan: true });

    console.log('✅ Alarm-based scanning aktif');
}

// Alarmları durdur
async function stopAlarmScanning() {
    console.log('🛑 Scanning durduruluyor...');
    await chrome.alarms.clearAll();
    scannerEnabled = false;
    await chrome.storage.local.set({ autoScan: false });
    chrome.action.setBadgeText({ text: '' });
}

// === AUTO START ON INSTALL/STARTUP ===

chrome.runtime.onInstalled.addListener((details) => {
    console.log('📦 Extension yüklendi:', details.reason);

    // İlk yüklemede veya güncellemede storage kontrol et
    chrome.storage.local.get('autoScan', async (data) => {
        if (data.autoScan) {
            await startAlarmScanning();
        }
    });
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('🌅 Chrome başlatıldı, scanner kontrol ediliyor...');

    const data = await chrome.storage.local.get('autoScan');
    if (data.autoScan) {
        await startAlarmScanning();
    }
});

// İlk yükleme için de kontrol et
chrome.storage.local.get('autoScan', async (data) => {
    if (data.autoScan && !scannerEnabled) {
        console.log('🔄 Auto-scan aktif, başlatılıyor...');
        await startAlarmScanning();
    }
});

console.log('✅ Background service hazır (v3.0 Alarm-Based)');
