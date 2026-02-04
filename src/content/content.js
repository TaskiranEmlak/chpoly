/**
 * Polymarket Tahmin Asistanı - Content Script v2
 * Gelişmiş sayfa okuma - tüm outcome'ları çeker
 */

console.log('🔮 Polymarket Content Script v2 yüklendi');

// Market type detection patterns
const MARKET_PATTERNS = {
    crypto: {
        patterns: [/btc|bitcoin|eth|ethereum|crypto|sol|solana/i],
        keywords: ['up', 'down', 'above', 'below', 'price']
    },
    sports: {
        patterns: [/nba|nfl|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|ufc|mma|boxing|premier league|champions league|la liga|bundesliga|serie a|ligue 1/i],
        keywords: ['win', 'beat', 'match', 'game', 'vs', 'versus', 'score']
    },
    esports: {
        patterns: [/esports|lol|dota|csgo|valorant|league of legends|counter-strike/i],
        keywords: ['tournament', 'championship', 'finals']
    },
    politics: {
        patterns: [/election|president|trump|biden|senate|congress|vote|poll/i],
        keywords: ['win', 'elected', 'nomination']
    }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📩 Content script mesaj aldı:', message);

    if (message.type === 'PING') {
        sendResponse({ success: true, message: 'Content script aktif' });
        return true;
    }

    if (message.type === 'GET_MARKET_INFO') {
        try {
            const marketInfo = extractMarketInfo();
            console.log('✅ Market bilgisi çıkarıldı:', marketInfo);
            sendResponse({ success: true, data: marketInfo });
        } catch (error) {
            console.error('❌ Market bilgisi alınamadı:', error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }

    // FAZ 5: AUTO-EXECUTE
    if (message.type === 'EXECUTE_TRADE') {
        executeTrade(message.outcome, message.amount)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // async response
    }
});

/**
 * FAZ 5: Tek Tıkla İşlem - Auto Execute Trade
 * @param {string} outcome - 'YES' veya 'NO'
 * @param {number} amount - İşlem tutarı (USD cinsinden)
 */
async function executeTrade(outcome, amount = 5) {
    console.log(`⚡ Auto-Execute başlatılıyor: ${outcome} $${amount}`);

    // GÜVENLIK: Maksimum tek işlem limiti
    const MAX_SINGLE_TRADE = 50;
    if (amount > MAX_SINGLE_TRADE) {
        return { success: false, error: `Maksimum işlem limiti $${MAX_SINGLE_TRADE}` };
    }

    try {
        // Step 1: Doğru butonu bul (Buy Yes veya Buy No)
        const buyButton = findBuyButton(outcome);
        if (!buyButton) {
            return { success: false, error: `${outcome} için Buy butonu bulunamadı` };
        }

        console.log('✅ Buy butonu bulundu:', buyButton.textContent);

        // Step 2: Butona tıkla (order panel açılır)
        buyButton.click();
        await sleep(500); // Panel açılmasını bekle

        // Step 3: Amount input'u bul ve değeri gir
        const amountInput = findAmountInput();
        if (amountInput) {
            // Clear and set new value
            amountInput.value = '';
            amountInput.focus();

            // Simüle keyboard input (React için)
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(amountInput, amount.toString());
            amountInput.dispatchEvent(new Event('input', { bubbles: true }));

            console.log('✅ Tutar girildi:', amount);
            await sleep(300);
        } else {
            console.log('⚠️ Amount input bulunamadı, varsayılan tutar kullanılacak');
        }

        // Step 4: Confirm/Submit butonu bul ve tıkla
        const confirmButton = findConfirmButton();
        if (!confirmButton) {
            return { success: false, error: 'Onay butonu bulunamadı. Manuel işlem yapın.' };
        }

        console.log('✅ Confirm butonu bulundu:', confirmButton.textContent);

        // FINAL CHECK: Kullanıcı onayı (tarayıcı confirm dialog'u)
        // NOT: Popup'tan geldiği için bu çalışmayabilir, popup tarafında kontrol edilmeli

        // Butona tıkla
        confirmButton.click();
        console.log('🎉 İşlem gönderildi!');

        await sleep(1000);

        // Başarılı sonuç
        return {
            success: true,
            message: `${outcome} için $${amount} işlem gönderildi`,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('❌ Trade execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Buy butonunu bul
 */
function findBuyButton(outcome) {
    const buttons = document.querySelectorAll('button');
    const targetText = outcome.toLowerCase();

    for (const btn of buttons) {
        const text = btn.textContent.toLowerCase();
        // "Buy Yes" veya "Buy No" formatı
        if (text.includes('buy') && text.includes(targetText)) {
            return btn;
        }
    }

    // Alternatif: Sadece "Yes" veya "No" yazan buton (satın al bağlamında)
    for (const btn of buttons) {
        const text = btn.textContent.toLowerCase().trim();
        if (text === targetText || text === `buy ${targetText}`) {
            return btn;
        }
    }

    return null;
}

/**
 * Amount input alanını bul
 */
function findAmountInput() {
    // Tutar girişi için input alanları
    const selectors = [
        'input[type="number"]',
        'input[placeholder*="$"]',
        'input[placeholder*="Amount"]',
        'input[placeholder*="amount"]',
        'input[class*="amount"]',
        'input[class*="input"]'
    ];

    for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && isVisible(input)) {
            return input;
        }
    }

    return null;
}

/**
 * Confirm/Submit butonu bul
 */
function findConfirmButton() {
    const buttons = document.querySelectorAll('button');
    const confirmTexts = ['confirm', 'submit', 'buy', 'place order', 'execute', 'trade'];

    for (const btn of buttons) {
        const text = btn.textContent.toLowerCase().trim();
        for (const target of confirmTexts) {
            if (text.includes(target) && !text.includes('cancel')) {
                // İşlem butonları genellikle stilize edilmiştir
                if (isVisible(btn) && !btn.disabled) {
                    return btn;
                }
            }
        }
    }

    return null;
}

/**
 * Element görünür mü kontrolü
 */
function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        el.offsetParent !== null;
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract market information from the current Polymarket page
 */
function extractMarketInfo() {
    const url = window.location.href;
    const pathname = window.location.pathname;

    // Detect if this is an event page
    const isEventPage = pathname.includes('/event/');

    if (!isEventPage) {
        throw new Error('Bu bir market sayfası değil. Bir event sayfasına gidin.');
    }

    // Extract all info
    const title = extractTitle();
    const description = extractDescription();
    const outcomes = extractAllOutcomes();
    const currentPrice = extractCurrentPrice(outcomes);
    const marketType = detectMarketType(title, description);

    const marketInfo = {
        url: url,
        slug: extractSlug(pathname),
        title: title,
        description: description,
        expiry: extractExpiry(),
        volume: extractVolume(),
        currentPrice: currentPrice,
        type: marketType,
        strikePrice: marketType === 'crypto' ? extractStrikePrice(title) : null,
        outcomes: outcomes
    };

    return marketInfo;
}

/**
 * Extract slug from URL
 */
function extractSlug(pathname) {
    const match = pathname.match(/\/event\/([^\/\?]+)/);
    return match ? match[1] : null;
}

/**
 * Extract market title
 */
function extractTitle() {
    // Method 1: Look for h1
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim().length > 5) {
        return h1.textContent.trim();
    }

    // Method 2: Look for large text elements
    const largeTexts = document.querySelectorAll('[class*="text-2xl"], [class*="text-3xl"], [class*="text-xl"]');
    for (const el of largeTexts) {
        const text = el.textContent.trim();
        if (text.length > 10 && text.length < 300) {
            return text;
        }
    }

    // Method 3: Page title
    const pageTitle = document.title;
    if (pageTitle && !pageTitle.toLowerCase().includes('polymarket')) {
        return pageTitle.split('|')[0].split('-')[0].trim();
    }

    // Method 4: OG title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
        return ogTitle.content;
    }

    return 'Market başlığı bulunamadı';
}

/**
 * Extract description
 */
function extractDescription() {
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.content) {
        return metaDesc.content;
    }

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc && ogDesc.content) {
        return ogDesc.content;
    }

    return '';
}

/**
 * MAIN FUNCTION: Extract all outcomes with prices
 * Tüm bahis seçeneklerini ve fiyatlarını çeker
 */
function extractAllOutcomes() {
    console.log('🔍 Outcome extraction başlıyor...');

    let outcomes = [];

    // Strategy 1: Look for specific market outcome areas
    outcomes = extractFromMarketArea();
    if (outcomes.length > 0 && outcomes.length <= 20) {
        console.log('✅ Strategy 1 (market area) başarılı:', outcomes.length, 'outcome');
        return outcomes;
    }

    // Strategy 2: Find YES/NO buttons specifically
    outcomes = extractYesNoButtons();
    if (outcomes.length > 0) {
        console.log('✅ Strategy 2 (yes/no buttons) başarılı:', outcomes.length, 'outcome');
        return outcomes;
    }

    // Strategy 3: Parse from page text
    outcomes = extractFromPageText();
    if (outcomes.length > 0) {
        console.log('✅ Strategy 3 (page text) başarılı:', outcomes.length, 'outcome');
        return outcomes;
    }

    // Fallback: Basic YES/NO
    console.log('⚠️ Tüm stratejiler başarısız, fallback YES/NO kullanılıyor');
    return [
        { name: 'YES', price: null },
        { name: 'NO', price: null }
    ];
}

/**
 * Strategy 1: Look for market outcome area containers
 */
function extractFromMarketArea() {
    const outcomes = [];
    const seen = new Set();

    // Look for the main market section - usually has cards/buttons for each outcome
    // Find elements that look like clickable outcome options
    const potentialContainers = document.querySelectorAll('main button, main [role="button"], [class*="market"] button');

    for (const container of potentialContainers) {
        const text = container.textContent.trim();

        // Skip if too long (likely not an outcome button)
        if (text.length > 100 || text.length < 2) continue;

        // Must contain a price indicator
        const priceMatch = text.match(/(\d{1,2})\s*[¢%]/);
        if (!priceMatch) continue;

        const price = parseInt(priceMatch[1]);

        // Skip if price is out of range
        if (price < 1 || price > 99) continue;

        // Extract name
        let name = text
            .replace(/\d+\s*[¢%]/g, '')
            .replace(/Buy\s*/gi, '')
            .replace(/Sell\s*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Handle common patterns
        if (!name || name.length < 2) {
            if (/yes/i.test(text)) name = 'YES';
            else if (/no/i.test(text)) name = 'NO';
            else continue;
        }

        // Skip if it's just a number or too generic
        if (/^\d+$/.test(name)) continue;
        if (name.length > 50) name = name.substring(0, 50);

        const normalizedName = name.toLowerCase().trim();

        // Skip duplicates
        if (seen.has(normalizedName)) continue;
        seen.add(normalizedName);

        outcomes.push({ name, price });
    }

    // If we got too many, try to filter to just main ones
    if (outcomes.length > 20) {
        // Keep only YES/NO if they exist
        const yesNo = outcomes.filter(o =>
            o.name.toLowerCase() === 'yes' || o.name.toLowerCase() === 'no'
        );
        if (yesNo.length >= 2) {
            return yesNo;
        }
        // Otherwise return first 10
        return outcomes.slice(0, 10);
    }

    return outcomes;
}

/**
 * Strategy 2: Find YES/NO buttons specifically
 */
function extractYesNoButtons() {
    const outcomes = [];

    // Search all text on page for Yes/No with prices
    const allText = document.body.innerText;

    // Look for patterns like "Yes 45¢" or "Buy Yes 45¢"
    const yesPatterns = [
        /Buy\s+Yes\s*(\d+)\s*[¢%]/i,
        /Yes\s*(\d+)\s*[¢%]/i,
        /Yes\s+(\d+)/i
    ];

    const noPatterns = [
        /Buy\s+No\s*(\d+)\s*[¢%]/i,
        /No\s*(\d+)\s*[¢%]/i,
        /No\s+(\d+)/i
    ];

    let yesPrice = null;
    let noPrice = null;

    for (const pattern of yesPatterns) {
        const match = allText.match(pattern);
        if (match) {
            yesPrice = parseInt(match[1]);
            break;
        }
    }

    for (const pattern of noPatterns) {
        const match = allText.match(pattern);
        if (match) {
            noPrice = parseInt(match[1]);
            break;
        }
    }

    // Also try looking at buttons directly
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        const text = btn.textContent.trim();

        if (/yes/i.test(text) && text.length < 50) {
            const priceMatch = text.match(/(\d+)\s*[¢%]/);
            if (priceMatch) yesPrice = parseInt(priceMatch[1]);
            else if (yesPrice === null) {
                // Try to find price in sibling or parent
                const parent = btn.parentElement;
                if (parent) {
                    const parentMatch = parent.textContent.match(/(\d+)\s*[¢%]/);
                    if (parentMatch) yesPrice = parseInt(parentMatch[1]);
                }
            }
        }

        if (/no/i.test(text) && !/not|none|now|know|no\w/i.test(text) && text.length < 50) {
            const priceMatch = text.match(/(\d+)\s*[¢%]/);
            if (priceMatch) noPrice = parseInt(priceMatch[1]);
            else if (noPrice === null) {
                const parent = btn.parentElement;
                if (parent) {
                    const parentMatch = parent.textContent.match(/(\d+)\s*[¢%]/);
                    if (parentMatch) noPrice = parseInt(parentMatch[1]);
                }
            }
        }
    }

    if (yesPrice !== null || noPrice !== null) {
        // Calculate missing price if we have one
        if (yesPrice !== null && noPrice === null) {
            noPrice = 100 - yesPrice;
        } else if (noPrice !== null && yesPrice === null) {
            yesPrice = 100 - noPrice;
        }

        outcomes.push({ name: 'YES', price: yesPrice });
        outcomes.push({ name: 'NO', price: noPrice });
    }

    return outcomes;
}

/**
 * Strategy 3: Extract from page text using regex
 */
function extractFromPageText() {
    const outcomes = [];
    const bodyText = document.body.innerText;

    // Look for "Yes XX¢" or "No XX¢" patterns
    const yesMatch = bodyText.match(/Yes\s*(\d+)\s*[¢%]/i);
    const noMatch = bodyText.match(/No\s*(\d+)\s*[¢%]/i);

    if (yesMatch) {
        outcomes.push({ name: 'YES', price: parseInt(yesMatch[1]) });
    }
    if (noMatch) {
        outcomes.push({ name: 'NO', price: parseInt(noMatch[1]) });
    }

    // If we found one, calculate the other
    if (outcomes.length === 1) {
        if (outcomes[0].name === 'YES') {
            outcomes.push({ name: 'NO', price: 100 - outcomes[0].price });
        } else {
            outcomes.unshift({ name: 'YES', price: 100 - outcomes[0].price });
        }
    }

    return outcomes;
}

/**
 * Extract current price from outcomes
 */
function extractCurrentPrice(outcomes) {
    // Find YES outcome
    const yesOutcome = outcomes.find(o => o.name.toLowerCase() === 'yes');
    if (yesOutcome && yesOutcome.price) {
        return yesOutcome.price;
    }

    // Or use first outcome with price
    const withPrice = outcomes.find(o => o.price !== null);
    if (withPrice) {
        return withPrice.price;
    }

    return null;
}

/**
 * Extract expiry time
 */
function extractExpiry() {
    // Look for date/time patterns
    const timePatterns = [
        /(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
        /(ends?\s+[\w\s,]+)/i,
        /(\d{1,2}\/\d{1,2}\/\d{2,4})/
    ];

    const allText = document.body.innerText;

    for (const pattern of timePatterns) {
        const match = allText.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }

    // Look for specific elements
    const timeSelectors = [
        '[class*="expir"]',
        '[class*="end"]',
        '[class*="time"]',
        'time'
    ];

    for (const selector of timeSelectors) {
        try {
            const el = document.querySelector(selector);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        } catch (e) { }
    }

    return null;
}

/**
 * Extract volume
 */
function extractVolume() {
    const volumePatterns = [
        /\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:Vol|Volume)/i,
        /Volume[:\s]*\$?(\d+(?:,\d{3})*(?:\.\d+)?)/i,
        /(\d+(?:,\d{3})*(?:\.\d+)?)\s*traded/i
    ];

    const allText = document.body.innerText;

    for (const pattern of volumePatterns) {
        const match = allText.match(pattern);
        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        }
    }

    // Look for elements with volume info
    const volumeSelectors = [
        '[class*="volume"]',
        '[class*="traded"]'
    ];

    for (const selector of volumeSelectors) {
        try {
            const el = document.querySelector(selector);
            if (el) {
                const numMatch = el.textContent.match(/\$?([\d,]+)/);
                if (numMatch) {
                    return parseFloat(numMatch[1].replace(/,/g, ''));
                }
            }
        } catch (e) { }
    }

    return null;
}

/**
 * Detect market type
 */
function detectMarketType(title, description) {
    const combinedText = `${title} ${description}`.toLowerCase();

    for (const [type, config] of Object.entries(MARKET_PATTERNS)) {
        for (const pattern of config.patterns) {
            if (pattern.test(combinedText)) {
                return type;
            }
        }

        for (const keyword of config.keywords) {
            if (combinedText.includes(keyword.toLowerCase())) {
                if (type === 'crypto' && !MARKET_PATTERNS.crypto.patterns.some(p => p.test(combinedText))) {
                    continue;
                }
                return type;
            }
        }
    }

    return 'other';
}

/**
 * Extract strike price for crypto markets
 * Bu çok önemli - tahmin doğruluğu buna bağlı!
 */
function extractStrikePrice(title) {
    console.log('🎯 Strike price aranıyor...');

    // Method 1: Sayfadaki "PRICE TO BEAT" veya benzeri
    const allText = document.body.innerText;

    const pagePatterns = [
        /PRICE\s*TO\s*BEAT[:\s]*\$?([\d,]+\.?\d*)/i,
        /TARGET[:\s]*\$?([\d,]+\.?\d*)/i,
        /STRIKE[:\s]*\$?([\d,]+\.?\d*)/i,
        /BEAT[:\s]*\$?([\d,]+\.?\d*)/i
    ];

    for (const pattern of pagePatterns) {
        const match = allText.match(pattern);
        if (match && match[1]) {
            const price = parseFloat(match[1].replace(/,/g, ''));
            if (price > 1000) {
                console.log('✅ Strike price sayfadan bulundu:', price);
                return price;
            }
        }
    }

    // Method 2: Büyük dolar değerleri ara (kripto fiyat aralığında)
    const dollarPattern = /\$\s*([\d,]+\.?\d*)/g;
    const foundPrices = [];
    let match;

    while ((match = dollarPattern.exec(allText)) !== null) {
        const price = parseFloat(match[1].replace(/,/g, ''));
        // BTC için 50k-150k, ETH için 2k-10k aralığında
        if ((price >= 50000 && price <= 150000) || (price >= 2000 && price <= 10000)) {
            foundPrices.push(price);
        }
    }

    // En sık görülen veya ilk bulunan büyük fiyatı al
    if (foundPrices.length > 0) {
        // Frequency count
        const freq = {};
        foundPrices.forEach(p => {
            const rounded = Math.round(p);
            freq[rounded] = (freq[rounded] || 0) + 1;
        });

        // En çok tekrarlanan veya en düşük (genellikle strike)
        const sortedPrices = Object.entries(freq).sort((a, b) => b[1] - a[1] || parseFloat(a[0]) - parseFloat(b[0]));
        if (sortedPrices.length > 0) {
            const strikePrice = parseFloat(sortedPrices[0][0]);
            console.log('✅ Strike price dolar ayrıştırmadan bulundu:', strikePrice);
            return strikePrice;
        }
    }

    // Method 3: Title'dan çıkar (eski mantık)
    const titlePatterns = [
        /\$?([\d,]+\.?\d*)\s*(?:or more|or less|above|below)/i,
        /above\s*\$?([\d,]+\.?\d*)/i,
        /below\s*\$?([\d,]+\.?\d*)/i,
        /\$?([\d,]+\.?\d*)\s*at/i
    ];

    for (const pattern of titlePatterns) {
        const match = title.match(pattern);
        if (match && match[1]) {
            const price = parseFloat(match[1].replace(/,/g, ''));
            if (price > 1000 && price < 1000000) {
                console.log('✅ Strike price title\'dan bulundu:', price);
                return price;
            }
        }
    }

    console.log('⚠️ Strike price bulunamadı');
    return null;
}

// Notify that content script is ready
console.log('🚀 Content script hazır');
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => { });
