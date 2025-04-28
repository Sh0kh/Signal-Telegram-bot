const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const ti = require('technicalindicators');

// Конфигурация
const BOT_TOKEN = '7955550632:AAGrNgJRVbnIWsckCkcyZglo-lxvooWT3Wg';
const API_KEY = 'a9db6b712c1a40299e39d7266af5b2b3';
const CHAT_ID = '5214859281';
const TWELVEDATA_API_BASE = 'https://api.twelvedata.com';

// Инициализация бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Глобальные переменные
let marketData = [];
let fibLevels = {};
let supportResistanceLevels = [];
let lastAnalysisTime = 0;

// Настройки пользователей
const userSettings = {};

// Настройки языка
const LANGUAGES = {
    ru: {
        marketAnalysis: '📊 Анализ рынка Forex ({symbol} {interval}) - {date}',
        currentPrice: 'Текущая цена: {price}',
        fibonacciLevels: '📊 Уровни Фибоначчи:',
        reversePoint: '0% (точка разворота): {value}',
        fib236: '23.6%: {value}',
        fib382: '38.2%: {value}',
        fib500: '50%: {value}',
        fib618: '61.8%: {value}',
        fib786: '78.6%: {value}',
        endPoint: '100% (конечная точка): {value}',
        nearbyLevels: '📌 Ближайшие локальные уровни:',
        support: 'Поддержка',
        resistance: 'Сопротивление',
        noLevels: 'Нет близких локальных уровней',
        signals: '🚦 Сигналы:',
        noSignals: 'Нет сильных сигналов для входа',
        finalConfidence: '🎯 Итоговая уверенность: {confidence}%',
        strongBuy: '💪 СИЛЬНЫЙ СИГНАЛ НА ПОКУПКУ!',
        moderateBuy: '👍 Умеренный сигнал на покупку',
        strongSell: '🛑 СИЛЬНЫЙ СИГНАЛ НА ПРОДАЖУ!',
        moderateSell: '👎 Умеренный сигнал на продажу',
        neutral: '🤝 Нейтральная зона - лучше подождать',
        priceNearFib: 'Цена находится у уровня Фибоначчи {level}% ({value})',
        priceNearLevel: 'Цена находится у {type} {value}',
        rsiOverbought: 'RSI ({value}) - ПЕРЕКУПЛЕННОСТЬ',
        rsiOversold: 'RSI ({value}) - ПЕРЕПРОДАНОСТЬ',
        macdBuy: 'MACD - Сигнал на ПОКУПКУ',
        macdSell: 'MACD - Сигнал на ПРОДАЖУ',
        priceLowerBB: 'Цена у нижней границы Боллинджера - возможен отскок вверх',
        priceUpperBB: 'Цена у верхней границы Боллинджера - возможен отскок вниз',
        stochBuy: 'Stochastic - Сигнал на ПОКУПКУ',
        stochSell: 'Stochastic - Сигнал на ПРОДАЖУ',
        priceMovementUp: '⤴️ Цена движется ВВЕРХ к уровню {level}',
        priceMovementDown: '⤵️ Цена движется ВНИЗ к уровню {level}',
        marketSituation: '👁️ Текущая ситуация: {situation}'
    },
    uz: {
        marketAnalysis: '📊 Forex bozorini tahlil qilish ({symbol} {interval}) - {date}',
        currentPrice: 'Joriy narx: {price}',
        fibonacciLevels: '📊 Fibonacci darajalari:',
        reversePoint: '0% (qaytish nuqtasi): {value}',
        fib236: '23.6%: {value}',
        fib382: '38.2%: {value}',
        fib500: '50%: {value}',
        fib618: '61.8%: {value}',
        fib786: '78.6%: {value}',
        endPoint: '100% (oxirgi nuqta): {value}',
        nearbyLevels: '📌 Yaqin mahalliy darajalar:',
        support: 'Qo\'llab-quvvatlash',
        resistance: 'Qarshilik',
        noLevels: 'Yaqin mahalliy darajalar yo\'q',
        signals: '🚦 Signallar:',
        noSignals: 'Kirish uchun kuchli signallar yo\'q',
        finalConfidence: '🎯 Yakuniy ishonch: {confidence}%',
        strongBuy: '💪 SOTIB OLISH UCHUN KUCHLI SIGNAL!',
        moderateBuy: '👍 Sotib olish uchun o\'rtacha signal',
        strongSell: '🛑 SOTISH UCHUN KUCHLI SIGNAL!',
        moderateSell: '👎 Sotish uchun o\'rtacha signal',
        neutral: '🤝 Neytral zona - kutish yaxshiroq',
        priceNearFib: 'Narx Fibonacci darajasi {level}% ({value}) yaqinida',
        priceNearLevel: 'Narx {type} {value} yaqinida',
        rsiOverbought: 'RSI ({value}) - HADDAN TASHQARI SOTIB OLINGAN',
        rsiOversold: 'RSI ({value}) - HADDAN TASHQARI SOTILGAN',
        macdBuy: 'MACD - SOTIB OLISH signali',
        macdSell: 'MACD - SOTISH signali',
        priceLowerBB: 'Narx Bollinger pasttarafi chegarasida - yuqoriga sakrash mumkin',
        priceUpperBB: 'Narx Bollinger yuqoritarafi chegarasida - pastga sakrash mumkin',
        stochBuy: 'Stochastic - SOTIB OLISH signali',
        stochSell: 'Stochastic - SOTISH signali',
        priceMovementUp: '⤴️ Narx {level} darajasiga YUQORIGA harakat qilmoqda',
        priceMovementDown: '⤵️ Narx {level} darajasiga PASTGA harakat qilmoqda',
        marketSituation: '👁️ Joriy vaziyat: {situation}'
    }
};

// Функция для получения или создания настроек пользователя
function getUserSettings(chatId) {
    if (!userSettings[chatId]) {
        userSettings[chatId] = {
            symbol: 'EUR/USD', // Валютная пара по умолчанию
            interval: '15min',  // Интервал по умолчанию
            language: 'ru'      // Язык по умолчанию
        };
    }
    return userSettings[chatId];
}

// Получение текста на нужном языке
function getText(key, settings, replacements = {}) {
    const lang = LANGUAGES[settings.language] || LANGUAGES.ru;
    let text = lang[key] || LANGUAGES.ru[key];
    
    // Замена плейсхолдеров
    for (const [placeholder, value] of Object.entries(replacements)) {
        text = text.replace(`{${placeholder}}`, value);
    }
    
    return text;
}

// Клавиатуры
const getMainKeyboard = (language) => {
    const keyboards = {
        ru: {
            reply_markup: {
                keyboard: [
                    ['📊 Анализ рынка'],
                    ['📈 Индикаторы', '📉 Уровни'],
                    ['⚙️ Настройки']
                ],
                resize_keyboard: true
            }
        },
        uz: {
            reply_markup: {
                keyboard: [
                    ['📊 Bozor tahlili'],
                    ['📈 Indikatorlar', '📉 Darajalar'],
                    ['⚙️ Sozlamalar']
                ],
                resize_keyboard: true
            }
        }
    };
    
    return keyboards[language] || keyboards.ru;
};

const getIntervalKeyboard = (language) => {
    const keyboards = {
        ru: {
            reply_markup: {
                keyboard: [
                    ['5min', '15min', '1h'],
                    ['4h', '1day', 'Назад']
                ],
                resize_keyboard: true
            }
        },
        uz: {
            reply_markup: {
                keyboard: [
                    ['5min', '15min', '1h'],
                    ['4h', '1day', 'Orqaga']
                ],
                resize_keyboard: true
            }
        }
    };
    
    return keyboards[language] || keyboards.ru;
};

const getSymbolKeyboard = (language) => {
    const keyboards = {
        ru: {
            reply_markup: {
                keyboard: [
                    ['EUR/USD', 'GBP/USD'],
                    ['USD/JPY', 'GBP/JPY'],
                    ['AUD/USD', 'USD/CAD'],
                    ['Назад']
                ],
                resize_keyboard: true
            }
        },
        uz: {
            reply_markup: {
                keyboard: [
                    ['EUR/USD', 'GBP/USD'],
                    ['USD/JPY', 'GBP/JPY'],
                    ['AUD/USD', 'USD/CAD'],
                    ['Orqaga']
                ],
                resize_keyboard: true
            }
        }
    };
    
    return keyboards[language] || keyboards.ru;
};

const getLanguageKeyboard = () => {
    return {
        reply_markup: {
            keyboard: [
                ['Русский', 'O\'zbekcha'],
                ['Назад / Orqaga']
            ],
            resize_keyboard: true
        }
    };
};

const getSettingsKeyboard = (language) => {
    const keyboards = {
        ru: {
            reply_markup: {
                keyboard: [
                    ['Изменить пару', 'Изменить таймфрейм'],
                    ['Изменить язык', 'Назад']
                ],
                resize_keyboard: true
            }
        },
        uz: {
            reply_markup: {
                keyboard: [
                    ['Juftlikni o\'zgartirish', 'Vaqt oralig\'ini o\'zgartirish'],
                    ['Tilni o\'zgartirish', 'Orqaga']
                ],
                resize_keyboard: true
            }
        }
    };
    
    return keyboards[language] || keyboards.ru;
};

// Функция для получения данных с TwelveData API
async function fetchMarketData(symbol = 'EUR/USD', interval = '15min', limit = 100) {
    try {
        const response = await axios.get(`${TWELVEDATA_API_BASE}/time_series`, {
            params: {
                symbol: symbol,
                interval: interval,
                outputsize: limit,
                apikey: API_KEY
            }
        });

        if (!response.data || !response.data.values) {
            throw new Error('Неверный ответ от API');
        }

        // TwelveData возвращает данные в обратном порядке (сначала новые)
        const values = response.data.values.reverse();

        marketData = values.map(item => ({
            time: new Date(item.datetime).getTime(),
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            volume: parseFloat(item.volume || 0)
        }));

        return marketData;
    } catch (error) {
        sendError(`Ошибка при получении данных: ${error.message}`);
        return null;
    }
}

function calculateFibonacciLevels() {
    if (marketData.length < 2) return null;

    // Находим максимальный и минимальный уровень за период
    const highs = marketData.map(item => item.high);
    const lows = marketData.map(item => item.low);
    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);

    // Точки Фибоначчи
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

function calculateSupportResistance() {
    if (marketData.length < 20) return null;

    supportResistanceLevels = [];
    const sensitivity = 2;

    // Алгоритм обнаружения локальных экстремумов
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

    // Объединяем близкие уровни
    const groupedLevels = [];
    for (const level of supportResistanceLevels) {
        const similarLevel = groupedLevels.find(gl => 
            Math.abs(gl.value - level.value) / level.value < 0.0005); // 0.05% разница
        
        if (similarLevel) {
            // Обновляем существующий уровень
            similarLevel.count = (similarLevel.count || 1) + 1;
            similarLevel.strength = (similarLevel.count || 1);
        } else {
            // Добавляем новый уровень
            level.count = 1;
            level.strength = 1;
            groupedLevels.push(level);
        }
    }
    
    // Сортируем по значению
    supportResistanceLevels = groupedLevels.sort((a, b) => a.value - b.value);

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

    // Тренды (определение с помощью EMA)
    const emaShortInput = {
        values: closes,
        period: 9
    };
    const emaShort = ti.EMA.calculate(emaShortInput);
    
    const emaLongInput = {
        values: closes,
        period: 21
    };
    const emaLong = ti.EMA.calculate(emaLongInput);
    
    const lastEmaShort = emaShort[emaShort.length - 1];
    const lastEmaLong = emaLong[emaLong.length - 1];
    
    const trend = lastEmaShort > lastEmaLong ? 'UP' : 'DOWN';

    return {
        rsi: {
            value: lastRsi,
            overbought: lastRsi > 70,
            oversold: lastRsi < 30
        },
        macd: {
            value: lastMacd,
            histogram: lastMacd.histogram,
            signal: lastMacd.signal > lastMacd.MACD ? 'BUY' : 'SELL'
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
            oversold: lastStochastic.k < 20
        },
        trend: trend
    };
}

// Определить текущее направление движения рынка
function determineMarketDirection(currentPrice) {
    if (marketData.length < 5) return null;
    
    // Используем последние несколько свечей для определения направления
    const recentCandles = marketData.slice(-5);
    const priceChanges = [];
    
    for (let i = 1; i < recentCandles.length; i++) {
        priceChanges.push(recentCandles[i].close - recentCandles[i-1].close);
    }
    
    // Находим среднее изменение
    const avgChange = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
    
    return {
        direction: avgChange > 0 ? 'UP' : 'DOWN',
        strength: Math.abs(avgChange) / currentPrice * 10000 // Нормализованная сила
    };
}

// Найти ближайший уровень Фибоначчи в направлении движения
function findNextFibLevel(currentPrice, direction) {
    const levels = [
        { name: 'level1000', value: fibLevels.point100 },
        { name: 'level786', value: fibLevels.level786 },
        { name: 'level618', value: fibLevels.level618 },
        { name: 'level500', value: fibLevels.level500 },
        { name: 'level382', value: fibLevels.level382 },
        { name: 'level236', value: fibLevels.level236 },
        { name: 'level0', value: fibLevels.point0 }
    ];
    
    levels.sort((a, b) => a.value - b.value);
    
    if (direction === 'UP') {
        // Ищем ближайший уровень выше текущей цены
        for (const level of levels) {
            if (level.value > currentPrice) {
                return {
                    name: level.name.replace('level', ''),
                    value: level.value
                };
            }
        }
    } else {
        // Ищем ближайший уровень ниже текущей цены
        for (let i = levels.length - 1; i >= 0; i--) {
            if (levels[i].value < currentPrice) {
                return {
                    name: levels[i].name.replace('level', ''),
                    value: levels[i].value
                };
            }
        }
    }
    
    return null;
}

// Проверка близости к уровню Фибоначчи со строгими критериями
function checkFibonacciProximity(currentPrice) {
    const fibProximity = [];
    const threshold = 0.0015; // 0.15% от цены для считания "близко"
    
    // Проверяем только ключевые уровни Фибоначчи
    const keyLevels = [
        { name: '0', value: fibLevels.point0 },
        { name: '236', value: fibLevels.level236 },
        { name: '382', value: fibLevels.level382 },
        { name: '500', value: fibLevels.level500 },
        { name: '618', value: fibLevels.level618 },
        { name: '786', value: fibLevels.level786 },
        { name: '1000', value: fibLevels.point100 }
    ];
    
    for (const level of keyLevels) {
        const distance = Math.abs(currentPrice - level.value) / currentPrice;
        
        if (distance < threshold) {
            fibProximity.push({
                level: level.name,
                value: level.value,
                distance: distance
            });
        }
    }
    
    // Сортируем по близости и берем только самый близкий уровень
    fibProximity.sort((a, b) => a.distance - b.distance);
    
    return fibProximity.slice(0, 1);
}

async function sendMarketAnalysis(chatId) {
    try {
        const settings = getUserSettings(chatId);
        await fetchMarketData(settings.symbol, settings.interval);

        if (!marketData || marketData.length === 0) {
            const errorMsg = settings.language === 'uz' ? 
                `${settings.symbol} uchun ma'lumotlar olinmadi. Sozlamalarni tekshiring yoki keyinroq qayta urinib ko'ring.` :
                `Не удалось получить данные для ${settings.symbol}. Проверьте настройки или попробуйте позже.`;
            
            bot.sendMessage(chatId, errorMsg, getMainKeyboard(settings.language));
            return;
        }

        calculateFibonacciLevels();
        calculateSupportResistance();
        const indicators = calculateIndicators();

        const lastCandle = marketData[marketData.length - 1];
        const currentPrice = lastCandle.close;

        // Определяем движение рынка
        const marketDirection = determineMarketDirection(currentPrice);
        const nextFibLevel = marketDirection ? findNextFibLevel(currentPrice, marketDirection.direction) : null;

        // Проверка близости к уровням Фибоначчи (более строгая)
        const nearbyFibLevels = checkFibonacciProximity(currentPrice);

        // Анализ сигналов с улучшенной логикой
        let signals = [];
        let confidence = 50; // Стартуем с нейтрального уровня

        // 1. Проверка уровней Фибоначчи
        if (nearbyFibLevels.length > 0) {
            for (const fib of nearbyFibLevels) {
                signals.push(getText('priceNearFib', settings, {
                    level: fib.level,
                    value: fib.value.toFixed(4)
                }));
                confidence += 5; // Меньше влияния отдельного уровня
            }
        }

        // 2. Проверка локальных уровней поддержки/сопротивления
        const nearLevels = supportResistanceLevels
            .filter(level => Math.abs(currentPrice - level.value) / level.value < 0.0015) // 0.15%
            .sort((a, b) => Math.abs(a.value - currentPrice) - Math.abs(b.value - currentPrice))
            .slice(0, 2); // Только 2 ближайших уровня максимум

        for (const level of nearLevels) {
            const levelType = level.type === 'support' ? 
                getText('support', settings) : 
                getText('resistance', settings);
            
            signals.push(getText('priceNearLevel', settings, {
                type: levelType,
                value: level.value.toFixed(4)
            }));
            
            // Добавляем влияние в зависимости от типа уровня и направления движения
            if (marketDirection) {
                if (level.type === 'support' && marketDirection.direction === 'DOWN') {
                    confidence += 8 * (level.strength || 1); // Поддержка важнее при движении вниз
                } else if (level.type === 'resistance' && marketDirection.direction === 'UP') {
                    confidence -= 8 * (level.strength || 1); // Сопротивление важнее при движении вверх
                }
            }
        }

        // 3. Анализ индикаторов
        // RSI
        if (indicators.rsi.overbought) {
            signals.push(getText('rsiOverbought', settings, {
                value: indicators.rsi.value.toFixed(2)
            }));
            confidence -= 15;
        } else if (indicators.rsi.oversold) {
            signals.push(getText('rsiOversold', settings, {
                value: indicators.rsi.value.toFixed(2)
            }));
            confidence += 15;
        }

        // MACD
        if (indicators.macd.histogram > 0 && indicators.macd.signal === 'BUY') {
            signals.push(getText('macdBuy', settings));
            confidence += 15;
        } else if (indicators.macd.histogram < 0 && indicators.macd.signal === 'SELL') {
            signals.push(getText('macdSell', settings));
            confidence -= 15;
        }

        // Bollinger Bands
        if (currentPrice < indicators.bollinger.lower * 1.01) {
            signals.push(getText('priceLowerBB', settings));
            confidence += 10;
        } else if (currentPrice > indicators.bollinger.upper * 0.99) {
            signals.push(getText('priceUpperBB', settings));
            confidence -= 10;
        }

        // Stochastic
        if (indicators.stochastic.oversold && indicators.stochastic.k > indicators.stochastic.d) {
            signals.push(getText('stochBuy', settings));
            confidence += 10;
        } else if (indicators.stochastic.overbought && indicators.stochastic.k < indicators.stochastic.d) {
            signals.push(getText('stochSell', settings));
            confidence -= 10;
        }

      // 4. Информация о движении
      if (marketDirection && nextFibLevel) {
        if (marketDirection.direction === 'UP') {
            signals.push(getText('priceMovementUp', settings, {
                level: nextFibLevel.value.toFixed(4)
            }));
            confidence += 10; // Движение вверх позитивно для покупки
        } else {
            signals.push(getText('priceMovementDown', settings, {
                level: nextFibLevel.value.toFixed(4)
            }));
            confidence -= 10; // Движение вниз позитивно для продажи
        }
    }

    // Нормализация уверенности: теперь это более разумные значения от 0 до 100
    confidence = Math.max(0, Math.min(100, confidence));

    // Определяем текущую ситуацию на рынке для простого объяснения
    let marketSituation;
    if (confidence > 70) {
        marketSituation = settings.language === 'uz' ? 
            'Ko\'rsatkichlar narxning o\'sishini ko\'rsatmoqda' : 
            'Индикаторы показывают рост цены';
    } else if (confidence < 30) {
        marketSituation = settings.language === 'uz' ? 
            'Ko\'rsatkichlar narxning pasayishini ko\'rsatmoqda' : 
            'Индикаторы показывают падение цены';
    } else if (confidence >= 50) {
        marketSituation = settings.language === 'uz' ? 
            'Ko\'rsatkichlar narxning sekin o\'sishi mumkinligini ko\'rsatmoqda' : 
            'Индикаторы показывают возможный слабый рост цены';
    } else {
        marketSituation = settings.language === 'uz' ? 
            'Ko\'rsatkichlar narxning sekin pasayishi mumkinligini ko\'rsatmoqda' : 
            'Индикаторы показывают возможное слабое падение цены';
    }

    // Добавляем ситуацию на рынке к сигналам
    signals.push(getText('marketSituation', settings, {
        situation: marketSituation
    }));

    // Формирование сообщения
    let message = getText('marketAnalysis', settings, {
        symbol: settings.symbol,
        interval: settings.interval,
        date: new Date().toLocaleString()
    }) + '\n\n';
    
    message += getText('currentPrice', settings, {
        price: currentPrice.toFixed(4)
    }) + '\n\n';

    // Уровни Фибоначчи (показываем только ключевые)
    message += getText('fibonacciLevels', settings) + '\n';
    message += getText('reversePoint', settings, {value: fibLevels.point0.toFixed(4)}) + '\n';
    message += getText('fib236', settings, {value: fibLevels.level236.toFixed(4)}) + '\n';
    message += getText('fib382', settings, {value: fibLevels.level382.toFixed(4)}) + '\n';
    message += getText('fib500', settings, {value: fibLevels.level500.toFixed(4)}) + '\n';
    message += getText('fib618', settings, {value: fibLevels.level618.toFixed(4)}) + '\n';
    message += getText('fib786', settings, {value: fibLevels.level786.toFixed(4)}) + '\n';
    message += getText('endPoint', settings, {value: fibLevels.point100.toFixed(4)}) + '\n\n';

    // Локальные уровни (только ближайшие)
    message += getText('nearbyLevels', settings) + '\n';
    const nearbyLevels = supportResistanceLevels
        .filter(level => Math.abs(level.value - currentPrice) / currentPrice < 0.05)
        .sort((a, b) => Math.abs(a.value - currentPrice) - Math.abs(b.value - currentPrice))
        .slice(0, 3); // Только 3 ближайших уровня

    if (nearbyLevels.length > 0) {
        nearbyLevels.forEach(level => {
            const typeName = level.type === 'support' ? 
                getText('support', settings) : 
                getText('resistance', settings);
                
            message += `${typeName}: ${level.value.toFixed(4)} (${new Date(level.time).toLocaleTimeString()})\n`;
        });
    } else {
        message += getText('noLevels', settings) + '\n';
    }
    message += '\n';

    // Сигналы (с ограничением количества для удобства чтения)
    message += getText('signals', settings) + '\n';
    if (signals.length > 0) {
        // Берем не более 5 сигналов для лучшей читаемости
        signals.slice(0, 5).forEach(signal => {
            message += `• ${signal}\n`;
        });
    } else {
        message += getText('noSignals', settings) + '\n';
    }
    message += '\n';

    // Итоговая рекомендация
    message += getText('finalConfidence', settings, {
        confidence: confidence.toFixed(0)
    }) + '\n';
    
    if (confidence > 70) {
        message += getText('strongBuy', settings) + '\n';
    } else if (confidence > 60) {
        message += getText('moderateBuy', settings) + '\n';
    } else if (confidence < 30) {
        message += getText('strongSell', settings) + '\n';
    } else if (confidence < 40) {
        message += getText('moderateSell', settings) + '\n';
    } else {
        message += getText('neutral', settings) + '\n';
    }

    // Отправка сообщения
    await bot.sendMessage(chatId, message, getMainKeyboard(settings.language));
    
    // Сохраняем время последнего анализа
    lastAnalysisTime = Date.now();
} catch (error) {
    sendError(`Ошибка при анализе рынка: ${error.message}`);
    const errorMsg = settings && settings.language === 'uz' ? 
        'Bozorni tahlil qilishda xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.' :
        'Произошла ошибка при анализе рынка. Попробуйте позже.';
    
    bot.sendMessage(chatId, errorMsg, getMainKeyboard(settings ? settings.language : 'ru'));
}
}

function sendIndicatorsInfo(chatId) {
const settings = getUserSettings(chatId);
fetchMarketData(settings.symbol, settings.interval).then((data) => {
    if (!data || data.length === 0) {
        const errorMsg = settings.language === 'uz' ? 
            `${settings.symbol} uchun ma'lumotlar olinmadi. Sozlamalarni tekshiring yoki keyinroq qayta urinib ko'ring.` :
            `Не удалось получить данные для ${settings.symbol}. Проверьте настройки или попробуйте позже.`;
        
        bot.sendMessage(chatId, errorMsg, getMainKeyboard(settings.language));
        return;
    }

    const indicators = calculateIndicators();
    const lastCandle = marketData[marketData.length - 1];
    const currentPrice = lastCandle.close;

    // Заголовки на нужном языке
    const title = settings.language === 'uz' ? 
        `📊 Indikatorlar ko'rsatkichlari (${settings.symbol} ${settings.interval})` :
        `📊 Показатели индикаторов (${settings.symbol} ${settings.interval})`;
        
    const priceLabel = settings.language === 'uz' ? 
        `📈 Joriy narx: ${currentPrice.toFixed(4)}` :
        `📈 Текущая цена: ${currentPrice.toFixed(4)}`;
        
    // RSI
    const rsiState = settings.language === 'uz' ? 
        (indicators.rsi.overbought ? 'HADDAN TASHQARI SOTIB OLINGAN' : 
         indicators.rsi.oversold ? 'HADDAN TASHQARI SOTILGAN' : 'NEYTRAL') :
        (indicators.rsi.overbought ? 'ПЕРЕКУПЛЕННОСТЬ' : 
         indicators.rsi.oversold ? 'ПЕРЕПРОДАНОСТЬ' : 'НЕЙТРАЛЬНО');
    
    const rsiLabel = settings.language === 'uz' ? 
        `📉 RSI (14): ${indicators.rsi.value.toFixed(2)}` :
        `📉 RSI (14): ${indicators.rsi.value.toFixed(2)}`;
        
    const rsiStateLabel = settings.language === 'uz' ? 
        `Holat: ${rsiState}` :
        `Состояние: ${rsiState}`;
        
    // MACD
    const macdSignal = settings.language === 'uz' ? 
        (indicators.macd.signal === 'BUY' ? 'SOTIB OLISH' : 'SOTISH') :
        (indicators.macd.signal === 'BUY' ? 'ПОКУПКА' : 'ПРОДАЖА');
        
    const macdLabel = settings.language === 'uz' ? 
        `📊 MACD (12/26/9)` :
        `📊 MACD (12/26/9)`;
        
    const macdHistogramLabel = settings.language === 'uz' ? 
        `Gistogramma: ${indicators.macd.histogram.toFixed(4)}` :
        `Гистограмма: ${indicators.macd.histogram.toFixed(4)}`;
        
    const macdSignalLabel = settings.language === 'uz' ? 
        `Signal: ${macdSignal}` :
        `Сигнал: ${macdSignal}`;
        
    // Bollinger Bands
    const bbLabel = settings.language === 'uz' ? 
        `📈 Bollinger Bands (20,2)` :
        `📈 Bollinger Bands (20,2)`;
        
    const bbUpperLabel = settings.language === 'uz' ? 
        `Yuqori: ${indicators.bollinger.upper.toFixed(4)}` :
        `Верхняя: ${indicators.bollinger.upper.toFixed(4)}`;
        
    const bbMiddleLabel = settings.language === 'uz' ? 
        `O'rta: ${indicators.bollinger.middle.toFixed(4)}` :
        `Средняя: ${indicators.bollinger.middle.toFixed(4)}`;
        
    const bbLowerLabel = settings.language === 'uz' ? 
        `Quyi: ${indicators.bollinger.lower.toFixed(4)}` :
        `Нижняя: ${indicators.bollinger.lower.toFixed(4)}`;
        
    const bbPositionLabel = settings.language === 'uz' ? 
        `Narx pozitsiyasi: ${indicators.bollinger.pricePosition.toFixed(1)}%` :
        `Позиция цены: ${indicators.bollinger.pricePosition.toFixed(1)}%`;
        
    // Stochastic
    const stochasticState = settings.language === 'uz' ? 
        (indicators.stochastic.overbought ? 'HADDAN TASHQARI SOTIB OLINGAN' : 
         indicators.stochastic.oversold ? 'HADDAN TASHQARI SOTILGAN' : 'NEYTRAL') :
        (indicators.stochastic.overbought ? 'ПЕРЕКУПЛЕННОСТЬ' : 
         indicators.stochastic.oversold ? 'ПЕРЕПРОДАНОСТЬ' : 'НЕЙТРАЛЬНО');
         
    const stochasticLabel = settings.language === 'uz' ? 
        `📊 Stochastic (14,3)` :
        `📊 Stochastic (14,3)`;
        
    const stochasticKLabel = settings.language === 'uz' ? 
        `K: ${indicators.stochastic.k.toFixed(2)}` :
        `K: ${indicators.stochastic.k.toFixed(2)}`;
        
    const stochasticDLabel = settings.language === 'uz' ? 
        `D: ${indicators.stochastic.d.toFixed(2)}` :
        `D: ${indicators.stochastic.d.toFixed(2)}`;
        
    const stochasticStateLabel = settings.language === 'uz' ? 
        `Holat: ${stochasticState}` :
        `Состояние: ${stochasticState}`;

    // Строим сообщение
    let message = `${title}\n\n${priceLabel}\n\n`;
    message += `${rsiLabel}\n${rsiStateLabel}\n\n`;
    message += `${macdLabel}\n${macdHistogramLabel}\n${macdSignalLabel}\n\n`;
    message += `${bbLabel}\n${bbUpperLabel}\n${bbMiddleLabel}\n${bbLowerLabel}\n${bbPositionLabel}\n\n`;
    message += `${stochasticLabel}\n${stochasticKLabel}\n${stochasticDLabel}\n${stochasticStateLabel}`;

    bot.sendMessage(chatId, message, getMainKeyboard(settings.language));
});
}

function sendLevelsInfo(chatId) {
const settings = getUserSettings(chatId);
fetchMarketData(settings.symbol, settings.interval).then((data) => {
    if (!data || data.length === 0) {
        const errorMsg = settings.language === 'uz' ? 
            `${settings.symbol} uchun ma'lumotlar olinmadi. Sozlamalarni tekshiring yoki keyinroq qayta urinib ko'ring.` :
            `Не удалось получить данные для ${settings.symbol}. Проверьте настройки или попробуйте позже.`;
        
        bot.sendMessage(chatId, errorMsg, getMainKeyboard(settings.language));
        return;
    }

    calculateFibonacciLevels();
    calculateSupportResistance();
    const lastCandle = marketData[marketData.length - 1];
    const currentPrice = lastCandle.close;

    // Заголовки на нужном языке
    const title = settings.language === 'uz' ? 
        `📊 Bozor darajalari (${settings.symbol} ${settings.interval})` :
        `📊 Уровни рынка (${settings.symbol} ${settings.interval})`;
        
    const priceLabel = settings.language === 'uz' ? 
        `📈 Joriy narx: ${currentPrice.toFixed(4)}` :
        `📈 Текущая цена: ${currentPrice.toFixed(4)}`;
        
    // Фибоначчи
    const fibTitle = settings.language === 'uz' ? 
        `📉 Fibonacci darajalari:` :
        `📉 Уровни Фибоначчи:`;
        
    // Ближайшие уровни
    const nearLevelsTitle = settings.language === 'uz' ? 
        `📌 Yaqin darajalar:` :
        `📌 Ближайшие уровни:`;
        
    const noLevelsMsg = settings.language === 'uz' ? 
        `Yaqin ahamiyatli darajalar yo'q` :
        `Нет близких значимых уровней`;

    // Строим сообщение
    let message = `${title}\n\n${priceLabel}\n\n`;
    
    // Фибоначчи
    message += `${fibTitle}\n`;
    message += `23.6%: ${fibLevels.level236.toFixed(4)}\n`;
    message += `38.2%: ${fibLevels.level382.toFixed(4)}\n`;
    message += `50.0%: ${fibLevels.level500.toFixed(4)}\n`;
    message += `61.8%: ${fibLevels.level618.toFixed(4)}\n\n`;

    // Ближайшие уровни поддержки/сопротивления
    message += `${nearLevelsTitle}\n`;
    const nearbyLevels = supportResistanceLevels
        .filter(level => Math.abs(level.value - currentPrice) / currentPrice < 0.05)
        .sort((a, b) => Math.abs(a.value - currentPrice) - Math.abs(b.value - currentPrice))
        .slice(0, 4);

    if (nearbyLevels.length > 0) {
        nearbyLevels.forEach(level => {
            const distance = ((level.value - currentPrice) / currentPrice * 100).toFixed(2);
            const levelType = level.type === 'support' ? 
                (settings.language === 'uz' ? '🔵 Qo\'llab-quvvatlash' : '🔵 Поддержка') : 
                (settings.language === 'uz' ? '🔴 Qarshilik' : '🔴 Сопротивление');
                
            message += `${levelType}: ${level.value.toFixed(4)} (${distance}%)\n`;
        });
    } else {
        message += `${noLevelsMsg}\n`;
    }

    bot.sendMessage(chatId, message, getMainKeyboard(settings.language));
});
}

// Обработка ошибок
function sendError(errorMessage) {
console.error(`[ERROR] ${new Date().toISOString()}: ${errorMessage}`);
bot.sendMessage(CHAT_ID, `⚠️ Ошибка в работе бота: ${errorMessage}`)
    .catch(err => console.error(`Не удалось отправить сообщение об ошибке: ${err.message}`));
}

// Обработчики команд
bot.onText(/\/start/, (msg) => {
const chatId = msg.chat.id;

const welcomeMessage = {
    ru: '🔮 Forex Аналитический Бот запущен!\n\nИспользуйте кнопки ниже для анализа валютных пар.',
    uz: '🔮 Forex Analitik Bot ishga tushirildi!\n\nValyuta juftliklarini tahlil qilish uchun quyidagi tugmalardan foydalaning.'
};

const settings = getUserSettings(chatId);
bot.sendMessage(chatId, welcomeMessage[settings.language] || welcomeMessage.ru, getMainKeyboard(settings.language));
});

// Обработка нажатий кнопок
bot.on('message', (msg) => {
const chatId = msg.chat.id;
const text = msg.text;
const settings = getUserSettings(chatId);

if (!text) return;

// Русскоязычные команды
if (text === '📊 Анализ рынка' || text === '📊 Bozor tahlili') {
    sendMarketAnalysis(chatId);
}
else if (text === '📈 Индикаторы' || text === '📈 Indikatorlar') {
    sendIndicatorsInfo(chatId);
}
else if (text === '📉 Уровни' || text === '📉 Darajalar') {
    sendLevelsInfo(chatId);
}
else if (text === '⚙️ Настройки' || text === '⚙️ Sozlamalar') {
    bot.sendMessage(
        chatId, 
        settings.language === 'uz' ? 'Sozlash uchun parametrni tanlang:' : 'Выберите параметр для настройки:', 
        getSettingsKeyboard(settings.language)
    );
}
else if (text === 'Изменить пару' || text === 'Juftlikni o\'zgartirish') {
    bot.sendMessage(
        chatId, 
        settings.language === 'uz' ? 'Valyuta juftligini tanlang:' : 'Выберите валютную пару:', 
        getSymbolKeyboard(settings.language)
    );
}
else if (text === 'Изменить таймфрейм' || text === 'Vaqt oralig\'ini o\'zgartirish') {
    bot.sendMessage(
        chatId, 
        settings.language === 'uz' ? 'Vaqt oralig\'ini tanlang:' : 'Выберите таймфрейм:', 
        getIntervalKeyboard(settings.language)
    );
}
else if (text === 'Изменить язык' || text === 'Tilni o\'zgartirish') {
    bot.sendMessage(
        chatId, 
        'Выберите язык / Tilni tanlang:', 
        getLanguageKeyboard()
    );
}
else if (text === '5min' || text === '15min' || text === '1h' || text === '4h' || text === '1day') {
    // Сохраняем выбранный таймфрейм
    getUserSettings(chatId).interval = text;
    const confirmMsg = settings.language === 'uz' ? 
        `Vaqt oralig'i ${text} ga o'zgartirildi. Yangi tahlillar ushbu intervalni ishlatadi.` :
        `Таймфрейм изменен на ${text}. Новые анализы будут использовать этот интервал.`;
        
    bot.sendMessage(chatId, confirmMsg, getMainKeyboard(settings.language));
}
else if (
    text === 'EUR/USD' || 
    text === 'GBP/USD' || 
    text === 'USD/JPY' || 
    text === 'GBP/JPY' || 
    text === 'AUD/USD' || 
    text === 'USD/CAD'
) {
    // Сохраняем выбранную пару
    getUserSettings(chatId).symbol = text;
    const confirmMsg = settings.language === 'uz' ? 
        `Valyuta jufti ${text} ga o'zgartirildi. Yangi tahlillar ushbu juftni ishlatadi.` :
        `Валютная пара изменена на ${text}. Новые анализы будут использовать эту пару.`;
        
    bot.sendMessage(chatId, confirmMsg, getMainKeyboard(settings.language));
}
else if (text === 'Русский') {
    // Меняем язык на русский
    getUserSettings(chatId).language = 'ru';
    bot.sendMessage(chatId, 'Язык изменен на русский', getMainKeyboard('ru'));
}
else if (text === 'O\'zbekcha') {
    // Меняем язык на узбекский
    getUserSettings(chatId).language = 'uz';
    bot.sendMessage(chatId, 'Til o\'zbekchaga o\'zgartirildi', getMainKeyboard('uz'));
}
else if (text === 'Назад' || text === 'Orqaga' || text === 'Назад / Orqaga') {
    bot.sendMessage(
        chatId, 
        settings.language === 'uz' ? 'Asosiy menyu' : 'Главное меню', 
        getMainKeyboard(settings.language)
    );
}
});

// Планировщик анализа
setInterval(() => {
analyzeMarket();
}, 15 * 60 * 1000); // Каждые 15 минут

// Автоматический анализ
function analyzeMarket() {
if (Date.now() - lastAnalysisTime < 15 * 60 * 1000) return;
lastAnalysisTime = Date.now();

// Для автоматического анализа используем настройки по умолчанию для основного чата
const settings = getUserSettings(CHAT_ID);

fetchMarketData(settings.symbol, settings.interval)
    .then((data) => {
        if (!data || data.length === 0) {
            sendError(`Не удалось получить данные для автоматического анализа (${settings.symbol})`);
            return;
        }

        calculateFibonacciLevels();
        calculateSupportResistance();

        sendMarketAnalysis(CHAT_ID);
    })
    .catch(error => sendError(`Ошибка автоматического анализа: ${error.message}`));
}

console.log('Forex Аналитический Бот запущен...');