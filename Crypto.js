require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = (...args) =>
    import('node-fetch').then(({ default: fetch }) => fetch(...args));

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';

// Список криптовалютных пар для анализа
const SYMBOLS = [
    { pair: 'BTCUSDT', name: 'Bitcoin/USDT' },
    { pair: 'ETHUSDT', name: 'Ethereum/USDT' },
    { pair: 'BNBUSDT', name: 'BNB/USDT' },
    { pair: 'SOLUSDT', name: 'Solana/USDT' }
];
const INTERVAL = '15m'; // Binance использует: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
const AUTO_CHECK_INTERVAL = 5 * 60 * 1000;

let nextAnalysisTime = Date.now() + 10000;
let autoAnalysisTimer = null;

// Уровни доверия с цветами и описаниями
const CONFIDENCE_LEVELS = {
    'VERY_HIGH': { 
        emoji: '🟢', 
        name: 'Очень высокий',
        description: 'Сильный сигнал с множеством подтверждающих факторов'
    },
    'HIGH': { 
        emoji: '🟩', 
        name: 'Высокий',
        description: 'Хороший сигнал с несколькими подтверждениями'
    },
    'MEDIUM': { 
        emoji: '🟨', 
        name: 'Средний',
        description: 'Умеренный сигнал с некоторыми подтверждениями'
    },
    'LOW': { 
        emoji: '🟧', 
        name: 'Низкий',
        description: 'Слабый сигнал, требуется дополнительная проверка'
    },
    'VERY_LOW': { 
        emoji: '🟥', 
        name: 'Очень низкий',
        description: 'Очень слабый сигнал, рекомендуется воздержаться'
    }
};

function formatTimeRemaining(targetTime) {
    const now = Date.now();
    const milliseconds = Math.max(0, targetTime - now);

    if (milliseconds < 1000) return "менее 1 секунды";

    const seconds = Math.floor(milliseconds / 1000) % 60;
    const minutes = Math.floor(milliseconds / (1000 * 60));

    let minutesText = `${minutes} минут`;
    let secondsText = `${seconds} секунд`;

    if (minutes === 1 || minutes % 10 === 1 && minutes !== 11) minutesText = `${minutes} минуту`;
    else if ((minutes >= 2 && minutes <= 4) || (minutes % 10 >= 2 && minutes % 10 <= 4 && (minutes < 12 || minutes > 14))) minutesText = `${minutes} минуты`;

    if (seconds === 1 || seconds % 10 === 1 && seconds !== 11) secondsText = `${seconds} секунду`;
    else if ((seconds >= 2 && seconds <= 4) || (seconds % 10 >= 2 && seconds % 10 <= 4 && (seconds < 12 || seconds > 14))) secondsText = `${seconds} секунды`;

    if (minutes === 0) return secondsText;
    else if (seconds === 0) return minutesText;
    else return `${minutesText} ${secondsText}`;
}

async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.code && data.msg) {
            throw new Error(`API error: ${data.msg}`);
        }

        return data;
    } catch (error) {
        console.error('Ошибка fetch:', error);
        throw error;
    }
}

// Функция для получения исторических данных с Binance
async function getKlines(symbol, interval, limit = 100) {
    try {
        const url = `${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const data = await fetchData(url);
        
        return data.map(k => ({
            openTime: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            closeTime: k[6]
        }));
    } catch (error) {
        console.error(`Ошибка получения Klines для ${symbol}:`, error);
        throw error;
    }
}

// Функция для расчета SMA
function calculateSMA(data, period) {
    const results = [];
    for (let i = period - 1; i < data.length; i++) {
        const sum = data.slice(i - period + 1, i + 1).reduce((total, price) => total + price, 0);
        results.push(sum / period);
    }
    return results;
}

// Функция для расчета EMA
function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    const emaResults = [data[0]];
    
    for (let i = 1; i < data.length; i++) {
        const ema = (data[i] * k) + (emaResults[i - 1] * (1 - k));
        emaResults.push(ema);
    }
    
    return emaResults;
}

// Функция для расчета RSI
function calculateRSI(data, period) {
    const changes = [];
    for (let i = 1; i < data.length; i++) {
        changes.push(data[i] - data[i - 1]);
    }
    
    const results = [];
    for (let i = period; i < changes.length + 1; i++) {
        const slice = changes.slice(i - period, i);
        const gains = slice.filter(change => change > 0).reduce((total, change) => total + change, 0) / period;
        const losses = slice.filter(change => change < 0).reduce((total, change) => total + Math.abs(change), 0) / period;
        
        const rs = gains / (losses === 0 ? 0.01 : losses);
        const rsi = 100 - (100 / (1 + rs));
        results.push(rsi);
    }
    
    return results;
}

// Функция для расчета MACD
function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEMA = calculateEMA(data, fastPeriod);
    const slowEMA = calculateEMA(data, slowPeriod);
    
    // Обрезаем быстрые EMA, чтобы они соответствовали длине медленных EMA
    const macdLine = [];
    for (let i = 0; i < slowEMA.length; i++) {
        const fastEMAIndex = i + (fastEMA.length - slowEMA.length);
        if (fastEMAIndex >= 0) {
            macdLine.push(fastEMA[fastEMAIndex] - slowEMA[i]);
        }
    }
    
    const signalLine = calculateEMA(macdLine, signalPeriod);
    
    // Формируем результат
    const result = [];
    for (let i = 0; i < signalLine.length; i++) {
        const macdIndex = i + (macdLine.length - signalLine.length);
        const histogram = macdLine[macdIndex] - signalLine[i];
        
        result.push({
            macd: macdLine[macdIndex],
            signal: signalLine[i],
            histogram: histogram
        });
    }
    
    return result;
}

// Функция для расчета ATR
function calculateATR(klines, period = 14) {
    const trueRanges = [];
    
    for (let i = 1; i < klines.length; i++) {
        const high = klines[i].high;
        const low = klines[i].low;
        const prevClose = klines[i - 1].close;
        
        const tr1 = high - low;
        const tr2 = Math.abs(high - prevClose);
        const tr3 = Math.abs(low - prevClose);
        
        const tr = Math.max(tr1, tr2, tr3);
        trueRanges.push(tr);
    }
    
    // Расчет ATR как средних истинных диапазонов
    const atr = [];
    if (trueRanges.length >= period) {
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += trueRanges[i];
        }
        atr.push(sum / period);
        
        for (let i = period; i < trueRanges.length; i++) {
            atr.push((atr[atr.length - 1] * (period - 1) + trueRanges[i]) / period);
        }
    }
    
    return atr;
}

async function getSignal(symbol) {
    try {
        // Получаем исторические данные с Binance
        const klines = await getKlines(symbol.pair, INTERVAL, 100);
        
        if (!klines || klines.length < 50) {
            throw new Error('Недостаточно исторических данных');
        }
        
        // Извлекаем массив закрытия
        const closePrices = klines.map(k => k.close);
        
        // Рассчитываем индикаторы
        const sma7 = calculateSMA(closePrices, 7);
        const sma25 = calculateSMA(closePrices, 25);
        const ema50 = calculateEMA(closePrices, 50);
        const rsiData = calculateRSI(closePrices, 14);
        const macdData = calculateMACD(closePrices);
        const atrData = calculateATR(klines, 14);
        
        // Получаем последние значения
        const latestPrice = closePrices[closePrices.length - 1];
        const prevPrice = closePrices[closePrices.length - 2];
        const latestSMA7 = sma7[sma7.length - 1];
        const latestSMA25 = sma25[sma25.length - 1];
        const latestEMA50 = ema50[ema50.length - 1];
        const latestRSI = rsiData[rsiData.length - 1];
        const latestMACD = macdData[macdData.length - 1];
        const prevMACD = macdData[macdData.length - 2];
        const latestATR = atrData[atrData.length - 1];
        
        // Рассчитываем динамические SL/TP на основе ATR
        const slDistance = latestATR * 1.5;
        const tpDistance = latestATR * 2.5;
        const slBuy = (latestPrice - slDistance).toFixed(5);
        const tpBuy = (latestPrice + tpDistance).toFixed(5);
        const slSell = (latestPrice + slDistance).toFixed(5);
        const tpSell = (latestPrice - tpDistance).toFixed(5);

        // Определяем тренд
        const trendUp = latestSMA7 > latestSMA25 && latestSMA25 > latestEMA50;
        const trendDown = latestSMA7 < latestSMA25 && latestSMA25 < latestEMA50;

        // Определяем сигналы и уровни доверия
        let signal = 'HOLD';
        let confidence = 'VERY_LOW';
        let reasons = [];
        let hasActionSignal = false;

        // Сигналы на покупку
        if (trendUp && latestRSI < 60 && latestMACD.macd > latestMACD.signal) {
            signal = 'BUY';
            confidence = 'HIGH';
            reasons.push('Тренд вверх (SMA7 > SMA25 > EMA50)');
            reasons.push('RSI не перекуплен (<60)');
            reasons.push('MACD выше сигнальной линии');
            hasActionSignal = true;
            
            // Повышаем доверие при дополнительных подтверждениях
            if (latestRSI > 30 && latestRSI < 50) {
                confidence = 'VERY_HIGH';
                reasons.push('RSI в оптимальной зоне (30-50)');
            }
            
            if (latestMACD.histogram > 0 && latestMACD.histogram > prevMACD.histogram) {
                reasons.push('Гистограмма MACD растет');
            }
        }
        // Сигналы на продажу
        else if (trendDown && latestRSI > 40 && latestMACD.macd < latestMACD.signal) {
            signal = 'SELL';
            confidence = 'HIGH';
            reasons.push('Тренд вниз (SMA7 < SMA25 < EMA50)');
            reasons.push('RSI не перепродан (>40)');
            reasons.push('MACD ниже сигнальной линии');
            hasActionSignal = true;
            
            // Повышаем доверие при дополнительных подтверждениях
            if (latestRSI > 50 && latestRSI < 70) {
                confidence = 'VERY_HIGH';
                reasons.push('RSI в оптимальной зоне (50-70)');
            }
            
            if (latestMACD.histogram < 0 && latestMACD.histogram < prevMACD.histogram) {
                reasons.push('Гистограмма MACD снижается');
            }
        }
        // Нейтральные сигналы с меньшим доверием
        else if (latestSMA7 > latestSMA25 && latestRSI < 70 && latestMACD.macd > 0) {
            signal = 'BUY';
            confidence = 'MEDIUM';
            reasons.push('Краткосрочный тренд вверх (SMA7 > SMA25)');
            reasons.push('RSI не перекуплен (<70)');
            reasons.push('MACD выше нуля');
            hasActionSignal = true;
        }
        else if (latestSMA7 < latestSMA25 && latestRSI > 30 && latestMACD.macd < 0) {
            signal = 'SELL';
            confidence = 'MEDIUM';
            reasons.push('Краткосрочный тренд вниз (SMA7 < SMA25)');
            reasons.push('RSI не перепродан (>30)');
            reasons.push('MACD ниже нуля');
            hasActionSignal = true;
        }
        // Очень слабые сигналы
        else if (latestPrice > latestSMA7 && latestSMA7 > latestSMA25 && latestRSI < 65) {
            signal = 'BUY';
            confidence = 'LOW';
            reasons.push('Цена выше SMA7 и SMA25');
            reasons.push('RSI умеренный (<65)');
            hasActionSignal = true;
        }
        else if (latestPrice < latestSMA7 && latestSMA7 < latestSMA25 && latestRSI > 35) {
            signal = 'SELL';
            confidence = 'LOW';
            reasons.push('Цена ниже SMA7 и SMA25');
            reasons.push('RSI умеренный (>35)');
            hasActionSignal = true;
        }

        // Эмодзи для сигналов
        const signalEmoji = {
            'BUY': '🔼',
            'SELL': '🔽',
            'HOLD': '↔️'
        }[signal];

        // Получаем данные об уровне доверия
        const confidenceData = CONFIDENCE_LEVELS[confidence] || CONFIDENCE_LEVELS.VERY_LOW;

        return {
            symbol: symbol.name,
            pair: symbol.pair,
            latestPrice,
            sma7: latestSMA7,
            sma25: latestSMA25,
            ema50: latestEMA50,
            rsi: latestRSI,
            macd: latestMACD.macd,
            macdSignal: latestMACD.signal,
            macdHist: latestMACD.histogram,
            atr: latestATR,
            signal: `${signalEmoji} ${signal}`,
            confidence: confidenceData,
            reasons,
            tp: signal === 'BUY' ? tpBuy : tpSell,
            sl: signal === 'BUY' ? slBuy : slSell,
            hasActionSignal,
            trend: trendUp ? 'Восходящий' : trendDown ? 'Нисходящий' : 'Боковой'
        };
    } catch (error) {
        console.error(`Ошибка для ${symbol.name}:`, error.message);
        return {
            symbol: symbol.name,
            error: error.message
        };
    }
}

async function sendMessage(ctx, text) {
    try {
        if (ctx) {
            await ctx.replyWithMarkdown(text);
        } else if (CHAT_ID) {
            try {
                await bot.telegram.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error(`Не удалось отправить сообщение в CHAT_ID: ${error.message}`);
                // Не выбрасываем ошибку дальше, чтобы не прерывать выполнение программы
            }
        }
    } catch (error) {
        console.error('Ошибка отправки:', error.message);
    }
}

async function sendSignals(ctx = null, isAutoCheck = false) {
    try {
        if (!isAutoCheck) {
            await sendMessage(ctx, '🔍 Начинаю углубленный анализ крипторынка...');
        }

        let hasAnySignal = false;
        const results = [];

        for (const symbol of SYMBOLS) {
            const result = await getSignal(symbol);

            if (result.error) {
                if (!isAutoCheck) {
                    await sendMessage(ctx, `❌ ${symbol.name}: ${result.error}`);
                }
                continue;
            }

            results.push(result);
            if (result.hasActionSignal) {
                hasAnySignal = true;
            }
        }

        updateNextAnalysisTime();

        // Если это автоматическая проверка и нет сигналов
        if (isAutoCheck && !hasAnySignal && results.length > 0) {
            const timeRemaining = formatTimeRemaining(nextAnalysisTime);
            await sendMessage(null, `⚠️ *Автоматический анализ: нет сильных торговых сигналов*\n\nПроанализировано пар: ${results.length}\nВремя: ${new Date().toLocaleTimeString()}\n\n⏱ Следующий анализ через: ${timeRemaining}`);
            return;
        }

        // Отправляем результаты
        for (const result of results) {
            if (isAutoCheck && !result.hasActionSignal) continue;

            const timeRemaining = formatTimeRemaining(nextAnalysisTime);
            const confidence = result.confidence;

            const message = `
${isAutoCheck ? '🔄 *АВТОМАТИЧЕСКИЙ АНАЛИЗ*' : '📊 *РЕЗУЛЬТАТЫ АНАЛИЗА*'}
${confidence.emoji} *${result.symbol} (${result.pair})*
📌 *Сигнал*: ${result.signal} (${confidence.name})
${confidence.emoji} *Уверенность*: ${confidence.description}

💰 *Цена*: ${result.latestPrice}
📈 *Тренд*: ${result.trend}
📊 *Индикаторы*:
- SMA(7): ${result.sma7.toFixed(5)}
- SMA(25): ${result.sma25.toFixed(5)}
- EMA(50): ${result.ema50.toFixed(5)}
- RSI(14): ${result.rsi.toFixed(2)}
- MACD: ${result.macd.toFixed(5)} (сигнал: ${result.macdSignal.toFixed(5)})
- ATR(14): ${result.atr.toFixed(5)} (волатильность)

🎯 *Рекомендации*:
- TP: ${result.tp}
- SL: ${result.sl}

📝 *Обоснование*:
${result.reasons.map(r => `• ${r}`).join('\n')}

⏰ *Время анализа*: ${new Date().toLocaleTimeString()}
⏱ *Следующий анализ через*: ${timeRemaining}
            `.trim();

            await sendMessage(isAutoCheck ? null : ctx, message);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!isAutoCheck) {
            const timeRemaining = formatTimeRemaining(nextAnalysisTime);
            await sendMessage(ctx, `✅ Анализ завершен\n\n⏱ Следующий автоматический анализ через: ${timeRemaining}`);
        }
    } catch (error) {
        console.error('Ошибка sendSignals:', error);
        const timeRemaining = formatTimeRemaining(nextAnalysisTime);
        const errorMessage = `❗ Ошибка анализа: ${error.message}\n\n⏱ Следующий анализ через: ${timeRemaining}`;
        
        await sendMessage(isAutoCheck ? null : ctx, errorMessage);
        updateNextAnalysisTime();
    }
}

function updateNextAnalysisTime() {
    nextAnalysisTime = Date.now() + AUTO_CHECK_INTERVAL;
    console.log(`Следующий анализ запланирован на: ${new Date(nextAnalysisTime).toLocaleTimeString()}`);

    if (autoAnalysisTimer) clearTimeout(autoAnalysisTimer);
    autoAnalysisTimer = setTimeout(runAutoAnalysis, AUTO_CHECK_INTERVAL);
}

async function showStatus(ctx) {
    const timeRemaining = formatTimeRemaining(nextAnalysisTime);
    const nextTimeString = new Date(nextAnalysisTime).toLocaleTimeString();

    await sendMessage(ctx, `📊 *Статус бота*\n\n✅ Бот активен и работает\n⏱ Следующий автоматический анализ через: ${timeRemaining}\n🕒 Точное время следующего анализа: ${nextTimeString}\n📈 Отслеживаемые пары: ${SYMBOLS.map(s => s.name).join(', ')}`);
}

async function runAnalysisNow(ctx) {
    if (autoAnalysisTimer) clearTimeout(autoAnalysisTimer);
    await sendMessage(ctx, '⚡ Запускаю углубленный анализ немедленно...');
    await sendSignals(ctx, false);
}

const runAutoAnalysis = async () => {
    try {
        console.log('Запуск автоматического анализа...');
        await sendSignals(null, true);
    } catch (error) {
        console.error('Ошибка автоматического анализа:', error);
        updateNextAnalysisTime();
    }
};

// Команды бота
bot.start(ctx => ctx.replyWithMarkdown(
    `💎 *Криптовалютный Торговый Бот* 💎\n\n📈 *Отслеживаемые пары*: ${SYMBOLS.map(s => s.name).join(', ')}\n⏱ *Автопроверка*: каждые 5 минут\n\n*Уровни доверия*:\n${Object.values(CONFIDENCE_LEVELS).map(l => `${l.emoji} ${l.name}: ${l.description}`).join('\n')}`,
    {
        reply_markup: {
            keyboard: [
                [{ text: '📈 Получить сигналы' }, { text: '📊 Статус' }],
                [{ text: '⚡ Запустить анализ сейчас' }],
                [{ text: 'ℹ️ О боте' }]
            ], 
            resize_keyboard: true
        }
    }
));

bot.hears('📈 Получить сигналы', ctx => sendSignals(ctx, false));
bot.hears('📊 Статус', ctx => showStatus(ctx));
bot.hears('⚡ Запустить анализ сейчас', ctx => runAnalysisNow(ctx));
bot.hears('ℹ️ О боте', ctx => ctx.replyWithMarkdown(
    `🤖 *Криптовалютный Торговый Бот*\n\n` +
    `Этот бот использует комплексный анализ рынка с несколькими индикаторами:\n` +
    `- Трендовые индикаторы (SMA, EMA)\n` +
    `- Осцилляторы (RSI, MACD)\n` +
    `- Анализ волатильности (ATR)\n\n` +
    `Сигналы сопровождаются уровнями доверия для лучшей оценки рисков.\n\n` +
    `Данные котировок получены от Binance API.`
));

// Обработчик ошибок для вебхуков Telegram
bot.catch((err, ctx) => {
    console.error(`Ошибка при обработке ${ctx.updateType}:`, err);
});

async function startBot() {
    try {
        console.log('Проверка окружения...');
        if (!process.env.BOT_TOKEN) {
            throw new Error('Не задан токен бота в переменных окружения');
        }

        console.log('Проверка доступности Binance API...');
        const testUrl = `${BINANCE_BASE_URL}/ping`;
        await fetchData(testUrl);
        console.log('Binance API доступен и отвечает корректно');

        await bot.launch();
        console.log('🤖 Бот запущен');

        // Устанавливаем таймер для автоматического анализа
        nextAnalysisTime = Date.now() + 10000;
        autoAnalysisTimer = setTimeout(runAutoAnalysis, 10000);
        
        // Только если CHAT_ID задан, пытаемся отправить сообщение
        if (CHAT_ID) {
            try {
                await bot.telegram.sendMessage(CHAT_ID, 
                    '💎 *Криптовалютный Торговый Бот активирован!*\n\n' +
                    '✅ Автоматический анализ каждые 5 минут\n' +
                    `📊 Отслеживаемые пары: ${SYMBOLS.map(s => s.name).join(', ')}\n\n` +
                    'Используйте команды в боте для управления.',
                    { parse_mode: 'Markdown' });
                console.log(`Успешно отправлено стартовое сообщение в чат ${CHAT_ID}`);
            } catch (error) {
                console.error(`Не удалось отправить стартовое сообщение в CHAT_ID: ${error.message}`);
                console.log('Бот продолжит работу без отправки автоматических сообщений в указанный чат.');
                console.log('Проверьте правильность CHAT_ID или разблокируйте бота в указанном чате.');
            }
        } else {
            console.log('CHAT_ID не указан. Автоматические сообщения отправляться не будут.');
            console.log('Бот будет работать только в режиме ответов на прямые сообщения.');
        }
    } catch (error) {
        console.error('🚨 Ошибка запуска:', error.message);
        process.exit(1);
    }
}

startBot();

// Обработчики для корректного завершения
process.once('SIGINT', () => {
    console.log('Получен сигнал SIGINT, завершение работы...');
    if (autoAnalysisTimer) clearTimeout(autoAnalysisTimer);
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('Получен сигнал SIGTERM, завершение работы...');
    if (autoAnalysisTimer) clearTimeout(autoAnalysisTimer);
    bot.stop('SIGTERM');
});