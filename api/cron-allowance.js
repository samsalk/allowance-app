// Vercel Cron target (see vercel.json). Vercel sends
// "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set.
const { safeEqual } = require('../lib/session');
const { readData, writeData } = require('../lib/store');
const { dueDates, applyAllowanceToAppData } = require('../lib/weekly-allowance');

const MAX_RETRIES = 3;

module.exports = async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || !safeEqual(req.headers.authorization || '', `Bearer ${secret}`)) {
        return res.status(401).end();
    }

    try {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const { data, etag } = await readData();
            const due = dueDates(data);
            if (due.length === 0) return res.status(200).json({ message: 'No allowance due' });

            applyAllowanceToAppData(data, due);
            const result = await writeData(data, etag);
            if (result.ok) {
                return res.status(200).json({ message: `Applied ${due.length} week(s) for ${data.kids.length} kid(s)` });
            }
            console.log(`Version conflict on attempt ${attempt}; retrying`);
        }
        return res.status(500).json({ error: 'Repeated version conflicts' });
    } catch (err) {
        console.error('cron-allowance failed:', err);
        return res.status(500).json({ error: 'Failed' });
    }
};
