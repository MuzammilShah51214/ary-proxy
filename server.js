const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post('/api/stream', async (req, res) => {
  try {
    const slug = req.body.slug;
    if (!slug) return res.status(400).json({ error: 'Slug missing' });

    console.log(`Fetching: ${slug}`);

    // 1. Direct Mjunoon API try karein (Agar block ho toh ignore karega)
    try {
      const apiRes = await fetch('https://cdn2.mjunoon.tv:9191/v2/embed-player-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': 'https://www.mjunoon.tv/',
          'Origin': 'https://www.mjunoon.tv'
        },
        body: `slug=${slug}`
      });
      
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data?.data?.live_stream_url) {
          return res.json({ data: { live_stream_url: data.data.live_stream_url } });
        }
      }
    } catch (e) {
      console.log("API failed, moving to scraping.");
    }

    // 2. HTML Scraping (Agar API block kare) - Asal Embed URL
    // Aapne jo link diya tha: https://www.mjunoon.tv/embedplayer/abb-takk-news-live.html
    // Hum slug ki ID (e.g. -133) hata kar URL banayenge
    let cleanSlug = slug.replace(/-[0-9]+.*$/, '').toLowerCase(); // AbbTakNews-133 -> abbtaknews
    let embedUrl = `https://www.mjunoon.tv/embedplayer/${cleanSlug}-live.html`;

    const htmlRes = await fetch(embedUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'Accept': 'text/html'
      }
    });

    const html = await htmlRes.text();
    
    // HTML se m3u8 link nikalna
    const streamRegex = /(https?:\/\/[^"']+\.m3u8[^"']*)/g;
    const matches = html.match(streamRegex);

    if (matches && matches.length > 0) {
      return res.json({ data: { live_stream_url: matches[0] } });
    }

    return res.status(404).json({ error: 'Stream not found', slug });
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', details: error.message });
  }
});

app.get('/', (req, res) => res.send('Proxy is Running ✅'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
