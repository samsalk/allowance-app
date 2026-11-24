const { isAuthenticated } = require('../lib/session');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(isAuthenticated(req) ? 200 : 401).json({ ok: isAuthenticated(req) });
};
