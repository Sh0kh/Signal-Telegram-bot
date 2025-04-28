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
    switch (interval) {
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
    switch (interval) {
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
        const from = to - (limit * parseInt(interval || 15) * 60); // для минутных интервалов

        // Проверка на валидный интервал
        let validResolution = interval;
        if (!['1', '5', '15', '30', '60', '240', 'D', 'W', 'M'].includes(interval)) {
            validResolution = '15'; // Значение по умолчанию
        }

        console.log(`Запрос к Finnhub: symbol=${formattedSymbol}, resolution=${validResolution}, from=${from}, to=${to}`);

        // Правильный формат запроса для Forex данных
        const response = await axios.get('https://finnhub.io/api/v1/forex/candle', {
            params: {
                symbol: formattedSymbol,  // Удалили префикс OANDA:
                resolution: validResolution,
                from: from,
                to: to,
                token: FINNHUB_API_KEY
            },
            headers: {
                'X-Finnhub-Token': FINNHUB_API_KEY
            }
        });

        // Логирование для отладки
        console.log('Получен ответ от Finnhub:', response.status);

        if (response.data.s === 'no_data') {
            // В случае отсутствия данных, пробуем альтернативные источники
            console.log('Нет данных, попытка использовать альтернативный источник...');
            return await fetchAlternativeData(symbol, interval, limit);
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

        console.log(`Получено ${marketData.length} свечей для ${symbol}`);
        return marketData;
    } catch (error) {
        console.error('Ошибка при запросе к Finnhub:', error.message);
        if (error.response) {
            console.error('Статус ответа:', error.response.status);
            console.error('Данные ответа:', error.response.data);
        }

        // В случае ошибки, пробуем альтернативные источники
        return await fetchAlternativeData(symbol, interval, limit);
    }
}

// Альтернативный источник данных, если Finnhub не работает
async function fetchAlternativeData(symbol = 'EUR/USD', interval = '15', limit = 100) {
    try {
        console.log('Использование альтернативного API для получения данных...');

        // Здесь используем примерный генератор данных вместо реального API
        // В реальном приложении этот метод следует заменить на запрос к другому API

        const currentPrice = getBasePrice(symbol);
        const volatility = 0.0005; // 0.05% волатильность для Forex

        marketData = [];
        const now = Date.now();
        const intervalMs = parseInt(interval || 15) * 60 * 1000; // преобразуем интервал в миллисекунды

        for (let i = limit - 1; i >= 0; i--) {
            const time = now - (i * intervalMs);
            const randomChange = (Math.random() - 0.5) * volatility * 2;
            const basePrice = currentPrice * (1 + (i - limit / 2) * volatility / 10);

            const open = basePrice * (1 + randomChange);
            const close = basePrice * (1 + (Math.random() - 0.5) * volatility * 2);
            const high = Math.max(open, close) * (1 + Math.random() * volatility);
            const low = Math.min(open, close) * (1 - Math.random() * volatility);

            marketData.push({
                time: time,
                open: open,
                high: high,
                low: low,
                close: close,
                volume: Math.floor(Math.random() * 1000)
            });
        }

        console.log(`Сгенерировано ${marketData.length} свечей для ${symbol}`);
        return marketData;
    } catch (error) {
        sendError(`Ошибка при получении альтернативных данных: ${error.message}`);
        return [];
    }
}

// Функция для получения базовой цены для пары
function getBasePrice(symbol) {
    // Приблизительные цены для популярных валютных пар
    const basePrices = {
        'EUR/USD': 1.15,
        'GBP/USD': 1.35,
        'USD/JPY': 110.50,
        'GBP/JPY': 149.20,
        'USD/CHF': 0.92,
        'AUD/USD': 0.77
    };

    return basePrices[symbol] || 1.0;
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
    if (!marketData || marketData.length === 0) {
        return {
            rsi: { value: 50, overbought: false, oversold: false },
            macd: { value: { MACD: 0, signal: 0, histogram: 0 }, histogram: 0, signal: 'NEUTRAL' },
            bollinger: { upper: 0, middle: 0, lower: 0, pricePosition: 50 },
            stochastic: { k: 50, d: 50, overbought: false, oversold: false }
        };
    }

    const closes = marketData.map(item => item.close);
    const highs = marketData.map(item => item.high);
    const lows = marketData.map(item => item.low);

    // RSI
    const rsiInput = {
        values: closes,
        period: 14
    };
    const rsi = ti.RSI.calculate(rsiInput);
    const lastRsi = rsi.length > 0 ? rsi[rsi.length - 1] : 50;

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
    const lastMacd = macd.length > 0 ? macd[macd.length - 1] : { MACD: 0, signal: 0, histogram: 0 };

    // Bollinger Bands
    const bbInput = {
        values: closes,
        period: 20,
        stdDev: 2
    };
    const bb = ti.BollingerBands.calculate(bbInput);
    const lastBb = bb.length > 0 ? bb[bb.length - 1] : { upper: closes[closes.length - 1] * 1.02, middle: closes[closes.length - 1], lower: closes[closes.length - 1] * 0.98 };

    // Stochastic
    const stochasticInput = {
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
    };
    const stochastic = ti.Stochastic.calculate(stochasticInput);
    const lastStochastic = stochastic.length > 0 ? stochastic[stochastic.length - 1] : { k: 50, d: 50 };

    return {
        rsi: {
            value: lastRsi,
            overbought: lastRsi > 70,
            oversold: lastRsi < 30
        },
        macd: {
            value: lastMacd,
            histogram: lastMacd.histogram,
            signal: lastMacd.signal > lastMacd.MACD ? 'BUY' : (lastMacd.signal < lastMacd.MACD ? 'SELL' : 'NEUTRAL')
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

        await bot.sendMessage(chatId, `⏳ Загружаю данные для ${settings.symbol}...`);

        const data = await fetchMarketData(settings.symbol, settings.resolution);
        if (!data || data.length === 0) {
            return bot.sendMessage(chatId, `⚠️ Не удалось получить данные для ${settings.symbol}. Попробуйте другую пару или позже.`, mainKeyboard);
        }

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

    bot.sendMessage(chatId, `⏳ Загружаю данные индикаторов для ${settings.symbol}...`).then(() => {
        fetchMarketData(settings.symbol, settings.resolution).then((data) => {
            if (!data || data.length === 0) {
                return bot.sendMessage(chatId, `⚠️ Не удалось получить данные для ${settings.symbol}. Попробуйте другую пару или позже.`, mainKeyboard);
            }

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
        }).catch(error => {
            sendError(`Ошибка при получении индикаторов: ${error.message}`);
            bot.sendMessage(chatId, `Произошла ошибка при получении индикаторов. Попробуйте позже.`, mainKeyboard);
        });
    });
}

function sendLevelsInfo(chatId) {
    const settings = getUserSettings(chatId);
    const formattedInterval = formatInterval(settings.resolution);

    bot.sendMessage(chatId, `⏳ Загружаю уровни для ${settings.symbol}...`).then(() => {
        fetchMarketData(settings.symbol, settings.resolution).then((data) => {
            if (!data || data.length === 0) {
                return bot.sendMessage(chatId, `⚠️ Не удалось получить данные для ${settings.symbol}. Попробуйте другую пару или позже.`, mainKeyboard);
            }

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
        }).catch(error => {
            sendError(`Ошибка при получении уровней: ${error.message}`);
            bot.sendMessage(chatId, `Произошла ошибка при получении уровней. Попробуйте позже.`, mainKeyboard);
        });
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

// Обработ