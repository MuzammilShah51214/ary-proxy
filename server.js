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
  // Vercel mein agar purana token dala hai to usko bhi try karega
  MANUAL_TOKEN: process.env.MJ_TOKEN || '', 
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://www.mjunoon.tv',
  'Referer': 'https://www.mjunoon.tv/',
};

let tokenCache = { token: CONFIG.MANUAL_TOKEN || null, expiresAt: 0 };

function isTokenValid() {
  return tokenCache.token && Date.now() < tokenCache.expiresAt - 60000; 
}

// 🔥 NAYA TAREEQA: Bina email/password ke API se token maangna
async function getFreshToken() {
  console.log('[AUTH] Requesting guest token from mjunoon API...');
  
  try {
    // Mjunoon.tv aam tor par guest login ke liye device_id ya guest flag use karta hai
    const res = await fetch(`${CONFIG.API_BASE}/auth/login`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ 
        email: "guest@mjunoon.tv", // Dummy email
        password: "123456",
        device_id: "web_guest_" + Math.floor(Math.random() * 100000),
        guest: true 
      }),
    });

    const text = await res.text();
    let data; 
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    
    // Token kahan mil raha hai check karein
    const token = data.token || data.access_token || data?.data?.token || data?.data?.access_token;
    
    if (token) {
      console.log('[AUTH] Success! Token auto-generated.');
      let expiresAt = Date.now() + 3600000;
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        if (payload.exp) expiresAt = payload.exp * 1000;
      } catch {}
      tokenCache = { token, expiresAt };
      return token;
    } else {
      console.log('[AUTH] Auto-login failed, trying fallback...');
      throw new Error('Auto-login failed');
    }
  } catch (e) {
    console.error('[AUTH] Error:', e.message);
    // Agar fail ho jaye to Vercel wala token use karega
    if (CONFIG.MANUAL_TOKEN) return CONFIG.MANUAL_TOKEN;
    throw new Error('Could not generate token. Please update MJ_TOKEN in Vercel.');
  }
}

async function getToken() {
  if (isTokenValid()) return tokenCache.token;
  return await getFreshToken();
}

async function apiCall(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${CONFIG.API_BASE}${path}`, {
    ...options,
    headers: { ...HEADERS, 'Authorization': `Bearer ${token}`, ...(options.headers || {}) },
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`API Error (${res.status}): ${text.slice(0, 100)}`);
  return data;
}

// ROUTES
app.post('/api/stream', async (req, res) => {
  const { channel, quality } = req.body;
  if (!channel || !quality) return res.status(400).json({ error: 'channel and quality required' });
  try {
    // Agar aapke channels ke naam galat hain to yahan error aayega
    const response = await apiCall('/streaming-url', { 
        method: 'POST', 
        body: JSON.stringify({ channel, quality }) 
    });
    res.json(response);
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
      headers: { 'User-Agent': HEADERS['User-Agent'], 'Referer': 'https://www.mjunoon.tv/', 'Origin': 'https://www.mjunoon.tv' },
    });
    if (!upstream.ok) return res.status(upstream.status).send('upstream error');
    
    const contentType = upstream.headers.get('content-type') || '';
    if (url.endsWith('.m3u8') || contentType.includes('mpegurl')) {
      const base = url.substring(0, url.lastIndexOf('/') + 1);
      let text = await upstream.text();
      text = text.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) {
          if (t.includes('URI="')) return t.replace(/URI="([^"]+)"/g, (_, u) => `URI="/proxy?url=${encodeURIComponent(u.startsWith('http') ? u : new URL(u, base).href)}"`);
          return line;
        }
        return `/proxy?url=${encodeURIComponent(t.startsWith('http') ? t : new URL(t, base).href)}`;
      }).join('\n');
      res.set('Content-Type', 'application/vnd.apple.mpegurl'); return res.send(text);
    }
    res.set('Content-Type', contentType || 'video/mp2t');
    upstream.body.pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => { console.log(`✅ Local Server running on port ${PORT}`); });
}
