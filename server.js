const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const DEFAULT_REFERER = 'https://aryzap.com/';

// Home route - test ke liye
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'ARY Proxy is running',
        usage: '/proxy?url=ENCODED_URL&referer=https://aryzap.com/'
    });
});

// Main proxy route
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    const referer = req.query.referer || DEFAULT_REFERER;

    if (!targetUrl) {
        return res.status(400).json({ error: 'url parameter required' });
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'Referer': referer,
                'Origin': new URL(referer).origin,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            responseType: 'arraybuffer',
            timeout: 30000,
            maxRedirects: 5
        });

        const contentType = response.headers['content-type'] || 'application/octet-stream';
        res.set('Content-Type', contentType);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Headers', '*');

        let data = response.data;

        // Agar M3U8 file hai to andar ke URLs bhi proxy karein
        if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegURL')) {
            let text = Buffer.from(data).toString('utf-8');
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
            const proxyBase = `${req.protocol}://${req.get('host')}/proxy`;

            text = text.split('\n').map(line => {
                const trimmed = line.trim();
                
                // Non-comment lines = segment URLs
                if (trimmed && !trimmed.startsWith('#')) {
                    const fullUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
                    return `${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}`;
                }
                
                // Comment lines mein URI="..." ko bhi replace karein (keys, maps etc)
                return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                    const fullUrl = uri.startsWith('http') ? uri : baseUrl + uri;
                    return `URI="${proxyBase}?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}"`;
                });
            }).join('\n');

            return res.send(text);
        }

        // Normal response (TS segments, keys etc)
        res.send(data);
    } catch (err) {
        console.error('Proxy error:', err.message);
        res.status(500).json({ 
            error: err.message,
            url: targetUrl 
        });
    }
});

app.listen(PORT, () => {
    console.log(`✅ ARY Proxy running on port ${PORT}`);
    console.log(`📡 Test: http://localhost:${PORT}/`);
});
