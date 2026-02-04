/**
 * Polymarket Tahmin Asistanı - Sports Analyzer
 * API-Sports entegrasyonu ile gerçek spor verileri
 */

export class SportsAnalyzer {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'https://v3.football.api-sports.io';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 dakika
    }

    /**
     * Set API key from settings
     */
    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * Load API key from storage
     */
    async loadApiKey() {
        try {
            const data = await chrome.storage.local.get('settings');
            this.apiKey = data.settings?.sportsApiKey || null;
            return this.apiKey;
        } catch (error) {
            console.error('API key yüklenemedi:', error);
            return null;
        }
    }

    /**
     * Main analysis function
     */
    async analyze(market) {
        console.log('Spor analizi başlıyor:', market.title);

        // Load API key if not set
        if (!this.apiKey) {
            await this.loadApiKey();
        }

        const result = {
            prediction: 'YES',
            confidence: 55,
            reasons: [],
            indicators: [],
            traders: null
        };

        try {
            // Parse match info from title
            const matchInfo = this.parseMatchInfo(market.title);

            if (matchInfo) {
                result.reasons.push({
                    sentiment: 'neutral',
                    text: `<strong>Maç:</strong> ${matchInfo.team1} vs ${matchInfo.team2}`
                });

                // Detect bet type
                const betType = this.detectBetType(market.title);
                result.reasons.push({
                    sentiment: 'neutral',
                    text: `<strong>Bahis Tipi:</strong> ${betType.name}`
                });

                // If API key available, get real data
                if (this.apiKey) {
                    const liveData = await this.getLiveData(matchInfo);

                    if (liveData) {
                        this.addLiveDataToResult(result, liveData, matchInfo, betType);
                    } else {
                        result.reasons.push({
                            sentiment: 'neutral',
                            text: '<strong>Not:</strong> Maç verisi bulunamadı, genel analiz yapıldı'
                        });
                        this.addFallbackAnalysis(result, matchInfo, betType, market);
                    }
                } else {
                    // No API key - use fallback
                    result.reasons.push({
                        sentiment: 'neutral',
                        text: '<strong>💡 İpucu:</strong> Ayarlardan API key ekleyerek canlı istatistik alabilirsiniz'
                    });
                    this.addFallbackAnalysis(result, matchInfo, betType, market);
                }
            } else {
                // Couldn't parse match info
                result.reasons.push({
                    sentiment: 'neutral',
                    text: '<strong>Not:</strong> Maç bilgisi ayrıştırılamadı'
                });
                this.addGenericAnalysis(result, market);
            }

            // Use market price if available
            if (market.currentPrice) {
                const priceConfidence = Math.max(market.currentPrice, 100 - market.currentPrice);
                result.confidence = Math.round((result.confidence + priceConfidence) / 2);
                result.prediction = market.currentPrice > 50 ? 'YES' : 'NO';
            }

        } catch (error) {
            console.error('Spor analizi hatası:', error);
            result.reasons.push({
                sentiment: 'neutral',
                text: 'Analiz sırasında hata oluştu, temel tahmin yapıldı'
            });
        }

        return result;
    }

    /**
     * Parse match info from market title
     */
    parseMatchInfo(title) {
        const patterns = [
            /(.+?)\s+(?:vs?\.?|versus|v)\s+(.+?)(?:\s*[-–?]|$)/i,
            /(.+?)\s+to\s+(?:beat|win against|defeat)\s+(.+)/i,
            /will\s+(.+?)\s+(?:beat|win|defeat)\s+(.+)/i
        ];

        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                const team1 = this.cleanTeamName(match[1]);
                const team2 = this.cleanTeamName(match[2]);

                if (team1 && team2) {
                    return {
                        team1,
                        team2,
                        sport: this.detectSport(title)
                    };
                }
            }
        }

        return null;
    }

    /**
     * Clean team name
     */
    cleanTeamName(name) {
        return name
            .replace(/^will\s+/i, '')
            .replace(/\s*\?.*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Detect sport type
     */
    detectSport(title) {
        const titleLower = title.toLowerCase();

        if (/nba|basketball|lakers|warriors|celtics|nets/i.test(titleLower)) {
            return 'basketball';
        }
        if (/nfl|football|patriots|cowboys|chiefs/i.test(titleLower)) {
            return 'american_football';
        }
        if (/mlb|baseball|yankees|dodgers|cubs/i.test(titleLower)) {
            return 'baseball';
        }
        if (/nhl|hockey|bruins|rangers|maple leafs/i.test(titleLower)) {
            return 'hockey';
        }
        if (/ufc|mma|boxing|fight/i.test(titleLower)) {
            return 'mma';
        }
        if (/tennis|atp|wta|wimbledon|us open/i.test(titleLower)) {
            return 'tennis';
        }
        if (/esports|lol|dota|csgo|valorant/i.test(titleLower)) {
            return 'esports';
        }

        // Default to football/soccer
        return 'football';
    }

    /**
     * Detect bet type
     */
    detectBetType(title) {
        const titleLower = title.toLowerCase();

        if (titleLower.includes('win') || titleLower.includes('beat')) {
            return { type: 'match_winner', name: 'Maç Kazananı' };
        }
        if (/\d+\+?\s*goals?/i.test(titleLower) || titleLower.includes('score')) {
            return { type: 'goals', name: 'Gol Bahsi' };
        }
        if (titleLower.includes('over') || titleLower.includes('under')) {
            return { type: 'over_under', name: 'Alt/Üst' };
        }
        if (/\d+\+?\s*points?/i.test(titleLower)) {
            return { type: 'points', name: 'Sayı Bahsi' };
        }
        if (titleLower.includes('champion') || titleLower.includes('title')) {
            return { type: 'championship', name: 'Şampiyonluk' };
        }
        if (titleLower.includes('mvp') || titleLower.includes('player')) {
            return { type: 'player', name: 'Oyuncu Bahsi' };
        }

        return { type: 'other', name: 'Genel Bahis' };
    }

    /**
     * Get live data from API-Sports
     */
    async getLiveData(matchInfo) {
        if (!this.apiKey) return null;

        try {
            // Search for team
            const searchResult = await this.searchTeam(matchInfo.team1);

            if (!searchResult || searchResult.length === 0) {
                console.log('Takım bulunamadı:', matchInfo.team1);
                return null;
            }

            const teamId = searchResult[0].team.id;

            // Get fixtures
            const fixtures = await this.getTeamFixtures(teamId);

            if (!fixtures || fixtures.length === 0) {
                console.log('Maç bulunamadı');
                return null;
            }

            // Find matching fixture
            const fixture = fixtures.find(f => {
                const home = f.teams.home.name.toLowerCase();
                const away = f.teams.away.name.toLowerCase();
                const team2Lower = matchInfo.team2.toLowerCase();

                return home.includes(team2Lower) || away.includes(team2Lower) ||
                    team2Lower.includes(home) || team2Lower.includes(away);
            });

            if (fixture) {
                // Get detailed fixture info
                const fixtureDetails = await this.getFixtureDetails(fixture.fixture.id);
                return {
                    fixture,
                    details: fixtureDetails,
                    team: searchResult[0]
                };
            }

            return { fixtures: fixtures.slice(0, 3), team: searchResult[0] };

        } catch (error) {
            console.error('API-Sports hatası:', error);
            return null;
        }
    }

    /**
     * Search team by name
     */
    async searchTeam(teamName) {
        const cacheKey = `search_${teamName}`;

        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.time < this.cacheTimeout) {
                return cached.data;
            }
        }

        const response = await fetch(
            `${this.baseUrl}/teams?search=${encodeURIComponent(teamName)}`,
            {
                headers: {
                    'x-apisports-key': this.apiKey
                }
            }
        );

        if (!response.ok) {
            throw new Error('API isteği başarısız');
        }

        const data = await response.json();

        this.cache.set(cacheKey, { data: data.response, time: Date.now() });

        return data.response;
    }

    /**
     * Get team fixtures
     */
    async getTeamFixtures(teamId) {
        const cacheKey = `fixtures_${teamId}`;

        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.time < this.cacheTimeout) {
                return cached.data;
            }
        }

        const today = new Date().toISOString().split('T')[0];

        const response = await fetch(
            `${this.baseUrl}/fixtures?team=${teamId}&next=5`,
            {
                headers: {
                    'x-apisports-key': this.apiKey
                }
            }
        );

        if (!response.ok) {
            throw new Error('Fixtures isteği başarısız');
        }

        const data = await response.json();

        this.cache.set(cacheKey, { data: data.response, time: Date.now() });

        return data.response;
    }

    /**
     * Get fixture details
     */
    async getFixtureDetails(fixtureId) {
        const cacheKey = `fixture_${fixtureId}`;

        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.time < this.cacheTimeout) {
                return cached.data;
            }
        }

        const response = await fetch(
            `${this.baseUrl}/fixtures?id=${fixtureId}`,
            {
                headers: {
                    'x-apisports-key': this.apiKey
                }
            }
        );

        if (!response.ok) {
            throw new Error('Fixture detay isteği başarısız');
        }

        const data = await response.json();

        if (data.response && data.response.length > 0) {
            this.cache.set(cacheKey, { data: data.response[0], time: Date.now() });
            return data.response[0];
        }

        return null;
    }

    /**
     * Add live data analysis to result
     */
    addLiveDataToResult(result, liveData, matchInfo, betType) {
        if (liveData.fixture) {
            const fixture = liveData.fixture;
            const homeTeam = fixture.teams.home;
            const awayTeam = fixture.teams.away;

            // Match info
            result.reasons.push({
                sentiment: 'neutral',
                text: `<strong>Lig:</strong> ${fixture.league.name} (${fixture.league.country})`
            });

            // Date
            const matchDate = new Date(fixture.fixture.date);
            result.reasons.push({
                sentiment: 'neutral',
                text: `<strong>Tarih:</strong> ${matchDate.toLocaleDateString('tr-TR')} ${matchDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
            });

            // Analyze based on bet type
            if (betType.type === 'match_winner') {
                // Check which team is in the title
                const team1Lower = matchInfo.team1.toLowerCase();
                const isHomeTeam = homeTeam.name.toLowerCase().includes(team1Lower) ||
                    team1Lower.includes(homeTeam.name.toLowerCase());

                if (isHomeTeam) {
                    result.reasons.push({
                        sentiment: 'bullish',
                        text: `<strong>Ev Sahibi:</strong> ${homeTeam.name} - Ev avantajı +%10-15`
                    });
                    result.confidence += 5;
                } else {
                    result.reasons.push({
                        sentiment: 'bearish',
                        text: `<strong>Deplasman:</strong> ${matchInfo.team1} deplasmanda oynuyor`
                    });
                    result.confidence -= 5;
                }
            }

            // Add team stats if available
            if (liveData.details && liveData.details.statistics) {
                this.addStatisticsToResult(result, liveData.details.statistics);
            }

        } else if (liveData.fixtures) {
            // No exact match found, show upcoming fixtures
            result.reasons.push({
                sentiment: 'neutral',
                text: `<strong>API:</strong> ${liveData.team.team.name} için ${liveData.fixtures.length} yaklaşan maç bulundu`
            });
        }
    }

    /**
     * Add statistics to result
     */
    addStatisticsToResult(result, statistics) {
        // Parse statistics for both teams
        if (statistics.length >= 2) {
            const homeStats = statistics[0];
            const awayStats = statistics[1];

            // Add some key stats as indicators
            const indicators = [];

            // Possession
            const homePoss = homeStats.statistics?.find(s => s.type === 'Ball Possession');
            if (homePoss) {
                indicators.push({
                    name: 'Topa Sahiplik',
                    value: homePoss.value || '--',
                    signal: parseInt(homePoss.value) > 55 ? 'bullish' : parseInt(homePoss.value) < 45 ? 'bearish' : 'neutral'
                });
            }

            // Shots on target
            const homeShots = homeStats.statistics?.find(s => s.type === 'Shots on Goal');
            if (homeShots) {
                indicators.push({
                    name: 'İsabetli Şut',
                    value: homeShots.value || '0',
                    signal: parseInt(homeShots.value) > 5 ? 'bullish' : 'neutral'
                });
            }

            result.indicators = indicators;
        }
    }

    /**
     * Add fallback analysis (no API)
     */
    addFallbackAnalysis(result, matchInfo, betType, market) {
        // Home advantage
        result.reasons.push({
            sentiment: 'bullish',
            text: `<strong>Not:</strong> İlk yazılan takım genellikle ev sahibidir (+%10-15 avantaj)`
        });

        // Bet type specific advice
        if (betType.type === 'goals') {
            result.reasons.push({
                sentiment: 'neutral',
                text: '<strong>Gol Bahsi:</strong> Takımların son 5 maçtaki gol ortalamalarını kontrol edin'
            });
        } else if (betType.type === 'over_under') {
            result.reasons.push({
                sentiment: 'neutral',
                text: '<strong>Alt/Üst:</strong> Ligin ortalama gol sayısını inceleyin'
            });
        }

        // Use market outcomes for prediction
        if (market.outcomes && market.outcomes.length > 0) {
            const sortedOutcomes = [...market.outcomes].sort((a, b) => (b.price || 0) - (a.price || 0));
            if (sortedOutcomes[0].price) {
                result.confidence = sortedOutcomes[0].price;
                result.prediction = sortedOutcomes[0].price > 50 ? 'YES' : 'NO';
            }
        }
    }

    /**
     * Add generic analysis
     */
    addGenericAnalysis(result, market) {
        // Use market price
        if (market.currentPrice) {
            result.prediction = market.currentPrice > 50 ? 'YES' : 'NO';
            result.confidence = Math.max(market.currentPrice, 100 - market.currentPrice);

            result.reasons.push({
                sentiment: market.currentPrice > 60 ? 'bullish' : market.currentPrice < 40 ? 'bearish' : 'neutral',
                text: `<strong>Market Fiyatı:</strong> ${market.currentPrice}¢`
            });
        }

        result.reasons.push({
            sentiment: 'neutral',
            text: '<strong>Öneri:</strong> Takım istatistiklerini ve son form durumlarını kontrol edin'
        });
    }
}
