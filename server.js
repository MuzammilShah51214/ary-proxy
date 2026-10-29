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

// ⚙️ CONFIG
const CONFIG = {
  API_BASE: 'https://cdn2.mjunoon.tv:9191/v2',
  LOGIN_EMAIL: process.env.MJ_EMAIL || 'your_email@example.com',
  LOGIN_PASSWORD: process.env.MJ_PASSWORD || 'your_password',
  MANUAL_TOKEN: process.env.MJ_TOKEN || '',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://www.mjunoon.tv',
  'Referer': 'https://www.mjunoon.tv/',
  'Accept-Language': 'en,en-US;q=0.9,ur;q=0.8',
};

let tokenCache = { token: CONFIG.MANUAL_TOKEN || null, expiresAt: 0 };

function isTokenValid() {
  return tokenCache.token && Date.now() < tokenCache.expiresAt - 60000; 
}

async function login() {
  console.log('[AUTH] Logging in...');
  const res = await fetch(`${CONFIG.API_BASE}/auth/login`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ email: CONFIG.LOGIN_EMAIL, password: CONFIG.LOGIN_PASSWORD }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${text}`);

  let data; 
  try { data = JSON.parse(text); } catch { throw new Error('Login: invalid JSON'); }
  
  const token = data.token || data.access_token || data?.data?.token || data?.data?.access_token;
  if (!token) throw new Error('Login: no token in response');

  let expiresAt = Date.now() + 3600000;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (payload.exp) expiresAt = payload.exp * 1000;
  } catch {}
  
  tokenCache = { token, expiresAt };
  console.log('[AUTH] Token acquired successfully');
  return token;
}

async function getToken() {
  if (isTokenValid()) return tokenCache.token;
  return await login();
}

async function apiCall(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${CONFIG.API_BASE}${path}`, {
    ...options,
    headers: { ...HEADERS, 'Authorization': `Bearer ${token}`, ...(options.headers || {}) },
  });
  const text = await res.text();
  let data; 
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`API ${path} failed (${res.status}): ${text}`);
  return data;
}

// 🛣️ ROUTES

app.get('/api/health', (req, res) => {
  res.json({ ok: true, tokenValid: isTokenValid() });
});

app.get('/api/channels', async (req, res) => {
  try { res.json(await apiCall('/channel-details', { method: 'GET' })); } 
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/stream', async (req, res) => {
  const { channel, quality } = req.body;
  if (!channel || !quality) return res.status(400).json({ error: 'channel and quality required' });
  try {
    res.json(await apiCall('/streaming-url', { method: 'POST', body: JSON.stringify({ channel, quality }) }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// HLS Proxy (CORS + Referer bypass)
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('url required');
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': HEADERS['User-Agent'], 'Referer': 'https://www.mjunoon.tv/', 'Origin': 'https://www.mjunoon.tv' },
    });
    if (!upstream.ok) return res.status(upstream.status).send('upstream error');
    
    const contentType = upstream.headers.get('content-type') || '';
    
    // Agar HLS playlist (.m3u8) hai toh uske andar ke links ko proxy karein
    if (url.endsWith('.m3u8') || contentType.includes('mpegurl')) {
      const base = url.substring(0, url.lastIndexOf('/') + 1);
      let text = await upstream.text();
      text = text.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) {
          if (t.includes('URI="')) {
            return t.replace(/URI="([^"]+)"/g, (_, u) => {
              const abs = u.startsWith('http') ? u : new URL(u, base).href;
              return `URI="/proxy?url=${encodeURIComponent(abs)}"`;
            });
          }
          return line;
        }
        const abs = t.startsWith('http') ? t : new URL(t, base).href;
        return `/proxy?url=${encodeURIComponent(abs)}`;
      }).join('\n');
      
      res.set('Content-Type', 'application/vnd.apple.mpegurl'); 
      return res.send(text);
    }
    
    // Video segments (.ts) ko direct pipe karein
    res.set('Content-Type', contentType || 'video/mp2t');
    upstream.body.pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

app.listen(PORT, () => { 
  console.log(`✅ Server running on port ${PORT}`); 
});
