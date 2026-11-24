// Stateless signed session cookie for the single shared family login.
// Cookie value: "<expiryMs>.<hmac>" signed with SESSION_SECRET.
const crypto = require('crypto');

const COOKIE = 'salk_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(value) {
    return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(value).digest('hex');
}

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function makeCookie() {
    const exp = String(Date.now() + MAX_AGE_SECONDS * 1000);
    return `${COOKIE}=${exp}.${sign(exp)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

function clearCookie() {
    return `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function isAuthenticated(req) {
    if (!process.env.SESSION_SECRET) return false;
    const header = req.headers.cookie || '';
    const match = header.split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
    if (!match) return false;
    const [exp, sig] = match.slice(COOKIE.length + 1).split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    return safeEqual(sig, sign(exp));
}

module.exports = { makeCookie, clearCookie, isAuthenticated, safeEqual };
