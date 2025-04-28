const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const ti = require('technicalindicators');

// Konfiguratsiya
const BOT_TOKEN = '7955550632:AAGrNgJRVbnIWsckCkcyZglo-lxvooWT3Wg';
const API_KEY = 'a9db6b712c1a40299e39d7266af5b2b3';
const CHAT_ID = '5214859281';

// Botni ishga tushirish
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Global o'zgaruvchilar
let marketData = [];
let fibLevels = {};
let supportResistanceLevels = [];
let lastAnalysisTime = 0;

// Foydalanuvchi sozlamalari
const userSettings = {};

function getUserSettings(chatId) {
    if (!userSettings[chatId]) {
        userSettings[chatId] = {
            symbol: 'EUR/USD',
            interval: '15min'
        };
    }
    return userSettings[chatId];
}

// Klaviaturalar
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            ['📊 Bozor tahlili'],
            ['📈 Indikatorlar', '📉 Darajalar'],
            ['⚙️ Sozlamalar']
        ],
        resize_keyboard: true
    }
};

const intervalKeyboard = {
    reply_markup: {
        keyboard: [
            ['5min', '15min', '1h'],
            ['4h', '1day', 'Orqaga']
        ],
        resize_keyboard: true
    }
};

const symbolKeyboard = {
    reply_markup: {
        keyboard: [
            ['EUR/USD', 'GBP/JPY'],
            ['USD/JPY', 'AUD/USD'],
            ['Orqaga']
        ],
        resize_keyboard: true
    }
};

// Asosiy funksiyalar
async function fetchMarketData(symbol = 'EUR/USD', interval = '15min', limit = 100) {
    try {
        const response = await axios.get(`https://api.twelvedata.com/time_series`, {
            params: {
                symbol: symbol,
                interval: interval,
                apikey: API_KEY,
                outputsize: limit,
                format: 'JSON'
            }
        });

        if (!response.data || !response.data.values) {
            throw new Error('Ma\'lumotlar formati noto\'g\'ri');
        }

        marketData = response.data.values.map(item => ({
            time: new Date(item.datetime).getTime(),
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            volume: parseFloat(item.volume || 0)
        })).reverse();

        return marketData;
    } catch (error) {
        sendError(`Ma'lumotlarni olishda xato: ${error.message}`);
        return null;
    }
}

function calculateFibonacciLevels() {
    if (marketData.length < 2) return null;

    // Eng yuqori va eng past nuqtalarni topish (oxirgi 50 ta candle uchun)
    const recentData = marketData.slice(-50);
    const highs = recentData.map(item => item.high);
    const lows = recentData.map(item => item.low);

    let highestHigh = Math.max(...highs);
    let lowestLow = Math.min(...lows);

    // Agar hozirgi narx ekstremumdan uzoqda bo'lsa, so'nggi swinglardan foydalanish
    const currentPrice = marketData[marketData.length - 1].close;
    if (currentPrice < lowestLow || currentPrice > highestHigh) {
        // Swing high va swing low larni topish
        const swingPoints = findSwingPoints(recentData);
        if (swingPoints.highs.length > 0 && swingPoints.lows.length > 0) {
            highestHigh = Math.max(...swingPoints.highs.map(h => h.value));
            lowestLow = Math.min(...swingPoints.lows.map(l => l.value));
        }
    }

    fibLevels = {
        point0: highestHigh,
        point100: lowestLow,
        level236: highestHigh - (highestHigh - lowestLow) * 0.236,
        level382: highestHigh - (highestHigh - lowestLow) * 0.382,
        level500: highestHigh - (highestHigh - lowestLow) * 0.5,
        level618: highestHigh - (highestHigh - lowestLow) * 0.618,
        level786: highestHigh - (highestHigh - lowestLow) * 0.786,
        level1000: lowestLow
    };

    return fibLevels;
}

function findSwingPoints(data, sensitivity = 3) {
    const highs = [];
    const lows = [];

    for (let i = sensitivity; i < data.length - sensitivity; i++) {
        const windowHigh = data.slice(i - sensitivity, i + sensitivity + 1).map(item => item.high);
        const windowLow = data.slice(i - sensitivity, i + sensitivity + 1).map(item => item.low);

        const currentHigh = data[i].high;
        const currentLow = data[i].low;

        if (currentHigh === Math.max(...windowHigh)) {
            highs.push({
                value: currentHigh,
                time: data[i].time
            });
        }

        if (currentLow === Math.min(...windowLow)) {
            lows.push({
                value: currentLow,
                time: data[i].time
            });
        }
    }

    return { highs, lows };
}

function calculateSupportResistance() {
    if (marketData.length < 20) return null;

    supportResistanceLevels = [];
    const sensitivity = 2;

    for (let i = sensitivity; i < marketData.length - sensitivity; i++) {
        const windowHigh = marketData.slice(i - sensitivity, i + sensitivity + 1).map(item => item.high);
        const windowLow = marketData.slice(i - sensitivity, i + sensitivity + 1).map(item => item.low);

        const currentHigh = marketData[i].high;
        const currentLow = marketData[i].low;

        if (currentHigh === Math.max(...windowHigh)) {
            supportResistanceLevels.push({
                value: currentHigh,
                type: 'resistance',
                time: marketData[i].time
            });
        }

        if (currentLow === Math.min(...windowLow)) {
            supportResistanceLevels.push({
                value: currentLow,
                type: 'support',
                time: marketData[i].time
            });
        }
    }

    supportResistanceLevels = supportResistanceLevels
        .filter((level, index, self) =>
            index === self.findIndex(l => Math.abs(l.value - level.value) < level.value * 0.001)
        )
        .sort((a, b) => a.value - b.value);

    return supportResistanceLevels;
}

function calculateIndicators() {
    const closes = marketData.map(item => item.close);
    const highs = marketData.map(item => item.high);
    const lows = marketData.map(item => item.low);

    // RSI
    const rsiInput = {
        values: closes,
        period: 14
    };
    const rsi = ti.RSI.calculate(rsiInput);
    const lastRsi = rsi[rsi.length - 1];

    // MACD
    const macdInput = {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    };
    const macd = ti.MACD.calculate(macdInput);
    const lastMacd = macd[macd.length - 1];

    // Bollinger Bands
    const bbInput = {
        values: closes,
        period: 20,
        stdDev: 2
    };
    const bb = ti.BollingerBands.calculate(bbInput);
    const lastBb = bb[bb.length - 1];

    // Stochastic
    const stochasticInput = {
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
    };
    const stochastic = ti.Stochastic.calculate(stochasticInput);
    const lastStochastic = stochastic[stochastic.length - 1];

    return {
        rsi: {
            value: lastRsi,
            overbought: lastRsi > 70,
            oversold: lastRsi < 30
        },
        macd: {
            MACD: lastMacd.MACD,
            signal: lastMacd.signal,
            histogram: lastMacd.histogram,
            direction: lastMacd.MACD > lastMacd.signal ? 'BUY' : 'SELL'
        },
        bollinger: {
            upper: lastBb.upper,
            middle: lastBb.middle,
            lower: lastBb.lower,
            pricePosition: (marketData[marketData.length - 1].close - lastBb.lower) / (lastBb.upper - lastBb.lower) * 100
        },
        stochastic: {
            k: lastStochastic.k,
            d: lastStochastic.d,
            overbought: lastStochastic.k > 80,
            oversold: lastStochastic.k < 20,
            direction: lastStochastic.k > lastStochastic.d ? 'UP' : 'DOWN'
        }
    };
}

async function sendMarketAnalysis(chatId) {
    try {
        const settings = getUserSettings(chatId);
        await fetchMarketData(settings.symbol, settings.interval);
        calculateFibonacciLevels();
        calculateSupportResistance();
        const indicators = calculateIndicators();

        const lastCandle = marketData[marketData.length - 1];
        const currentPrice = lastCandle.close;

        // Signal tahlili
        let signals = [];
        let confidence = 0;
        let trendDirection = "aniqlanmagan";
        let priceAction = "konsolidatsiya";

        // 1. Trendni aniqlash (MACD va Stochastic bo'yicha)
        if (indicators.macd.direction === 'BUY' && indicators.stochastic.direction === 'UP') {
            trendDirection = "ko'tarilish";
        } else if (indicators.macd.direction === 'SELL' && indicators.stochastic.direction === 'DOWN') {
            trendDirection = "tushish";
        }

        // 2. Fibonachchi darajalari tahlili
        const fibDistances = {};
        let closestFibLevel = null;
        let minFibDistance = Infinity;

        for (const [level, value] of Object.entries(fibLevels)) {
            if (level.includes('level')) {
                const distance = Math.abs(currentPrice - value);
                fibDistances[level] = distance;

                if (distance < minFibDistance) {
                    minFibDistance = distance;
                    closestFibLevel = { level, value };
                }

                // Agar narx Fibonachchi darajasiga yaqin bo'lsa (0.5% ichida)
                if (distance / value < 0.005) {
                    const levelName = level.replace('level', '');
                    signals.push(`🔵 Narx Fibonachchi ${levelName}% darajasiga yetdi (${value.toFixed(4)})`);

                    // Darajaning ahamiyatiga qarab ishonchni oshirish
                    if (levelName === '618' || levelName === '382') {
                        confidence += 25; // Asosiy Fibonachchi darajalari
                    } else {
                        confidence += 15;
                    }
                }
            }
        }

        // 3. Mahalliy qo'llab-quvvatlash/qarshilik darajalari tahlili
        let closestLevel = null;
        let minDistance = Infinity;

        for (const level of supportResistanceLevels) {
            const distance = Math.abs(currentPrice - level.value);

            if (distance < minDistance) {
                minDistance = distance;
                closestLevel = level;
            }

            // Agar narx darajaga yaqin bo'lsa (0.3% ichida)
            if (distance / level.value < 0.003) {
                signals.push(`⚪️ Narx ${level.type === 'support' ? 'qo\'llab-quvvatlash' : 'qarshilik'} darajasida ${level.value.toFixed(4)}`);
                confidence += 10;
            }
        }

        // 4. Darajalar yaqinidagi narx harakatini tahlil qilish
        if (closestFibLevel && closestLevel) {
            const fibDistance = Math.abs(currentPrice - closestFibLevel.value) / closestFibLevel.value;
            const levelDistance = Math.abs(currentPrice - closestLevel.value) / closestLevel.value;

            // Agar narz kuchli darajada bo'lsa va burilish belgilari bo'lsa
            if ((fibDistance < 0.005 || levelDistance < 0.003)) {
                // Oxirgi 3 ta shamni tahlil qilish
                const lastCandles = marketData.slice(-3);
                const isReversalUp = lastCandles.every(c => c.close > c.open);
                const isReversalDown = lastCandles.every(c => c.close < c.open);

                if (isReversalUp && (closestLevel.type === 'support' || currentPrice > closestFibLevel.value)) {
                    signals.push(`🟢 ${closestFibLevel ? 'Fibonachchi darajasidan' : 'darajadan'} yuqoriga burilish mumkin ${closestFibLevel?.value.toFixed(4) || closestLevel.value.toFixed(4)}`);
                    confidence += 20;
                    priceAction = "yuqoriga burilish";
                } else if (isReversalDown && (closestLevel.type === 'resistance' || currentPrice < closestFibLevel.value)) {
                    signals.push(`🔻 ${closestFibLevel ? 'Fibonachchi darajasidan' : 'darajadan'} pastga burilish mumkin ${closestFibLevel?.value.toFixed(4) || closestLevel.value.toFixed(4)}`);
                    confidence -= 20;
                    priceAction = "pastga burilish";
                }
            }
        }

        // 5. Indikatorlarni tahlil qilish
        // RSI
        if (indicators.rsi.overbought) {
            signals.push(`📛 RSI (${indicators.rsi.value.toFixed(2)}) - Ortiqcha sotib olingan`);
            confidence -= 10;
        } else if (indicators.rsi.oversold) {
            signals.push(`📉 RSI (${indicators.rsi.value.toFixed(2)}) - Ortiqcha sotilgan`);
            confidence += 10;
        }

        // MACD
        if (indicators.macd.histogram > 0 && indicators.macd.direction === 'BUY') {
            signals.push(`🟢 MACD - Sotib olish signali`);
            confidence += 15;
        } else if (indicators.macd.histogram < 0 && indicators.macd.direction === 'SELL') {
            signals.push(`🔻 MACD - Sotish signali`);
            confidence -= 15;
        }

        // Bollinger Bands
        if (currentPrice < indicators.bollinger.lower * 1.005) {
            signals.push(`🔼 Narx Bollingerning pastki chegarasida - yuqoriga qaytish mumkin`);
            confidence += 10;
        } else if (currentPrice > indicators.bollinger.upper * 0.995) {
            signals.push(`🔽 Narx Bollingerning yuqori chegarasida - pastga qaytish mumkin`);
            confidence -= 10;
        }

        // Stochastic
        if (indicators.stochastic.oversold && indicators.stochastic.direction === 'UP') {
            signals.push(`🟢 Stochastic - Sotib olish signali`);
            confidence += 10;
        } else if (indicators.stochastic.overbought && indicators.stochastic.direction === 'DOWN') {
            signals.push(`🔻 Stochastic - Sotish signali`);
            confidence -= 10;
        }

        // Fibonachchi darajalariga yaqinlik bo'yicha ishonchni sozlash
        if (closestFibLevel) {
            const distancePercentage = minFibDistance / closestFibLevel.value * 100;
            if (distancePercentage < 0.5) {
                confidence += 30; // Juda yaqin
            } else if (distancePercentage < 1) {
                confidence += 20; // Yaqin
            } else if (distancePercentage < 2) {
                confidence += 10; // Nisbatan yaqin
            }
        }

        // Narx harakatiga qarab ishonchni sozlash
        if (priceAction.includes("burilish")) {
            confidence += 20;
        }

        // Ishondirishni normalizatsiya qilish (0-100%)
        confidence = Math.max(0, Math.min(100, confidence));

        // Xabar tuzish
        let message = `📈 Bozor tahlili (${settings.symbol} ${settings.interval})\n`;
        message += `⏱ ${new Date().toLocaleString()}\n\n`;

        message += `💰 Joriy narx: ${currentPrice.toFixed(4)}\n`;
        message += `📶 Trend: ${trendDirection}\n`;
        message += `🎯 Narx harakati: ${priceAction}\n\n`;

        // Fibonachchi darajalari
        message += `📊 Fibonachchi darajalari:\n`;
        message += `0% (Yuqori): ${fibLevels.point0.toFixed(4)}\n`;
        message += `100% (Past): ${fibLevels.point100.toFixed(4)}\n\n`;

        // Eng yaqin darajalar
        message += `📌 Eng yaqin darajalar:\n`;
        if (closestFibLevel) {
            const distance = ((currentPrice - closestFibLevel.value) / closestFibLevel.value * 100).toFixed(2);
            message += `• Fibo ${closestFibLevel.level.replace('level', '')}%: ${closestFibLevel.value.toFixed(4)} (${distance}%)\n`;
        }
        if (closestLevel) {
            const distance = ((currentPrice - closestLevel.value) / closestLevel.value * 100).toFixed(2);
            message += `• ${closestLevel.type === 'support' ? 'Qo\'llab-quvvatlash' : 'Qarshilik'}: ${closestLevel.value.toFixed(4)} (${distance}%)\n`;
        }
        message += `\n`;

        // Signallar
        message += `🚦 Signallar:\n`;
        if (signals.length > 0) {
            signals.slice(0, 5).forEach(signal => {
                message += `• ${signal}\n`;
            });
        } else {
            message += `• Kuchli signallar yo'q\n`;
        }
        message += `\n`;

        // Tavsiya
        message += `🔍 Yakuniy ishonch: ${confidence.toFixed(0)}%\n`;

        if (confidence > 75) {
            message += `\n💪 SOTIB OLISH UCHUN KUCHLI SIGNAL!\n`;
            message += `🔸 Tavsiya: Keyingi qarshilik darajasiga stop-loss bilan uzun pozitsiya oching\n`;
        } else if (confidence > 60) {
            message += `\n👍 Sotib olish uchun o'rtacha signal\n`;
            message += `🔸 Tavsiya: Aniq stop-loss bilan uzun pozitsiyani ko'rib chiqing\n`;
        } else if (confidence < 25) {
            message += `\n🛑 SOTISH UCHUN KUCHLI SIGNAL!\n`;
            message += `🔸 Tavsiya: Keyingi qo'llab-quvvatlash darajasiga stop-loss bilan qisqa pozitsiya oching\n`;
        } else if (confidence < 40) {
            message += `\n👎 Sotish uchun o'rtacha signal\n`;
            message += `🔸 Tavsiya: Aniq stop-loss bilan qisqa pozitsiyani ko'rib chiqing\n`;
        } else {
            message += `\n🤝 Neytral zona\n`;
            message += `🔸 Tavsiya: Aniqroq signallarni kutish yoki darajalarning buzilishini tasdiqlash\n`;
        }

        // Xabarni yuborish
        await bot.sendMessage(chatId, message, mainKeyboard);
    } catch (error) {
        sendError(`Bozor tahlilida xato: ${error.message}`);
        bot.sendMessage(chatId, `Bozor tahlili paytida xato yuz berdi. Keyinroq urinib ko'ring.`, mainKeyboard);
    }
}

function sendIndicatorsInfo(chatId) {
    const settings = getUserSettings(chatId);
    fetchMarketData(settings.symbol, settings.interval).then(() => {
        const indicators = calculateIndicators();
        const lastCandle = marketData[marketData.length - 1];
        const currentPrice = lastCandle.close;

        let message = `📊 Indikator ko'rsatkichlari (${settings.symbol} ${settings.interval})\n\n`;
        message += `📈 Joriy narx: ${currentPrice.toFixed(2)}\n\n`;

        // RSI
        message += `📉 RSI (14): ${indicators.rsi.value.toFixed(2)}\n`;
        message += `Holati: ${indicators.rsi.overbought ? 'ORTIQCHA SOTIB OLINGAN' : indicators.rsi.oversold ? 'ORTIQCHA SOTILGAN' : 'NEYTRAL'}\n\n`;

        // MACD
        message += `📊 MACD (12/26/9)\n`;
        message += `Gistogramma: ${indicators.macd.histogram.toFixed(4)}\n`;
        message += `Signal: ${indicators.macd.signal}\n\n`;

        // Bollinger Bands
        message += `📈 Bollinger Bands (20,2)\n`;
        message += `Yuqori: ${indicators.bollinger.upper.toFixed(2)}\n`;
        message += `O'rta: ${indicators.bollinger.middle.toFixed(2)}\n`;
        message += `Pastki: ${indicators.bollinger.lower.toFixed(2)}\n`;
        message += `Narxning joylashuvi: ${indicators.bollinger.pricePosition.toFixed(1)}%\n\n`;

        // Stochastic
        message += `📊 Stochastic (14,3)\n`;
        message += `K: ${indicators.stochastic.k.toFixed(2)}\n`;
        message += `D: ${indicators.stochastic.d.toFixed(2)}\n`;
        message += `Holati: ${indicators.stochastic.overbought ? 'ORTIQCHA SOTIB OLINGAN' : indicators.stochastic.oversold ? 'ORTIQCHA SOTILGAN' : 'NEYTRAL'}`;

        bot.sendMessage(chatId, message, mainKeyboard);
    });
}

function sendLevelsInfo(chatId) {
    const settings = getUserSettings(chatId);
    fetchMarketData(settings.symbol, settings.interval).then(() => {
        calculateFibonacciLevels();
        calculateSupportResistance();
        const lastCandle = marketData[marketData.length - 1];
        const currentPrice = lastCandle.close;

        let message = `📊 Bozor darajalari (${settings.symbol} ${settings.interval})\n\n`;
        message += `📈 Joriy narx: ${currentPrice.toFixed(2)}\n\n`;

        // Fibonachchi
        message += `📉 Fibonachchi darajalari:\n`;
        message += `0% (Yuqori): ${fibLevels.point0.toFixed(2)}\n`;
        message += `23.6%: ${fibLevels.level236.toFixed(2)}\n`;
        message += `38.2%: ${fibLevels.level382.toFixed(2)}\n`;
        message += `50.0%: ${fibLevels.level500.toFixed(2)}\n`;
        message += `61.8%: ${fibLevels.level618.toFixed(2)}\n`;
        message += `100% (Past): ${fibLevels.point100.toFixed(2)}\n\n`;

        // Eng yaqin qo'llab-quvvatlash/qarshilik darajalari
        message += `📌 Eng yaqin darajalar:\n`;
        const nearbyLevels = supportResistanceLevels
            .filter(level => Math.abs(level.value - currentPrice) / currentPrice < 0.1)
            .sort((a, b) => Math.abs(a.value - currentPrice) - Math.abs(b.value - currentPrice))
            .slice(0, 4);

        if (nearbyLevels.length > 0) {
            nearbyLevels.forEach(level => {
                const distance = ((level.value - currentPrice) / currentPrice * 100).toFixed(2);
                message += `${level.type === 'support' ? '🔵 Qo\'llab-quvvatlash' : '🔴 Qarshilik'}: ${level.value.toFixed(2)} (${distance}%)\n`;
            });
        } else {
            message += `Yaqin darajalar topilmadi\n`;
        }

        bot.sendMessage(chatId, message, mainKeyboard);
    });
}

function sendError(errorMessage) {
    console.error(`[XATO] ${new Date().toISOString()}: ${errorMessage}`);
    bot.sendMessage(CHAT_ID, `⚠️ Botda xato: ${errorMessage}`)
        .catch(err => console.error(`Xato haqida xabar yuborib bo'lmadi: ${err.message}`));
}

// Komandalarni qayta ishlash
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🔮 Bozor tahlili boti ishga tushdi!\n\nBozor tahlili uchun quyidagi tugmalardan foydalaning.`, mainKeyboard);
});

// Tugmalarni bosishni qayta ishlash
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    switch (text) {
        case '📊 Bozor tahlili':
            sendMarketAnalysis(chatId);
            break;

        case '📈 Indikatorlar':
            sendIndicatorsInfo(chatId);
            break;

        case '📉 Darajalar':
            sendLevelsInfo(chatId);
            break;

        case '⚙️ Sozlamalar':
            bot.sendMessage(chatId, 'Sozlamalarni o\'zgartirish uchun parametrni tanlang:', {
                reply_markup: {
                    keyboard: [
                        ['Juftlikni o\'zgartirish', 'Vaqt oralig\'ini o\'zgartirish'],
                        ['Orqaga']
                    ],
                    resize_keyboard: true
                }
            });
            break;

        case 'Juftlikni o\'zgartirish':
            bot.sendMessage(chatId, 'Valyuta juftligini tanlang:', symbolKeyboard);
            break;

        case 'Vaqt oralig\'ini o\'zgartirish':
            bot.sendMessage(chatId, 'Vaqt oralig\'ini tanlang:', intervalKeyboard);
            break;

        case '5min':
        case '15min':
        case '1h':
        case '4h':
        case '1day':
            // Tanlangan vaqt oralig'ini saqlash
            getUserSettings(chatId).interval = text;
            bot.sendMessage(chatId, `Vaqt oralig'i ${text} ga o'zgartirildi. Yangi tahlillar ushbu intervaldan foydalanadi.`, mainKeyboard);
            break;

        case 'EUR/USD':
        case 'GBP/JPY':
        case 'USD/JPY':
        case 'AUD/USD':
            // Tanlangan juftlikni saqlash
            getUserSettings(chatId).symbol = text;
            bot.sendMessage(chatId, `Valyuta juftligi ${text} ga o'zgartirildi. Yangi tahlillar ushbu juftlikdan foydalanadi.`, mainKeyboard);
            break;

        case 'Orqaga':
            bot.sendMessage(chatId, 'Asosiy menyu', mainKeyboard);
            break;
    }
});

console.log('Bot ishga tushdi...');