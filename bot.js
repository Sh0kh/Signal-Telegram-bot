const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const ti = require('technicalindicators');

// Konfiguratsiya (O'Z MA'LUMOTLARINGIZNI QO'YING)
const BOT_TOKEN = '7914277313:AAHXJcKaKqH8tpPtyFBfu9IxcBpFJSoBKp8';
// const BOT_TOKEN = '7866615330:AAH-J3jHitzvMBjLgbNinjhQKwoj8iN_O24';
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
            active: true // Tahlil faolligi bayrog'i
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
    // 1. Проверка настроек пользователя
    const settings = getUserSettings(chatId);
    if (!settings || !settings.active) {
        await bot.sendMessage(chatId, '⚠️ Sozlamalar topilmadi yoki tahlil oʻchirilgan');
        return;
    }

    // 2. Подготовка времени анализа
    const analysisTime = new Date();
    const timeString = analysisTime.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    try {
        // 3. Получение рыночных данных
        const marketData = await fetchMarketData(settings.symbol, settings.interval);
        if (!marketData || marketData.length < 50) {
            await bot.sendMessage(chatId, `⚠️ Yetarli maʼlumot yoʻq (${marketData?.length || 0} dan 50 ta shamchi)`);
            return;
        }

        // 4. Подготовка данных для анализа
        const last50 = marketData.slice(-50);
        const highs = last50.map(item => parseFloat(item.high)).filter(val => !isNaN(val));
        const lows = last50.map(item => parseFloat(item.low)).filter(val => !isNaN(val));
        const closes = last50.map(item => parseFloat(item.close)).filter(val => !isNaN(val));

        if (highs.length < 14 || lows.length < 14 || closes.length < 14) {
            await bot.sendMessage(chatId, '⚠️ Notoʻgʻri maʼlumotlar - qiymatlar soni yetarli emas');
            return;
        }

        // 5. Определение тренда
        const highestHigh = Math.max(...highs);
        const lowestLow = Math.min(...lows);
        const isUptrend = highs.lastIndexOf(highestHigh) > lows.lastIndexOf(lowestLow);
        const range = highestHigh - lowestLow;

        // 6. Расчет уровней Фибоначчи
        const fibLevels = [
            { level: 0, price: isUptrend ? lowestLow : highestHigh, type: isUptrend ? "Low" : "High" },
            { level: 23.6, price: isUptrend ? lowestLow + range * 0.236 : highestHigh - range * 0.236 },
            { level: 38.2, price: isUptrend ? lowestLow + range * 0.382 : highestHigh - range * 0.382 },
            { level: 50, price: isUptrend ? lowestLow + range * 0.5 : highestHigh - range * 0.5 },
            { level: 61.8, price: isUptrend ? lowestLow + range * 0.618 : highestHigh - range * 0.618 },
            { level: 78.6, price: isUptrend ? lowestLow + range * 0.786 : highestHigh - range * 0.786 },
            { level: 100, price: isUptrend ? highestHigh : lowestLow, type: isUptrend ? "High" : "Low" }
        ];

        // 7. Текущая цена
        const currentPrice = closes[closes.length - 1] || 0;

        // 8. Расчет индикаторов
        let lastRsi = 50;
        let stochK = 50;
        let stochD = 50;
        let macdHistogram = 0;

        try {
            // RSI расчет
            const rsiValues = ti.RSI.calculate({ values: closes, period: 14 });
            lastRsi = rsiValues?.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

            // Stochastic расчет
            const stochPeriod = 14;
            const signalPeriod = 3;
            const kValues = [];

            for (let i = stochPeriod - 1; i < closes.length; i++) {
                const currentClose = closes[i];
                const lowest = Math.min(...lows.slice(i - stochPeriod + 1, i + 1));
                const highest = Math.max(...highs.slice(i - stochPeriod + 1, i + 1));

                const k = highest - lowest !== 0
                    ? ((currentClose - lowest) / (highest - lowest)) * 100
                    : 50;

                kValues.push(k);
            }

            // Расчет сигнальной линии (D)
            if (kValues.length >= signalPeriod) {
                for (let i = signalPeriod - 1; i < kValues.length; i++) {
                    const d = kValues.slice(i - signalPeriod + 1, i + 1)
                        .reduce((sum, val) => sum + val, 0) / signalPeriod;
                    if (i === kValues.length - 1) stochD = d;
                }
            }

            stochK = kValues.length > 0 ? kValues[kValues.length - 1] : 50;

            // MACD расчет
            const macdValues = ti.MACD.calculate({
                values: closes,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9
            });
            if (macdValues && macdValues.length > 0) {
                macdHistogram = macdValues[macdValues.length - 1]?.histogram || 0;
            }
        } catch (indicatorError) {
            console.error('Indikator xatosi:', indicatorError);
        }

        // 9. Ближайшие уровни Фибоначчи
        const activeLevels = fibLevels
            .map(level => ({
                ...level,
                distance: Math.abs(currentPrice - (level.price || 0))
            }))
            .sort((a, b) => (a.distance || 0) - (b.distance || 0))
            .slice(0, 3);

        // 10. Определение сигналов
        let signals = [];
        activeLevels.forEach(level => {
            const distance = level.distance || 0;
            const price = level.price || 0;

            if (distance / (currentPrice || 1) < 0.005) {
                const rsiSignal = isUptrend ?
                    (level.level >= 61.8 ? lastRsi > 70 : lastRsi < 30) :
                    (level.level >= 61.8 ? lastRsi < 30 : lastRsi > 70);

                const stochSignal = isUptrend ?
                    (level.level >= 61.8 ? stochK > 80 : stochK < 20) :
                    (level.level >= 61.8 ? stochK < 20 : stochK > 80);

                const macdSignal = isUptrend ?
                    (level.level >= 61.8 ? macdHistogram < 0 : macdHistogram > 0) :
                    (level.level >= 61.8 ? macdHistogram > 0 : macdHistogram < 0);

                const strength = [rsiSignal, stochSignal, macdSignal].filter(Boolean).length;

                signals.push({
                    level: level.level,
                    price: price,
                    strength: strength === 3 ? "strong" : strength >= 1 ? "medium" : "weak",
                    direction: isUptrend ?
                        (level.level >= 61.8 ? "pastga burilish" : "yuqoriga qaytish") :
                        (level.level >= 61.8 ? "yuqoriga burilish" : "pastga qaytish")
                });
            }
        });

        // 11. Генерация ИИ-объяснения
        const generateAIExplanation = () => {
            let explanation = "🤖 <b>Sun'iy intellekt Tahlili va Tavsiyalar:</b>\n\n";

            // Общее состояние рынка
            explanation += `📊 <b>Umumiy holat:</b>\n`;
            explanation += isUptrend
                ? "- Bozor hozir ko'tarilish trendida. Harakat yuqoriga qarab davom etayotgan.\n"
                : "- Bozor hozir pasayish trendida. Harakat pastga qarab davom etayotgan.\n";

            // Анализ RSI
            explanation += `\n🔍 <b>RSI tahlili (${lastRsi.toFixed(1)}):</b>\n`;
            if (lastRsi >= 70) {
                explanation += "- Bozor haddan tashqari ko‘tarilgan (overbought). Qisqa muddatda tushish ehtimoli bor.\n";
            } else if (lastRsi <= 30) {
                explanation += "- Bozor haddan tashqari pasaygan (oversold). Qisqa muddatda ko'tarilish ehtimoli bor.\n";
            } else if (lastRsi > 50) {
                explanation += "- Bozor ko'tarilish uchun kuchga ega, ammo hali haddan tashqari ko‘tarilmagan.\n";
            } else {
                explanation += "- Bozor pasayish uchun kuchga ega, ammo hali haddan tashqari pasaymagan.\n";
            }

            // Анализ Stochastic
            explanation += `\n📈 <b>Stochastic tahlili (K=${stochK.toFixed(1)}, D=${stochD.toFixed(1)}):</b>\n`;
            if (stochK > 80 || stochD > 80) {
                explanation += "- Ko'rsatkichlar haddan tashqari yuqori. ";
                explanation += isUptrend
                    ? "Trendning tugashi yoki tushish korreksiyasi bo'lishi mumkin.\n"
                    : "Pasayish davom etishi mumkin.\n";
            } else if (stochK < 20 || stochD < 20) {
                explanation += "- Ko'rsatkichlar haddan tashqari past. ";
                explanation += isUptrend
                    ? "Ko'tarilish davom etishi mumkin.\n"
                    : "Trendning tugashi yoki ko'tarilish korreksiyasi bo'lishi mumkin.\n";
            } else {
                explanation += "- Ko'rsatkichlar neytral zonada. Trend davom etishi mumkin.\n";
            }

            // Анализ MACD
            explanation += `\n📉 <b>MACD tahlili (${macdHistogram.toFixed(4)}):</b>\n`;
            if (macdHistogram > 0) {
                explanation += "- Ko'tarilish impulsi kuchaymoqda. ";
                explanation += isUptrend
                    ? "Trendni qo'llab-quvvatlaydi.\n"
                    : "Burilish signali bo'lishi mumkin.\n";
            } else {
                explanation += "- Pasayish impulsi kuchaymoqda. ";
                explanation += isUptrend
                    ? "Burilish signali bo'lishi mumkin.\n"
                    : "Trendni qo'llab-quvvatlaydi.\n";
            }

            // Анализ уровней Фибоначчи
            explanation += `\n🎯 <b>Muhim darajalar:</b>\n`;
            activeLevels.forEach(level => {
                const direction = currentPrice > level.price ? "pastga" : "yuqoriga";
                explanation += `- ${level.level}% (${level.price.toFixed(5)}): ${direction} qarab yaqinlashmoqda\n`;
            });


            // Сигналы для торговли
            if (signals.length > 0) {
                explanation += "\n🚨 <b>Savdo signallari:</b>\n";
                signals.forEach(signal => {
                    explanation += `\n▫️ ${signal.level}% darajada (${signal.price.toFixed(5)})\n`;
                    explanation += `- Yo'nalish: ${signal.direction}\n`;
                    explanation += `- Signal kuchi: ${signal.strength === "strong" ? "Kuchli" : "Oʻrtacha"}\n`;

                    if (signal.strength === "strong") {
                        explanation += `- 💎 <b>Tavsiya:</b> ${signal.direction.includes("pastga") ? "Sotishni ko'rib chiqing" : "Sotib olishni ko'rib chiqing"
                            }\n`;
                    } else {
                        explanation += `- ℹ️ Qo'shimcha tasdiqlash kerak\n`;
                    }
                });
            } else {
                explanation += "\n🔍 Hozircha kuchli savdo signallari yo'q. Bozor barqaror holatda.\n";
            }

            // Итоговая рекомендация
            explanation += "\n💡 <b>Yakuniy qaror:</b>\n";
            const strongSignals = signals.filter(s => s.strength === "strong");

            if (strongSignals.length > 0) {
                const mainSignal = strongSignals[0];
                explanation += `1. ${mainSignal.direction} ehtimoli kuchli\n`;
                explanation += `2. ${mainSignal.level}% darajasi yaqinida ${mainSignal.price.toFixed(5)} muhim\n`;
                explanation += `3. ${isUptrend ? "Sotish" : "Sotib olish"}ni qat'iy ko'rib chiqing\n`;
            } else if (lastRsi > 70 && stochK > 80) {
                explanation += "1. Ko'p indikatorlar bozor haddan tashqari ko‘tarilganligini ko'rsatmoqda\n";
                explanation += "2. Qisqa muddatda sotish imkoniyati bo'lishi mumkin\n";
                explanation += "3. Stop-loss qo'yishni unutmang\n";
            } else if (lastRsi < 30 && stochK < 20) {
                explanation += "1. Ko'p indikatorlar bozor haddan tashqari pasayganligini  ko'rsatmoqda\n";
                explanation += "2. Qisqa muddatda sotib olish imkoniyati bo'lishi mumkin\n";
                explanation += "3. Stop-loss qo'yishni unutmang\n";
            } else {
                explanation += "1. Hozircha aniq harakat yo'q\n";
                explanation += "2. Bozorni kuzatishda davom eting\n";
                explanation += "3. Keyingi signallarni kutib turing\n";
            }

            explanation += "\n⚠️ <i>Fibonachchi darajalarida minimal xavf bilan sinab ko‘rish mumkin, faqat minimal xavf bilan xolos.</i>";

            return explanation;
        };



        // 12. Формирование полного сообщения
        let message = `📅 <b>${timeString}</b> | ${settings.symbol} ${settings.interval}\n\n`;
        message += `💰 <b>Joriy narx:</b> ${currentPrice.toFixed(5)}\n`;
        message += `📌 <b>Trend:</b> ${isUptrend ? "🟢 Koʻtariluvchi" : "🔴 Pasayuvchi"}\n\n`;


        message += `🔷 <b>Fibonachchi darajalari (nusxa olish uchun):</b>\n`;
        fibLevels.forEach(level => {
            const levelName = level.level === 0 ? "0% (Low)" :
                level.level === 100 ? "100% (High)" :
                    `${level.level}%`;
            const price = level.price || 0;
            message += `${levelName}: <code>${price.toFixed(5)}</code>\n`;
        });
        message += `\n`;

        // Добавляем ИИ объяснение
        message += generateAIExplanation();

        // 13. Отправка сообщения
        await bot.sendMessage(chatId, message, { parse_mode: "HTML" });

    } catch (error) {
        console.error('Tahlil xatosi:', error);
        await bot.sendMessage(chatId, `❌ Xato: ${error.message}\nIltimos, qayta urunib koʻring yoki texnik yordamga murojaat qiling.`);
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
            // Разбиваем пары на группы по 3 для лучшего отображения
            const pairGroups = [];
            for (let i = 0; i < availablePairs.length; i += 3) {
                pairGroups.push(availablePairs.slice(i, i + 3).map(pair => ({ text: pair })));
            }

            // Добавляем кнопку "Orqaga" в отдельный ряд
            pairGroups.push([{ text: 'Orqaga' }]);

            bot.sendMessage(chatId, 'Valyuta juftligini tanlang:', {
                reply_markup: {
                    keyboard: pairGroups,
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