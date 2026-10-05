const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// ARY Channels Configuration
const CHANNELS = {
    'k7x9p2m': { name: 'ARY News', url: 'https://live.arynews.tv/' },
    'q3n8z1v': { name: 'ARY News 2', url: 'https://live.arynews.tv/' },
    'w5r2y9t': { name: 'ARY Musik', url: 'https://live.arymusik.tv/' },
    'a8f4h6j': { name: 'ARY Digital', url: 'https://live.arydigital.tv/' },
    'b2c7d9e': { name: 'ARY Zindagi', url: 'https://live.aryzindagi.tv/' }
};

// 🎯 Puppeteer se FRESH m3u8 URL nikalna (real-time)
async function fetchFreshUrl(channelKey) {
    const channel = CHANNELS[channelKey];
    if (!channel) return null;

    console.log(`🔍 Fetching fresh URL for ${channel.name}...`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });

        const page = await browser.newPage();
        
        // Mobile UA (ARY mobile ko prefer karta hai)
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

        // m3u8 requests capture karein
        let m3u8Url = null;
        page.on('request', (req) => {
            const url = req.url();
            if (url.includes('.m3u8')) {
                // Prefer main.m3u8 (master playlist)
                if (!m3u8Url || url.includes('main.m3u8')) {
                    m3u8Url = url;
                    console.log(`   📡 Captured: ${url.substring(0, 90)}...`);
                }
            }
        });

        console.log(`🌐 Opening ${channel.url}...`);
        await page.goto(channel.url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 25000 
        });

        // Video auto-play karne ki koshish
        try {
            await page.evaluate(() => {
                const videos = document.querySelectorAll('video');
                videos.forEach(v => {
                    v.muted = true;
                    v.play().catch(() => {});
                });
            });
        } catch (e) {}

        // Max 10 second wait for m3u8
        console.log(`⏳ Waiting for m3u8 URL...`);
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 800));
            if (m3u8Url) break;
        }

        if (m3u8Url) {
            console.log(`✅ Got URL for ${channel.name}`);
            return m3u8Url;
        } else {
            console.log(`❌ No m3u8 URL found for ${channel.name}`);
            return null;
        }

    } catch (err) {
        console.error(`❌ Error fetching ${channelKey}:`, err.message);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

// Home route
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'ARY Proxy with real-time Puppeteer fetch',
        channels: Object.keys(CHANNELS)
    });
});

// 🎯 Short route: /b2c7d9e.m3u8 — HAR REQUEST PE FRESH URL
app.get('/:code', async (req, res, next) => {
    const code = req.params.code.replace(/\.m3u8$/i, '');
    const channel = CHANNELS[code];
    
    if (!channel) return next();

    // 🔥 HAR BAAR FRESH URL NIKALO (no cache)
    console.log(`📡 Request received for ${channel.name}`);
    const channelUrl = await fetchFreshUrl(code);
    
    if (!channelUrl) {
        return res.status(503).json({ 
            error: 'Stream temporarily unavailable. Try again in 30 seconds.',
            channel: channel.name
        });
    }

    try {
        const response = await axios.get(channelUrl, {
            headers: {
                'Referer': 'https://live.arydigital.tv/',
                'Origin': 'https://live.arydigital.tv',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': '*/*'
            },
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5
        });

        const contentType = response.headers['content-type'] || 'application/vnd.apple.mpegurl';
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');

        let text = Buffer.from(response.data).toString('utf-8');
        const baseUrl = channelUrl.substring(0, channelUrl.lastIndexOf('/') + 1);
        const proxyBase = `${req.protocol}://${req.get('host')}/proxy`;
        const referer = 'https://live.arydigital.tv/';

        text = text.split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const fullUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
                return `${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}`;
            }
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                const fullUrl = uri.startsWith('http') ? uri : baseUrl + uri;
                return `URI="${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}"`;
            });
        }).join('\n');

        res.send(text);
    } catch (err) {
        console.error(`❌ Proxy error for ${channel.name}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// Generic proxy route (m3u8 segments, keys etc)
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    const referer = req.query.referer || 'https://aryzap.com/';

    if (!targetUrl) {
        return res.status(400).json({ error: 'url parameter required' });
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'Referer': referer,
                'Origin': new URL(referer).origin,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*'
            },
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5
        });

        const contentType = response.headers['content-type'] || 'application/octet-stream';
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');

        let data = response.data;

        if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
            let text = Buffer.from(data).toString('utf-8');
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
            const proxyBase = `${req.protocol}://${req.get('host')}/proxy`;

            text = text.split('\n').map(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const fullUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
                    return `${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}`;
                }
                return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                    const fullUrl = uri.startsWith('http') ? uri : baseUrl + uri;
                    return `URI="${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}"`;
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

// Server start
app.listen(PORT, async () => {
    console.log(`✅ ARY Proxy running on port ${PORT}`);
    console.log(`🚀 Real-time Puppeteer mode enabled`);
    console.log(`📡 No caching — har request pe fresh URL`);
});
