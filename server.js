import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG = {
  API_BASE: 'https://cdn2.mjunoon.tv:9191/v2',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://www.mjunoon.tv',
  'Referer': 'https://www.mjunoon.tv/',
};

let tokenCache = { token: process.env.MJ_TOKEN || null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;
  
  const res = await fetch(`${CONFIG.API_BASE}/auth/login`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ email: "guest@mjunoon.tv", password: "123456", device_id: "web", guest: true }),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = {}; }
  
  const token = data.token || data.access_token || data?.data?.token;
  if (token) {
    tokenCache = { token, expiresAt: Date.now() + 3500000 };
    return token;
  }
  if (process.env.MJ_TOKEN) return process.env.MJ_TOKEN;
  throw new Error('Token fail');
}

app.post('/api/stream', async (req, res) => {
  const { channel, quality } = req.body;
  try {
    const token = await getToken();
    
    // API ko call kar rahe hain taake naya security token (eData) mile
    const response = await fetch(`${CONFIG.API_BASE}/streaming-url`, {
      method: 'POST',
      headers: { ...HEADERS, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ channel, quality })
    });
    
    const data = await response.json();
    
    // API se eData (token) nikal rahe hain
    const authToken = data.eData || data.data?.eData || data.token;
    
    if (authToken) {
        // Hum link khud bana rahe hain aapke diye hue format ke mutabiq (playlist.m3u8)
        let finalUrl = "";
        
        if (quality && quality.trim() !== "") {
            // Agar quality di hai (jaise 121H)
            finalUrl = `https://cdn5.mjunoon.tv:8087/web/${channel}/${quality}/playlist.m3u8?wmsAuthSign=${authToken}`;
        } else {
            // Agar quality khali hai
            finalUrl = `https://cdn5.mjunoon.tv:8087/web/${channel}/playlist.m3u8?wmsAuthSign=${authToken}`;
        }
        
        return res.json({ success: true, url: finalUrl });
    }
    
    // Agar direct url mila toh wohi bhej do
    res.json(data); 
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('url required');
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': HEADERS['User-Agent'], 'Referer': 'https://www.mjunoon.tv/' },
    });
    if (!upstream.ok) return res.status(upstream.status).send('upstream error');
    
    const contentType = upstream.headers.get('content-type') || '';
    if (url.includes('.m3u8') || contentType.includes('mpegurl')) {
      const base = url.substring(0, url.lastIndexOf('/') + 1);
      let text = await upstream.text();
      text = text.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        return `/proxy?url=${encodeURIComponent(t.startsWith('http') ? t : new URL(t, base).href)}`;
      }).join('\n');
      res.set('Content-Type', 'application/vnd.apple.mpegurl'); return res.send(text);
    }
    res.set('Content-Type', contentType || 'video/mp2t');
    upstream.body.pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

export default app;
if (process.env.NODE_ENV !== 'production') { app.listen(PORT); }
