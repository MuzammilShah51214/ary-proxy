const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'MUZAMMIL2026ARY';

// Stream URLs cache karne ke liye (Expiry: 30 mins)
const streamCache = {}; 
const CACHE_TTL = 30 * 60 * 1000; 

const CHANNELS = {
    'k7x9p2m': { name: 'ARY News',    url: 'https://live.arynews.tv/',    referer: 'https://live.arynews.tv/' },
    'q3n8z1v': { name: 'ARY News 2',  url: 'https://live.arynews.tv/',    referer: 'https://live.arynews.tv/' },
    'w5r2y9t': { name: 'ARY Musik',   url: 'https://live.arymusik.tv/',   referer: 'https://live.arymusik.tv/' },
    'a8f4h6j': { name: 'ARY Digital', url: 'https://live.arydigital.tv/', referer: 'https://live.arydigital.tv/' },
    'b2c7d9e': { name: 'ARY Zindagi', url: 'https://live.aryzindagi.tv/', referer: 'https://live.aryzindagi.tv/' },
    'm4k8n2p': { name: 'ARY Qtv',     url: 'https://live.aryqtv.tv/',     referer: 'https://live.aryqtv.tv/' }
};

async function fetchFreshUrl(channelKey) {
    const channel = CHANNELS[channelKey];
    if (!channel) return null;

    // Check if valid cached URL exists
    const cached = streamCache[channelKey];
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log(`⚡ [CACHE HIT] Fast loading for ${channel.name}`);
        return cached.url;
    }

    console.log(`🔍 Fetching fresh URL via Puppeteer for ${channel.name}...`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

        // OPTIMIZATION: Images, Stylesheets aur Fonts block karke page fast load karein
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        let m3u8Url = null;

        page.on('request', (req) => {
            const url = req.url();
            if (url.includes('.m3u8')) {
                if (!m3u8Url || url.includes('main.m3u8') || url.includes('playlist.m3u8') || url.includes('master.m3u8')) {
                    m3u8Url = url;
                }
            }
        });

        await page.goto(channel.url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 15000 
        });

        // Maximum 8 seconds wait time
        for (let i = 0; i < 8; i++) {
            await new Promise(r => setTimeout(r, 1000));
            if (m3u8Url) break;
        }

        if (m3u8Url) {
            console.log(`✅ Fresh URL Captured: ${m3u8Url.substring(0, 80)}...`);
            // Cache in memory
            streamCache[channelKey] = {
                url: m3u8Url,
                timestamp: Date.now()
            };
            return m3u8Url;
        } else {
            console.log(`❌ No m3u8 URL found for ${channel.name}`);
            return null;
        }

    } catch (err) {
        console.error(`❌ Browser Error: ${err.message}`);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'ARY Proxy running fast' });
});

app.get('/:code', async (req, res, next) => {
    const code = req.params.code.replace(/\.m3u8$/i, '');
    const channel = CHANNELS[code];
    
    if (!channel) return next();

    const providedKey = req.query.key;
    if (!providedKey || providedKey !== SECRET_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const channelUrl = await fetchFreshUrl(code);
    
    if (!channelUrl) {
        return res.status(503).json({ 
            error: 'Stream unavailable',
            channel: channel.name
        });
    }

    try {
        const response = await axios.get(channelUrl, {
            headers: {
                'Referer': channel.referer,
                'Origin': new URL(channel.referer).origin,
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': '*/*'
            },
            responseType: 'arraybuffer',
            timeout: 10000,
            maxRedirects: 5
        });

        const contentType = response.headers['content-type'] || 'application/vnd.apple.mpegurl';
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');

        let text = Buffer.from(response.data).toString('utf-8');
        const baseUrl = channelUrl.substring(0, channelUrl.lastIndexOf('/') + 1);
        const proxyBase = `https://${req.get('host')}/proxy`;

        text = text.split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const fullUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
                return `${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(channel.referer)}&key=${SECRET_KEY}`;
            }
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                const fullUrl = uri.startsWith('http') ? uri : baseUrl + uri;
                return `URI="${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(channel.referer)}&key=${SECRET_KEY}"`;
            });
        }).join('\n');

        res.send(text);
    } catch (err) {
        console.error(`❌ Proxy error: ${err.message}`);
        // Clear cache if stream fails
        delete streamCache[code];
        res.status(500).json({ error: err.message });
    }
});

app.get('/proxy', async (req, res) => {
    const providedKey = req.query.key;
    if (providedKey && providedKey !== SECRET_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const targetUrl = req.query.url;
    const referer = req.query.referer || 'https://live.arynews.tv/';

    if (!targetUrl) return res.status(400).json({ error: 'url required' });

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'Referer': referer,
                'Origin': new URL(referer).origin,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*'
            },
            responseType: 'arraybuffer',
            timeout: 10000,
            maxRedirects: 5
        });

        const contentType = response.headers['content-type'] || 'application/octet-stream';
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');

        let data = response.data;

        if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
            let text = Buffer.from(data).toString('utf-8');
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
            const proxyBase = `https://${req.get('host')}/proxy`;

            text = text.split('\n').map(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const fullUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
                    return `${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}&key=${SECRET_KEY}`;
                }
                return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                    const fullUrl = uri.startsWith('http') ? uri : baseUrl + uri;
                    return `URI="${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}&key=${SECRET_KEY}"`;
                });
            }).join('\n');

            return res.send(text);
        }

        res.send(data);
    } catch (err) {
        console.error('Proxy error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ ARY Proxy running on port ${PORT}`);
});
