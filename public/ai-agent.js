/* =========================================================
   IRONFORGE FITNESS — ai-agent.js
   Floating AI coach:
   - Draggable launcher + draggable chat panel (mouse, touch, keyboard)
   - Ask by voice (speech recognition) or chat
   - Every reply is shown in chat AND spoken aloud (toggleable)
   - Hands-free conversation mode (listens again after speaking)
   - Uses live website data via /api/site + /api/chat
   ========================================================= */
(function () {
  'use strict';

  var root = document.getElementById('aiAssistant');
  if (!root) return;

  // ---------------------------------------------------------------------------
  // Config + state
  // ---------------------------------------------------------------------------
  var cfg = {
    name: 'AI Support Coach',
    greeting: 'How can I help you train today?',
    subtitle: 'Ask about memberships, programs, trainers, opening hours, workouts, nutrition and recovery — by voice or chat.',
    voiceReplies: true,
    voiceRate: 1,
    voiceLang: 'en-US',
    continuousConversation: true,
    suggestions: [
      'What membership plans do you offer?',
      'What are your opening hours?',
      'Which program is best for fat loss?',
      'Give me a beginner full-body workout',
      'How much protein do I need to build muscle?',
      'How can I contact IRONFORGE?'
    ]
  };

  var KEYS = { pos: 'if-agent-pos', voice: 'if-agent-voice', chat: 'if-agent-chat', session: 'if-agent-session' };
  var SECTION_LABELS = { about: 'About', programs: 'Programs', trainers: 'Trainers', membership: 'Membership plans', gallery: 'Gallery', info: 'Hours & location', contact: 'Contact form', faq: 'FAQ' };

  var store = {
    get: function (area, key, fallback) {
      try { var v = window[area].getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (area, key, value) {
      try { window[area].setItem(key, JSON.stringify(value)); } catch (e) {}
    },
    del: function (area, key) { try { window[area].removeItem(key); } catch (e) {} }
  };

  var state = {
    open: false,
    busy: false,
    voiceMode: false,     // hands-free conversation on
    listening: false,
    speaking: false,
    voiceReplies: null,   // user preference (null = use admin default)
    messages: store.get('sessionStorage', KEYS.chat, []),
    sessionId: store.get('sessionStorage', KEYS.session, null),
    speakingRow: null
  };
  if (!state.sessionId) {
    state.sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    store.set('sessionStorage', KEYS.session, state.sessionId);
  }
  var savedVoicePref = store.get('localStorage', KEYS.voice, null);
  if (typeof savedVoicePref === 'boolean') state.voiceReplies = savedVoicePref;

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  var recognition = null;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  var I = {
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l1.9 5.6a3 3 0 0 0 1.9 1.9l5.6 1.9-5.6 1.9a3 3 0 0 0-1.9 1.9L12 21.6l-1.9-5.6a3 3 0 0 0-1.9-1.9L2.6 12.2l5.6-1.9a3 3 0 0 0 1.9-1.9z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    volOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    volOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4h4"/></svg>',
    move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 5.5v-.3a1.7 1.7 0 0 0-1.7-1.7H5.2a1.7 1.7 0 0 0-1.7 1.7v8.6a1.7 1.7 0 0 0 1.7 1.7h.3"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5"/></svg>'
  };

  // ---------------------------------------------------------------------------
  // Build UI
  // ---------------------------------------------------------------------------
  root.innerHTML =
    '<button class="ai-launcher" id="aiLauncher" type="button" aria-expanded="false" aria-controls="aiPanel" ' +
      'aria-label="Open AI coach. Drag to move, or use Shift plus arrow keys." title="Drag to move · Click to chat">' +
      '<span class="ai-launcher-orb"><span class="ai-pulse"></span>' + I.spark + '</span>' +
      '<span class="ai-launcher-label">Ask AI Coach</span>' +
      '<span class="ai-launcher-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
    '</button>' +
    '<section class="ai-panel" id="aiPanel" role="dialog" aria-modal="false" aria-labelledby="aiTitle" aria-hidden="true">' +
      '<header class="ai-header" data-drag-handle title="Drag to move">' +
        '<div class="ai-identity">' +
          '<div class="ai-avatar" aria-hidden="true"><span>IF</span><i class="ai-avatar-ring"></i></div>' +
          '<div class="ai-identity-text">' +
            '<span class="ai-kicker">IRONFORGE INTELLIGENCE</span>' +
            '<h3 id="aiTitle"></h3>' +
            '<span class="ai-status" id="aiStatus"><i></i><span>Online · voice &amp; chat</span></span>' +
          '</div>' +
        '</div>' +
        '<div class="ai-header-actions">' +
          '<button type="button" class="ai-icon-btn" id="aiVoiceToggle" aria-pressed="true"></button>' +
          '<button type="button" class="ai-icon-btn" id="aiNewChat" aria-label="Start a new chat" title="New chat">' + I.reset + '</button>' +
          '<button type="button" class="ai-icon-btn ai-move-hint" id="aiResetPos" aria-label="Reset position" title="Drag the header to move · click to reset position">' + I.move + '</button>' +
          '<button type="button" class="ai-icon-btn" id="aiClose" aria-label="Close AI coach" title="Close">' + I.close + '</button>' +
        '</div>' +
      '</header>' +
      '<div class="ai-messages" id="aiMessages" aria-live="polite" aria-relevant="additions"></div>' +
      '<div class="ai-voice-bar" id="aiVoiceBar" hidden>' +
        '<span class="ai-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>' +
        '<span class="ai-voice-text" id="aiVoiceText">Listening…</span>' +
        '<button type="button" class="ai-voice-stop" id="aiVoiceStop">Stop</button>' +
      '</div>' +
      '<form class="ai-composer" id="aiForm" autocomplete="off">' +
        '<button type="button" class="ai-mic" id="aiMic" aria-pressed="false" aria-label="Start voice conversation" title="Talk to the AI coach">' + I.mic + '</button>' +
        '<label class="sr-only" for="aiInput">Message the AI coach</label>' +
        '<textarea id="aiInput" rows="1" maxlength="1500" placeholder="Ask by voice or type a question…"></textarea>' +
        '<button type="submit" class="ai-send" id="aiSend" aria-label="Send message" disabled>' + I.send + '</button>' +
      '</form>' +
      '<p class="ai-disclaimer">AI answers use IRONFORGE website info and general fitness knowledge. Not medical advice.</p>' +
    '</section>';

  var $ = function (id) { return document.getElementById(id); };
  var launcher = $('aiLauncher');
  var panel = $('aiPanel');
  var header = panel.querySelector('.ai-header');
  var messagesEl = $('aiMessages');
  var form = $('aiForm');
  var input = $('aiInput');
  var sendBtn = $('aiSend');
  var micBtn = $('aiMic');
  var voiceToggle = $('aiVoiceToggle');
  var voiceBar = $('aiVoiceBar');
  var voiceText = $('aiVoiceText');
  var statusEl = $('aiStatus').querySelector('span');

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Safe markdown-lite: **bold**, *italic*, "- " bullets, "1." lists, paragraphs
  function renderMarkdown(text) {
    var lines = esc(text).split(/\r?\n/);
    var html = '';
    var list = null;
    function inline(s) {
      return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
    }
    function closeList() { if (list) { html += '</' + list + '>'; list = null; } }
    lines.forEach(function (line) {
      var t = line.trim();
      var bullet = t.match(/^[-•*]\s+(.*)/);
      var num = t.match(/^\d+[.)]\s+(.*)/);
      if (bullet || num) {
        var type = bullet ? 'ul' : 'ol';
        if (list !== type) { closeList(); html += '<' + type + '>'; list = type; }
        html += '<li>' + inline((bullet || num)[1]) + '</li>';
      } else if (!t) {
        closeList();
      } else {
        closeList();
        html += '<p>' + inline(t.replace(/^#+\s*/, '')) + '</p>';
      }
    });
    closeList();
    return html;
  }

  // Text that sounds natural when read aloud
  function speechText(text) {
    return String(text)
      .replace(/\*\*|__|`/g, '')
      .replace(/(^|\n)\s*[-•*]\s+/g, '$1')
      .replace(/(^|\n)\s*(\d+)[.)]\s+/g, '$1$2. ')
      .replace(/(\d+)\s*×\s*(\d)/g, '$1 sets of $2')
      .replace(/(\d)\s*[–-]\s*(\d)/g, '$1 to $2')
      .replace(/\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s*[–-]\s*(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/g, '$1day to $2day')
      .replace(/:\s*\n/g, ': ')
      .replace(/\s+[–—]\s+/g, ', ')
      .replace(/\/mo\b/g, ' per month')
      .replace(/\bkg\b/g, 'kilograms')
      .replace(/\n+/g, '. ')
      .replace(/\.\s*\./g, '.')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function voiceRepliesOn() {
    return state.voiceReplies == null ? !!cfg.voiceReplies : state.voiceReplies;
  }

  function currentSection() {
    var ids = ['home', 'about', 'programs', 'trainers', 'membership', 'gallery', 'testimonials', 'info', 'faq', 'contact'];
    var mid = window.innerHeight * 0.4;
    for (var i = 0; i < ids.length; i++) {
      var el = ids[i] === 'home' ? document.getElementById('hero') : document.getElementById(ids[i]);
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) return ids[i];
    }
    return '';
  }

  function setStatus(text) { statusEl.textContent = text; }

  function setRootState() {
    var s = state.listening ? 'listening' : state.speaking ? 'speaking' : state.busy ? 'thinking' : 'idle';
    root.setAttribute('data-state', s);
    root.classList.toggle('voice-mode', state.voiceMode);
    var label = {
      listening: 'Listening…',
      speaking: 'Speaking…',
      thinking: 'Thinking…',
      idle: state.voiceMode ? 'Voice mode on · tap mic to speak' : 'Online · voice & chat'
    }[s];
    setStatus(label);

    voiceBar.hidden = !(state.listening || state.speaking);
    voiceText.textContent = state.listening ? 'Listening… ask your question' : 'Speaking… ';
    $('aiVoiceStop').textContent = state.listening ? 'Cancel' : 'Stop';

    micBtn.classList.toggle('active', state.voiceMode);
    micBtn.classList.toggle('is-listening', state.listening);
    micBtn.setAttribute('aria-pressed', String(state.voiceMode));
    micBtn.setAttribute('aria-label', state.voiceMode ? 'Turn off voice conversation' : 'Start voice conversation');
  }

  function updateVoiceToggle() {
    var on = voiceRepliesOn();
    voiceToggle.innerHTML = on ? I.volOn : I.volOff;
    voiceToggle.setAttribute('aria-pressed', String(on));
    voiceToggle.setAttribute('aria-label', on ? 'Mute spoken replies' : 'Turn on spoken replies');
    voiceToggle.title = on ? 'Spoken replies on' : 'Spoken replies off';
    voiceToggle.classList.toggle('is-off', !on);
  }

  // ---------------------------------------------------------------------------
  // Position + dragging
  // ---------------------------------------------------------------------------
  var MARGIN = 16;
  var pos = store.get('localStorage', KEYS.pos, {}) || {};

  function isCompact() { return window.innerWidth < 600; }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function launcherBox() {
    return { w: launcher.offsetWidth || 180, h: launcher.offsetHeight || 60 };
  }

  // Positions are stored as fractions of the free space so they survive resizes
  function toPx(frac, box) {
    return {
      x: MARGIN + frac.fx * Math.max(0, window.innerWidth - box.w - MARGIN * 2),
      y: MARGIN + frac.fy * Math.max(0, window.innerHeight - box.h - MARGIN * 2)
    };
  }
  function toFrac(px, box) {
    var fw = Math.max(1, window.innerWidth - box.w - MARGIN * 2);
    var fh = Math.max(1, window.innerHeight - box.h - MARGIN * 2);
    return { fx: clamp((px.x - MARGIN) / fw, 0, 1), fy: clamp((px.y - MARGIN) / fh, 0, 1) };
  }

  function placeLauncher(px) {
    var b = launcherBox();
    var x = clamp(px.x, MARGIN, window.innerWidth - b.w - MARGIN);
    var y = clamp(px.y, MARGIN, window.innerHeight - b.h - MARGIN);
    launcher.style.left = x + 'px';
    launcher.style.top = y + 'px';
    root.classList.toggle('on-left', x + b.w / 2 < window.innerWidth / 2);
    return { x: x, y: y };
  }

  function launcherPx() {
    var b = launcherBox();
    return toPx(pos.launcher || { fx: 1, fy: 1 }, b);
  }

  function panelBox() {
    return { w: panel.offsetWidth || 400, h: panel.offsetHeight || 600 };
  }

  function placePanel() {
    if (isCompact()) {
      panel.style.left = panel.style.top = '';
      panel.classList.add('is-sheet');
      return;
    }
    panel.classList.remove('is-sheet');
    var p = panelBox();
    var x, y;
    if (pos.panel) {
      var px = toPx(pos.panel, p);
      x = px.x; y = px.y;
    } else {
      // Anchor next to the launcher: above it if it's in the lower half, else below
      var l = launcher.getBoundingClientRect();
      var below = l.top + l.height / 2 < window.innerHeight / 2;
      y = below ? l.bottom + 12 : l.top - p.h - 12;
      x = root.classList.contains('on-left') ? l.left : l.right - p.w;
      panel.style.transformOrigin = (below ? 'top ' : 'bottom ') + (root.classList.contains('on-left') ? 'left' : 'right');
    }
    x = clamp(x, MARGIN, window.innerWidth - p.w - MARGIN);
    y = clamp(y, MARGIN, window.innerHeight - p.h - MARGIN);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  function savePos() { store.set('localStorage', KEYS.pos, pos); }

  function makeDraggable(handle, opts) {
    var start = null;
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (opts.ignore && e.target.closest(opts.ignore)) return;
      if (opts.enabled && !opts.enabled()) return;
      var r = opts.el.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false, id: e.pointerId };
      // Capture right away so fast drags don't lose the pointer
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    });
    handle.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id) return;
      var dx = e.clientX - start.x;
      var dy = e.clientY - start.y;
      if (!start.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      if (!start.moved) {
        start.moved = true;
        root.classList.add('is-dragging');
      }
      e.preventDefault();
      opts.move(start.left + dx, start.top + dy);
    });
    function end(e) {
      if (!start || (e && e.pointerId !== start.id)) return;
      var moved = start.moved;
      start = null;
      root.classList.remove('is-dragging');
      if (moved) {
        opts.done();
        handle.dataset.justDragged = '1';
        setTimeout(function () { delete handle.dataset.justDragged; }, 50);
      }
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  makeDraggable(launcher, {
    el: launcher,
    move: function (x, y) {
      placeLauncher({ x: x, y: y });
      if (state.open && !pos.panel) placePanel();
    },
    done: function () {
      var r = launcher.getBoundingClientRect();
      pos.launcher = toFrac({ x: r.left, y: r.top }, launcherBox());
      // Re-anchor the panel to the launcher's new spot
      delete pos.panel;
      savePos();
      if (state.open) placePanel();
    }
  });

  makeDraggable(header, {
    el: panel,
    ignore: 'button',
    enabled: function () { return !isCompact(); },
    move: function (x, y) {
      var p = panelBox();
      panel.style.left = clamp(x, MARGIN, window.innerWidth - p.w - MARGIN) + 'px';
      panel.style.top = clamp(y, MARGIN, window.innerHeight - p.h - MARGIN) + 'px';
    },
    done: function () {
      var r = panel.getBoundingClientRect();
      pos.panel = toFrac({ x: r.left, y: r.top }, panelBox());
      savePos();
    }
  });

  // Keyboard: Shift + arrows moves the launcher
  launcher.addEventListener('keydown', function (e) {
    if (!e.shiftKey) return;
    var step = 32;
    var d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    var r = launcher.getBoundingClientRect();
    var p = placeLauncher({ x: r.left + d[0], y: r.top + d[1] });
    pos.launcher = toFrac(p, launcherBox());
    delete pos.panel;
    savePos();
    if (state.open) placePanel();
  });

  $('aiResetPos').addEventListener('click', function () {
    pos = {};
    store.del('localStorage', KEYS.pos);
    placeLauncher(launcherPx());
    placePanel();
  });
  header.addEventListener('dblclick', function (e) {
    if (e.target.closest('button')) return;
    delete pos.panel;
    savePos();
    placePanel();
  });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      placeLauncher(launcherPx());
      if (state.open) placePanel();
    }, 80);
  });

  // ---------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------
  function setOpen(open) {
    state.open = open;
    root.classList.toggle('is-open', open);
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute('aria-label', open ? 'Close AI coach' : 'Open AI coach. Drag to move, or use Shift plus arrow keys.');
    if (open) {
      placePanel();
      setTimeout(function () {
        if (!isCompact()) input.focus({ preventScroll: true });
        if (!$('aiWelcome')) scrollToEnd();
      }, 140);
    } else {
      stopVoiceMode();
    }
  }

  launcher.addEventListener('click', function () {
    if (launcher.dataset.justDragged) return;
    setOpen(!state.open);
  });
  $('aiClose').addEventListener('click', function () { setOpen(false); launcher.focus(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open && !document.querySelector('.module-modal.open')) {
      setOpen(false);
      launcher.focus();
    }
  });

  // Any element on the page can open the agent / ask a question
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-open-assistant], [data-ai-prompt]');
    if (!t) return;
    e.preventDefault();
    if (!state.open) setOpen(true);
    var q = t.getAttribute('data-ai-prompt');
    if (q) ask(q, 'text');
  });

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------
  function scrollToEnd() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderWelcome() {
    var w = document.createElement('div');
    w.className = 'ai-welcome';
    w.id = 'aiWelcome';
    w.innerHTML =
      '<div class="ai-welcome-orb" aria-hidden="true">' + I.spark + '</div>' +
      '<h4>' + esc(cfg.greeting) + '</h4>' +
      '<p>' + esc(cfg.subtitle) + '</p>' +
      '<div class="ai-welcome-modes">' +
        '<button type="button" class="ai-mode-card" data-start-voice>' + I.mic + '<span><strong>Talk</strong><small>Speak & hear replies</small></span></button>' +
        '<button type="button" class="ai-mode-card" data-focus-input>' + I.send + '<span><strong>Type</strong><small>Chat with the coach</small></span></button>' +
      '</div>' +
      '<p class="ai-welcome-label">Try asking</p>' +
      '<div class="ai-suggestions">' + cfg.suggestions.map(function (s) {
        return '<button type="button" class="ai-chip" data-suggest="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('') + '</div>';
    messagesEl.appendChild(w);
  }

  messagesEl.addEventListener('click', function (e) {
    var s = e.target.closest('[data-suggest]');
    if (s) return ask(s.getAttribute('data-suggest'), 'text');
    if (e.target.closest('[data-start-voice]')) return startVoiceMode();
    if (e.target.closest('[data-focus-input]')) return input.focus();

    var go = e.target.closest('[data-goto]');
    if (go) return gotoSection(go.getAttribute('data-goto'));

    var play = e.target.closest('[data-speak]');
    if (play) {
      var row = play.closest('.ai-message');
      if (state.speaking && state.speakingRow === row) { stopSpeaking(); return; }
      speak(row._text, row);
      return;
    }
    var copy = e.target.closest('[data-copy]');
    if (copy) {
      var text = copy.closest('.ai-message')._text;
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () {
        copy.classList.add('done');
        setTimeout(function () { copy.classList.remove('done'); }, 1200);
      });
      return;
    }
    var retry = e.target.closest('[data-retry]');
    if (retry) {
      var q = retry.getAttribute('data-retry');
      retry.closest('.ai-message').remove();
      ask(q, 'text', true);
    }
  });

  function addMessage(msg, animate) {
    var w = $('aiWelcome');
    if (w) w.remove();

    var row = document.createElement('div');
    row.className = 'ai-message ' + (msg.role === 'user' ? 'ai-message-user' : 'ai-message-bot') + (animate === false ? ' no-anim' : '');
    row._text = msg.content;

    if (msg.role === 'user') {
      row.innerHTML = '<div class="ai-bubble">' + (msg.mode === 'voice' ? '<span class="ai-voice-tag">' + I.mic + 'Voice</span>' : '') + '<p>' + esc(msg.content) + '</p></div>';
    } else {
      var goto = (msg.actions || []).filter(function (a) { return a.type === 'goto' && SECTION_LABELS[a.section]; })[0];
      row.innerHTML =
        '<div class="ai-message-avatar" aria-hidden="true">IF</div>' +
        '<div class="ai-bubble-wrap">' +
          '<div class="ai-bubble' + (msg.error ? ' is-error' : '') + '">' + renderMarkdown(msg.content) +
            (goto ? '<button type="button" class="ai-goto" data-goto="' + goto.section + '">View ' + esc(SECTION_LABELS[goto.section]) + ' ' + I.arrow + '</button>' : '') +
            (msg.error && msg.retry ? '<button type="button" class="ai-goto" data-retry="' + esc(msg.retry) + '">Try again ' + I.reset + '</button>' : '') +
          '</div>' +
          (msg.error ? '' :
          '<div class="ai-msg-tools">' +
            '<button type="button" data-speak aria-label="Play this reply aloud" title="Listen">' + I.play + '<span>Listen</span></button>' +
            '<button type="button" data-copy aria-label="Copy reply" title="Copy">' + I.copy + '<span>Copy</span></button>' +
          '</div>') +
        '</div>';
    }
    messagesEl.appendChild(row);
    scrollToEnd();
    return row;
  }

  function addTyping() {
    var row = document.createElement('div');
    row.className = 'ai-message ai-message-bot ai-typing-row';
    row.innerHTML = '<div class="ai-message-avatar" aria-hidden="true">IF</div><div class="ai-bubble"><span class="ai-typing" aria-label="Thinking"><span></span><span></span><span></span></span></div>';
    messagesEl.appendChild(row);
    scrollToEnd();
    return row;
  }

  function persistChat() {
    store.set('sessionStorage', KEYS.chat, state.messages.slice(-40));
  }

  function gotoSection(section) {
    var el = document.getElementById(section);
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('ai-spotlight');
    void el.offsetWidth;
    el.classList.add('ai-spotlight');
    setTimeout(function () { el.classList.remove('ai-spotlight'); }, 2200);
    // On small screens the panel covers the page — get out of the way
    if (isCompact()) setOpen(false);
  }

  function resetChat() {
    stopSpeaking();
    stopListening();
    state.messages = [];
    persistChat();
    messagesEl.innerHTML = '';
    renderWelcome();
    state.sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    store.set('sessionStorage', KEYS.session, state.sessionId);
    input.focus();
  }
  $('aiNewChat').addEventListener('click', resetChat);

  // ---------------------------------------------------------------------------
  // Asking
  // ---------------------------------------------------------------------------
  function ask(text, mode, isRetry) {
    text = String(text || '').trim();
    if (!text || state.busy) return;
    if (!state.open) setOpen(true);
    stopSpeaking();
    stopListening(true);

    var userMsg = { role: 'user', content: text, mode: mode };
    if (!isRetry) {
      addMessage(userMsg);
      state.messages.push(userMsg);
      persistChat();
    }

    state.busy = true;
    setRootState();
    sendBtn.disabled = true;
    var typing = addTyping();

    var history = state.messages.slice(0, -1).slice(-10).map(function (m) { return { role: m.role, content: m.content }; });
    var wantsNavigation = /\b(show|take me|go to|open|navigate|scroll|where (is|are) the)\b/i.test(text);

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: history,
        sessionId: state.sessionId,
        mode: mode,
        page: location.pathname,
        section: currentSection()
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Request failed');
          return data;
        });
      })
      .then(function (data) {
        typing.remove();
        var botMsg = { role: 'assistant', content: data.answer, actions: data.actions || [] };
        state.messages.push(botMsg);
        persistChat();
        var row = addMessage(botMsg);

        var goto = botMsg.actions.filter(function (a) { return a.type === 'goto'; })[0];
        if (goto && wantsNavigation) setTimeout(function () { gotoSection(goto.section); }, 400);

        if (voiceRepliesOn() || mode === 'voice') speak(data.answer, row);
        else if (state.voiceMode) listenAgain();
      })
      .catch(function (err) {
        typing.remove();
        var msg = /too many/i.test(err.message)
          ? 'You\'re sending messages quickly — give me a few seconds and try again.'
          : 'Sorry, I couldn\'t reach the assistant just now. Check your connection and try again.';
        addMessage({ role: 'assistant', content: msg, error: true, retry: text });
      })
      .finally(function () {
        state.busy = false;
        setRootState();
        sendBtn.disabled = !input.value.trim();
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value;
    if (!v.trim() || state.busy) return;
    input.value = '';
    autoGrow();
    ask(v, 'text');
  });

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    sendBtn.disabled = !input.value.trim() || state.busy;
  }
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  // ---------------------------------------------------------------------------
  // Speech output (TTS)
  // ---------------------------------------------------------------------------
  var chosenVoice = null;
  function pickVoice() {
    if (!synth) return null;
    var voices = synth.getVoices();
    if (!voices.length) return null;
    var lang = (cfg.voiceLang || 'en-US').toLowerCase();
    var base = lang.split('-')[0];
    var pool = voices.filter(function (v) { return v.lang && v.lang.toLowerCase() === lang; });
    if (!pool.length) pool = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(base) === 0; });
    if (!pool.length) pool = voices;
    var prefs = [/natural/i, /neural/i, /google/i, /aria|jenny|guy|samantha|daniel|karen|serena/i];
    for (var i = 0; i < prefs.length; i++) {
      var hit = pool.filter(function (v) { return prefs[i].test(v.name); })[0];
      if (hit) return hit;
    }
    return pool[0];
  }
  if (synth) {
    chosenVoice = pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', function () { chosenVoice = pickVoice(); });
  }

  function chunkText(text) {
    // Chrome cuts off long utterances — speak sentence-sized chunks
    var parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    var chunks = [];
    var buf = '';
    parts.forEach(function (p) {
      if ((buf + p).length > 180 && buf) { chunks.push(buf.trim()); buf = ''; }
      buf += p;
    });
    if (buf.trim()) chunks.push(buf.trim());
    return chunks;
  }

  var speakToken = 0;
  function speak(text, row) {
    if (!synth) {
      if (state.voiceMode) listenAgain();
      return;
    }
    stopSpeaking();
    var token = ++speakToken;
    var chunks = chunkText(speechText(text));
    if (!chunks.length) return;

    state.speaking = true;
    state.speakingRow = row || null;
    if (row) row.classList.add('is-speaking');
    setRootState();

    var i = 0;
    function next() {
      if (token !== speakToken) return;
      if (i >= chunks.length) {
        finishSpeaking(token);
        return;
      }
      var u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = cfg.voiceLang || 'en-US';
      if (chosenVoice) u.voice = chosenVoice;
      u.rate = Number(cfg.voiceRate) || 1;
      u.pitch = 1;
      u.onend = next;
      u.onerror = function () { finishSpeaking(token); };
      synth.speak(u);
    }
    // Some browsers need a tick after cancel()
    setTimeout(next, 60);
  }

  function finishSpeaking(token) {
    if (token !== speakToken) return;
    state.speaking = false;
    if (state.speakingRow) state.speakingRow.classList.remove('is-speaking');
    state.speakingRow = null;
    setRootState();
    if (state.voiceMode) listenAgain();
  }

  function stopSpeaking() {
    speakToken++;
    if (synth) synth.cancel();
    if (state.speakingRow) state.speakingRow.classList.remove('is-speaking');
    state.speakingRow = null;
    if (state.speaking) { state.speaking = false; setRootState(); }
  }

  voiceToggle.addEventListener('click', function () {
    state.voiceReplies = !voiceRepliesOn();
    store.set('localStorage', KEYS.voice, state.voiceReplies);
    if (!state.voiceReplies) stopSpeaking();
    updateVoiceToggle();
  });

  // ---------------------------------------------------------------------------
  // Speech input (STT) + hands-free conversation
  // ---------------------------------------------------------------------------
  function buildRecognition() {
    if (recognition || !Recognition) return recognition;
    recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    var finalText = '';
    recognition.onstart = function () {
      finalText = '';
      state.listening = true;
      setRootState();
    };
    recognition.onresult = function (event) {
      var interim = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      input.value = (finalText + interim).trim();
      autoGrow();
      voiceText.textContent = '“' + input.value + '”';
    };
    recognition.onerror = function (event) {
      state.listening = false;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        state.voiceMode = false;
        addMessage({ role: 'assistant', content: 'Microphone access is blocked. Allow microphone permission for this site in your browser, then tap the mic again — or just type your question.', error: true });
      } else if (event.error === 'no-speech' && state.voiceMode) {
        setStatus('Didn\'t catch that — tap the mic to try again');
        state.voiceMode = false;
      } else if (event.error === 'network') {
        addMessage({ role: 'assistant', content: 'Voice recognition needs an internet connection. Please type your question instead.', error: true });
        state.voiceMode = false;
      }
      setRootState();
    };
    recognition.onend = function () {
      state.listening = false;
      var cancelled = recognition._cancelled;
      var text = cancelled ? '' : (finalText.trim() || input.value.trim());
      recognition._cancelled = false;
      if (cancelled) { input.value = ''; autoGrow(); }
      setRootState();
      if (text && !state.busy) {
        input.value = '';
        autoGrow();
        ask(text, 'voice');
      }
    };
    return recognition;
  }

  function startListening() {
    if (state.listening || state.busy) return;
    var rec = buildRecognition();
    if (!rec) return;
    stopSpeaking();
    rec.lang = cfg.voiceLang || 'en-US';
    rec._cancelled = false;
    try { rec.start(); } catch (e) { /* already started */ }
  }

  function stopListening(cancel) {
    if (!recognition || !state.listening) return;
    recognition._cancelled = !!cancel;
    try { cancel ? recognition.abort() : recognition.stop(); } catch (e) {}
  }

  function listenAgain() {
    if (!state.voiceMode || !cfg.continuousConversation || !state.open) return;
    setTimeout(function () { if (state.voiceMode && !state.speaking && !state.busy) startListening(); }, 350);
  }

  function startVoiceMode() {
    if (!Recognition) {
      addMessage({
        role: 'assistant',
        content: 'Voice input isn\'t supported in this browser. Please use **Chrome**, **Edge** or **Safari** to talk to me — or type your question below. I\'ll still read my replies aloud.',
        error: true
      });
      return;
    }
    state.voiceMode = true;
    if (state.voiceReplies === false) { state.voiceReplies = true; updateVoiceToggle(); }
    setRootState();
    startListening();
  }

  function stopVoiceMode() {
    state.voiceMode = false;
    stopListening(true);
    stopSpeaking();
    setRootState();
  }

  micBtn.addEventListener('click', function () {
    if (state.speaking) { stopSpeaking(); if (state.voiceMode) { startListening(); return; } }
    if (state.listening) { stopListening(false); state.voiceMode = false; setRootState(); return; }
    if (state.voiceMode) { stopVoiceMode(); return; }
    startVoiceMode();
  });

  $('aiVoiceStop').addEventListener('click', function () {
    if (state.listening) { state.voiceMode = false; stopListening(true); input.value = ''; autoGrow(); }
    if (state.speaking) stopSpeaking();
    setRootState();
  });

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function applyConfig(data) {
    if (data && data.assistant) {
      Object.keys(data.assistant).forEach(function (k) {
        if (data.assistant[k] != null && data.assistant[k] !== '') cfg[k] = data.assistant[k];
      });
      if (!cfg.suggestions || !cfg.suggestions.length) cfg.suggestions = [];
    }
    $('aiTitle').textContent = cfg.name;
    updateVoiceToggle();
    if ($('aiWelcome')) { $('aiWelcome').remove(); renderWelcome(); }
  }

  function init() {
    $('aiTitle').textContent = cfg.name;
    updateVoiceToggle();
    if (state.messages.length) {
      state.messages.forEach(function (m) { addMessage(m, false); });
    } else {
      renderWelcome();
    }
    placeLauncher(launcherPx());
    root.classList.add('is-ready');
    setRootState();

    if (window.IRONFORGE_DATA) applyConfig(window.IRONFORGE_DATA);
    window.addEventListener('ironforge:data', function (e) { applyConfig(e.detail); });

    // Stop talking if the visitor leaves the tab
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stopSpeaking(); stopListening(true); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
