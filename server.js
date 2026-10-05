import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.js';
import { createAuth } from './lib/auth.js';
import { createAssistant } from './lib/ai.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');
const port = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

// Admin URL — keep the default or set ADMIN_PATH=/something-private in .env
const ADMIN_PATH = ('/' + String(process.env.ADMIN_PATH || 'admin').replace(/^\/+|\/+$/g, '')) || '/admin';

const store = createStore(path.join(__dirname, 'data'));
const auth = createAuth({
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD,
  secret: process.env.SESSION_SECRET,
  secureCookies: isProd
});
const assistant = await createAssistant({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  embedModel: process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001',
  rootDir: __dirname,
  timezone: process.env.GYM_TIMEZONE || 'Asia/Kolkata'
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));

// Basic security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=()');
  next();
});

// ---------------------------------------------------------------------------
// Tiny in-memory rate limiter (per IP, per bucket)
// ---------------------------------------------------------------------------
const hits = new Map();
function rateLimit(bucket, max, windowMs) {
  return (req, res, next) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const entry = hits.get(key) || { n: 0, reset: now + windowMs };
    if (entry.reset < now) { entry.n = 0; entry.reset = now + windowMs; }
    entry.n++;
    hits.set(key, entry);
    if (entry.n > max) return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60e3).unref();

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ...assistant.status(), ragSources: undefined, ragError: undefined });
});

// Everything the public website + AI widget need to render
app.get('/api/site', (_req, res) => {
  const a = store.getSettings().assistant;
  res.setHeader('Cache-Control', 'no-cache');
  res.json({
    site: store.getSite(),
    assistant: {
      name: a.name,
      greeting: a.greeting,
      subtitle: a.subtitle,
      voiceReplies: a.voiceReplies,
      voiceRate: a.voiceRate,
      voiceLang: a.voiceLang,
      continuousConversation: a.continuousConversation,
      suggestions: a.suggestions
    }
  });
});

app.post('/api/chat', rateLimit('chat', 30, 60e3), async (req, res) => {
  const message = clean(req.body?.message, 1500);
  if (!message) return res.status(400).json({ error: 'Message is required.' });

  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
    .slice(-10)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }));

  const mode = req.body?.mode === 'voice' ? 'voice' : 'text';
  const sessionId = /^[a-zA-Z0-9-]{8,64}$/.test(req.body?.sessionId || '') ? req.body.sessionId : crypto.randomUUID();

  try {
    const result = await assistant.answer({
      message,
      history,
      site: store.getSite(),
      settings: store.getSettings(),
      viewing: ['home', 'about', 'programs', 'trainers', 'membership', 'gallery', 'testimonials', 'info', 'faq', 'contact'].includes(req.body?.section) ? req.body.section : ''
    });
    store.logChat({ sessionId, mode, question: message, answer: result.answer, fallback: result.fallback, page: clean(req.body?.page, 120) });
    res.json({ ...result, sessionId });
  } catch (err) {
    console.error('Chat error:', err?.message || err);
    res.status(502).json({ error: 'AI service request failed.' });
  }
});

app.post('/api/leads', rateLimit('leads', 5, 10 * 60e3), (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot field — bots fill it
  const lead = {
    name: clean(b.name, 80),
    email: clean(b.email, 160).toLowerCase(),
    phone: clean(b.phone, 40),
    interest: clean(b.interest, 60),
    message: clean(b.message, 2000),
    source: b.source === 'assistant' ? 'assistant' : 'contact-form'
  };
  if (!lead.name || !EMAIL_RE.test(lead.email) || !lead.message) {
    return res.status(400).json({ error: 'Please provide your name, a valid email and a message.' });
  }
  store.addLead(lead);
  res.json({ ok: true });
});

app.post('/api/subscribe', rateLimit('subscribe', 5, 10 * 60e3), (req, res) => {
  const email = clean(req.body?.email, 160);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  const r = store.addSubscriber(email);
  res.json({ ok: true, duplicate: r.duplicate });
});

// ---------------------------------------------------------------------------
// Admin (private — not linked anywhere on the public site)
// ---------------------------------------------------------------------------
const noIndex = (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store');
  next();
};

const adminHtml = () => fs.readFileSync(path.join(ADMIN_DIR, 'index.html'), 'utf8').replaceAll('__ADMIN_PATH__', ADMIN_PATH);
app.get([ADMIN_PATH, `${ADMIN_PATH}/`], noIndex, (_req, res) => res.type('html').send(adminHtml()));
app.use(`${ADMIN_PATH}/assets`, noIndex, express.static(ADMIN_DIR, { index: false, dotfiles: 'deny' }));

const adminApi = express.Router();
adminApi.use(noIndex);

adminApi.post('/login', rateLimit('admin-login', 20, 15 * 60e3), (req, res) => auth.login(req, res));
adminApi.post('/logout', (_req, res) => { auth.clear(res); res.json({ ok: true }); });
adminApi.get('/me', (req, res) => {
  const s = auth.verify(req);
  return s ? res.json({ user: s.u }) : res.status(401).json({ error: 'Not signed in.' });
});

adminApi.use(auth.requireAdmin);

adminApi.get('/overview', (_req, res) => {
  const leads = store.listLeads();
  const chats = store.listChats();
  const subs = store.listSubscribers();
  const dayMs = 864e5;
  const now = Date.now();
  const within = (iso, days) => now - new Date(iso).getTime() < days * dayMs;

  // last 14 days of activity
  const days = [...Array(14)].map((_, i) => {
    const d = new Date(now - (13 - i) * dayMs);
    return d.toISOString().slice(0, 10);
  });
  const perDay = (items, field) => days.map((d) => items.filter((x) => (x[field] || '').slice(0, 10) === d).length);

  const questions = chats.flatMap((c) => c.messages.filter((m) => m.role === 'user'));
  const freq = new Map();
  questions.forEach((m) => {
    const k = m.content.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (k) freq.set(k, (freq.get(k) || 0) + 1);
  });

  res.json({
    totals: {
      leads: leads.length,
      newLeads: leads.filter((l) => l.status === 'new').length,
      leads7d: leads.filter((l) => within(l.createdAt, 7)).length,
      chats: chats.length,
      chats7d: chats.filter((c) => within(c.startedAt, 7)).length,
      questions: questions.length,
      voiceShare: questions.length ? Math.round((questions.filter((m) => m.mode === 'voice').length / questions.length) * 100) : 0,
      subscribers: subs.length,
      fallbackAnswers: chats.flatMap((c) => c.messages).filter((m) => m.role === 'assistant' && m.fallback).length
    },
    activity: { days, chats: perDay(chats, 'startedAt'), leads: perDay(leads, 'createdAt') },
    topQuestions: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([q, n]) => ({ q, n })),
    recentLeads: leads.slice(0, 5),
    system: assistant.status()
  });
});

adminApi.get('/site', (_req, res) => res.json(store.getSite()));
adminApi.put('/site', (req, res) => res.json(store.setSite(req.body)));
adminApi.get('/settings', (_req, res) => res.json(store.getSettings()));
adminApi.put('/settings', (req, res) => res.json(store.setSettings(req.body)));

adminApi.get('/leads', (_req, res) => res.json(store.listLeads()));
adminApi.patch('/leads/:id', (req, res) => {
  const lead = store.updateLead(req.params.id, req.body || {});
  return lead ? res.json(lead) : res.status(404).json({ error: 'Not found' });
});
adminApi.delete('/leads/:id', (req, res) => res.json({ ok: store.deleteLead(req.params.id) }));
adminApi.get('/leads.csv', (_req, res) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Name', 'Email', 'Phone', 'Interest', 'Status', 'Source', 'Message', 'Notes']]
    .concat(store.listLeads().map((l) => [l.createdAt, l.name, l.email, l.phone, l.interest, l.status, l.source, l.message, l.notes]));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ironforge-enquiries.csv"');
  res.send('﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n'));
});

adminApi.get('/subscribers', (_req, res) => res.json(store.listSubscribers()));
adminApi.delete('/subscribers/:id', (req, res) => { store.deleteSubscriber(req.params.id); res.json({ ok: true }); });

adminApi.get('/chats', (_req, res) => {
  res.json(store.listChats().map((c) => ({
    id: c.id,
    startedAt: c.startedAt,
    updatedAt: c.updatedAt,
    voice: c.voice,
    count: c.messages.filter((m) => m.role === 'user').length,
    preview: c.messages.find((m) => m.role === 'user')?.content || ''
  })));
});
adminApi.get('/chats/:id', (req, res) => {
  const chat = store.getChat(req.params.id);
  return chat ? res.json(chat) : res.status(404).json({ error: 'Not found' });
});
adminApi.delete('/chats/:id', (req, res) => { store.deleteChat(req.params.id); res.json({ ok: true }); });

// Let the admin try the assistant without polluting the transcripts
adminApi.post('/test-chat', async (req, res) => {
  const message = clean(req.body?.message, 1500);
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  res.json(await assistant.answer({ message, history: [], site: store.getSite(), settings: store.getSettings() }));
});

app.use('/api/admin', adminApi);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---------------------------------------------------------------------------
// Public website
// ---------------------------------------------------------------------------
app.use(express.static(PUBLIC_DIR, { index: 'index.html', dotfiles: 'ignore', extensions: ['html'] }));

// Media files (images / video) that still live in the project root are served
// too, so existing assets keep working. Only media extensions are allowed —
// server code, .env, data/ and rag.db are never exposed.
const MEDIA_RE = /^\/[\w\-]+\.(jpe?g|png|webp|avif|gif|svg|ico|mp4|webm)$/i;
app.get(MEDIA_RE, (req, res, next) => {
  res.sendFile(path.join(__dirname, req.path), { dotfiles: 'deny' }, (err) => err && next());
});

app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html') && !path.extname(req.path)) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  res.status(404).send('Not found');
});

const server = app.listen(port, '0.0.0.0', () => {
  const s = assistant.status();
  console.log('');
  console.log('======================================');
  console.log(' IRONFORGE FITNESS — website + AI agent');
  console.log('======================================');
  console.log(` Website : http://localhost:${port}`);
  console.log(` Admin   : http://localhost:${port}${ADMIN_PATH}`);
  console.log(` Gemini  : ${s.aiConfigured ? `configured (${s.model})` : 'NOT configured — using built-in fallback answers'}`);
  console.log(` RAG     : ${s.ragChunks ? `${s.ragChunks} chunks` : `not loaded${s.ragError ? ` (${s.ragError})` : ''}`}`);
  if (auth.generatedPassword) {
    console.log('');
    console.log(' ADMIN_PASSWORD is not set in .env — a temporary one was generated:');
    console.log(`   username: ${auth.username}`);
    console.log(`   password: ${auth.generatedPassword}`);
    console.log(' It changes on every restart. Set ADMIN_PASSWORD in .env to keep it fixed.');
  }
  console.log('======================================');
});

const shutdown = () => { store.flush(); server.close(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
