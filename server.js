const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const https = require('https');
const app = express();
// ============================================================
// TELEGRAM
// ============================================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
function sendTelegramMessage(text) {
    return new Promise((resolve, reject) => {
        if (!TELEGRAM_BOT_TOKEN) {
            return reject(
                new Error(
                    'Не задан TELEGRAM_BOT_TOKEN'
                )
            );
        }
        if (!TELEGRAM_CHAT_ID) {
            return reject(
                new Error(
                    'Не задан TELEGRAM_CHAT_ID'
                )
            );
        }
        const data = JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: text
        });
        const request = https.request(
            {
                hostname: 'api.telegram.org',
                path:
                    '/bot' +
                    TELEGRAM_BOT_TOKEN +
                    '/sendMessage',
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json',
                    'Content-Length':
                        Buffer.byteLength(data)
                }
            },
            response => {
                let body = '';
                response.on(
                    'data',
                    chunk => {
                        body += chunk;
                    }
                );
                response.on(
                    'end',
                    () => {
                        try {
                            const result =
                                JSON.parse(body);
                            if (!result.ok) {
                                return reject(
                                    new Error(
                                        result.description ||
                                        'Telegram API error'
                                    )
                                );
                            }
                            resolve(result);
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            }
        );
        request.on(
            'error',
            error => {
                reject(error);
            }
        );
        request.write(data);
        request.end();
    });
}
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'products.json');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}
const upload = multer({
    dest: UPLOAD_DIR
});
app.use(express.json());
app.use(express.static(__dirname));
// ============================================================
// АДМИН
// ============================================================
const ADMIN_CREDENTIALS = {
    username: process.env.ADMIN_USERNAME || 'fsuvorov976@gmail.com',
    password: process.env.ADMIN_PASSWORD || '0631023827Aa'
};
// ============================================================
// ЧТЕНИЕ PRODUCTS.JSON
// ============================================================
function readProducts() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, '[]', 'utf8');
            return [];
        }
        const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
        if (!raw) {
            return [];
        }
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error(
            'Ошибка чтения products.json:',
            error
        );
        return [];
    }
}
// ============================================================
// ЗАПИСЬ PRODUCTS.JSON
// ============================================================
function writeProducts(products) {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(products, null, 2),
            'utf8'
        );
        console.log('');
        console.log(
            '=========================================='
        );
        console.log(
            'ТОВАРЫ СОХРАНЕНЫ'
        );
        console.log(
            'Количество:',
            products.length
        );
        console.log(
            'Файл:',
            DATA_FILE
        );
        console.log(
            '=========================================='
        );
        console.log('');
        return true;
    } catch (error) {
        console.error(
            'Ошибка записи products.json:',
            error
        );
        return false;
    }
}
// ============================================================
// УНИКАЛЬНЫЙ 8-ЗНАЧНЫЙ КОД ТОВАРА
// ============================================================
function generateProductCode(usedCodes) {
    let code;
    do {
        code = Math.floor(
            10000000 +
            Math.random() * 90000000
        ).toString();
    } while (
        usedCodes.has(code)
        );
    usedCodes.add(code);
    return code;
}
// ============================================================
// ПОЛУЧИТЬ СУЩЕСТВУЮЩИЕ КОДЫ
// ============================================================
function getUsedProductCodes(products) {
    const usedCodes = new Set();
    products.forEach(product => {
        const code = String(
            product.productCode ||
            product.Код_товара ||
            ''
        ).trim();
        if (/^\d{8}$/.test(code)) {
            usedCodes.add(code);
        }
    });
    return usedCodes;
}
// ============================================================
// ДОБАВИТЬ КОДЫ ТОВАРАМ, У КОТОРЫХ ИХ НЕТ
// ============================================================
function ensureProductCodes(products) {
    const usedCodes =
        getUsedProductCodes(products);
    let changed = false;
    products.forEach(product => {
        let code = String(
            product.productCode ||
            product.Код_товара ||
            ''
        ).trim();
        if (!/^\d{8}$/.test(code)) {
            code =
                generateProductCode(
                    usedCodes
                );
            product.productCode = code;
            product.Код_товара = code;
            changed = true;
        } else {
            if (
                product.productCode !== code
            ) {
                product.productCode = code;
                changed = true;
            }
            if (
                product.Код_товара !== code
            ) {
                product.Код_товара = code;
                changed = true;
            }
        }
    });
    if (changed) {
        writeProducts(products);
    }
    return products;
}
// ============================================================
// НОРМАЛИЗАЦИЯ ТОВАРОВ
// ============================================================
function normalizeProducts(products) {
    const usedCodes =
        getUsedProductCodes(products);
    let changed = false;
    products.forEach((product, index) => {
// ----------------------------------------------------
// ID
// ----------------------------------------------------
        if (!product.id) {
            product.id = index + 1;
            changed = true;
        }
// ----------------------------------------------------
// НАЗВАНИЕ
// ----------------------------------------------------
        if (!product.title) {
            product.title =
                product['Название_позиции'] ||
                product['Название_позиции_укр'] ||
                product['Назва'] ||
                product['Title'] ||
                'Без назви';
            changed = true;
        }
// ----------------------------------------------------
// ПРОИЗВОДИТЕЛЬ
// ----------------------------------------------------
        const manufacturer =
            String(
                product.Производитель ||
                product.brand ||
                'Не вказано'
            ).trim();
        if (
            !product.Производитель ||
            product.Производитель !== manufacturer
        ) {
            product.Производитель =
                manufacturer || 'Не вказано';
            changed = true;
        }
        if (
            !product.brand ||
            product.brand !== product.Производитель
        ) {
            product.brand =
                product.Производитель;
            changed = true;
        }
// ----------------------------------------------------
// КОД ТОВАРА
// ----------------------------------------------------
        let code = String(
            product.productCode ||
            product.Код_товара ||
            ''
        ).trim();
        if (
            !/^\d{8}$/.test(code) ||
            usedCodes.has(code) &&
            !products.some(
                p =>
                    p !== product &&
                    (
                        p.productCode === code ||
                        p.Код_товара === code
                    )
            )
        ) {
            if (!/^\d{8}$/.test(code)) {
                code =
                    generateProductCode(
                        usedCodes
                    );
                changed = true;
            }
        }
        product.productCode = code;
        product.Код_товара = code;
// ----------------------------------------------------
// ЦЕНА
// ----------------------------------------------------
        if (
            product.price === undefined
        ) {
            product.price = 0;
            changed = true;
        }
// ----------------------------------------------------
// НАЛИЧИЕ
// ----------------------------------------------------
        if (
            product.inStock === undefined
        ) {
            product.inStock = true;
            changed = true;
        }
// ----------------------------------------------------
// ОПЛАТА
// ----------------------------------------------------
        if (!product.payments) {
            product.payments = {
                online: true,
                cash: true,
                account: true
            };
            changed = true;
        } else {
            if (
                product.payments.online === undefined
            ) {
                product.payments.online = true;
                changed = true;
            }
            if (
                product.payments.cash === undefined
            ) {
                product.payments.cash = true;
                changed = true;
            }
            if (
                product.payments.account === undefined
            ) {
                product.payments.account = true;
                changed = true;
            }
        }
// ----------------------------------------------------
// ДОСТАВКА
// ----------------------------------------------------
        if (!product.deliveries) {
            product.deliveries = {
                courier: true,
                branch: true,
                postomat: true,
                pickup: true
            };
            changed = true;
        } else {
            if (
                product.deliveries.courier === undefined
            ) {
                product.deliveries.courier = true;
                changed = true;
            }
            if (
                product.deliveries.branch === undefined
            ) {
                product.deliveries.branch = true;
                changed = true;
            }
            if (
                product.deliveries.postomat === undefined
            ) {
                product.deliveries.postomat = true;
                changed = true;
            }
            if (
                product.deliveries.pickup === undefined
            ) {
                product.deliveries.pickup = true;
                changed = true;
            }
        }
    });
    if (changed) {
        writeProducts(products);
    }
    return products;
}
// ============================================================
// ТЕСТ
// ============================================================
app.get('/api/test', (req, res) => {
    const products =
        normalizeProducts(
            readProducts()
        );
    res.json({
        success: true,
        message:
            'Сервер работает',
        productsFile:
        DATA_FILE,
        productsExists:
            fs.existsSync(DATA_FILE),
        productsCount:
        products.length
    });
});
// ============================================================
// LOGIN
// ============================================================
app.post('/api/login', (req, res) => {
    const {
        username,
        password
    } = req.body;
    if (
        username ===
        ADMIN_CREDENTIALS.username &&
        password ===
        ADMIN_CREDENTIALS.password
    ) {
        return res.json({
            success: true
        });
    }
    res.json({
        success: false,
        error:
            'Невірний логін або пароль'
    });
});
// ============================================================
// ПОЛУЧИТЬ ТОВАРЫ
// ============================================================
app.get('/api/products', (req, res) => {
    try {
        let products =
            readProducts();
        products =
            normalizeProducts(
                products
            );
        res.json(
            products
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error:
                'Не вдалося отримати товари'
        });
    }
});
// ============================================================
// НАСТРОЙКИ ТОВАРОВ
// ============================================================
app.post(
    '/api/products/config',
    (req, res) => {
        try {
            let products =
                readProducts();
            products =
                normalizeProducts(
                    products
                );
            const updates =
                Array.isArray(
                    req.body.updates
                )
                    ? req.body.updates
                    : [];
            let updated = 0;
            updates.forEach(update => {
                const updateCode =
                    String(
                        update.code ||
                        update.productCode ||
                        update.Код_товара ||
                        ''
                    ).trim();
                const product =
                    products.find(
                        item =>
                            String(
                                item.productCode ||
                                item.Код_товара ||
                                ''
                            ) ===
                            updateCode
                    );
                if (!product) {
                    return;
                }
// -----------------------------
// НАЛИЧИЕ
// -----------------------------
                if (
                    update.inStock !== undefined
                ) {
                    product.inStock =
                        !!update.inStock;
                }
// -----------------------------
// ОПЛАТА
// -----------------------------
                if (
                    update.payments
                ) {
                    product.payments = {
                        online:
                            update.payments.online !== false,
                        cash:
                            update.payments.cash !== false,
                        account:
                            update.payments.account !== false
                    };
                }
// -----------------------------
// ДОСТАВКА
// -----------------------------
                if (
                    update.deliveries
                ) {
                    product.deliveries = {
                        courier:
                            update.deliveries.courier !== false,
                        branch:
                            update.deliveries.branch !== false,
                        postomat:
                            update.deliveries.postomat !== false,
                        pickup:
                            update.deliveries.pickup !== false
                    };
                }
                updated++;
            });
            writeProducts(
                products
            );
            res.json({
                success: true,
                updated:
                updated
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({
                success: false,
                error:
                    'Не вдалося зберегти налаштування'
            });
        }
    }
);
// ============================================================
// МАССОВОЕ УДАЛЕНИЕ
// ============================================================
app.post(
    '/api/products/delete',
    (req, res) => {
        try {
            const codes =
                Array.isArray(
                    req.body.codes
                )
                    ? req.body.codes
                        .map(
                            code =>
                                String(code).trim()
                        )
                        .filter(Boolean)
                    : [];
            if (!codes.length) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Не вибрано товари'
                });
            }
// Убираем дубли кодов
            const codeSet =
                new Set(codes);
// Читаем АКТУАЛЬНЫЕ товары
            let products =
                readProducts();
// Нормализуем товары
            products =
                normalizeProducts(
                    products
                );
            const before =
                products.length;
// Удаляем выбранные товары
            products =
                products.filter(
                    product => {
                        const code =
                            String(
                                product.productCode ||
                                product.Код_товара ||
                                ''
                            ).trim();
                        return !codeSet.has(
                            code
                        );
                    }
                );
            const deleted =
                before -
                products.length;
// Если товары не найдены
            if (deleted === 0) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Вибрані товари не знайдені на сервері',
                    requested:
                    codes.length,
                    deleted: 0
                });
            }
// СОХРАНЯЕМ ИЗМЕНЕНИЯ
// В РЕАЛЬНЫЙ products.json
            const saved =
                writeProducts(
                    products
                );
            if (!saved) {
                return res.status(500).json({
                    success: false,
                    error:
                        'Не вдалося зберегти products.json'
                });
            }
            console.log('');
            console.log(
                '=========================================='
            );
            console.log(
                'ТОВАРЫ УДАЛЕНЫ С СЕРВЕРА'
            );
            console.log(
                'Запрошено:',
                codes.length
            );
            console.log(
                'Удалено:',
                deleted
            );
            console.log(
                'Осталось:',
                products.length
            );
            console.log(
                '=========================================='
            );
            console.log('');
            res.json({
                success: true,
                deleted:
                deleted,
                remaining:
                products.length
            });
        } catch (error) {
            console.error(
                'Ошибка удаления товаров:',
                error
            );
            res.status(500).json({
                success: false,
                error:
                    'Помилка видалення товарів'
            });
        }
    }
);
// ============================================================
// ОФОРМЛЕНИЕ ЗАКАЗА -> TELEGRAM
// ============================================================
app.post('/api/order', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            phone,
            delivery,
            deliveryDetails,
            payment,
            cart
        } = req.body;
        if (!firstName || !lastName || !phone || !payment) {
            return res.status(400).json({
                success: false,
                error: 'Не заполнены обязательные данные'
            });
        }
        if (!Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Корзина пуста'
            });
        }
// Считаем сумму товаров на сервере.
// deliveryFee из сайта специально НЕ включаем,
// чтобы "Разом до сплати" соответствовало стоимости товаров.
        const subtotal = cart.reduce((sum, item) => {
            const quantity = Number(item.quantity) || 1;
            const price = Number(item.price) || 0;
            return sum + (price * quantity);
        }, 0);
        const formatMoney = value =>
            Number.isInteger(value)
                ? String(value)
                : value.toFixed(2);
        const productsText = cart.map((item, index) => {
            const name = item.title || item.name || 'Товар';
            const code =
                item.productCode ||
                item.Код_товара ||
                item.code ||
                '';
            const quantity = Number(item.quantity) || 1;
            const price = Number(item.price) || 0;
            const codeText = code ? ` — ${code}` : '';
            return (
                `${index + 1}. ${name}${codeText} — ` +
                `${quantity} шт. × ${formatMoney(price)} ₴`
            );
        }).join('\n');
        const deliveryText = delivery || 'Не вказано';
        const deliveryDetailsText =
            deliveryDetails || 'Не вказано';
        const paymentText = payment || 'Не вказано';
        const message = `
􀀀 Нове замовлення!
􀀀 Клієнт: ${lastName} ${firstName}
􀀀 Телефон: ${phone}
􀀀 Доставка: ${deliveryText}
􀀀 Відділення/Адреса: ${deliveryDetailsText}
􀀀 Оплата: ${paymentText}
􀀀 Товари:
${productsText}
􀀀 Разом до сплати: ${formatMoney(subtotal)} ₴
􀀀 Час: ${new Date().toLocaleString('uk-UA', {
            timeZone: 'Europe/Warsaw'
        })}
`.trim();
        await sendTelegramMessage(message);
        console.log('');
        console.log('==========================================');
        console.log('НОВЫЙ ЗАКАЗ ОТПРАВЛЕН В TELEGRAM');
        console.log(`Клиент: ${lastName} ${firstName}`);
        console.log(`Телефон: ${phone}`);
        console.log(`Доставка: ${deliveryText}`);
        console.log(`Адрес/отделение: ${deliveryDetailsText}`);
        console.log(`Оплата: ${paymentText}`);
        console.log(`Сумма товаров: ${formatMoney(subtotal)} ₴`);
        console.log('==========================================');
        console.log('');
        res.json({
            success: true,
            message: 'Заказ успешно оформлен'
        });
    } catch (error) {
        console.error('Ошибка оформления заказа:', error);
        res.status(500).json({
            success: false,
            error: 'Не удалось отправить заказ'
        });
    }
});
// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});