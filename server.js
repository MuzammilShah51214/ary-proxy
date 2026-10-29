// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const MJ_API = 'https://cdn2.mjunoon.tv:9191';
let token = null;
let expiry = 0;

// ✅ FIX 1: Railway ka dynamic PORT use karo
const PORT = process.env.PORT || 3000;

// ✅ FIX 2: Health check (Railway iske bina bhi crash karta hai)
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'mjunoon-proxy', time: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, hasToken: !!token, tokenExpiry: expiry });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    
    const r = await axios.post(`${MJ_API}/v2/auth/login`, { email, password }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.mjunoon.tv',
        'Referer': 'https://www.mjunoon.tv/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
      },
      timeout: 15000  // ✅ FIX 3: Timeout add karo
    });
    
    token = r.data.token || r.data.access_token;
    expiry = Date.now() + (r.data.expires_in || 3600) * 1000;
    res.json({ ok: true, expires_in: r.data.expires_in || 3600 });
  } catch(e) {
    console.error('Login error:', e.message);
    res.status(500).json({ 
      error: e.message,
      detail: e.response?.data,
      status: e.response?.status
    });
  }
});

// Channel list
app.get('/api/channels', async (req, res) => {
  try {
    if (!token) return res.status(401).json({ error: 'Login required' });
    
    const r = await axios.get(`${MJ_API}/v2//channel-types`, {
      headers: {
        'Authorization': `bearer ${token}`,
        'Origin': 'https://www.mjunoon.tv',
        'Referer': 'https://www.mjunoon.tv/'
      },
      timeout: 15000
    });
    res.json(r.data);
  } catch(e) {
    console.error('Channels error:', e.message);
    res.status(500).json({ error: e.message, detail: e.response?.data });
  }
});

// Stream URL
app.post('/api/stream-url', async (req, res) => {
  try {
    if (!token) return res.status(401).json({ error: 'Login required' });
    
    const r = await axios.post(`${MJ_API}/v2/streaming-url`, req.body, {
      headers: {
        'Authorization': `bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin': 'https://www.mjunoon.tv',
        'Referer': 'https://www.mjunoon.tv/'
      },
      timeout: 15000
    });
    res.json(r.data);
  } catch(e) {
    console.error('Stream URL error:', e.message);
    res.status(500).json({ error: e.message, detail: e.response?.data });
  }
});

// HLS proxy (CORS + Origin headers)
app.get('/hls/*', async (req, res) => {
  try {
    // req.params[0] path capture karta hai
    const path = req.params[0] || '';
    const url = 'https://cdn5.mjunoon.tv:8087/' + path;
    
    const r = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'Origin': 'https://www.mjunoon.tv',
        'Referer': 'https://www.mjunoon.tv/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    res.set('Content-Type', r.headers['content-type'] || 'application/octet-stream');
    res.set('Access-Control-Allow-Origin', '*');
    r.data.pipe(res);
  } catch(e) {
    console.error('HLS error:', e.message);
    res.status(500).send('HLS proxy error: ' + e.message);
  }
});

// ✅ FIX 4: 0.0.0.0 par bind karo (Railway ke liye zaroori)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
