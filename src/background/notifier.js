/**
 * Notification Manager
 * Sinyal geldiğinde Chrome bildirimi gönderir
 */

class NotificationManager {
    constructor() {
        this.recentNotifications = new Map(); // Duplicate önleme
        this.notificationTimeout = 30000; // 30 saniye içinde aynı market için tekrar bildirim gönderme
    }

    /**
     * Trade sinyali bildirimi gönder
     */
    async sendSignal(signal) {
        // Duplicate kontrolü
        const key = `${signal.market.id}_${signal.action}`;
        const lastNotification = this.recentNotifications.get(key);

        if (lastNotification && Date.now() - lastNotification < this.notificationTimeout) {
            console.log('⏭️ Duplicate bildirim atlandı');
            return;
        }

        // Bildirimi kaydet
        this.recentNotifications.set(key, Date.now());

        // Bildirim metni
        const title = `🚨 ${signal.action} SİNYALİ - ${signal.market.coin}`;
        const message = [
            `💰 ${signal.confidence}% Güven`,
            `📊 Fiyat: $${signal.currentPrice.toLocaleString()}`,
            `🎯 Hedef: $${signal.strikePrice.toLocaleString()}`,
            `⏱️ ${signal.timeRemaining} saniye kaldı`,
            ``,
            `Fark: ${signal.gapPercent > 0 ? '+' : ''}${signal.gapPercent.toFixed(2)}%`
        ].join('\n');

        try {
            // Chrome notification API
            await chrome.notifications.create(`signal_${Date.now()}`, {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: title,
                message: message,
                priority: 2,
                requireInteraction: true, // Kullanıcı kapatana kadar kalsın
                buttons: [
                    { title: '🔗 Market\'e Git' },
                    { title: '❌ Kapat' }
                ]
            });

            // Market URL'ini kaydet (tıklama için)
            await chrome.storage.local.set({
                lastSignal: signal,
                lastSignalUrl: signal.market.url
            });

            console.log('✅ Bildirim gönderildi:', title);

        } catch (error) {
            console.error('Notification error:', error);

            // Alternatif: Badge ile uyar
            try {
                chrome.action.setBadgeText({ text: signal.action });
                chrome.action.setBadgeBackgroundColor({
                    color: signal.action === 'YES' ? '#10B981' : '#EF4444'
                });
            } catch (e) {
                console.error('Badge error:', e);
            }
        }
    }

    /**
     * Eski bildirimleri temizle
     */
    cleanup() {
        const now = Date.now();
        for (const [key, time] of this.recentNotifications.entries()) {
            if (now - time > 60000) { // 1 dakikadan eski
                this.recentNotifications.delete(key);
            }
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.NotificationManager = NotificationManager;
}
if (typeof self !== 'undefined') {
    self.NotificationManager = NotificationManager;
}
