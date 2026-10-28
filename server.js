const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Ye route fix hai. HTML isi ko call kar raha hai.
app.post('/api/stream', async (req, res) => {
  try {
    const slug = req.body.slug;
    if (!slug) return res.status(400).json({ error: 'Slug missing' });

    // Mjunoon TV API try karein
    try {
      const apiRes = await fetch('https://cdn2.mjunoon.tv:9191/v2/embed-player-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.mjunoon.tv/',
          'Origin': 'https://www.mjunoon.tv'
        },
        body: `slug=${slug}`
      });
      
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data && data.data && data.data.live_stream_url) {
          return res.json({ data: { live_stream_url: data.data.live_stream_url } });
        }
      }
    } catch (e) {
      console.log("API failed, trying scraping...");
    }

    // Agar API block kare, toh Website (HTML) se stream nikalein
    // URL format: https://www.mjunoon.tv/embedplayer/madni-live.html
    let embedUrl = `https://www.mjunoon.tv/embedplayer/${slug.toLowerCase()}-live.html`;
    const htmlRes = await fetch(embedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
    });
    
    const html = await htmlRes.text();
    // HTML se m3u8 link dhoondein
    const streamRegex = /(https?:\/\/[^"']+\.m3u8[^"']*)/g;
    const matches = html.match(streamRegex);

    if (matches && matches.length > 0) {
      return res.json({ data: { live_stream_url: matches[0] } });
    }

    return res.status(404).json({ error: 'Stream not found' });
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', details: error.message });
  }
});

// Test route
app.get('/', (req, res) => res.send('Server is Running ✅'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
