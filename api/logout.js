const { clearCookie } = require('../lib/session');

module.exports = async (req, res) => {
    res.setHeader('Set-Cookie', clearCookie());
    res.status(200).json({ ok: true });
};
