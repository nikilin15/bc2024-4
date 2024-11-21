const http = require('http');
const { Command } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const superagent = require('superagent');

const program = new Command();
program
    .requiredOption('-h, --host <host>', 'server host')
    .requiredOption('-p, --port <port>', 'server port')
    .requiredOption('-c, --cache <cache>', 'cache directory path');

program.parse(process.argv);

const options = program.opts();
const host = options.host;
const port = options.port;
const cacheDir = options.cache;

// Функція для перевірки існування директорії
async function checkCacheDirectory() {
    const stat = await fs.stat(cacheDir).catch(() => null);
    if (!stat || !stat.isDirectory()) {
        console.error(`Помилка: Директорія для кешу не існує: ${cacheDir}`);
        process.exit(1);
    }
}

// Обробник запитів
const requestListener = async function (req, res) {
    // res.end("My server with images")
    const urlPath = req.url.slice(1); // Видаляємо перший слеш '/'
    const code = parseInt(urlPath, 10); // Перетворюємо шлях на число
    const filePath = path.join(cacheDir, `${code}.jpg`); // Формуємо шлях до файлу

    if (isNaN(code)) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Welcome to server');
        return;
    }

    if (req.method === 'GET') {
        try {
            // Спробуємо прочитати картинку з кешу
            const image = await fs.readFile(filePath);
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(image);
        } catch (error) {
            if (error.code === 'ENOENT') { // Якщо файл не знайдено
                try {
                    // Скачати картинку з http.cat
                    const response = await superagent.get(`https://http.cat/${code}`).responseType('buffer');
                    const imageBuffer = response.body;

                    // Записати в кеш
                    await fs.writeFile(filePath, imageBuffer);
                    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                    res.end(imageBuffer);
                } catch (fetchError) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not Found');
                }
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        }
    } else if (req.method === 'PUT') {
        try {
            const data = [];
            req.on('data', chunk => data.push(chunk));
            req.on('end', async () => {
                const imageBuffer = Buffer.concat(data);
                await fs.writeFile(filePath, imageBuffer);
                res.writeHead(201, { 'Content-Type': 'text/plain' });
                res.end('Created');
            });
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    } else if (req.method === 'DELETE') {
        try {
            await fs.unlink(filePath);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Deleted');
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        }
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
    }
};

// Спершу перевіряємо наявність директорії для кешу, а потім запускаємо сервер
checkCacheDirectory().then(() => {
    const server = http.createServer(requestListener);

    server.listen(port, host, () => {
        console.log(`Server is running on http://${host}:${port}`);
        console.log(`Host: ${host}`);
        console.log(`Port: ${port}`);
        console.log(`Cache: ${cacheDir}`);
    });
});
