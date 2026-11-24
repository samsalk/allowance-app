const { makeCookie, safeEqual } = require('../lib/session');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();
    if (!process.env.FAMILY_PIN || !process.env.SESSION_SECRET) {
        return res.status(500).json({ error: 'Server not configured' });
    }
    const pin = req.body && typeof req.body.pin === 'string' ? req.body.pin : '';
    if (!safeEqual(pin, process.env.FAMILY_PIN)) {
        // Slow down guessing a little (serverless, so this is not real rate limiting).
        await new Promise(r => setTimeout(r, 800));
        return res.status(401).json({ error: 'Incorrect PIN' });
    }
    res.setHeader('Set-Cookie', makeCookie());
    res.status(200).json({ ok: true });
};
