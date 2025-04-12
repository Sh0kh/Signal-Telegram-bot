require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = (...args) =>
    import('node-fetch').then(({ default: fetch }) => fetch(...args));

const bot = new Telegraf(process.env.BOT_TOKEN);
const API_KEY = process.env.API_KEY;
const CHAT_ID = process.env.CHAT_ID;
const BASE_URL = 'https://api.twelvedata.com';

const SYMBOLS = [
    { pair: 'EUR/USD', name: 'Евро/Доллар' },
    { pair: 'GBP/USD', name: 'Фунт/Доллар' },
    { pair: 'USD/JPY', name: 'Доллар/Йена' },
    { pair: 'AUD/USD', name: 'Австралийский доллар/Доллар' }
];
const INTERVAL = '15min';
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

        if (data.status === 'error') {
            throw new Error(`API error: ${data.message || 'Unknown API error'}`);
        }

        return data;
    } catch (error) {
        console.error('Ошибка fetch:', error);
        throw error;
    }
}

// Функция для расчета волатильности (ATR)
async function getATR(symbol, period = 14) {
    try {
        const url = `${BASE_URL}/atr?symbol=${symbol.pair}&interval=${INTERVAL}&time_period=${period}&apikey=${API_KEY}`;
        const data = await fetchData(url);
        return parseFloat(data.values[0].atr);
    } catch (error) {
        console.error(`Ошибка получения ATR для ${symbol.name}:`, error);
        return null;
    }
}

async function getSignal(symbol) {
    try {
        // Получаем все необходимые данные
        const urls = [
            `${BASE_URL}/time_series?symbol=${symbol.pair}&interval=${INTERVAL}&outputsize=50&apikey=${API_KEY}`,
            `${BASE_URL}/sma?symbol=${symbol.pair}&interval=${INTERVAL}&time_period=7&apikey=${API_KEY}`,
            `${BASE_URL}/sma?symbol=${symbol.pair}&interval=${INTERVAL}&time_period=25&apikey=${API_KEY}`,
            `${BASE_URL}/ema?symbol=${symbol.pair}&interval=${INTERVAL}&time_period=50&apikey=${API_KEY}`,
            `${BASE_URL}/rsi?symbol=${symbol.pair}&interval=${INTERVAL}&time_period=14&apikey=${API_KEY}`,
            `${BASE_URL}/macd?symbol=${symbol.pair}&interval=${INTERVAL}&series_type=close&apikey=${API_KEY}`
        ];

        const results = [];
        for (const url of urls) {
            const result = await fetchData(url);
            results.push(result);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        const [priceData, sma7Data, sma25Data, ema50Data, rsiData, macdData] = results;

        // Проверка данных
        if (!priceData.values || !sma7Data.values || !sma25Data.values || 
            !ema50Data.values || !rsiData.values || !macdData.values) {
            throw new Error('Неполные данные от API');
        }

        // Получаем последние значения
        const latestPrice = parseFloat(priceData.values[0].close);
        const prevPrice = parseFloat(priceData.values[1].close);
        const sma7 = parseFloat(sma7Data.values[0].sma);
        const sma25 = parseFloat(sma25Data.values[0].sma);
        const ema50 = parseFloat(ema50Data.values[0].ema);
        const rsi = parseFloat(rsiData.values[0].rsi);
        const macd = parseFloat(macdData.values[0].macd);
        const macdSignal = parseFloat(macdData.values[0].macd_signal);
        const macdHist = parseFloat(macdData.values[0].macd_hist);

        // Получаем волатильность (ATR)
        const atr = await getATR(symbol) || (latestPrice * 0.01);

        // Рассчитываем динамические SL/TP на основе ATR
        const slDistance = atr * 1.5;
        const tpDistance = atr * 2.5;
        const slBuy = (latestPrice - slDistance).toFixed(5);
        const tpBuy = (latestPrice + tpDistance).toFixed(5);
        const slSell = (latestPrice + slDistance).toFixed(5);
        const tpSell = (latestPrice - tpDistance).toFixed(5);

        // Определяем тренд
        const trendUp = sma7 > sma25 && sma25 > ema50;
        const trendDown = sma7 < sma25 && sma25 < ema50;

        // Определяем сигналы и уровни доверия
        let signal = 'HOLD';
        let confidence = 'VERY_LOW';
        let reasons = [];
        let hasActionSignal = false;

        // Сигналы на покупку
        if (trendUp && rsi < 60 && macd > macdSignal) {
            signal = 'BUY';
            confidence = 'HIGH';
            reasons.push('Тренд вверх (SMA7 > SMA25 > EMA50)');
            reasons.push('RSI не перекуплен (<60)');
            reasons.push('MACD выше сигнальной линии');
            hasActionSignal = true;
            
            // Повышаем доверие при дополнительных подтверждениях
            if (rsi > 30 && rsi < 50) {
                confidence = 'VERY_HIGH';
                reasons.push('RSI в оптимальной зоне (30-50)');
            }
            
            if (macdHist > 0 && macdHist > macdData.values[1].macd_hist) {
                reasons.push('Гистограмма MACD растет');
            }
        }
        // Сигналы на продажу
        else if (trendDown && rsi > 40 && macd < macdSignal) {
            signal = 'SELL';
            confidence = 'HIGH';
            reasons.push('Тренд вниз (SMA7 < SMA25 < EMA50)');
            reasons.push('RSI не перепродан (>40)');
            reasons.push('MACD ниже сигнальной линии');
            hasActionSignal = true;
            
            // Повышаем доверие при дополнительных подтверждениях
            if (rsi > 50 && rsi < 70) {
                confidence = 'VERY_HIGH';
                reasons.push('RSI в оптимальной зоне (50-70)');
            }
            
            if (macdHist < 0 && macdHist < macdData.values[1].macd_hist) {
                reasons.push('Гистограмма MACD снижается');
            }
        }
        // Нейтральные сигналы с меньшим доверием
        else if (sma7 > sma25 && rsi < 70 && macd > 0) {
            signal = 'BUY';
            confidence = 'MEDIUM';
            reasons.push('Краткосрочный тренд вверх (SMA7 > SMA25)');
            reasons.push('RSI не перекуплен (<70)');
            reasons.push('MACD выше нуля');
            hasActionSignal = true;
        }
        else if (sma7 < sma25 && rsi > 30 && macd < 0) {
            signal = 'SELL';
            confidence = 'MEDIUM';
            reasons.push('Краткосрочный тренд вниз (SMA7 < SMA25)');
            reasons.push('RSI не перепродан (>30)');
            reasons.push('MACD ниже нуля');
            hasActionSignal = true;
        }
        // Очень слабые сигналы
        else if (latestPrice > sma7 && sma7 > sma25 && rsi < 65) {
            signal = 'BUY';
            confidence = 'LOW';
            reasons.push('Цена выше SMA7 и SMA25');
            reasons.push('RSI умеренный (<65)');
            hasActionSignal = true;
        }
        else if (latestPrice < sma7 && sma7 < sma25 && rsi > 35) {
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
            sma7,
            sma25,
            ema50,
            rsi,
            macd,
            macdSignal,
            macdHist,
            atr,
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
            await bot.telegram.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('Ошибка отправки:', error.message);
    }
}

async function sendSignals(ctx = null, isAutoCheck = false) {
    try {
        if (!isAutoCheck) {
            await sendMessage(ctx, '🔍 Начинаю углубленный анализ рынка...');
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
        if (CHAT_ID) {
            await bot.telegram.sendMessage(CHAT_ID,
                `⚠️ Ошибка автоматического анализа: ${error.message}`);
        }
        updateNextAnalysisTime();
    }
};

// Команды бота
bot.start(ctx => ctx.replyWithMarkdown(
    `💎 *Улучшенный Форекс Бот* 💎\n\n📈 *Отслеживаемые пары*: ${SYMBOLS.map(s => s.name).join(', ')}\n⏱ *Автопроверка*: каждые 5 минут\n\n*Уровни доверия*:\n${Object.values(CONFIDENCE_LEVELS).map(l => `${l.emoji} ${l.name}: ${l.description}`).join('\n')}`,
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
    `🤖 *Улучшенный Форекс Бот*\n\n` +
    `Этот бот использует комплексный анализ рынка с несколькими индикаторами:\n` +
    `- Трендовые индикаторы (SMA, EMA)\n` +
    `- Осцилляторы (RSI, MACD)\n` +
    `- Анализ волатильности (ATR)\n\n` +
    `Сигналы сопровождаются уровнями доверия для лучшей оценки рисков.`
));

async function startBot() {
    try {
        console.log('Проверка окружения...');
        if (!process.env.BOT_TOKEN || !process.env.API_KEY) {
            throw new Error('Не заданы обязательные переменные окружения');
        }

        console.log('Проверка доступности API...');
        const testUrl = `${BASE_URL}/time_series?symbol=EUR/USD&interval=1min&outputsize=1&apikey=${API_KEY}`;
        const testData = await fetchData(testUrl);
        if (!testData.values) throw new Error('API не отвечает корректно');
        console.log('API доступен и отвечает корректно');

        await bot.launch();
        console.log('🤖 Бот запущен');

        if (CHAT_ID) {
            await bot.telegram.sendMessage(CHAT_ID, 
                '💎 *Улучшенный Форекс Бот активирован!*\n\n' +
                '✅ Автоматический анализ каждые 5 минут\n' +
                `📊 Отслеживаемые пары: ${SYMBOLS.map(s => s.name).join(', ')}\n\n` +
                'Используйте команды в боте для управления.');

            nextAnalysisTime = Date.now() + 10000;
            autoAnalysisTimer = setTimeout(runAutoAnalysis, 10000);
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