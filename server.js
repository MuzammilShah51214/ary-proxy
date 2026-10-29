app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('url required');
  
  try {
    // Hum mjunoon.tv ko bilkul Chrome browser jaisa dikha rahe hain
    const upstream = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.mjunoon.tv/',
        'Origin': 'https://www.mjunoon.tv',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      },
    });

    if (!upstream.ok) {
        console.log("Upstream Error Status:", upstream.status);
        return res.status(upstream.status).send('upstream error');
    }
    
    const contentType = upstream.headers.get('content-type') || '';
    
    // Agar m3u8 (playlist) file hai
    if (url.includes('.m3u8') || contentType.includes('mpegurl')) {
      const base = url.substring(0, url.lastIndexOf('/') + 1);
      let text = await upstream.text();
      
      // m3u8 ke andar jo links hain unko bhi proxy ke through bhej rahe hain
      text = text.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        return `/proxy?url=${encodeURIComponent(t.startsWith('http') ? t : new URL(t, base).href)}`;
      }).join('\n');
      
      res.set('Content-Type', 'application/vnd.apple.mpegurl'); 
      return res.send(text);
    }
    
    // Agar .ts (video chunk) file hai
    res.set('Content-Type', contentType || 'video/mp2t');
    upstream.body.pipe(res);
    
  } catch (e) { 
    console.error("Proxy Error:", e.message);
    res.status(500).send(e.message); 
  }
});
