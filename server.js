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

const API_BASE = 'https://cdn2.mjunoon.tv:9191/v2';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://www.mjunoon.tv',
  'Referer': 'https://www.mjunoon.tv/',
};

// 🔥 NAYA API: embed-player-url
app.post('/api/stream', async (req, res) => {
  const { channel } = req.body; // Yahan channel ka slug aayega (jaise abb-takk-news-live)
  
  try {
    const response = await fetch(`${API_BASE}/embed-player-url`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ slug: channel })
    });
    
    const data = await response.json();
    console.log("API Response:", data); // Debugging ke liye
    
    // API se seedha HLS link nikal rahe hain
    if (data.data && data.data.live_stream_url) {
        return res.json({ success: true, url: data.data.live_stream_url });
    }
    
    res.status(400).json({ error: "API ne stream URL nahi diya.", raw: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy (CORS aur 403 fix ke liye)
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('url required');
  
  try {
    const upstream = await fetch(url, {
      headers: { 
        'User-Agent': HEADERS['User-Agent'],
        'Referer': 'https://www.mjunoon.tv/',
        'Origin': 'https://www.mjunoon.tv',
        'Accept': '*/*'
      },
    });

    if (!upstream.ok) return res.status(upstream.status).send('upstream error: ' + upstream.status);
    
    const contentType = upstream.headers.get('content-type') || '';
    
    if (url.includes('.m3u8') || contentType.includes('mpegurl')) {
      const base = url.substring(0, url.lastIndexOf('/') + 1);
      let text = await upstream.text();
      text = text.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        return `/proxy?url=${encodeURIComponent(t.startsWith('http') ? t : new URL(t, base).href)}`;
      }).join('\n');
      res.set('Content-Type', 'application/vnd.apple.mpegurl'); 
      return res.send(text);
    }
    res.set('Content-Type', contentType || 'video/mp2t');
    upstream.body.pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

export default app;
if (process.env.NODE_ENV !== 'production') { app.listen(PORT); }
