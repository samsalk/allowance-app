const { isAuthenticated } = require('../lib/session');
const { readData, writeData } = require('../lib/store');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Not signed in' });

    try {
        if (req.method === 'GET') {
            const { data, etag } = await readData();
            return res.status(200).json({ data, etag });
        }

        if (req.method === 'PUT') {
            const body = req.body || {};
            const d = body.data;
            if (!d || !Array.isArray(d.kids) || !Array.isArray(d.transactions) || typeof d.settings !== 'object') {
                return res.status(400).json({ error: 'Invalid data shape' });
            }
            const result = await writeData(d, body.etag == null ? null : body.etag);
            if (!result.ok) return res.status(409).json({ error: 'Conflict' });
            return res.status(200).json({ etag: result.etag });
        }

        return res.status(405).end();
    } catch (err) {
        console.error('api/data failed:', err);
        return res.status(500).json({ error: 'Storage error' });
    }
};
