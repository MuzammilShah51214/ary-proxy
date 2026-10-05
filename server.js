const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// 🔐 SECURITY KEY
const SECRET_KEY = 'MUZAMMIL2026ARY';

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
                '--autoplay-policy=no-user-gesture-required'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

        // Har request ko capture karein
        let m3u8Url = null;
        let allUrls = [];
        
        page.on('request', (req) => {
            const url = req.url();
            if (url.includes('.m3u8')) {
                allUrls.push(url);
                // Har pattern capture karein
                if (!m3u8Url) {
                    m3u8Url = url;
                }
                // Main playlist ko prefer karein
                if (url.includes('main.m3u8') || url.includes('playlist.m3u8') || url.includes('master.m3u8')) {
                    m3u8Url = url;
                }
            }
        });

        console.log(`🌐 Opening ${channel.url}...`);
        await page.goto(channel.url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });

        // Page load hone ka wait
        await new Promise(r => setTimeout(r, 2000));

        // Page ko scroll karein
        try {
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight / 2);
            });
        } catch (e) {}

        // Videos aur buttons play karne ki koshish
        try {
            await page.evaluate(() => {
                // Saari videos play karein
                document.querySelectorAll('video').forEach(v => {
                    v.muted = true;
                    v.play().catch(() => {});
                });
                
                // Play buttons dhoondein
                const buttons = document.querySelectorAll('button, [role="button"], .play, .play-button, [class*="play"]');
                buttons.forEach(b => {
                    try {
                        const text = (b.textContent || '').toLowerCase();
                        if (text.includes('play') || text === '') {
                            b.click();
                        }
                    } catch (e) {}
                });
            });
        } catch (e) {}

        // 25 second tak wait karein (zyada time)
        console.log(`⏳ Waiting up to 25s for m3u8 URL...`);
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 1000));
            if (m3u8Url) break;
            
            // Har 5 second baad phir se try karein
            if (i % 5 === 4) {
                try {
                    await page.evaluate(() => {
                        document.querySelectorAll('video').forEach(v => {
                            v.muted = true;
                            v.play().catch(() => {});
                        });
                    });
                } catch (e) {}
            }
        }

        if (m3u8Url) {
            console.log(`✅ Got URL: ${m3u8Url.substring(0, 100)}...`);
            return m3u8Url;
        } else {
            console.log(`❌ No m3u8 URL for ${channel.name}`);
            console.log(`   URLs captured: ${allUrls.length}`);
            return null;
        }

    } catch (err) {
        console.error(`❌ Error: ${err.message}`);
        return null;
    } finally {
        if (browser) await browser.close();
    }
}

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'ARY Proxy running' });
});

app.get('/:code', async (req, res, next) => {
    const code = req.params.code.replace(/\.m3u8$/i, '');
    const channel = CHANNELS[code];
    
    if (!channel) return next();

    const providedKey = req.query.key;
    if (!providedKey || providedKey !== SECRET_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    console.log(`✅ Request: ${channel.name}`);
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
            timeout: 30000,
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
        res.status(500).json({ error: err.message });
    }
});

app.get('/proxy', async (req, res) => {
    const providedKey = req.query.key;
    if (providedKey && providedKey !== SECRET_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const targetUrl = req.query.url;
    const referer = req.query.referer || 'https://aryzap.com/';

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
    console.log(`✅ ARY Proxy on port ${PORT}`);
    console.log(`🔐 Key: ${SECRET_KEY}`);
    console.log(`🔒 HTTPS enforced`);
});
