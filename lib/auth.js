// Admin authentication: single admin account from environment variables,
// HMAC-signed session cookie, simple login rate limiting.

import crypto from 'node:crypto';

const COOKIE = 'if_admin';
const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export function createAuth({ username, password, secret, secureCookies }) {
  const adminUser = username || 'admin';
  let adminPass = password;
  let generated = false;

  if (!adminPass) {
    adminPass = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }

  const key = secret || crypto.randomBytes(32).toString('hex');
  const fails = new Map(); // ip -> { count, until }

  const sign = (data) => crypto.createHmac('sha256', key).update(data).digest('base64url');

  const safeEqual = (a, b) => {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
  };

  function issue(res) {
    const payload = Buffer.from(JSON.stringify({ u: adminUser, exp: Date.now() + SESSION_HOURS * 3600e3 })).toString('base64url');
    const token = `${payload}.${sign(payload)}`;
    res.setHeader('Set-Cookie', [
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secureCookies ? '; Secure' : ''}`
    ]);
  }

  function clear(res) {
    res.setHeader('Set-Cookie', [`${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies ? '; Secure' : ''}`]);
  }

  function readCookie(req) {
    const raw = req.headers.cookie || '';
    const match = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
    return match ? match.slice(COOKIE.length + 1) : '';
  }

  function verify(req) {
    const token = readCookie(req);
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    if (!safeEqual(sig, sign(payload))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return data.exp > Date.now() ? data : null;
    } catch {
      return null;
    }
  }

  function login(req, res) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const entry = fails.get(ip);
    if (entry && entry.until > Date.now()) {
      const mins = Math.ceil((entry.until - Date.now()) / 60000);
      return res.status(429).json({ error: `Too many attempts. Try again in ${mins} minute(s).` });
    }

    const { username: u, password: p } = req.body || {};
    if (safeEqual(u || '', adminUser) && safeEqual(p || '', adminPass)) {
      fails.delete(ip);
      issue(res);
      return res.json({ ok: true, user: adminUser });
    }

    const count = (entry && entry.until <= Date.now() ? 0 : entry?.count || 0) + 1;
    fails.set(ip, { count, until: count >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60e3 : 0 });
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }

  // Middleware: protects /api/admin/* routes.
  // Also requires a custom header so a cross-site form post can never act as the admin.
  function requireAdmin(req, res, next) {
    const session = verify(req);
    if (!session) return res.status(401).json({ error: 'Not signed in.' });
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'IronforgeAdmin') {
      return res.status(403).json({ error: 'Missing request header.' });
    }
    req.admin = session;
    next();
  }

  return { login, verify, clear, requireAdmin, username: adminUser, generatedPassword: generated ? adminPass : null };
}
