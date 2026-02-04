/**
 * Polymarket AI - Premium Popup JavaScript v3
 * Gelişmiş analiz motoru entegrasyonu
 */

// State
let currentMarket = null;
let analysisResult = null;
let analysisHistory = [];
let cryptoAnalyzer = null;
let polymarketAPI = null;
let liquidityAnalyzer = null;
let pnlTracker = null;
let newsSentiment = null;

// Market Type Icons
const MARKET_ICONS = {
  crypto: '₿',
  sports: '⚽',
  esports: '🎮',
  politics: '🏛️',
  other: '📊'
};

const MARKET_LABELS = {
  crypto: 'Kripto',
  sports: 'Spor',
  esports: 'E-Spor',
  politics: 'Politika',
  other: 'Market'
};

// DOM Elements
const elements = {};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  initElements();
  setupEventListeners();
  initAnalyzers();
  await loadHistory();
  await loadSettings();
  await initScannerState();
  await tryGetMarketInfo();
});

function initElements() {
  // Navigation
  elements.navBtns = document.querySelectorAll('.nav-btn');
  elements.tabPanels = {
    main: document.getElementById('mainTab'),
    history: document.getElementById('historyTab'),
    settings: document.getElementById('settingsTab')
  };

  // Scanner
  elements.scannerSection = document.getElementById('scannerSection');
  elements.autoScanToggle = document.getElementById('autoScanToggle');
  elements.scannerStatus = document.getElementById('scannerStatus');

  // Last Signal
  elements.lastSignal = document.getElementById('lastSignal');
  elements.signalAction = document.getElementById('signalAction');
  elements.signalCoin = document.getElementById('signalCoin');
  elements.signalConfidence = document.getElementById('signalConfidence');
  elements.signalTime = document.getElementById('signalTime');
  elements.openSignalBtn = document.getElementById('openSignalBtn');

  // Main Tab - Welcome
  elements.welcomeState = document.getElementById('welcomeState');
  elements.analyzeBtn = document.getElementById('analyzeBtn');

  // Main Tab - Result
  elements.analysisResult = document.getElementById('analysisResult');
  elements.marketBadge = document.getElementById('marketBadge');
  elements.marketTitle = document.getElementById('marketTitle');
  elements.marketExpiry = document.getElementById('marketExpiry');
  elements.marketVolume = document.getElementById('marketVolume');
  elements.predictionCard = document.getElementById('predictionCard');
  elements.predictionValue = document.getElementById('predictionValue');
  elements.confidenceNumber = document.getElementById('confidenceNumber');
  elements.confidenceRing = document.getElementById('confidenceRing');
  elements.marketPrices = document.getElementById('marketPrices');
  elements.insightsList = document.getElementById('insightsList');
  elements.indicatorsSection = document.getElementById('indicatorsSection');
  elements.indicatorsGrid = document.getElementById('indicatorsGrid');
  elements.tradersSection = document.getElementById('tradersSection');
  elements.tradersYesCount = document.getElementById('tradersYesCount');
  elements.tradersNoCount = document.getElementById('tradersNoCount');
  elements.tradersFill = document.getElementById('tradersFill');
  elements.tradersDetails = document.getElementById('tradersDetails');
  elements.strategySection = document.getElementById('strategySection');
  elements.strategyText = document.getElementById('strategyText');
  elements.reanalyzeBtn = document.getElementById('reanalyzeBtn');

  // Main Tab - States
  elements.loadingState = document.getElementById('loadingState');
  elements.loadingText = document.getElementById('loadingText');
  elements.errorState = document.getElementById('errorState');
  elements.errorText = document.getElementById('errorText');
  elements.retryBtn = document.getElementById('retryBtn');

  // Header
  elements.brandStatus = document.getElementById('brandStatus');

  // History
  elements.historyList = document.getElementById('historyList');
  elements.clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Settings
  elements.sportsApiKey = document.getElementById('sportsApiKey');
  elements.saveSettingsBtn = document.getElementById('saveSettingsBtn');
  elements.exportBtn = document.getElementById('exportBtn');

  // Liquidity
  elements.liquiditySection = document.getElementById('liquiditySection');
  elements.liquiditySafe = document.getElementById('liquiditySafe');
  elements.liquiditySpread = document.getElementById('liquiditySpread');
  elements.liquidityAlert = document.getElementById('liquidityAlert');

  // P&L
  elements.pnlDashboard = document.getElementById('pnlDashboard');
  elements.pnlWinRate = document.getElementById('pnlWinRate');
  elements.pnlRoi = document.getElementById('pnlRoi');
  elements.pnlProfit = document.getElementById('pnlProfit');
  elements.pnlChart = document.getElementById('pnlChart');

  // Quick Trade
  elements.quickTradeSection = document.getElementById('quickTradeSection');
  elements.quickTradeYes = document.getElementById('quickTradeYes');
  elements.quickTradeNo = document.getElementById('quickTradeNo');

  // Arbitrage
  elements.arbitrageSection = document.getElementById('arbitrageSection');
  elements.arbBinancePrice = document.getElementById('arbBinancePrice');
  elements.arbStrikePrice = document.getElementById('arbStrikePrice');
  elements.arbDiff = document.getElementById('arbDiff');
  elements.arbSignal = document.getElementById('arbSignal');
  elements.arbSignalText = document.getElementById('arbSignalText');

  // News
  elements.newsSection = document.getElementById('newsSection');
  elements.newsSentimentEmoji = document.getElementById('newsSentimentEmoji');
  elements.newsSentimentLabel = document.getElementById('newsSentimentLabel');
  elements.newsSentimentScore = document.getElementById('newsSentimentScore');
  elements.newsRecommendation = document.getElementById('newsRecommendation');
  elements.newsList = document.getElementById('newsList');
}

function initAnalyzers() {
  // Initialize CryptoAnalyzer if available
  if (typeof CryptoAnalyzer !== 'undefined') {
    cryptoAnalyzer = new CryptoAnalyzer();
    console.log('✅ CryptoAnalyzer initialized');
  }

  // Initialize PolymarketDataAPI if available
  if (typeof PolymarketDataAPI !== 'undefined') {
    polymarketAPI = new PolymarketDataAPI();
    console.log('✅ PolymarketDataAPI initialized');
  }

  // Initialize LiquidityAnalyzer if available
  if (typeof LiquidityAnalyzer !== 'undefined') {
    liquidityAnalyzer = new LiquidityAnalyzer();
    console.log('✅ LiquidityAnalyzer initialized');
  }

  // Initialize PnLTracker if available
  if (typeof PnLTracker !== 'undefined') {
    pnlTracker = new PnLTracker();
    console.log('✅ PnLTracker initialized');
  }

  // Initialize NewsSentiment if available
  if (typeof NewsSentiment !== 'undefined') {
    newsSentiment = new NewsSentiment();
    console.log('✅ NewsSentiment initialized');
  }
}

function setupEventListeners() {
  elements.navBtns?.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  elements.analyzeBtn?.addEventListener('click', handleAnalyze);
  elements.reanalyzeBtn?.addEventListener('click', handleAnalyze);
  elements.retryBtn?.addEventListener('click', handleAnalyze);

  elements.clearHistoryBtn?.addEventListener('click', clearHistory);
  elements.saveSettingsBtn?.addEventListener('click', saveSettings);
  elements.exportBtn?.addEventListener('click', exportData);

  // Quick Trade handlers
  elements.quickTradeYes?.addEventListener('click', () => handleQuickTrade('YES'));
  elements.quickTradeNo?.addEventListener('click', () => handleQuickTrade('NO'));

  // Scanner Listeners
  elements.autoScanToggle?.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    await chrome.storage.local.set({ autoScan: enabled });

    // Background'a bildir
    chrome.runtime.sendMessage({
      type: 'TOGGLE_SCANNER',
      enabled: enabled
    }, (response) => {
      updateScannerStatus(response?.enabled || false);
    });
  });

  elements.openSignalBtn?.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('lastSignalUrl');
    if (data.lastSignalUrl) {
      chrome.tabs.create({ url: data.lastSignalUrl });
    }
  });
}

// === Scanner Functions ===

async function initScannerState() {
  // Scanner aktif mi?
  const response = await chrome.runtime.sendMessage({ type: 'GET_SCANNER_STATUS' });
  if (response?.enabled) {
    elements.autoScanToggle.checked = true;
    updateScannerStatus(true);
  }

  // Son sinyali yükle
  const data = await chrome.storage.local.get('lastSignal');
  if (data.lastSignal) {
    updateLastSignal(data.lastSignal);
  }

  // Storage değişikliklerini dinle (yeni sinyal gelirse)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastSignal) {
      updateLastSignal(changes.lastSignal.newValue);
    }
  });
}

function updateScannerStatus(enabled) {
  const statusDot = elements.scannerStatus.querySelector('.status-dot');
  const statusText = elements.scannerStatus.querySelector('.status-text');

  if (enabled) {
    elements.scannerSection.classList.add('active');
    statusDot.style.background = 'var(--success)';
    statusText.textContent = 'Tarama aktif - arka planda çalışıyor';
  } else {
    elements.scannerSection.classList.remove('active');
    statusDot.style.background = 'var(--text-muted)';
    statusText.textContent = 'Tarama kapalı';
  }
}

function updateLastSignal(signal) {
  if (!signal) return;

  elements.lastSignal.classList.remove('hidden');

  elements.signalAction.textContent = signal.action;
  elements.signalAction.className = `signal-action ${signal.action.toLowerCase()}`;

  elements.signalCoin.textContent = signal.market.coin;
  elements.signalConfidence.textContent = `${signal.confidence}%`;

  const timeDiff = Math.round((Date.now() - signal.timestamp) / 1000);
  elements.signalTime.textContent = timeDiff < 60 ? `${timeDiff}sn önce` : `${Math.floor(timeDiff / 60)}dk önce`;
}

// Tab Navigation
function switchTab(tabName) {
  elements.navBtns?.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  Object.entries(elements.tabPanels).forEach(([name, panel]) => {
    panel?.classList.toggle('active', name === tabName);
  });
}

// Helpers
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function injectContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content.js']
    });
    await sleep(500);
  }
}

async function tryGetMarketInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('polymarket.com')) {
      await injectContentScript(tab.id);
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_MARKET_INFO' });
      if (response?.success) {
        currentMarket = response.data;
        showMarketPreview(currentMarket);
      }
    }
  } catch (e) {
    console.log('Market preview failed:', e);
  }
}

// Main Analysis
async function handleAnalyze() {
  try {
    showLoading('Sayfa okunuyor...');
    setStatus('Analiz ediliyor...');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('polymarket.com')) {
      throw new Error('Lütfen bir Polymarket sayfasına gidin');
    }

    await injectContentScript(tab.id);

    showLoading('Market verisi alınıyor...');
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_MARKET_INFO' });

    if (!response?.success) {
      throw new Error(response?.error || 'Market bilgisi alınamadı');
    }

    currentMarket = response.data;
    console.log('📊 Market:', currentMarket);

    showLoading('Analiz yapılıyor...');

    // Use advanced analyzer for crypto
    if (currentMarket.type === 'crypto' && cryptoAnalyzer) {
      analysisResult = await cryptoAnalyzer.analyze(currentMarket);
    } else {
      analysisResult = await analyzeMarket(currentMarket);
    }

    // Try to get trader signals
    let traderSignals = null;
    if (polymarketAPI) {
      showLoading('Trader sinyalleri alınıyor...');

      try {
        traderSignals = await polymarketAPI.getTraderSignals(currentMarket);
      } catch (e) {
        console.log('❌ Trader signals error:', e);
      }
    }

    // If no trader signals from API, create from market outcomes
    if (!traderSignals?.available && currentMarket.outcomes?.length >= 2) {
      console.log('📊 Fallback: Outcome fiyatlarından trader sinyalleri oluşturuluyor');
      const yesOutcome = currentMarket.outcomes.find(o => o.name.toLowerCase() === 'yes');
      const noOutcome = currentMarket.outcomes.find(o => o.name.toLowerCase() === 'no');

      if (yesOutcome && noOutcome) {
        const yesPrice = yesOutcome.price || 50;
        const noPrice = noOutcome.price || 50;

        traderSignals = {
          available: true,
          yesBias: yesPrice,
          noBias: noPrice,
        };
      }
    }

    // Likidite analizi (kripto marketleri için)
    let liquidityData = null;
    if (liquidityAnalyzer && currentMarket.type === 'crypto') {
      showLoading('Likidite kontrol ediliyor...');
      try {
        // Token ID'yi outcome'dan al
        const yesOutcome = currentMarket.outcomes?.find(o => o.name.toLowerCase() === 'yes');
        if (yesOutcome?.tokenId) {
          liquidityData = await liquidityAnalyzer.analyze(yesOutcome.tokenId);
          console.log('💧 Likidite:', liquidityData);
        }
      } catch (e) {
        console.log('Liquidity analysis error:', e);
      }
    }

    showResult(currentMarket, analysisResult, traderSignals, liquidityData);

    // Arbitraj analizi (kripto için)
    if (currentMarket.type === 'crypto') {
      updateArbitrageSection(currentMarket);
      updateNewsSection(currentMarket);
    }

    await saveToHistory(currentMarket, analysisResult);

    setStatus('Hazır');

  } catch (error) {
    console.error('Analysis error:', error);
    showError(error.message);
    setStatus('Hata');
  }
}

// Fallback Analysis (for non-crypto markets)
async function analyzeMarket(market) {
  const result = {
    prediction: 'Nötr',
    confidence: 50,
    reasons: [],
    indicators: [],
    timeRemaining: null,
    strategy: { name: 'genel' }
  };

  try {
    if (market.type === 'sports' || market.type === 'esports') {
      await analyzeSports(market, result);
    } else {
      analyzeGeneric(market, result);
    }
  } catch (error) {
    console.error('Analysis error:', error);
  }

  return result;
}

async function analyzeSports(market, result) {
  const teams = extractTeams(market.title);

  if (teams) {
    result.reasons.push({
      sentiment: 'neutral',
      text: `<strong>Maç:</strong> ${teams.team1} vs ${teams.team2}`
    });
  }

  if (market.outcomes?.length >= 2) {
    const sorted = [...market.outcomes].sort((a, b) => (b.price || 0) - (a.price || 0));
    const top = sorted[0];

    if (top && top.price) {
      result.confidence = top.price;
      result.prediction = top.name; // YES/NO yerine outcome adı
      result.reasons.push({
        sentiment: top.price > 60 ? 'bullish' : 'neutral',
        text: `Favori: <strong>${top.name}</strong> ${top.price}¢`
      });
    }
  }
}

function analyzeGeneric(market, result) {
  if (market.outcomes?.length > 0) {
    const sorted = [...market.outcomes].sort((a, b) => (b.price || 0) - (a.price || 0));
    const top = sorted[0];
    if (top && top.price) {
      result.prediction = top.name;
      result.confidence = top.price;
    }
  }
}

function extractTeams(title) {
  const match = title.match(/(.+?)\s+(?:vs?\.?|versus)\s+(.+?)(?:\s*[-–?]|$)/i);
  return match ? { team1: match[1].trim(), team2: match[2].trim() } : null;
}

// UI Functions
function showMarketPreview(market) {
  if (elements.welcomeState) {
    const h2 = elements.welcomeState.querySelector('h2');
    const p = elements.welcomeState.querySelector('p');
    if (h2) h2.textContent = market.title;
    if (p) p.textContent = 'Analiz için butona tıkla';
  }
}

function showResult(market, result, traderSignals = null, liquidityData = null) {
  hideLoading();
  hideError();
  elements.welcomeState?.classList.add('hidden');
  elements.analysisResult?.classList.remove('hidden');

  // Market info
  if (elements.marketBadge) {
    const icon = MARKET_ICONS[market.type] || MARKET_ICONS.other;
    const label = MARKET_LABELS[market.type] || MARKET_LABELS.other;
    elements.marketBadge.textContent = `${icon} ${label}`;
  }

  if (elements.marketTitle) {
    elements.marketTitle.textContent = market.title;
  }

  if (elements.marketExpiry) {
    elements.marketExpiry.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
      </svg>
      ${market.expiry || '--:--'}
    `;
  }

  if (elements.marketVolume) {
    elements.marketVolume.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
      </svg>
      ${market.volume ? '$' + formatNumber(market.volume) : '$--'}
    `;
  }

  // Prediction card
  const isYes = result.prediction.toUpperCase() === 'YES';
  const isNo = result.prediction.toUpperCase() === 'NO';

  elements.predictionCard?.classList.toggle('no', isNo); // Kırmızı renk için class

  if (elements.predictionValue) elements.predictionValue.textContent = result.prediction;
  if (elements.confidenceNumber) elements.confidenceNumber.textContent = result.confidence;
  if (elements.confidenceRing) {
    const offset = 264 - (264 * result.confidence / 100);
    elements.confidenceRing.style.strokeDashoffset = offset;
  }

  // Market prices
  if (elements.marketPrices && market.outcomes?.length > 0) {
    const mainOutcomes = market.outcomes.slice(0, 4);
    elements.marketPrices.innerHTML = mainOutcomes.map(o => `
      <div class="price-item ${o.name.toLowerCase() === result.prediction.toLowerCase() ? 'highlight' : ''}">
        <span class="price-name">${o.name}</span>
        <span class="price-value">${o.price ? o.price + '¢' : '--'}</span>
      </div>
    `).join('');
  }

  // Insights
  if (elements.insightsList) {
    if (result.reasons?.length > 0) {
      elements.insightsList.innerHTML = result.reasons.map(r => `
        <div class="insight-item">
            <span class="insight-dot ${r.sentiment}"></span>
            <span class="insight-text">${r.text}</span>
        </div>
        `).join('');
    } else {
      elements.insightsList.innerHTML = '<div class="insight-item"><span class="insight-text">Ekstra bilgi yok</span></div>';
    }
  }

  // Indicators
  if (result.indicators?.length > 0) {
    elements.indicatorsSection?.classList.remove('hidden');
    if (elements.indicatorsGrid) {
      elements.indicatorsGrid.innerHTML = result.indicators.map(i => `
        <div class="indicator-item">
          <div class="indicator-name">${i.name}</div>
          <div class="indicator-value ${i.signal}">${i.value}</div>
        </div>
      `).join('');
    }
  } else {
    elements.indicatorsSection?.classList.add('hidden');
  }

  // Trader Signals
  if (traderSignals && traderSignals.available) {
    elements.tradersSection?.classList.remove('hidden');
    if (elements.tradersYesCount) elements.tradersYesCount.textContent = Math.round(traderSignals.yesBias) + '%';
    if (elements.tradersNoCount) elements.tradersNoCount.textContent = Math.round(traderSignals.noBias) + '%';
    if (elements.tradersFill) elements.tradersFill.style.width = traderSignals.yesBias + '%';

    if (elements.tradersDetails && traderSignals.details?.length > 0) {
      elements.tradersDetails.innerHTML = traderSignals.details
        .filter(d => typeof d === 'object')
        .map(d => `
          <div class="trader-detail">
            <span class="dot ${d.sentiment}"></span>
            <span>${d.text}</span>
          </div>
        `).join('');
    }
  } else {
    elements.tradersSection?.classList.add('hidden');
  }

  // Strategy
  if (result.strategy && result.timeRemaining !== null) {
    elements.strategySection?.classList.remove('hidden');
    const strategyNames = {
      'trend': '📈 Trend Analizi',
      'momentum': '⚡ Momentum',
      'gap_focus': '🎯 Hedef Odaklı',
      'final': '⏰ Son Dakika',
      'balanced': '⚖️ Dengeli',
      'genel': '📊 Genel Analiz'
    };
    if (elements.strategyText) {
      const strategyName = strategyNames[result.strategy.name] || result.strategy.name || 'Genel';
      elements.strategyText.textContent = `${strategyName} • ${result.timeRemaining} dk kaldı`;
    }
  } else {
    elements.strategySection?.classList.add('hidden');
  }

  // Liquidity
  if (liquidityData && liquidityData.available) {
    elements.liquiditySection?.classList.remove('hidden');

    // Güvenli işlem tutarı
    const safeTrade = liquidityData.safeTradeSize?.recommended || 0;
    if (elements.liquiditySafe) {
      elements.liquiditySafe.textContent = `$${safeTrade.toLocaleString()}`;
      elements.liquiditySafe.className = 'liquidity-value ' +
        (safeTrade >= 500 ? 'good' : safeTrade >= 100 ? 'warning' : 'danger');
    }

    // Spread
    if (elements.liquiditySpread && liquidityData.spread) {
      elements.liquiditySpread.textContent = `${liquidityData.spread.percent}%`;
      elements.liquiditySpread.className = 'liquidity-value ' +
        (liquidityData.spread.status === 'good' ? 'good' :
          liquidityData.spread.status === 'fair' ? 'warning' : 'danger');
    }

    // Uyarı mesajı
    if (elements.liquidityAlert && liquidityData.recommendation?.length > 0) {
      const firstRec = liquidityData.recommendation[0];
      elements.liquidityAlert.textContent = firstRec;
      elements.liquidityAlert.className = 'liquidity-alert show ' +
        (safeTrade < 100 ? 'danger' : safeTrade < 500 ? 'warning' : '');
    }
  } else {
    elements.liquiditySection?.classList.add('hidden');
  }

  // Quick Trade Section - Analiz sonucu varsa göster
  elements.quickTradeSection?.classList.remove('hidden');
}

function showLoading(text) {
  elements.welcomeState?.classList.add('hidden');
  elements.analysisResult?.classList.add('hidden');
  elements.errorState?.classList.add('hidden');
  elements.loadingState?.classList.remove('hidden');
  if (elements.loadingText) elements.loadingText.textContent = text;
}

function hideLoading() {
  elements.loadingState?.classList.add('hidden');
}

function showError(message) {
  hideLoading();
  elements.welcomeState?.classList.add('hidden');
  elements.analysisResult?.classList.add('hidden');
  elements.errorState?.classList.remove('hidden');
  if (elements.errorText) elements.errorText.textContent = message;
}

function hideError() {
  elements.errorState?.classList.add('hidden');
}

function setStatus(text) {
  if (elements.brandStatus) elements.brandStatus.textContent = text;
}

// History
async function loadHistory() {
  try {
    const data = await chrome.storage.local.get('analysisHistory');
    analysisHistory = data.analysisHistory || [];
    renderHistory();
    updatePnlDashboard();
  } catch (e) {
    analysisHistory = [];
  }
}

async function saveToHistory(market, result) {
  const item = {
    market,
    result,
    timestamp: Date.now()
  };

  // En başa ekle
  analysisHistory.unshift(item);

  // Max 50
  if (analysisHistory.length > 50) {
    analysisHistory = analysisHistory.slice(0, 50);
  }

  await chrome.storage.local.set({ analysisHistory });
  renderHistory();
  updatePnlDashboard();
}

function renderHistory() {
  if (!elements.historyList) return;

  elements.historyList.innerHTML = '';

  if (analysisHistory.length === 0) {
    elements.historyList.innerHTML = `
      <div class="empty-state">
        <span>📭</span>
        <p>Henüz analiz yok</p>
      </div>
    `;
    return;
  }

  analysisHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';

    const date = new Date(item.timestamp).toLocaleTimeString();
    const prediction = item.result.prediction;
    const isYes = prediction.toUpperCase() === 'YES';

    // Result badge or buttons
    let resultHtml = '';
    if (item.outcome) {
      // Zaten sonuçlanmış
      const isWin = item.outcome === 'WON';
      resultHtml = `<span class="result-badge ${isWin ? 'won' : 'lost'}">${isWin ? 'KAZANDI' : 'KAYBETTİ'}</span>`;
    } else {
      // Sonuç girilmeli
      resultHtml = `
        <button class="history-action-btn won" onclick="window.setHistoryResult(${item.timestamp}, 'WON')">✅</button>
        <button class="history-action-btn lost" onclick="window.setHistoryResult(${item.timestamp}, 'LOST')">❌</button>
      `;
    }

    div.innerHTML = `
      <div class="history-header">
        <span class="history-coin">${item.market.coin}</span>
        <span class="history-time">${date}</span>
      </div>
      <div class="history-details">
        <span>Tahmin: <strong class="${isYes ? 'text-success' : 'text-danger'}">${prediction}</strong></span>
        <span>Güven: %${item.result.confidence}</span>
      </div>
      <div class="history-actions">
        ${resultHtml}
      </div>
    `;

    elements.historyList.appendChild(div);
  });
}

// Settings
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get('settings');
    if (data.settings?.sportsApiKey && elements.sportsApiKey) {
      elements.sportsApiKey.value = data.settings.sportsApiKey;
    }
  } catch (e) { }
}

async function saveSettings() {
  const settings = { sportsApiKey: elements.sportsApiKey?.value || '' };
  await chrome.storage.local.set({ settings });
  alert('Ayarlar kaydedildi!');
}

async function exportData() {
  const data = { history: analysisHistory, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'polymarket-ai-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Helpers
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatTime(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  if (hours < 24) return `${hours} saat önce`;
  if (days < 7) return `${days} gün önce`;
  return date.toLocaleDateString('tr-TR');
}

// P&L Dashboard
// Global scope for onclick access
window.setHistoryResult = async (timestamp, result) => {
  const index = analysisHistory.findIndex(item => item.timestamp === timestamp);
  if (index !== -1) {
    analysisHistory[index].outcome = result; // WON or LOST
    await chrome.storage.local.set({ analysisHistory });
    renderHistory();
    updatePnlDashboard();
  }
};

function updatePnlDashboard() {
  if (!pnlTracker || !elements.pnlDashboard) return;

  // Sadece sonucu belli olanları filtrele
  const finishedTrades = analysisHistory.filter(item => item.outcome).map(item => ({
    result: item.outcome, // PnLTracker 'result' bekliyor (WON/LOST)
    timestamp: item.timestamp
  }));

  if (finishedTrades.length === 0) {
    elements.pnlDashboard.classList.add('hidden');
    return;
  }

  elements.pnlDashboard.classList.remove('hidden');
  const stats = pnlTracker.calculateStats(finishedTrades);

  if (elements.pnlWinRate) {
    elements.pnlWinRate.textContent = `${stats.winRate.toFixed(1)}%`;
    elements.pnlWinRate.className = 'pnl-value ' + (stats.winRate >= 50 ? 'positive' : 'negative');
  }

  if (elements.pnlRoi) {
    elements.pnlRoi.textContent = `${stats.roi.toFixed(1)}%`;
    elements.pnlRoi.className = 'pnl-value ' + (stats.roi >= 0 ? 'positive' : 'negative');
  }

  if (elements.pnlProfit) {
    elements.pnlProfit.textContent = `$${stats.totalProfit.toLocaleString()}`;
    elements.pnlProfit.className = 'pnl-value ' + (stats.totalProfit >= 0 ? 'positive' : 'negative');
  }

  renderMiniChart(stats.equityCurve);
}

function renderMiniChart(dataPoints) {
  if (!elements.pnlChart || dataPoints.length < 2) return;

  const width = elements.pnlChart.clientWidth || 300;
  const height = 40;

  // Min/Max values for scaling
  const values = dataPoints.map(d => d.value);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const range = maxVal - minVal || 100;

  const points = dataPoints.map((pt, i) => {
    const x = (i / (dataPoints.length - 1)) * width;
    // Normalize Y (0 at bottom, height at top)
    const y = height - ((pt.value - minVal) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  elements.pnlChart.innerHTML = `
    <polyline 
      points="${points}" 
      fill="none" 
      stroke="${values[values.length - 1] >= 0 ? '#10B981' : '#EF4444'}" 
      stroke-width="2"
    />
    <line x1="0" y1="${height - ((0 - minVal) / range) * height}" x2="${width}" y2="${height - ((0 - minVal) / range) * height}" stroke="#334155" stroke-dasharray="4" />
  `;
}

// FAZ 5: Quick Trade Handler
async function handleQuickTrade(outcome) {
  const amount = 5; // Varsayılan $5

  // GÜVENLIK: Kullanıcı onayı
  const confirmed = confirm(`⚠️ DİKKAT: GERÇEK PARA İŞLEMİ!\n\n${outcome} için $${amount} işlem yapılacak.\n\nDevam etmek istiyor musunuz?`);

  if (!confirmed) {
    console.log('❌ Kullanıcı işlemi iptal etti');
    return;
  }

  // Butonları disable et
  if (elements.quickTradeYes) elements.quickTradeYes.disabled = true;
  if (elements.quickTradeNo) elements.quickTradeNo.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('polymarket.com')) {
      alert('❌ Lütfen bir Polymarket sayfasına gidin');
      return;
    }

    // Content script'e mesaj gönder
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXECUTE_TRADE',
      outcome: outcome,
      amount: amount
    });

    if (response?.success) {
      alert(`✅ İşlem gönderildi!\n\n${response.message}`);
      console.log('🎉 Trade başarılı:', response);
    } else {
      alert(`❌ İşlem başarısız!\n\n${response?.error || 'Bilinmeyen hata'}`);
      console.error('Trade hatası:', response?.error);
    }

  } catch (error) {
    console.error('Quick trade error:', error);
    alert(`❌ Hata: ${error.message}\n\nContent script yüklenmemiş olabilir. Sayfayı yenileyin.`);
  } finally {
    // Butonları tekrar aktif et
    if (elements.quickTradeYes) elements.quickTradeYes.disabled = false;
    if (elements.quickTradeNo) elements.quickTradeNo.disabled = false;
  }
}

// Clear History
async function clearHistory() {
  if (confirm('Geçmişi silmek istediğinizden emin misiniz?')) {
    analysisHistory = [];
    await chrome.storage.local.remove(['analysisHistory']);
    renderHistory();
    updatePnlDashboard();
  }
}

/**
 * Arbitraj Section Güncelleme
 * Market kripto ise Binance ile karşılaştırır
 */
async function updateArbitrageSection(market) {
  if (!market || market.type !== 'crypto' || !market.strikePrice) {
    elements.arbitrageSection?.classList.add('hidden');
    return;
  }

  try {
    const symbol = market.coin === 'ETH' ? 'ETHUSDT' : 'BTCUSDT';
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);

    if (!response.ok) {
      elements.arbitrageSection?.classList.add('hidden');
      return;
    }

    const data = await response.json();
    const binancePrice = parseFloat(data.price);
    const strikePrice = market.strikePrice;

    // Fark hesapla
    const diffPercent = ((binancePrice - strikePrice) / strikePrice) * 100;

    // UI güncelle
    elements.arbitrageSection?.classList.remove('hidden');

    if (elements.arbBinancePrice) {
      elements.arbBinancePrice.textContent = `$${binancePrice.toLocaleString()}`;
    }

    if (elements.arbStrikePrice) {
      elements.arbStrikePrice.textContent = `$${strikePrice.toLocaleString()}`;
    }

    if (elements.arbDiff) {
      elements.arbDiff.textContent = `${diffPercent > 0 ? '+' : ''}${diffPercent.toFixed(2)}%`;
      elements.arbDiff.className = 'arbitrage-value ' + (diffPercent > 0 ? 'positive' : 'negative');
    }

    // Arbitraj sinyali göster (fark %0.3+ ise)
    if (Math.abs(diffPercent) >= 0.3) {
      const suggestedAction = diffPercent > 0 ? 'YES şansı yüksek' : 'NO şansı yüksek';
      elements.arbSignal?.classList.remove('hidden');
      if (elements.arbSignalText) {
        elements.arbSignalText.textContent = `Binance ${diffPercent > 0 ? 'yukarıda' : 'aşağıda'}: ${suggestedAction}`;
      }
    } else {
      elements.arbSignal?.classList.add('hidden');
    }

  } catch (error) {
    console.error('Arbitrage update error:', error);
    elements.arbitrageSection?.classList.add('hidden');
  }
}

/**
 * News Sentiment Section Güncelleme
 * Kripto marketler için haber analizi yapar
 */
async function updateNewsSection(market) {
  if (!newsSentiment || !market || market.type !== 'crypto') {
    elements.newsSection?.classList.add('hidden');
    return;
  }

  try {
    const coin = market.coin || (market.title?.toLowerCase().includes('btc') ? 'BTC' : 'ETH');
    const summary = await newsSentiment.getSentimentSummary(coin);

    // Section'ı göster
    elements.newsSection?.classList.remove('hidden');

    // Sentiment bar güncelle
    if (elements.newsSentimentEmoji) {
      elements.newsSentimentEmoji.textContent = summary.emoji;
    }

    if (elements.newsSentimentLabel) {
      const labelMap = { bullish: 'Pozitif', bearish: 'Negatif', neutral: 'Nötr' };
      elements.newsSentimentLabel.textContent = `${coin} Haberleri: ${labelMap[summary.overallSentiment] || 'Nötr'}`;
    }

    if (elements.newsSentimentScore) {
      elements.newsSentimentScore.textContent = `${summary.sentimentScore > 0 ? '+' : ''}${summary.sentimentScore}`;
      elements.newsSentimentScore.className = 'news-sentiment-score ' +
        (summary.sentimentScore > 0 ? 'positive' : summary.sentimentScore < 0 ? 'negative' : '');
    }

    if (elements.newsRecommendation) {
      elements.newsRecommendation.textContent = summary.recommendation;
    }

    // Haber listesi
    if (elements.newsList && summary.topNews.length > 0) {
      elements.newsList.innerHTML = summary.topNews.map(news => `
        <div class="news-item">
          <span class="news-item-emoji">${news.sentiment.emoji}</span>
          <div class="news-item-title">
            <a href="${news.url}" target="_blank">${news.title}</a>
          </div>
        </div>
      `).join('');
    }

  } catch (error) {
    console.error('News update error:', error);
    elements.newsSection?.classList.add('hidden');
  }
}
