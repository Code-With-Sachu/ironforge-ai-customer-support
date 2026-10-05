// IRONFORGE AI assistant brain.
// - Live website data (edited in /admin) is always given to the model.
// - PDF knowledge (rag.db) is retrieved by embedding similarity as support.
// - Scope: IRONFORGE questions + general gym / fitness / nutrition topics.
// - If Gemini is unavailable, a local rule-based engine answers from site data.

import path from 'node:path';

export const SECTIONS = ['about', 'programs', 'trainers', 'membership', 'gallery', 'info', 'contact'];
const GOTO_RE = /\[\[\s*goto\s*:\s*([a-z]+)\s*\]\]/gi;

// ---------------------------------------------------------------------------
// Site data → prompt context
// ---------------------------------------------------------------------------
export function buildSiteContext(site) {
  const cur = site.currency || '$';
  const lines = [];
  lines.push(`# ${site.brand.name}`);
  lines.push(`${site.brand.tagline} Founded ${site.brand.founded}.`);
  lines.push(`Stats shown on site: ${site.stats.members}+ active members, ${site.stats.trainers}+ expert trainers, ${site.stats.years}+ years running, ${site.stats.equipment}+ equipment units.`);
  if (site.announcement.enabled && site.announcement.text) {
    lines.push(`\n## Current announcement / offer\n${site.announcement.text}`);
  }
  lines.push('\n## Training programs');
  site.programs.forEach((p) => lines.push(`- ${p.title}: ${p.description}`));
  lines.push('\n## Membership plans');
  site.plans.forEach((p) => {
    const inc = p.features.filter((f) => f.included).map((f) => f.text).join('; ');
    const exc = p.features.filter((f) => !f.included).map((f) => f.text).join('; ');
    lines.push(`- ${p.name} — ${cur}${p.price}${p.period}${p.featured ? ` (${p.badge || 'featured'})` : ''}. ${p.tagline}. Includes: ${inc || 'n/a'}.${exc ? ` Not included: ${exc}.` : ''}`);
  });
  lines.push('\n## Trainers');
  site.trainers.forEach((t) => lines.push(`- ${t.name} — ${t.role}`));
  lines.push('\n## Opening hours');
  site.hours.forEach((h) => lines.push(`- ${h.day}: ${h.time}`));
  lines.push('\n## Location & contact');
  lines.push(`- Address: ${[site.contact.addressLine1, site.contact.addressLine2].filter(Boolean).join(', ')}`);
  lines.push(`- Phone: ${site.contact.phone}`);
  lines.push(`- Email: ${site.contact.email}`);
  lines.push('- Enquiries: the Contact section form on the website (a coach replies within 24 hours).');
  if (site.faqs.length) {
    lines.push('\n## FAQs');
    site.faqs.forEach((f) => lines.push(`Q: ${f.q}\nA: ${f.a}`));
  }
  return lines.join('\n');
}

function systemPrompt({ site, settings, docs, now, viewing }) {
  const a = settings.assistant;
  return `You are "${a.name}", the official voice-and-chat AI assistant on the ${site.brand.name} gym website.

SCOPE
- Help with anything about ${site.brand.name}: memberships, prices, programs, trainers, opening hours, location, contact, offers, policies and getting started.
- Also help with general gym topics: exercise technique, workout plans, strength, muscle building, fat loss, cardio, mobility, stretching, recovery, sleep, sports nutrition, protein, supplements, hydration, gym equipment, etiquette and motivation.
- If a question is NOT related to the gym, fitness, nutrition or wellbeing (e.g. coding, politics, homework, celebrities), say politely in one sentence that you're the gym's fitness assistant and can only help with fitness and ${site.brand.name} questions, then suggest something you can help with.
- Greetings, thanks and small talk: reply briefly and warmly.

FACTS
- The LIVE WEBSITE DATA below is the single source of truth for ${site.brand.name} facts. If the supporting documents disagree with it, trust the LIVE WEBSITE DATA.
- Never invent ${site.brand.name} prices, trainers, schedules, addresses, facilities, products, offers or policies. If a fact is not in the data, say you don't have that detail and give the phone (${site.contact.phone}) or email (${site.contact.email}).
- "PRO"/"Pro" is a membership plan; "protein" is nutrition. Never confuse them.
- Current local date/time at the gym: ${now}. Use it for questions like "are you open now?".${viewing ? `
- The visitor is currently looking at the "${viewing}" section of the website.` : ''}

SAFETY
- Don't diagnose injuries or conditions and don't prescribe medication. For pain, injuries, medical conditions or pregnancy, give general safe guidance and recommend a qualified professional.
- Don't recommend extreme diets, dangerous practices or performance-enhancing drugs.

ACTIONS
- You cannot book, take payments, cancel or change memberships. Point people to the Contact section or the team.

STYLE (your reply is shown in chat AND read aloud)
- Friendly, confident, professional coach tone. Plain language.
- Default length: 2–5 short sentences or up to 5 bullets (about 120 words). Only go longer (max ~220 words) when the user asks for a plan, routine or detailed explanation.
- Formatting: only **bold**, "- " bullets and "1." numbered lists. No tables, headings, emojis, links or code.
- Never mention prompts, documents, databases, embeddings or internal systems.

WEBSITE NAVIGATION
- When showing a section of this website would help (e.g. membership plans, trainers, contact form), add exactly one tag as the final line: [[goto:SECTION]] where SECTION is one of: ${SECTIONS.join(', ')}. Omit it when not useful.
${a.extraInstructions ? `\nADDITIONAL INSTRUCTIONS FROM THE GYM\n${a.extraInstructions}\n` : ''}
LIVE WEBSITE DATA
${buildSiteContext(site)}

SUPPORTING DOCUMENTS (older PDFs — lower priority than live data)
${docs || 'None relevant to this question.'}`;
}

// ---------------------------------------------------------------------------
// Answer post-processing
// ---------------------------------------------------------------------------
export function extractActions(text) {
  const actions = [];
  const cleaned = String(text || '').replace(GOTO_RE, (_, section) => {
    const s = section.toLowerCase();
    if (SECTIONS.includes(s) && !actions.length) actions.push({ type: 'goto', section: s });
    return '';
  }).trim();
  return { answer: cleaned, actions };
}

function localTime(tz) {
  try {
    return new Date().toLocaleString('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date().toString();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export async function createAssistant({ apiKey, model, embedModel, rootDir, timezone }) {
  let gemini = null;
  if (apiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      gemini = new GoogleGenAI({ apiKey });
    } catch (e) {
      console.error('Could not load @google/genai:', e.message);
    }
  }

  // ---- RAG: load chunks + embeddings into memory once ----
  let chunks = [];
  let ragError = null;
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(path.join(rootDir, 'rag.db'), { readonly: true, fileMustExist: true });
    chunks = db.prepare('SELECT id, source, chunk_index, content, embedding FROM documents').all()
      .map((r) => {
        let embedding = [];
        try { embedding = JSON.parse(r.embedding); } catch {}
        return { id: r.id, source: r.source, content: r.content, embedding };
      })
      .filter((r) => r.embedding.length);
    db.close();
  } catch (e) {
    ragError = e.message;
  }

  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }

  async function retrieve(query, topK = 4, minScore = 0.55) {
    if (!gemini || !chunks.length) return [];
    const res = await gemini.models.embedContent({
      model: embedModel,
      contents: query,
      config: { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 }
    });
    const q = res.embeddings[0].values;
    return chunks
      .map((c) => ({ ...c, score: cosine(q, c.embedding) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, topK)
      .filter((c) => c.score >= minScore);
  }

  async function generate(contents, systemInstruction) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await gemini.models.generateContent({
          model,
          contents,
          config: { systemInstruction, maxOutputTokens: 900, temperature: 0.5 }
        });
        return r.text || '';
      } catch (err) {
        lastErr = err;
        const status = err?.status || err?.code || err?.response?.status;
        const msg = String(err?.message || '');
        const temporary = status === 503 || status === 429 || /\b(503|429)\b/.test(msg);
        if (!temporary || attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 6000)));
      }
    }
    throw lastErr;
  }

  async function answer({ message, history, site, settings, viewing }) {
    if (!gemini) {
      return { ...localAnswer(message, site), fallback: true, sources: [] };
    }

    let docs = [];
    try {
      docs = await retrieve(message);
    } catch (e) {
      console.warn('RAG retrieval skipped:', e.message);
    }

    const docText = docs.map((d, i) => `[${i + 1}] (${d.source})\n${d.content}`).join('\n---\n');

    const contents = [
      ...history.map((h) => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] }
    ];

    try {
      const raw = await generate(contents, systemPrompt({ site, settings, docs: docText, now: localTime(timezone), viewing }));
      const { answer: text, actions } = extractActions(raw);
      if (!text) throw new Error('Empty model response');
      return {
        answer: text,
        actions,
        fallback: false,
        sources: docs.map((d) => ({ file: d.source, score: Number(d.score.toFixed(3)) }))
      };
    } catch (e) {
      console.error('Gemini error:', e?.message || e);
      return { ...localAnswer(message, site), fallback: true, sources: [] };
    }
  }

  return {
    answer,
    status: () => ({
      aiConfigured: Boolean(gemini),
      model,
      ragChunks: chunks.length,
      ragSources: [...new Set(chunks.map((c) => c.source))],
      ragError
    })
  };
}

// ---------------------------------------------------------------------------
// Local fallback engine (no API key / API outage)
// ---------------------------------------------------------------------------
const has = (q, words) => words.some((w) => (w instanceof RegExp ? w.test(q) : q.includes(w)));

const GENERAL_FITNESS = [
  { k: [/\bprotein\b/], a: 'For muscle building, most people do well with about **1.6–2.2 g of protein per kg of body weight per day**, spread over 3–5 meals. Good sources are eggs, chicken, fish, dairy, paneer, lentils, tofu and whey. Whey is convenient after training, but total daily protein matters more than timing.' },
  { k: ['creatine'], a: '**Creatine monohydrate** is one of the most researched supplements. A typical dose is **3–5 g per day**, every day, with water — no loading needed. It supports strength and power output. Check with a doctor first if you have kidney issues.' },
  { k: ['pre workout', 'pre-workout', 'supplement'], a: 'Supplements are optional. The basics that matter most are enough protein, sleep and consistent training. If you use extras, **creatine** and **whey protein** have the best evidence; keep caffeine-based pre-workouts moderate and avoid them late in the day.' },
  { k: ['warm up', 'warm-up', 'warmup'], a: 'A good warm-up takes **8–10 minutes**: 3–5 minutes of light cardio, a few dynamic moves (leg swings, arm circles, hip openers), then 1–2 lighter ramp-up sets of your first exercise.' },
  { k: ['progressive overload'], a: '**Progressive overload** means gradually making training harder — adding weight, reps, sets or better control over time. Small, steady increases (like +2.5 kg or +1 rep) are what drive long-term strength and muscle gains.' },
  { k: ['beginner', 'full body', 'full-body', 'routine', 'workout plan', 'workout'], a: 'A simple beginner full-body session, **3 days a week**:\n- Squat or leg press — 3 × 8–10\n- Push-ups or bench press — 3 × 8–10\n- Lat pulldown or rows — 3 × 10\n- Romanian deadlift — 3 × 10\n- Plank — 3 × 30 seconds\nRest 60–90 seconds between sets and add a little weight when all reps feel solid. A coach can check your form in your first sessions.' },
  { k: ['lose weight', 'weight loss', 'fat loss', 'lose fat', 'burn fat'], a: 'Fat loss comes down to a **moderate calorie deficit** (about 300–500 kcal/day), **high protein**, **strength training 3–4×/week** to keep muscle, daily steps, and good sleep. Aim for roughly 0.5–1% of body weight per week. Our **Weight Loss** program combines conditioning with nutrition guidance.' },
  { k: ['build muscle', 'muscle gain', 'gain muscle', 'bulk', 'hypertrophy', 'muscle growth'], a: 'To build muscle: train each muscle **about twice a week**, use **6–15 reps** close to failure, apply progressive overload, eat enough protein (1.6–2.2 g/kg) with a small calorie surplus, and sleep 7–9 hours. Our **Muscle Building** program is built around exactly this.' },
  { k: ['cardio', 'running', 'treadmill', 'hiit'], a: 'Aim for **150 minutes of moderate cardio** or **75 minutes of vigorous cardio** per week. Mix steady sessions (brisk walking, cycling) with 1–2 short HIIT sessions if you enjoy them, and keep strength training in your week too.' },
  { k: ['stretch', 'mobility', 'flexibility'], a: 'Use **dynamic stretches** before training and **static stretches (20–40 seconds)** after training or on rest days. 10 minutes of mobility work a few times a week improves range of motion and helps your lifts feel better.' },
  { k: ['rest day', 'recovery', 'sore', 'soreness', 'doms'], a: 'Recovery is when you actually get stronger. Take **1–2 rest days per week**, sleep 7–9 hours, eat enough protein, and use light movement like walking. Normal soreness fades in 1–3 days; sharp or joint pain is a reason to stop and get it checked.' },
  { k: ['sleep'], a: 'Aim for **7–9 hours of sleep**. Consistent sleep improves strength, recovery, appetite control and motivation — it is one of the most underrated parts of any training plan.' },
  { k: ['water', 'hydration', 'hydrate'], a: 'A good baseline is about **30–35 ml of water per kg of body weight per day**, plus extra around training — roughly 400–800 ml per hour of exercise, more in hot weather.' },
  { k: [/\b(calories?|macros|diet|nutrition|eat|meals?|food)\b/], a: 'Build meals around a **protein source, vegetables, a quality carb and some healthy fat**. Calories decide weight change; protein supports muscle; carbs fuel training. Our coaches offer nutrition guidance on the Weight Loss program and 1-on-1 nutrition coaching on the Elite plan.' },
  { k: ['chest', 'bench'], a: 'Great chest exercises: **bench press**, **incline dumbbell press**, **push-ups**, **dips** and **cable flyes**. Do 2–3 of them for 3–4 sets of 6–12 reps, twice a week.' },
  { k: [/\b(back|pull ?-?ups?|deadlifts?|rows?|lats?)\b/], a: 'For a strong back: **pull-ups or lat pulldowns**, **barbell or dumbbell rows**, **deadlifts or Romanian deadlifts** and **face pulls**. Keep your spine neutral and control every rep.' },
  { k: [/\b(legs?|squats?|glutes?|quads?|hamstrings?)\b/], a: 'Top leg exercises: **squats**, **Romanian deadlifts**, **lunges or split squats**, **leg press** and **hip thrusts**. Train legs 1–2 times a week with 3–4 sets of 6–12 reps.' },
  { k: [/\b(abs|core|six ?-?pack)\b/], a: 'Train your core with **planks, dead bugs, hanging knee raises and cable crunches** 2–3 times a week. Visible abs mostly come from lower body fat, so nutrition matters as much as ab training.' },
  { k: ['motivat', 'consisten', 'lazy'], a: 'Make it easy to show up: pick **fixed training days**, start with short sessions, track your progress, and train with a friend or coach. Consistency beats intensity — small wins every week add up.' }
];

const OFF_TOPIC = [/\b(python|javascript|java|html|css|code|coding|programming|sql|algorithm)\b/, /\b(politic|election|president|prime minister)\b/, /\b(movie|film|song|lyrics|celebrity|cricket score|football score)\b/, /\b(weather|stock|bitcoin|crypto)\b/, /\b(homework|essay|math|equation)\b/];

export function localAnswer(message, site) {
  const q = ` ${String(message).toLowerCase()} `;
  const cur = site.currency || '$';
  const brand = site.brand.name;
  const contactLine = `You can reach the team on **${site.contact.phone}** or **${site.contact.email}**.`;
  const reply = (answer, section) => ({ answer, actions: section ? [{ type: 'goto', section }] : [] });

  if (has(q, [/^\s*(hi|hello|hey|hii|yo|good (morning|afternoon|evening))\b/])) {
    return reply(`Hey! I'm the ${brand} assistant. Ask me about memberships, programs, trainers, opening hours — or any workout and nutrition question.`);
  }
  if (has(q, [/\b(thanks|thank you|thx)\b/])) return reply('Anytime! Let me know if there is anything else I can help you with.');

  const fitnessPlan = /\b(workout|training|diet|meal|nutrition|exercise|gym|fitness) (plan|routine|program)/.test(q);
  const nutritionTopic = /\b(protein|creatine|calories?|macros|carbs?|supplements?|whey)\b/.test(q) && !/\b(membership|price|cost)\b/.test(q);
  if (nutritionTopic) {
    const t = GENERAL_FITNESS.find((x) => has(q, x.k));
    if (t) return reply(t.a);
  }

  // Specific plan
  const plan = site.plans.find((p) => new RegExp(`\\b${p.name.toLowerCase()}\\b`).test(q) && !/\bprotein\b/.test(q));
  const shortQ = q.trim().split(/\s+/).length <= 3;
  if (plan && !fitnessPlan && (shortQ || /\b(plans?|membership|price|cost|includes?|get|offer|tier|package|worth|vs|compare)\b/.test(q))) {
    const inc = plan.features.filter((f) => f.included).map((f) => `- ${f.text}`).join('\n');
    return reply(`**${plan.name}** is **${cur}${plan.price}${plan.period}** — ${plan.tagline.toLowerCase()}. It includes:\n${inc}`, 'membership');
  }
  if (has(q, [/\b(membership|memberships|pricing|price|prices|cost|fees?|package|subscription)\b/]) || (/\bplans?\b/.test(q) && !fitnessPlan)) {
    const list = site.plans.map((p) => `- **${p.name}** — ${cur}${p.price}${p.period}: ${p.features.filter((f) => f.included).slice(0, 3).map((f) => f.text.toLowerCase()).join(', ')}`).join('\n');
    return reply(`We have ${site.plans.length} membership plans:\n${list}\nNo hidden fees, and you can cancel anytime.`, 'membership');
  }

  // Specific program
  const prog = site.programs.find((p) => q.includes(p.title.toLowerCase()) || q.includes(p.id));
  if (prog) return reply(`**${prog.title}** — ${prog.description} Send an enquiry from the Contact section and a coach will help you get started.`, 'programs');
  if (!fitnessPlan && has(q, [/\b(programs?|programmes?|classes|class)\b/, 'training option'])) {
    return reply(`We offer ${site.programs.length} programs:\n${site.programs.map((p) => `- **${p.title}** — ${p.description}`).join('\n')}`, 'programs');
  }

  if (has(q, ['trainer', 'coach', 'instructor', 'staff', 'team'])) {
    return reply(`Our coaching team:\n${site.trainers.map((t) => `- **${t.name}** — ${t.role}`).join('\n')}`, 'trainers');
  }
  if (!/sleep|cardio|train for|workout/.test(q) && has(q, [/\b(open|opening|close|closing|closed|timings?|hours|holidays?|sunday|saturday)\b/])) {
    return reply(`Our opening hours:\n${site.hours.map((h) => `- **${h.day}:** ${h.time}`).join('\n')}`, 'info');
  }
  if (has(q, ['where', 'location', 'address', 'located', 'direction', 'map'])) {
    return reply(`We're at **${[site.contact.addressLine1, site.contact.addressLine2].filter(Boolean).join(', ')}**. ${contactLine}`, 'info');
  }
  if (has(q, [/\b(contact|phone|call|email|e-mail|reach|whatsapp|number)\b/])) {
    return reply(`${contactLine} You can also send an enquiry from the Contact section — a coach replies within 24 hours.`, 'contact');
  }
  if (has(q, [/\b(join|sign ?up|register|get started|trial|consultation|book|enrol|enroll|cancel)\b/])) {
    return reply(`Getting started is easy: pick a goal, choose a program and plan, then send an enquiry through the Contact section for a **free consultation**. I can't book for you directly, but the team will set everything up. ${contactLine}`, 'contact');
  }

  // FAQ match by word overlap
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  let best = null, bestScore = 0;
  site.faqs.forEach((f) => {
    const fq = f.q.toLowerCase();
    const score = words.filter((w) => fq.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = f; }
  });
  if (best && bestScore >= 2) return reply(best.a);

  if (has(q, ['injur', 'pain', 'hurt', 'doctor', 'medical', 'pregnan', 'diabet', 'heart', 'blood pressure'])) {
    return reply('I can share general fitness guidance, but I can\'t diagnose or treat injuries or medical conditions. Please check with a doctor or physiotherapist first — our coaches can then adapt your training around their advice.');
  }

  const topic = GENERAL_FITNESS.find((t) => has(q, t.k));
  if (topic) return reply(topic.a);

  if (has(q, OFF_TOPIC)) {
    return reply(`I'm the ${brand} fitness assistant, so I can only help with gym, workout, nutrition and ${brand} questions. Want a workout idea or info on our membership plans?`);
  }

  return reply(`I can help with ${brand} memberships, programs, trainers, hours and location, plus workout, nutrition and recovery questions. I don't have a specific answer for that one — ${contactLine}`);
}
