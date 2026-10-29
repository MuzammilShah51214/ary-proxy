import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const API_BASE = 'https://cdn2.mjunoon.tv:9191/v2';

// 1. API Headers (Login aur Stream URL lene ke liye)
const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Origin': 'https://www.mjunoon.tv',
  'Referer': 'https://www.mjunoon.tv/',
};

// 2. Stream Headers (Cookies ke sath taake CDN server error na de)
const STREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en,en-US;q=0.9,ur;q=0.8',
  'Origin': 'https://www.mjunoon.tv',
  'Referer': 'https://www.mjunoon.tv/',
  'Cookie': '_gcl_au=1.1.855322586.1793195906; _ga=GA1.2.1664054803.1783110302; _gid=GA1.2.245151655.1793195907; __gads=ID=d54de9c54bb73e57:T=1783110349:RT=1793195951:S=ALNI_MYxSIjIj_xIzvWeYY2JL9PDqEnSmQ; __gpi=UID=000013e7011dc9b4:T=1783110349:RT=1793195951:S=ALNI_MZEl8NFDCRdVWJ1mSMqb-BiuiN-Bg; __eoi=ID=7b303874d066ae67:T=1783110349:RT=1793195951:S=AA-AfjZ-uRMZ53XjDYS6Y9PTrOXF'
};

let tokenCache = { token: null, expiresAt: 0 };

// Function: Guest Token fetch karna (Cache ke sath)
async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;
  
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: API_HEADERS,
    body: JSON.stringify({ email: "guest@mjunoon.tv", password: "123456", device_id: "web", guest: true }),
  });
  const data = await res.json();
  const token = data.token || data.access_token || data?.data?.token;
  
  if (token) {
    tokenCache = { token, expiresAt: Date.now() + 3500000 };
    return token;
  }
  throw new Error('Token fail');
}

// API Route: Stream URL generate karna (/streaming-url)
app.post('/api/stream', async (req, res) => {
  const { channel, quality } = req.body;
  if (!channel || !quality) {
    return res.status(400).json({ success: false, error: 'Channel and quality are required' });
  }

  try {
    const token = await getToken();
    
    const response = await fetch(`${API_BASE}/streaming-url`, {
      method: 'POST',
      headers: { ...API_HEADERS, 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ channel, quality })
    });
    
    const data = await response.json();
    const authToken = data.eData || data.data?.eData || data.token;
    
    if (authToken) {
        const finalUrl = `https://cdn5.mjunoon.tv:8087/web/${channel}/live/${quality}/chunks.m3u8?wmsAuthSign=${authToken}`;
        return res.json({ success: true, url: finalUrl });
    }
    
    res.json(data); 
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy Route: CORS bypass aur m3u8/ts chunks load karne ke liye
app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('url required');
  
  try {
    const upstream = await fetch(url, {
      headers: STREAM_HEADERS
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send('upstream error: ' + upstream.status);
    }
    
    const contentType = upstream.headers.get('content-type') || '';
    
    // Agar playlist file (.m3u8) hai to links ko rewrite karein
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
    
    // Video chunks (.ts) ke liye stream pipe karna
    res.set('Content-Type', contentType || 'video/mp2t');
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
  } catch (e) { 
    res.status(500).send(e.message); 
  }
});

export default app;
if (process.env.NODE_ENV !== 'production') { 
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  }); 
}
