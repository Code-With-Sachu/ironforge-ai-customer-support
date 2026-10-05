// Lightweight JSON data store (no native dependencies).
// Holds website content, assistant settings, enquiries, subscribers and
// chat transcripts in data/db.json. Writes are atomic (tmp file + rename)
// and debounced so bursts of chat messages don't hammer the disk.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_SITE, DEFAULT_SETTINGS } from './defaults.js';

const MAX_CHATS = 2000;
const MAX_MESSAGES_PER_CHAT = 120;
const MAX_LEADS = 5000;

const clone = (v) => JSON.parse(JSON.stringify(v));
export const newId = () => crypto.randomBytes(8).toString('hex');

// ---------- small sanitizers ----------
const str = (v, max = 500, fallback = '') =>
  typeof v === 'string' ? v.trim().slice(0, max) : (typeof v === 'number' ? String(v) : fallback);
const num = (v, fallback = 0, min = 0, max = 1e7) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const bool = (v) => v === true || v === 'true' || v === 1;
const arr = (v, max = 50) => (Array.isArray(v) ? v.slice(0, max) : []);
const safeHref = (v) => {
  const s = str(v, 300);
  return /^(#|\/|https?:\/\/|mailto:|tel:)/i.test(s) ? s : '';
};
const safeImage = (v) => {
  const s = str(v, 300);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return /^[\w\-./]+\.(jpe?g|png|webp|avif|gif|svg)$/i.test(s) && !s.includes('..') ? s : '';
};

export function sanitizeSite(input, current = DEFAULT_SITE) {
  const s = input && typeof input === 'object' ? input : {};
  const c = current;
  return {
    brand: {
      name: str(s.brand?.name, 80, c.brand.name) || c.brand.name,
      tagline: str(s.brand?.tagline, 240, c.brand.tagline),
      founded: num(s.brand?.founded, c.brand.founded, 1900, 2100)
    },
    announcement: {
      enabled: bool(s.announcement?.enabled),
      text: str(s.announcement?.text, 240),
      linkText: str(s.announcement?.linkText, 40),
      linkHref: safeHref(s.announcement?.linkHref)
    },
    stats: {
      members: num(s.stats?.members, c.stats.members),
      trainers: num(s.stats?.trainers, c.stats.trainers),
      years: num(s.stats?.years, c.stats.years),
      equipment: num(s.stats?.equipment, c.stats.equipment)
    },
    // Program ids are fixed: each maps to an image + 3D preview on the site.
    programs: c.programs.map((p) => {
      const incoming = arr(s.programs).find((x) => x && x.id === p.id) || {};
      return {
        id: p.id,
        title: str(incoming.title, 60, p.title) || p.title,
        description: str(incoming.description, 400, p.description)
      };
    }),
    currency: str(s.currency, 4, c.currency || '$'),
    plans: arr(s.plans, 6).map((p, i) => ({
      id: str(p?.id, 40) || `plan-${i + 1}`,
      name: str(p?.name, 40) || `Plan ${i + 1}`,
      tagline: str(p?.tagline, 120),
      price: num(p?.price, 0, 0, 1e6),
      period: str(p?.period, 12, '/mo'),
      featured: bool(p?.featured),
      badge: str(p?.badge, 30),
      features: arr(p?.features, 15)
        .map((f) => ({ text: str(f?.text, 120), included: f?.included !== false }))
        .filter((f) => f.text)
    })),
    trainers: arr(s.trainers, 12).map((t) => ({
      name: str(t?.name, 60),
      role: str(t?.role, 80),
      image: safeImage(t?.image)
    })).filter((t) => t.name),
    hours: arr(s.hours, 10).map((h) => ({
      day: str(h?.day, 40),
      time: str(h?.time, 40),
      note: bool(h?.note)
    })).filter((h) => h.day),
    contact: {
      addressLine1: str(s.contact?.addressLine1, 120),
      addressLine2: str(s.contact?.addressLine2, 120),
      phone: str(s.contact?.phone, 40),
      email: str(s.contact?.email, 120),
      mapEmbedUrl: /^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/i.test(str(s.contact?.mapEmbedUrl, 1200))
        ? str(s.contact?.mapEmbedUrl, 1200) : ''
    },
    faqs: arr(s.faqs, 40).map((f) => ({ q: str(f?.q, 200), a: str(f?.a, 1200) })).filter((f) => f.q && f.a)
  };
}

export function sanitizeSettings(input, current = DEFAULT_SETTINGS) {
  const a = input?.assistant || {};
  const c = current.assistant;
  return {
    assistant: {
      name: str(a.name, 40, c.name) || c.name,
      greeting: str(a.greeting, 120, c.greeting) || c.greeting,
      subtitle: str(a.subtitle, 240, c.subtitle),
      voiceReplies: bool(a.voiceReplies),
      voiceRate: num(a.voiceRate, 1, 0.6, 1.6),
      voiceLang: /^[a-z]{2}(-[A-Z]{2})?$/.test(str(a.voiceLang, 10)) ? str(a.voiceLang, 10) : 'en-US',
      continuousConversation: bool(a.continuousConversation),
      extraInstructions: str(a.extraInstructions, 2000),
      suggestions: arr(a.suggestions, 8).map((x) => str(x, 120)).filter(Boolean)
    }
  };
}

// ---------- the store ----------
export function createStore(dataDir) {
  const file = path.join(dataDir, 'db.json');
  fs.mkdirSync(dataDir, { recursive: true });

  let db;
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = {};
  }

  // Merge defaults so new fields appear after upgrades.
  db.site = db.site ? sanitizeSite({ ...clone(DEFAULT_SITE), ...db.site }) : clone(DEFAULT_SITE);
  db.settings = db.settings
    ? sanitizeSettings({ assistant: { ...DEFAULT_SETTINGS.assistant, ...db.settings.assistant } })
    : clone(DEFAULT_SETTINGS);
  db.leads = Array.isArray(db.leads) ? db.leads : [];
  db.subscribers = Array.isArray(db.subscribers) ? db.subscribers : [];
  db.chats = Array.isArray(db.chats) ? db.chats : [];

  let timer = null;
  function persist(immediate = false) {
    clearTimeout(timer);
    const write = () => {
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, file);
    };
    if (immediate) return write();
    timer = setTimeout(() => {
      try { write(); } catch (e) { console.error('Could not save data/db.json:', e.message); }
    }, 400);
  }
  persist(true);

  return {
    // content
    getSite: () => db.site,
    setSite(next) { db.site = sanitizeSite(next, db.site); persist(); return db.site; },
    getSettings: () => db.settings,
    setSettings(next) { db.settings = sanitizeSettings(next, db.settings); persist(); return db.settings; },

    // enquiries
    addLead(lead) {
      const item = { id: newId(), status: 'new', createdAt: new Date().toISOString(), ...lead };
      db.leads.unshift(item);
      db.leads.length = Math.min(db.leads.length, MAX_LEADS);
      persist();
      return item;
    },
    listLeads: () => db.leads,
    updateLead(id, patch) {
      const lead = db.leads.find((l) => l.id === id);
      if (!lead) return null;
      if (['new', 'contacted', 'joined', 'closed'].includes(patch.status)) lead.status = patch.status;
      if (typeof patch.notes === 'string') lead.notes = patch.notes.slice(0, 2000);
      lead.updatedAt = new Date().toISOString();
      persist();
      return lead;
    },
    deleteLead(id) {
      const before = db.leads.length;
      db.leads = db.leads.filter((l) => l.id !== id);
      persist();
      return db.leads.length !== before;
    },

    // newsletter
    addSubscriber(email) {
      const e = email.toLowerCase();
      if (db.subscribers.some((s) => s.email === e)) return { duplicate: true };
      db.subscribers.unshift({ id: newId(), email: e, createdAt: new Date().toISOString() });
      persist();
      return { duplicate: false };
    },
    listSubscribers: () => db.subscribers,
    deleteSubscriber(id) {
      db.subscribers = db.subscribers.filter((s) => s.id !== id);
      persist();
    },

    // chat transcripts
    logChat({ sessionId, mode, question, answer, fallback, page }) {
      let chat = db.chats.find((c) => c.id === sessionId);
      const now = new Date().toISOString();
      if (!chat) {
        chat = { id: sessionId, startedAt: now, updatedAt: now, page: page || '/', voice: false, messages: [] };
        db.chats.unshift(chat);
        if (db.chats.length > MAX_CHATS) db.chats.length = MAX_CHATS;
      } else {
        // move to top
        db.chats = [chat, ...db.chats.filter((c) => c !== chat)];
      }
      chat.updatedAt = now;
      if (mode === 'voice') chat.voice = true;
      chat.messages.push({ role: 'user', content: question, mode, at: now });
      chat.messages.push({ role: 'assistant', content: answer, fallback: !!fallback, at: now });
      if (chat.messages.length > MAX_MESSAGES_PER_CHAT) {
        chat.messages = chat.messages.slice(-MAX_MESSAGES_PER_CHAT);
      }
      persist();
    },
    listChats: () => db.chats,
    getChat: (id) => db.chats.find((c) => c.id === id) || null,
    deleteChat(id) {
      db.chats = db.chats.filter((c) => c.id !== id);
      persist();
    },

    flush: () => persist(true)
  };
}
