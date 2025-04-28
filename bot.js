const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const ti = require('technicalindicators');

// Конфигурация
const BOT_TOKEN = '7955550632:AAGrNgJRVbnIWsckCkcyZglo-lxvooWT3Wg';
const FINNHUB_API_KEY = 'd07jdu1r01qrslhonoe0d07jdu1r01qrslhonoeg';
const CHAT_ID = '5214859281';

// Инициализация бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Глобальные переменные
let marketData = [];
let fibLevels = {};
let supportResistanceLevels = [];
let lastAnalysisTime = 0;

// Настройки пользователей - добавляем хранилище для пользовательских настроек
const userSettings = {};

// Функция для получения или создания настроек пользователя
function getUserSettings(chatId) {
    if (!userSettings[chatId]) {
        userSettings[chatId] = {
            symbol: 'EUR/USD',
            interval: '15',  // в минутах для Finnhub
            resolution: '15' // для Finnhub (D - день, W - неделя, M - месяц, или минуты: 1, 5, 15, 30, 60...)
        };
    }
    return userSettings[chatId];
}

// Функция преобразования интервала для отображения пользователю
function formatInterval(interval) {
    switch(interval) {
        case '15': return '15m';
        case '60': return '1h';
        case '240': return '4h';
        case 'D': return '1d';
        default: return interval;
    }
}

// Клавиатуры
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            ['📊 Анализ рынка'],
            ['📈 Индикаторы', '📉 Уровни'],
            ['⚙️ Настройки']
        ],
        resize_keyboard: true
    }
};

const intervalKeyboard = {
    reply_markup: {
        keyboard: [
            ['15m', '1h', '4h'],
            ['1d', 'Назад']
        ],
        resize_keyboard: true
    }
};

const symbolKeyboard = {
    reply_markup: {
        keyboard: [
            ['EUR/USD', 'GBP/USD'],
            ['USD/JPY', 'GBP/JPY'],
            ['USD/CHF', 'AUD/USD'],
            ['Назад']
        ],
        resize_keyboard: true
    }
};

// Функция преобразования интервала в формат, понятный Finnhub
function mapIntervalToResolution(interval) {
    switch(interval) {
        case '15m': return '15';
        case '1h': return '60';
        case '4h': return '240';
        case '1d': return 'D';
        default: return '15';
    }
}

// Основные функции
async function fetchMarketData(symbol = 'EUR/USD', interval = '15', limit = 100) {
    try {
        // Форматируем символ для Finnhub (замена слеша)
        const formattedSymbol = symbol.replace('/', '');
        
        // Получаем временные метки для запроса
        const to = Math.floor(Date.now() / 1000);
        const from = to - (limit * parseInt(interval) * 60); // для минутных интервалов
        
        const response = await axios.get('https://finnhub.io/api/v1/forex/candle', {
            params: {
                symbol: `OANDA:${formattedSymbol}`,
                resolution: interval,
                from: from,
                to: to,
                token: FINNHUB_API_KEY
            }
        });
        
        if (response.data.s === 'no_data') {
            throw new Error('Нет данных для этого символа/интервала');
        }
        
        marketData = [];
        for (let i = 0; i < response.data.t.length; i++) {
            marketData.push({
                time: response.data.t[i] * 1000, // convert to milliseconds
                open: response.data.o[i],
                high: response.data.h[i],
                low: response.data.l[i],
                close: response.data.c[i],
                volume: response.data.v ? response.data.v[i] : 0 // объем может отсутствовать для Forex
            });
        }

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

    supportResistanceLevels = supportResistanceLevels
        .filter((level, index, self) =>
            index === self.findIndex(l => Math.abs(l.value - level.value) < level.value * 0.0001)
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
        }
    };
}

async function sendMarketAnalysis(chatId) {
    try {
        const settings = getUserSettings(chatId);
        const formattedInterval = formatInterval(settings.resolution);
        
        await fetchMarketData(settings.symbol, settings.resolution);
        calculateFibonacciLevels();
        calculateSupportResistance();
        const indicators = calculateIndicators();

        const lastCandle = marketData[marketData.length - 1];
        const currentPrice = lastCandle.close;

        // Анализ сигналов
        let signals = [];
        let confidence = 0;

        // 1. Проверка уровней Фибоначчи
        const fibDistances = {};
        for (const [level, value] of Object.entries(fibLevels)) {
            if (level.includes('level')) {
                const distance = Math.abs(currentPrice - value) / value * 100;
                fibDistances[level] = distance;

                if (distance < 0.5) { // Цена близко к уровню Фибоначчи
                    signals.push(`Цена находится у уровня Фибоначчи ${level.replace('level', '')}% (${value.toFixed(5)})`);
                    confidence += 15;
                }
            }
        }

        // 2. Проверка локальных уровней поддержки/сопротивления
        for (const level of supportResistanceLevels) {
            const distance = Math.abs(currentPrice - level.value) / level.value * 100;

            if (distance < 0.3) { // Цена близко к локальному уровню
                signals.push(`Цена находится у ${level.type === 'support' ? 'поддержки' : 'сопротивления'} ${level.value.toFixed(5)}`);
                confidence += 15;
            }
        }

        // 3. Анализ индикаторов
        // RSI
        if (indicators.rsi.overbought) {
            signals.push(`RSI (${indicators.rsi.value.toFixed(2)}) - ПЕРЕКУПЛЕННОСТЬ`);
            confidence -= 10;
        } else if (indicators.rsi.oversold) {
            signals.push(`RSI (${indicators.rsi.value.toFixed(2)}) - ПЕРЕПРОДАНОСТЬ`);
            confidence += 10;
        }

        // MACD
        if (indicators.macd.histogram > 0 && indicators.macd.signal === 'BUY') {
            signals.push(`MACD - Сигнал на ПОКУПКУ`);
            confidence += 20;
        } else if (indicators.macd.histogram < 0 && indicators.macd.signal === 'SELL') {
            signals.push(`MACD - Сигнал на ПРОДАЖУ`);
            confidence -= 20;
        }

        // Bollinger Bands
        if (currentPrice < indicators.bollinger.lower * 1.01) {
            signals.push(`Цена у нижней границы Боллинджера - возможен отскок`);
            confidence += 15;
        } else if (currentPrice > indicators.bollinger.upper * 0.99) {
            signals.push(`Цена у верхней границы Боллинджера - возможен отскок вниз`);
            confidence -= 15;
        }

        // Stochastic
        if (indicators.stochastic.oversold && indicators.stochastic.k > indicators.stochastic.d) {
            signals.push(`Stochastic - Сигнал на ПОКУПКУ`);
            confidence += 10;
        } else if (indicators.stochastic.overbought && indicators.stochastic.k < indicators.stochastic.d) {
            signals.push(`Stochastic - Сигнал на ПРОДАЖУ`);
            confidence -= 10;
        }

        // Нормализация уверенности
        confidence = Math.max(0, Math.min(100, confidence + 50));

        // Формирование сообщения
        let message = `📈 Анализ рынка (${settings.symbol} ${formattedInterval}) - ${new Date().toLocaleString()}\n\n`;
        message += `Текущая цена: ${currentPrice.toFixed(5)}\n\n`;

        // Уровни Фибоначчи
        message += `📊 Уровни Фибоначчи:\n`;
        message += `0% (точка разворота): ${fibLevels.point0.toFixed(5)}\n`;
        message += `23.6%: ${fibLevels.level236.toFixed(5)}\n`;
        message += `38.2%: ${fibLevels.level382.toFixed(5)}\n`;
        message += `50%: ${fibLevels.level500.toFixed(5)}\n`;
        message += `61.8%: ${fibLevels.level618.toFixed(5)}\n`;
        message += `78.6%: ${fibLevels.level786.toFixed(5)}\n`;
        message += `100% (конечная точка): ${fibLevels.point100.toFixed(5)}\n\n`;

        // Локальные уровни
        message += `📌 Ближайшие локальные уровни:\n`;
        const nearbyLevels = supportResistanceLevels
            .filter(level => Math.abs(level.value - currentPrice) / currentPrice < 0.01)
            .sort((a, b) => Math.abs(a.value - currentPrice) - Math.abs(b.value - currentPrice))
            .slice(0, 5);

        if (nearbyLevels.length > 0) {
            nearbyLevels.forEach(level => {
                message += `${level.type === 'support' ? 'Поддержка' : 'Сопротивление'}: ${level.value.toFixed(5)} (${new Date(level.time).toLocaleTimeString()})\n`;
            });
        } else {
            message += `Нет близких локальных уровней\n`;
        }
        message += `\n`;

        // Сигналы
        message += `🚦 Сигналы:\n`;
        if (signals.length > 0) {
            signals.forEach(signal => {
                message += `• ${signal}\n`;
            });
        } else {
            message += `Нет сильных сигналов для входа\n`;
        }
        message += `\n`;

        // Итоговая рекомендация
        message += `🎯 Итоговая уверенность: ${confidence.toFixed(0)}%\n`;
        if (confidence > 70) {
            message += `💪 СИЛЬНЫЙ СИГНАЛ НА ПОКУПКУ!\n`;
        } else if (confidence > 60) {
            message += `👍 Умеренный сигнал на покупку\n`;
        } else if (confidence < 30) {
            message += `🛑 СИЛЬНЫЙ СИГНАЛ НА ПРОДАЖУ!\n`;
        } else if (confidence < 40) {
            message += `👎 Умеренный сигнал на продажу\n`;
        } else {
            message += `🤝 Нейтральная зона - лучше подождать\n`;
        }

        // Отправка сообщения
        await bot.sendMessage(chatId, message, mainKeyboard);
    } catch (error) {
        sendError(`Ошибка при анализе рынка: ${error.message}`);
        bot.sendMessage(chatId, `Произошла ошибка при анализе рынка. Попробуйте позже.`, mainKeyboard);
    }
}

function sendIndicatorsInfo(chatId) {
    const settings = getUserSettings(chatId);
    const formattedInterval = formatInterval(settings.resolution);
    
    fetchMarketData(settings.symbol, settings.resolution).then(() => {
        const indicators = calculateIndicators();
        const lastCandle = marketData[marketData.length - 1];
        const currentPrice = lastCandle.close;

        let message = `📊 Показатели индикаторов (${settings.symbol} ${formattedInterval})\n\n`;
        message += `📈 Текущая цена: ${currentPrice.toFixed(5)}\n\n`;

        // RSI
        message += `📉 RSI (14): ${indicators.rsi.value.toFixed(2)}\n`;
        message += `Состояние: ${indicators.rsi.overbought ? 'ПЕРЕКУПЛЕННОСТЬ' : indicators.rsi.oversold ? 'ПЕРЕПРОДАНОСТЬ' : 'НЕЙТРАЛЬНО'}\n\n`;

        // MACD
        message += `📊 MACD (12/26/9)\n`;
        message += `Гистограмма: ${indicators.macd.histogram.toFixed(6)}\n`;
        message += `Сигнал: ${indicators.macd.signal}\n\n`;

        // Bollinger Bands
        message += `📈 Bollinger Bands (20,2)\n`;
        message += `Верхняя: ${indicators.bollinger.upper.toFixed(5)}\n`;
        message += `Средняя: ${indicators.bollinger.middle.toFixed(5)}\n`;
        message += `Нижняя: ${indicators.bollinger.lower.toFixed(5)}\n`;
        message += `Позиция цены: ${indicators.bollinger.pricePosition.toFixed(1)}%\n\n`;

        // Stochastic
        message += `📊 Stochastic (14,3)\n`;
        message += `K: ${indicators.stochastic.k.toFixed(2)}\n`;
        message += `D: ${indicators.stochastic.d.toFixed(2)}\n`;
        message += `Состояние: ${indicators.stochastic.overbought ? 'ПЕРЕКУПЛЕННОСТЬ' : indicators.stochastic.oversold ? 'ПЕРЕПРОДАНОСТЬ' : 'НЕЙТРАЛЬНО'}`;

        bot.sendMessage(chatId, message, mainKeyboard);
    });
}

function sendLevelsInfo(chatId) {
    const settings = getUserSettings(chatId);
    const formattedInterval = formatInterval(settings.resolution);

    fetchMarketData(settings.symbol, settings.resolution).then(() => {
        calculateFibonacciLevels();
        calculateSupportResistance();
        const lastCandle = marketData[marketData.length - 1];
        const currentPrice = lastCandle.close;

        let message = `📊 Уровни рынка (${settings.symbol} ${formattedInterval})\n\n`;
        message += `📈 Текущая цена: ${currentPrice.toFixed(5)}\n\n`;

        // Фибоначчи
        message += `📉 Уровни Фибоначчи:\n`;
        message += `23.6%: ${fibLevels.level236.toFixed(5)}\n`;
        message += `38.2%: ${fibLevels.level382.toFixed(5)}\n`;
        message += `50.0%: ${fibLevels.level500.toFixed(5)}\n`;
        message += `61.8%: ${fibLevels.level618.toFixed(5)}\n\n`;

        // Ближайшие уровни поддержки/сопротивления
        message += `📌 Ближайшие уровни:\n`;
        const nearbyLevels = supportResistanceLevels
            .filter(level => Math.abs(level.value - currentPrice) / currentPrice < 0.01)
            .sort((a, b) => Math.abs(a.value - currentPrice) - Math.abs(b.value - currentPrice))
            .slice(0, 4);

        if (nearbyLevels.length > 0) {
            nearbyLevels.forEach(level => {
                const distance = ((level.value - currentPrice) / currentPrice * 100).toFixed(4);
                message += `${level.type === 'support' ? '🔵 Поддержка' : '🔴 Сопротивление'}: ${level.value.toFixed(5)} (${distance}%)\n`;
            });
        } else {
            message += `Нет близких значимых уровней\n`;
        }

        bot.sendMessage(chatId, message, mainKeyboard);
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
    bot.sendMessage(chatId, `🔮 Бот анализа Forex рынка запущен!\n\nИспользуйте кнопки ниже для анализа валютных пар.`, mainKeyboard);
});

// Обработка нажатий кнопок
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    switch (text) {
        case '📊 Анализ рынка':
            sendMarketAnalysis(chatId);
            break;

        case '📈 Индикаторы':
            sendIndicatorsInfo(chatId);
            break;

        case '📉 Уровни':
            sendLevelsInfo(chatId);
            break;

        case '⚙️ Настройки':
            bot.sendMessage(chatId, 'Выберите параметр для настройки:', {
                reply_markup: {
                    keyboard: [
                        ['Изменить пару', 'Изменить таймфрейм'],
                        ['Назад']
                    ],
                    resize_keyboard: true
                }
            });
            break;

        case 'Изменить пару':
            bot.sendMessage(chatId, 'Выберите валютную пару:', symbolKeyboard);
            break;

        case 'Изменить таймфрейм':
            bot.sendMessage(chatId, 'Выберите таймфрейм:', intervalKeyboard);
            break;

        case '15m':
            getUserSettings(chatId).resolution = '15';
            bot.sendMessage(chatId, `Таймфрейм изменен на ${text}. Новые анализы будут использовать этот интервал.`, mainKeyboard);
            break;
        case '1h':
            getUserSettings(chatId).resolution = '60';
            bot.sendMessage(chatId, `Таймфрейм изменен на ${text}. Новые анализы будут использовать этот интервал.`, mainKeyboard);
            break;
        case '4h':
            getUserSettings(chatId).resolution = '240';
            bot.sendMessage(chatId, `Таймфрейм изменен на ${text}. Новые анализы будут использовать этот интервал.`, mainKeyboard);
            break;
        case '1d':
            getUserSettings(chatId).resolution = 'D';
            bot.sendMessage(chatId, `Таймфрейм изменен на ${text}. Новые анализы будут использовать этот интервал.`, mainKeyboard);
            break;

        case 'EUR/USD':
        case 'GBP/USD':
        case 'USD/JPY':
        case 'GBP/JPY':
        case 'USD/CHF':
        case 'AUD/USD':
            // Сохраняем выбранную пару
            getUserSettings(chatId).symbol = text;
            bot.sendMessage(chatId, `Валютная пара изменена на ${text}. Новые анализы будут использовать эту пару.`, mainKeyboard);
            break;

        case 'Назад':
            bot.sendMessage(chatId, 'Главное меню', mainKeyboard);
            break;
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
    
    fetchMarketData(settings.symbol, settings.resolution)
        .then(() => {
            if (marketData && marketData.length > 0) {
                sendMarketAnalysis(CHAT_ID);
            } else {
                sendError('Не удалось получить данные для автоматического анализа');
            }
        })
        .catch(error => sendError(`Ошибка автоматического анализа: ${error.message}`));
}

console.log('Forex Trading Bot запущен...');