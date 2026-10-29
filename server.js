const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 1. API Proxy Route
app.use('/api', createProxyMiddleware({
    target: 'https://cdn2.mjunoon.tv:9191',
    changeOrigin: true,
    secure: false, // SSL certificate issue bypass karne ke liye
    pathRewrite: { '^/api': '/v2' },
    onProxyReq: (proxyReq, req, res) => {
        // Headers jo aapne diye hain
        proxyReq.setHeader('Origin', 'https://www.mjunoon.tv');
        proxyReq.setHeader('Referer', 'https://www.mjunoon.tv/');
        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36');
        
        // Authorization token (Jo aapne diya hai - Ye expire ho jayega!)
        proxyReq.setHeader('Authorization', 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczpcL1wvY2RuMi5tanVub29uLnR2OjkxOTFcL3YyXC9hdXRoXC9sb2dpbiIsImlhdCI6MTc5MzE5NTg1OCwiZXhwIjoxNzkzMTk5NDU4LCJuYmYiOjE3OTMxOTU4NTgsImp0aSI6Ik1Pb29BYmhmYnQwMnA1cVoiLCJzdWIiOjIsInBydiI6Ijg3ZTBhZjFlZjlmZDE1ODEyZmRlYzk3MTUzYTE0ZTBiMDQ3NTQ2YWEifQ.4H4fot-M3D9LAlh4jb0c9Izgcxe7J2c5_0liLyMcKo4');
    }
}));

// 2. Video Stream Proxy Route (Agar direct stream block ho)
app.use('/stream', createProxyMiddleware({
    target: 'https://cdn5.mjunoon.tv:8087',
    changeOrigin: true,
    secure: false,
    pathRewrite: { '^/stream': '' },
    onProxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('Origin', 'https://www.mjunoon.tv');
        proxyReq.setHeader('Referer', 'https://www.mjunoon.tv/');
    }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
