const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data'); // ✅ FormData import kiya

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;

app.post('/proxy', async (req, res) => {
  try {
    console.log("Frontend Request:", req.body);

    // ✅ FormData banaya
    const formData = new FormData();
    formData.append('channel_id', req.body.channel_id);
    formData.append('platform', 'web');

    const response = await axios({
      method: 'post',
      url: 'https://web.jazztv.pk/alpha/api_gateway/v6/web/get-channel-url',
      headers: {
        'Authorization': req.headers['authorization'] || '', 
        'Accept': 'application/json, text/plain, */*',
        'platform': 'web',
        'Origin': 'https://tamashaweb.com', // ✅ Naya Origin
        'Referer': 'https://tamashaweb.com/', // ✅ Naya Referer
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
        ...formData.getHeaders() // ✅ FormData headers
      },
      data: formData 
    });
    
    console.log("JazzTV API Response:", response.data);
    res.json(response.data);
    
  } catch (error) {
    console.error("Proxy Error:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Proxy request failed', details: error.message });
  }
});

app.get('/', (req, res) => { res.send('JazzTV Proxy is running perfectly!'); });
app.listen(PORT, () => { console.log(`Server is running on port ${PORT}`); });
