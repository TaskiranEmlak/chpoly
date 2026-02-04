/**
 * News Sentiment Analyzer
 * CryptoPanic API ve diğer kaynaklardan kripto haberlerini çekip sentiment analizi yapar
 * 
 * Free Tier: 100 requests/minute, sentiment votes (bullish/bearish)
 */

class NewsSentiment {
    constructor(apiKey = null) {
        // CryptoPanic public API (API key opsiyonel, ama rate limit daha yüksek)
        this.cryptoPanicUrl = 'https://cryptopanic.com/api/free/v1';
        this.apiKey = apiKey;
        this.cache = new Map();
        this.cacheDuration = 60000; // 1 dakika cache
    }

    /**
     * Set API key (optional, for higher rate limits)
     */
    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * Belirli bir coin için haberleri çek
     * @param {string} coin - BTC, ETH, SOL vb.
     * @param {number} limit - Maksimum haber sayısı
     */
    async getNews(coin = 'BTC', limit = 10) {
        const cacheKey = `news_${coin}_${limit}`;
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            return cached.data;
        }

        try {
            let url = `${this.cryptoPanicUrl}/posts/?currencies=${coin}&kind=news&public=true`;
            if (this.apiKey) {
                url += `&auth_token=${this.apiKey}`;
            }

            const response = await fetch(url);

            if (!response.ok) {
                console.error('CryptoPanic API error:', response.status);
                return this.getFallbackNews(coin);
            }

            const data = await response.json();
            const news = (data.results || []).slice(0, limit).map(item => ({
                title: item.title,
                url: item.url,
                source: item.source?.title || 'Unknown',
                publishedAt: item.published_at,
                votes: {
                    positive: item.votes?.positive || 0,
                    negative: item.votes?.negative || 0,
                    important: item.votes?.important || 0,
                    liked: item.votes?.liked || 0,
                    disliked: item.votes?.disliked || 0
                },
                sentiment: this.calculateSentiment(item.votes)
            }));

            this.cache.set(cacheKey, { data: news, timestamp: Date.now() });
            return news;

        } catch (error) {
            console.error('News fetch error:', error);
            return this.getFallbackNews(coin);
        }
    }

    /**
     * Vote'lardan sentiment hesapla
     */
    calculateSentiment(votes) {
        if (!votes) return { score: 0, label: 'neutral', emoji: '😐' };

        const positive = (votes.positive || 0) + (votes.liked || 0);
        const negative = (votes.negative || 0) + (votes.disliked || 0);
        const total = positive + negative;

        if (total === 0) {
            return { score: 0, label: 'neutral', emoji: '😐' };
        }

        const score = ((positive - negative) / total) * 100;

        if (score > 30) {
            return { score: Math.round(score), label: 'bullish', emoji: '🟢' };
        } else if (score < -30) {
            return { score: Math.round(score), label: 'bearish', emoji: '🔴' };
        } else {
            return { score: Math.round(score), label: 'neutral', emoji: '🟡' };
        }
    }

    /**
     * Genel sentiment özeti
     * @param {string} coin - BTC, ETH vb.
     */
    async getSentimentSummary(coin = 'BTC') {
        const news = await this.getNews(coin, 20);

        if (!news || news.length === 0) {
            return {
                coin: coin,
                newsCount: 0,
                overallSentiment: 'neutral',
                sentimentScore: 0,
                bullishCount: 0,
                bearishCount: 0,
                neutralCount: 0,
                topNews: [],
                recommendation: 'Yeterli haber bulunamadı'
            };
        }

        let bullish = 0, bearish = 0, neutral = 0;
        let totalScore = 0;

        for (const item of news) {
            if (item.sentiment.label === 'bullish') bullish++;
            else if (item.sentiment.label === 'bearish') bearish++;
            else neutral++;

            totalScore += item.sentiment.score;
        }

        const avgScore = totalScore / news.length;
        let overallSentiment, recommendation;

        if (avgScore > 20) {
            overallSentiment = 'bullish';
            recommendation = `${coin} için haberler pozitif. YES pozisyonu desteklenebilir.`;
        } else if (avgScore < -20) {
            overallSentiment = 'bearish';
            recommendation = `${coin} için haberler negatif. NO pozisyonu desteklenebilir.`;
        } else {
            overallSentiment = 'neutral';
            recommendation = `${coin} için haberler karışık. Dikkatli olun.`;
        }

        // En önemli haberler
        const importantNews = news
            .filter(n => n.votes.important > 0)
            .sort((a, b) => b.votes.important - a.votes.important)
            .slice(0, 3);

        return {
            coin: coin,
            newsCount: news.length,
            overallSentiment: overallSentiment,
            sentimentScore: Math.round(avgScore),
            bullishCount: bullish,
            bearishCount: bearish,
            neutralCount: neutral,
            topNews: importantNews.length > 0 ? importantNews : news.slice(0, 3),
            recommendation: recommendation,
            emoji: avgScore > 20 ? '🟢' : avgScore < -20 ? '🔴' : '🟡'
        };
    }

    /**
     * Fallback: CryptoPanic çalışmazsa basit alternatif
     */
    getFallbackNews(coin) {
        return [{
            title: `${coin} haberleri yüklenemedi`,
            url: `https://cryptopanic.com/news/${coin.toLowerCase()}/`,
            source: 'CryptoPanic',
            publishedAt: new Date().toISOString(),
            votes: { positive: 0, negative: 0, important: 0 },
            sentiment: { score: 0, label: 'neutral', emoji: '😐' }
        }];
    }

    /**
     * Trending haberler (tüm coinler)
     */
    async getTrendingNews(limit = 5) {
        try {
            let url = `${this.cryptoPanicUrl}/posts/?filter=hot&public=true`;
            if (this.apiKey) {
                url += `&auth_token=${this.apiKey}`;
            }

            const response = await fetch(url);
            if (!response.ok) return [];

            const data = await response.json();
            return (data.results || []).slice(0, limit).map(item => ({
                title: item.title,
                url: item.url,
                source: item.source?.title || 'Unknown',
                currencies: item.currencies?.map(c => c.code) || [],
                sentiment: this.calculateSentiment(item.votes)
            }));

        } catch (error) {
            console.error('Trending news error:', error);
            return [];
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.NewsSentiment = NewsSentiment;
}
