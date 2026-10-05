# IRONFORGE FITNESS — Website + AI Coach + Admin

A gym website with a draggable AI coach that you can talk to or chat with, a private admin panel, and light and dark modes.

## What's new in v2

### Private admin panel at `/admin`
- Nothing on the public website links to it. It sends `noindex` headers so search engines skip it, and it needs a password to sign in.
- **Overview:** enquiries, AI conversations, how many questions were asked by voice, top questions, a 14-day activity chart and AI status.
- **Enquiries:** contact-form messages are saved here. You can filter and search them, set a status (new / contacted / joined / closed), add notes, reply by email or phone, and export to CSV.
- **AI conversations:** full transcripts of what visitors asked, by voice or by chat.
- **Subscribers:** newsletter sign-ups from the footer. You can copy all the emails at once.
- **Website content:** edit the announcement bar, memberships (prices, features, featured plan), programs, trainers, opening hours, contact details and map, stats and FAQs. Changes go live straight away, and the AI uses the same data.
- **AI assistant:** set the name, greeting, suggested questions, voice language and speed, whether replies are spoken by default, hands-free mode and extra instructions. There is also a built-in test console.
- **System:** Gemini and knowledge-base status, plus a security checklist.
- Light and dark mode, and it works on mobile.

### AI coach
- **You can move it anywhere.** Drag the launcher button, or drag the chat window by its header. You can also use Shift + arrow keys. The position is saved. Double-click the header (or press the move icon) to put it back.
- **Voice or chat in, voice and chat out.** Every answer appears in the chat and is also read aloud. Visitors can mute this with the speaker icon.
- **Hands-free mode:** tap the mic once. The coach listens, answers out loud, then listens again.
- **Covers any gym-related question:** IRONFORGE facts plus workouts, technique, nutrition, protein and supplements, fat loss, muscle gain, recovery and sleep. It politely turns down questions that aren't about fitness.
- **Uses the website's data:** live content from the admin panel, the FAQs, the PDF knowledge base (RAG), and which section of the page the visitor is looking at.
- **Can move around the page:** it can scroll to the right section, for example "show me the membership plans", using a "View … →" button.
- Answers are formatted, and each one has Listen and Copy buttons. The chat survives a page reload, and there is a retry button if a request fails.
- **Works without an API key:** if Gemini isn't set up or is down, a built-in engine answers from your website data.

### Light and dark mode
- A toggle in the navbar and in the mobile menu. It follows the system setting until the visitor picks one, and the choice is saved.
- The cinematic hero and video areas stay dark in both modes. All the content sections switch.

### Other upgrades
- The contact form and newsletter now actually save submissions. They have spam protection (a hidden honeypot field) and rate limits.
- There is a new FAQ section, an optional announcement bar, and an optional Google Maps embed.
- **Security fix:** the old server exposed the entire project folder, including `.env`, `server.js` and `rag.db`, to the internet. Now only the `public/` folder and image and video files are served.

## Project structure

```
server.js            Express server (website, AI API, admin API)
lib/ai.js            AI brain: Gemini + RAG + built-in fallback answers
lib/store.js         JSON data store (content, enquiries, chats) → data/db.json
lib/auth.js          Admin login + signed session cookie
lib/defaults.js      Default website content and AI settings
public/              The public website (index.html, style.css, scripts)
  ai-agent.js        Draggable voice + chat AI coach
  site-content.js    Renders live content from /api/site
admin/               Admin panel (index.html, admin.css, admin.js)
knowledge/           PDFs for the knowledge base
ingest.js            Builds rag.db from the PDFs
```

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`, then set `GEMINI_API_KEY`, `ADMIN_PASSWORD` and `SESSION_SECRET`.
4. **Move your images and video** (`hero.jpg`, `program1.jpg`, `trainer1.jpg`, `gym-video.mp4` and so on) into `public/`. Images left in the project root still work, but `public/` is the right place for them.
5. Run `npm start`, or `npm run dev` to restart automatically when files change.
6. Website: http://localhost:3000. Admin: http://localhost:3000/admin

If `ADMIN_PASSWORD` isn't set, the server prints a temporary password in the terminal when it starts.

## Knowledge base (PDF → RAG)

Put PDFs in `knowledge/`, then run `npm run ingest` and restart the server. Website content edited in the admin panel always takes priority over the PDFs.

## Voice support

Voice input uses the browser's speech recognition, which works best in Chrome, Edge and Safari. Spoken replies work in all modern browsers. Visitors need to allow microphone access, and the site must be served over HTTPS (or from localhost).

## Production checklist

- Set a strong `ADMIN_PASSWORD` and a random `SESSION_SECRET`.
- Optionally change `ADMIN_PATH` to a private URL.
- Set `NODE_ENV=production` and serve the site over HTTPS.
- Back up `data/db.json`. It holds your content edits, enquiries and chat logs.
