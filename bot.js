const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const ti = require('technicalindicators');

// Konfiguratsiya (O'Z MA'LUMOTLARINGIZNI QO'YING)
const BOT_TOKEN = '7955550632:AAGrNgJRVbnIWsckCkcyZglo-lxvooWT3Wg';
const API_KEY = 'a9db6b712c1a40299e39d7266af5b2b3';

// Botni ishga tushirish
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Foydalanuvchi sozlamalari
const userSettings = {};

function getUserSettings(chatId) {
    if (!userSettings[chatId]) {
        userSettings[chatId] = {
            symbol: 'EUR/USD',
            interval: '15min',
            active: false // Tahlil faolligi bayrog'i
        };
    }
    return userSettings[chatId];
}

// Mavjud juftliklar va vaqt oraliklari
const availablePairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'GBP/JPY', 'EUR/JPY', 'CHF/JPY', 'CAD/JPY', 'GBP/CAD', 'EUR/GBP', 'ADU/JPY', 'USD/CAD', 'EUR/CHF', 'USD/CHF', 'BTC/USD'];
const availableIntervals = ['5min', '15min', '1h', '4h', '1day'];

// Asosiy funksiyalar
async function fetchMarketData(symbol, interval) {
    try {
        const response = await axios.get(`https://api.twelvedata.com/time_series`, {
            params: {
                symbol: symbol,
                interval: interval,
                apikey: API_KEY,
                outputsize: 100,
                format: 'JSON'
            }
        });

        if (!response.data || !response.data.values) {
            throw new Error('Noto‘g‘ri maʼlumot formati');
        }

        return response.data.values.map(item => ({
            time: new Date(item.datetime).getTime(),
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close)
        })).reverse();
    } catch (error) {
        console.error('Maʼlumotlarni olishda xato:', error.message);
        return null;
    }
}

async function analyzeMarket(chatId) {
    const settings = getUserSettings(chatId);
    if (!settings.active) return;

    const analysisTime = new Date();
    const timeString = analysisTime.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    try {
        const marketData = await fetchMarketData(settings.symbol, settings.interval);
        if (!marketData || marketData.length < 50) {
            bot.sendMessage(chatId, `⚠️ Yetarli maʼlumot yoʻq (${marketData?.length || 0} dan 50 ta shamchi)`);
            return;
        }

        // Trend va ekstremumlarni aniqlash
        const last50 = marketData.slice(-50);
        const highs = last50.map(item => item.high);
        const lows = last50.map(item => item.low);

        const highestHigh = Math.max(...highs);
        const lowestLow = Math.min(...lows);
        const isUptrend = highs.lastIndexOf(highestHigh) > lows.lastIndexOf(lowestLow);
        const range = highestHigh - lowestLow;

        // Barcha Fibonachchi darajalari
        const fibLevels = [
            { level: 0, price: isUptrend ? lowestLow : highestHigh, type: isUptrend ? "Low" : "High" },
            { level: 23.6, price: isUptrend ? lowestLow + range * 0.236 : highestHigh - range * 0.236 },
            { level: 38.2, price: isUptrend ? lowestLow + range * 0.382 : highestHigh - range * 0.382 },
            { level: 50, price: isUptrend ? lowestLow + range * 0.5 : highestHigh - range * 0.5 },
            { level: 61.8, price: isUptrend ? lowestLow + range * 0.618 : highestHigh - range * 0.618 },
            { level: 78.6, price: isUptrend ? lowestLow + range * 0.786 : highestHigh - range * 0.786 },
            { level: 100, price: isUptrend ? highestHigh : lowestLow, type: isUptrend ? "High" : "Low" }
        ];

        // Joriy maʼlumotlar
        const currentPrice = marketData[marketData.length - 1].close;
        const closes = marketData.map(item => item.close);
        const rsi = ti.RSI.calculate({ values: closes, period: 14 }).slice(-3);
        const macd = ti.MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9
        }).slice(-3);

        // Xabar shakllantirish
        let message = `📅 ${timeString} | ${settings.symbol} ${settings.interval}\n`;
        message += `📌 Trend: ${isUptrend ? "🟢 Koʻtariluvchi" : "🔴 Pasayuvchi"}\n\n`;

        // Asosiy darajalar (nusxa olish uchun)
        message += `🔷 Fibonachchi darajalari:\n`;
        fibLevels.forEach(level => {
            const levelName = level.level === 0 || level.level === 100 ?
                `${level.level}% (${level.type})` : `${level.level}%`;
            message += `${levelName}: <code>${level.price.toFixed(5)}</code>\n`;
        });
        message += `\n💰 Joriy narx: ${currentPrice.toFixed(5)}\n\n`;

        // Faol darajalarni topish (eng yaqin 3 tasi)
        const activeLevels = fibLevels
            .map(level => ({
                ...level,
                distance: Math.abs(currentPrice - level.price)
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3);

        message += `🎯 Eng yaqin darajalar:\n`;
        activeLevels.forEach(level => {
            const direction = currentPrice > level.price ? "↓" : "↑";
            message += `${level.level}%: ${level.price.toFixed(5)} ${direction} (${level.distance.toFixed(5)})\n`;
        });
        message += `\n`;

        // Har bir faol darajani tahlil qilish
        let signals = [];
        activeLevels.forEach(level => {
            if (level.distance / level.price < 0.005) {
                const rsiCondition = isUptrend ?
                    (level.level >= 61.8 ? rsi.some(v => v > 70) : rsi.some(v => v < 30)) :
                    (level.level >= 61.8 ? rsi.some(v => v < 30) : rsi.some(v => v > 70));

                const macdCondition = isUptrend ?
                    (level.level >= 61.8 ? macd[2].histogram < macd[1].histogram : macd[2].histogram > macd[1].histogram) :
                    (level.level >= 61.8 ? macd[2].histogram > macd[1].histogram : macd[2].histogram < macd[1].histogram);

                signals.push({
                    level: level.level,
                    price: level.price,
                    strength: rsiCondition && macdCondition ? "strong" :
                        rsiCondition || macdCondition ? "medium" : "weak",
                    direction: isUptrend ?
                        (level.level >= 61.8 ? "pastga burilish" : "yuqoriga qaytish") :
                        (level.level >= 61.8 ? "yuqoriga burilish" : "pastga qaytish")
                });
            }
        });

        // Signallarni shakllantirish
        if (signals.length > 0) {
            message += `🚨 Signallar:\n`;
            signals.forEach(signal => {
                message += `\n▫️ Daraja ${signal.level}% (${signal.price.toFixed(5)})\n`;
                message += `- Potentsial: ${signal.direction}\n`;
                message += `- Kuch: ${signal.strength === "strong" ? "Kuchli" : signal.strength === "medium" ? "Oʻrtacha" : "Zaif"}\n`;
                message += `- Harakat: ${signal.strength === "strong" ?
                    (isUptrend ? "SELLni koʻrib chiqing" : "BUYni koʻrib chiqing") :
                    "Kuzatish"}`;
            });
        } else {
            message += `🔍 Aniq signallar yoʻq. Narx darajalar oraligʻida.\n`;
        }

        // Yakuniy prognoz
        message += `\n🎯 YAKUNIY PROGNOZ:\n`;
        if (signals.some(s => s.strength === "strong")) {
            const strongSignal = signals.find(s => s.strength === "strong");
            message += `💎 Asosiy stsenariy: ${strongSignal.direction} ${strongSignal.level}% da\n`;
            message += `📌 Tavsiya: ${isUptrend ? "Sotish" : "Sotib olish"} tasdiqlangan holda`;
        } else if (signals.length > 0) {
            message += `📊 Mumkin ${signals[0].direction} ${signals[0].level}% da\n`;
            message += `📌 Indikatorlardan tasdiqni kutamiz`;
        } else {
            const nearestLevel = activeLevels[0];
            message += `📈 Narx ${nearestLevel.level}% darajasiga (${nearestLevel.price.toFixed(5)}) harakat qilmoqda\n`;
            message += `📌 ${currentPrice > nearestLevel.price ? "sotish" : "sotib olish"} uchun tayyorlaning`;
        }

        // Xabarni yuborish
        bot.sendMessage(chatId, message, { parse_mode: "HTML" });

    } catch (error) {
        console.error('Tahlil xatosi:', error);
        bot.sendMessage(chatId, `❌ Xato: ${error.message}`);
    }
}

// Klaviaturalar
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            ['📊 Tanlangan juftlikni tahlil qilish'],
            ['⚙️ Sozlamalar'],
            ['ℹ️ Yordam']
        ],
        resize_keyboard: true
    }
};

const settingsKeyboard = {
    reply_markup: {
        keyboard: [
            ['Valyuta juftligini tanlash', 'Vaqt oraligʻini tanlash'],
            ['Tahlilni yoqish/oʻchirish', 'Orqaga']
        ],
        resize_keyboard: true
    }
};

// Buyruqlarni qayta ishlash
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `📊 Fibonachchi bozor tahlili boti\n\nJuftlikni tanlang va tahlilni boshlang:`, mainKeyboard);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const settings = getUserSettings(chatId);

    if (!text) return;

    try {
        if (text === '📊 Tanlangan juftlikni tahlil qilish') {
            if (!settings.active) {
                bot.sendMessage(chatId, 'Avval sozlamalarda tahlilni yoqing');
                return;
            }
            bot.sendMessage(chatId, `${settings.symbol} juftligini ${settings.interval} oraligʻida tahlil qilish boshlandi...`);
            await analyzeMarket(chatId);
        }
        else if (text === '⚙️ Sozlamalar') {
            let status = settings.active ? '✅ YOQILGAN' : '❌ OʻCHIRILGAN';
            bot.sendMessage(chatId, `Joriy sozlamalar:\n\nJuftlik: ${settings.symbol}\nVaqt oraligʻi: ${settings.interval}\nTahlil: ${status}`, settingsKeyboard);
        }
        else if (text === 'Valyuta juftligini tanlash') {
            const pairButtons = availablePairs.map(pair => ({ text: pair }));
            bot.sendMessage(chatId, 'Valyuta juftligini tanlang:', {
                reply_markup: {
                    keyboard: [
                        pairButtons,
                        [{ text: 'Orqaga' }]
                    ],
                    resize_keyboard: true
                }
            });
        }
        else if (text === 'Vaqt oraligʻini tanlash') {
            const intervalButtons = availableIntervals.map(interval => ({ text: interval }));
            bot.sendMessage(chatId, 'Vaqt oraligʻini tanlang:', {
                reply_markup: {
                    keyboard: [
                        intervalButtons,
                        [{ text: 'Orqaga' }]
                    ],
                    resize_keyboard: true
                }
            });
        }
        else if (text === 'Tahlilni yoqish/oʻchirish') {
            settings.active = !settings.active;
            bot.sendMessage(chatId, `${settings.symbol} uchun tahlil ${settings.active ? 'yoqildi' : 'oʻchirildi'}`, settingsKeyboard);
        }
        else if (availablePairs.includes(text)) {
            settings.symbol = text;
            bot.sendMessage(chatId, `Valyuta juftligi oʻzgartirildi: ${text}`, settingsKeyboard);
        }
        else if (availableIntervals.includes(text)) {
            settings.interval = text;
            bot.sendMessage(chatId, `Vaqt oraligʻi oʻzgartirildi: ${text}`, settingsKeyboard);
        }
        else if (text === 'Orqaga') {
            bot.sendMessage(chatId, 'Asosiy menyu', mainKeyboard);
        }
        else if (text === 'ℹ️ Yordam') {
            bot.sendMessage(chatId, `📚 Yordam:\n\n1. Sozlamalarda valyuta juftligi va vaqt oraligʻini tanlang\n2. Tahlilni yoqing\n3. "Tanlangan juftlikni tahlil qilish" tugmasidan foydalaning\n4. Bot faqat tanlangan juftlik uchun signallarni qidiradi`, mainKeyboard);
        }
    } catch (error) {
        console.error('Xabarni qayta ishlash xatosi:', error);
        bot.sendMessage(chatId, 'Xato yuz berdi, qayta urinib koʻring', mainKeyboard);
    }
});

console.log('Bot ishga tushirildi va ishga tayyor...');