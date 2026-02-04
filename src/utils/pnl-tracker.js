/**
 * P&L Tracker (Kar/Zarar Takibi)
 * Geçmiş tahminlerin başarısını analiz eder ve sanal portföy performansı çıkarır.
 */

class PnLTracker {
    constructor() {
        this.virtualBetSize = 100; // Her işleme $100 varsayılan bahis
    }

    /**
     * Geçmiş verileri analiz et ve performans raporu oluştur
     * @param {Array} history - chrome.storage'dan gelen analysisHistory
     */
    calculateStats(history) {
        if (!history || history.length === 0) {
            return this.getEmptyStats();
        }

        let stats = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfit: 0,
            totalVolume: 0,
            winRate: 0,
            roi: 0,
            equityCurve: [] // Grafik çizimi için bakiye değişimi
        };

        let currentEquity = 0;
        stats.equityCurve.push({ index: 0, value: 0 });

        // Geçmişten bugüne doğru sırala (eğer ters ise)
        // Genelde history.unshift yapıldığı için [0] en yeni. 
        // Grafik için eskiye dönmemiz lazım, o yüzden reverse kopyası alalım.
        const chronologicHistory = [...history].reverse();

        for (const item of chronologicHistory) {
            // Sadece sonuçlanmış veya sonucu tahmin edilebilenleri almamız lazım
            // Ancak şu an için sadece simülasyon yapıyoruz.
            // Gerçek sonuç kontrolü şu an yok, bu yüzden simülasyon için:
            // "Eğer analysis sonrası fiyat, bizim yönümüzde %X gittiyse kazandık say" mantığı kuramayız çünkü geçmiş data yok.
            // Bu yüzden şimdilik sadece "Tahmin Güveni > 80% olanlar kazandı" gibi bir mock mantık yerine,
            // Kullanıcıya "Sonuç Gir" butonu mu sunsak? 
            // Veya sadece sinyal üretilenleri kaydedip, outcome gerçekleştiyse işaretlesek?

            // ŞİMDİLİK: Kullanıcının manuel olarak veya sistemin otomatik kontrolü ile işaretlenmiş sonuçları bekleyeceğiz.
            // Ancak elimizdeki history yapısında 'result' (WON/LOST) alanı henüz yok.
            // Bu yüzden bu fonksiyonu, gelecekteki sonuç kontrolüne hazırlık olarak yazıyorum.

            // Eğer result alanı yoksa, simülasyon yapalım:
            // Yüksek güvenli (%85+) tahminleri "kazanmış" varsayalım (DEMO AMAÇLI - Kullanıcıya belirtilecek)
            // GERÇEK SENARYO: result alanı dolu olmalı.

            if (item.result) { // WON veya LOST
                stats.totalTrades++;
                const isWin = item.result === 'WON';

                if (isWin) {
                    stats.winningTrades++;
                    const profit = this.virtualBetSize * 0.85; // %85 payout varsayımı
                    stats.totalProfit += profit;
                    currentEquity += profit;
                } else {
                    stats.losingTrades++;
                    stats.totalProfit -= this.virtualBetSize;
                    currentEquity -= this.virtualBetSize;
                }

                stats.totalVolume += this.virtualBetSize;
                stats.equityCurve.push({ index: stats.totalTrades, value: currentEquity });
            }
        }

        if (stats.totalTrades > 0) {
            stats.winRate = (stats.winningTrades / stats.totalTrades) * 100;
            stats.roi = (stats.totalProfit / stats.totalVolume) * 100;
        }

        return stats;
    }

    getEmptyStats() {
        return {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalProfit: 0,
            winRate: 0,
            roi: 0,
            equityCurve: [{ index: 0, value: 0 }]
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.PnLTracker = PnLTracker;
}
