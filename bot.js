const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const ti = require('technicalindicators');

// Конфигурация (ЗАМЕНИТЕ НА СВОИ ДАННЫЕ)
const BOT_TOKEN = '7955550632:AAGrNgJRVbnIWsckCkcyZglo-lxvooWT3Wg';
const API_KEY = 'a9db6b712c1a40299e39d7266af5b2b3';

// Инициализация бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Настройки пользователей
const userSettings = {};

function getUserSettings(chatId) {
    if (!userSettings[chatId]) {
        userSettings[chatId] = {
            symbol: 'EUR/USD',
            interval: '15min',
            active: false // Флаг активности анализа
        };
    }
    return userSettings[chatId];
}

// Доступные пары и таймфреймы
const availablePairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'BTC/USD'];
const availableIntervals = ['5min', '15min', '1h', '4h', '1day'];

// Основные функции
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
            throw new Error('Неверный формат данных');
        }

        return response.data.values.map(item => ({
            time: new Date(item.datetime).getTime(),
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close)
        })).reverse();
    } catch (error) {
        console.error('Ошибка при получении данных:', error.message);
        return null;
    }
}

async function analyzeMarket(chatId) {
    const settings = getUserSettings(chatId);
    if (!settings.active) return;

    try {
        const marketData = await fetchMarketData(settings.symbol, settings.interval);
        if (!marketData || marketData.length < 50) {
            bot.sendMessage(chatId, `Недостаточно данных для анализа ${settings.symbol} на ${settings.interval}`);
            return;
        }

        // 1. Определяем тренд и ключевые точки Фибо
        const last50 = marketData.slice(-50);
        const highs = last50.map(item => item.high);
        const lows = last50.map(item => item.low);
        
        // Точки Фибо (0% и 100%)
        const highestHigh = Math.max(...highs);
        const lowestLow = Math.min(...lows);
        const isUptrend = highs.lastIndexOf(highestHigh) > lows.lastIndexOf(lowestLow);

        // 2. Рассчитываем уровни Фибоначчи
        const fibLevels = {
            point0: isUptrend ? lowestLow : highestHigh,
            point100: isUptrend ? highestHigh : lowestLow,
            level236: isUptrend ? lowestLow + (highestHigh - lowestLow) * 0.236 : highestHigh - (highestHigh - lowestLow) * 0.236,
            level382: isUptrend ? lowestLow + (highestHigh - lowestLow) * 0.382 : highestHigh - (highestHigh - lowestLow) * 0.382,
            level50: isUptrend ? lowestLow + (highestHigh - lowestLow) * 0.5 : highestHigh - (highestHigh - lowestLow) * 0.5,
            level618: isUptrend ? lowestLow + (highestHigh - lowestLow) * 0.618 : highestHigh - (highestHigh - lowestLow) * 0.618
        };

        // 3. Получаем текущие значения индикаторов
        const closes = marketData.map(item => item.close);
        const currentPrice = closes[closes.length - 1];
        const rsi = ti.RSI.calculate({ values: closes, period: 14 }).slice(-3); // Последние 3 значения
        const macd = ti.MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9
        }).slice(-3);

        // 4. Визуализация Фибо-уровней
        let chartMsg = `📊 ${settings.symbol} ${settings.interval}\n`;
        chartMsg += `🔼 Точка 0% (${isUptrend ? 'Low' : 'High'}): ${fibLevels.point0.toFixed(5)}\n`;
        chartMsg += `🔽 Точка 100% (${isUptrend ? 'High' : 'Low'}): ${fibLevels.point100.toFixed(5)}\n\n`;
        chartMsg += `📈 Уровни Фибо:\n`;
        chartMsg += `23.6%: ${fibLevels.level236.toFixed(5)}\n`;
        chartMsg += `38.2%: ${fibLevels.level382.toFixed(5)}\n`;
        chartMsg += `50.0%: ${fibLevels.level50.toFixed(5)}\n`;
        chartMsg += `61.8%: ${fibLevels.level618.toFixed(5)}\n\n`;
        chartMsg += `💵 Текущая цена: ${currentPrice.toFixed(5)}`;

        // 5. Поиск сигналов
        let signals = [];
        const levelsToCheck = ['level382', 'level50', 'level618'];
        
        levelsToCheck.forEach(level => {
            const levelPrice = fibLevels[level];
            const distance = Math.abs(currentPrice - levelPrice);
            
            // Проверяем касание уровня (в пределах 0.5%)
            if (distance/levelPrice < 0.005) {
                // Условия для разворота:
                // 1) RSI показывает перекупленность/перепроданность
                // 2) MACD меняет направление
                const rsiCondition = isUptrend 
                    ? rsi.some(v => v > 70) 
                    : rsi.some(v => v < 30);
                
                const macdCondition = isUptrend
                    ? macd[2].histogram < macd[1].histogram // MACD замедляется
                    : macd[2].histogram > macd[1].histogram;
                
                if (rsiCondition && macdCondition) {
                    const signalType = isUptrend ? "🔴 SELL" : "🟢 BUY";
                    signals.push(`${signalType} на ${level.replace('level', '')}% (${levelPrice.toFixed(5)})`);
                }
            }
        });

        // 6. Отправка результатов
        if (signals.length > 0) {
            chartMsg += "\n\n🎯 СИГНАЛЫ:\n" + signals.join("\n");
            chartMsg += `\n\n📉 RSI: ${rsi[2].toFixed(2)}`;
            chartMsg += `\n📊 MACD: ${macd[2].histogram.toFixed(5)}`;
        } else {
            chartMsg += "\n\n🔍 Сигналов нет - ожидаем касания ключевых уровней";
        }

        bot.sendMessage(chatId, chartMsg);

    } catch (error) {
        console.error(`Ошибка анализа:`, error);
        bot.sendMessage(chatId, `Ошибка: ${error.message}`);
    }
}
// Клавиатуры
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            ['📊 Анализировать выбранную пару'],
            ['⚙️ Настройки'],
            ['ℹ️ Помощь']
        ],
        resize_keyboard: true
    }
};

const settingsKeyboard = {
    reply_markup: {
        keyboard: [
            ['Выбрать валютную пару', 'Выбрать таймфрейм'],
            ['Включить/выключить анализ', 'Назад']
        ],
        resize_keyboard: true
    }
};

// Обработчики команд
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `📊 Бот для анализа рынка по Фибоначчи\n\nВыберите пару и начните анализ:`, mainKeyboard);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const settings = getUserSettings(chatId);

    if (!text) return;

    try {
        if (text === '📊 Анализировать выбранную пару') {
            if (!settings.active) {
                bot.sendMessage(chatId, 'Сначала включите анализ в настройках');
                return;
            }
            bot.sendMessage(chatId, `Начинаю анализ ${settings.symbol} на ${settings.interval}...`);
            await analyzeMarket(chatId);
        }
        else if (text === '⚙️ Настройки') {
            let status = settings.active ? '✅ ВКЛЮЧЕН' : '❌ ВЫКЛЮЧЕН';
            bot.sendMessage(chatId, `Текущие настройки:\n\nПара: ${settings.symbol}\nТаймфрейм: ${settings.interval}\nАнализ: ${status}`, settingsKeyboard);
        }
        else if (text === 'Выбрать валютную пару') {
            const pairButtons = availablePairs.map(pair => ({ text: pair }));
            bot.sendMessage(chatId, 'Выберите валютную пару:', {
                reply_markup: {
                    keyboard: [
                        pairButtons,
                        [{ text: 'Назад' }]
                    ],
                    resize_keyboard: true
                }
            });
        }
        else if (text === 'Выбрать таймфрейм') {
            const intervalButtons = availableIntervals.map(interval => ({ text: interval }));
            bot.sendMessage(chatId, 'Выберите таймфрейм:', {
                reply_markup: {
                    keyboard: [
                        intervalButtons,
                        [{ text: 'Назад' }]
                    ],
                    resize_keyboard: true
                }
            });
        }
        else if (text === 'Включить/выключить анализ') {
            settings.active = !settings.active;
            bot.sendMessage(chatId, `Анализ ${settings.active ? 'включен' : 'выключен'} для ${settings.symbol}`, settingsKeyboard);
        }
        else if (availablePairs.includes(text)) {
            settings.symbol = text;
            bot.sendMessage(chatId, `Валютная пара изменена на: ${text}`, settingsKeyboard);
        }
        else if (availableIntervals.includes(text)) {
            settings.interval = text;
            bot.sendMessage(chatId, `Таймфрейм изменен на: ${text}`, settingsKeyboard);
        }
        else if (text === 'Назад') {
            bot.sendMessage(chatId, 'Главное меню', mainKeyboard);
        }
        else if (text === 'ℹ️ Помощь') {
            bot.sendMessage(chatId, `📚 Помощь:\n\n1. Выберите валютную пару и таймфрейм в настройках\n2. Включите анализ\n3. Используйте кнопку "Анализировать выбранную пару"\n4. Бот будет искать сигналы только для выбранной пары`, mainKeyboard);
        }
    } catch (error) {
        console.error('Ошибка обработки сообщения:', error);
        bot.sendMessage(chatId, 'Произошла ошибка, попробуйте еще раз', mainKeyboard);
    }
});

console.log('Бот запущен и готов к работе...');