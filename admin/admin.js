/* IRONFORGE Admin dashboard (vanilla JS, no build step) */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var md = function (v) { return esc(v).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  var fmtDate = function (iso, withTime) {
    if (!iso) return '';
    var d = new Date(iso);
    var opts = withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleString(undefined, opts);
  };
  var ago = function (iso) {
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return fmtDate(iso);
  };
  var getPath = function (obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  };
  var setPath = function (obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) { return o[k]; }, obj);
    target[last] = value;
  };

  var ICON = {
    ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    err: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 19.5h14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4.5v4h-4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 5.5v-.3a1.7 1.7 0 0 0-1.7-1.7H5.2a1.7 1.7 0 0 0-1.7 1.7v8.6a1.7 1.7 0 0 0 1.7 1.7h.3"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><path d="M4 6.5h16v11H4z"/><path d="M4 7l8 6 8-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3A2 2 0 0 1 18 19.5 15.5 15.5 0 0 1 4.5 6 2 2 0 0 1 6.5 4z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>'
  };

  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type || 'ok');
    t.innerHTML = (type === 'err' ? ICON.err : ICON.ok) + '<span>' + esc(msg) + '</span>';
    $('#toasts').appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(function () { t.remove(); }, 3000);
  }

  function api(method, url, body) {
    return fetch('/api/admin' + url, {
      method: method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'IronforgeAdmin' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (res.status === 401 && url !== '/login') { showLogin(); throw new Error('Session expired — please sign in again.'); }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
        return data;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  function applyTheme(t, save) {
    document.documentElement.setAttribute('data-theme', t);
    $$('[data-theme-label]').forEach(function (el) { el.textContent = t === 'light' ? 'Dark mode' : 'Light mode'; });
    if (save) { try { localStorage.setItem('if-admin-theme', t); } catch (e) {} }
  }
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-theme-toggle]')) {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
    }
  });

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------
  var state = {
    user: null,
    route: 'overview',
    site: null, siteDraft: null,
    settings: null, settingsDraft: null,
    dirty: null,
    contentTab: 'general',
    leadFilter: 'all', leadSearch: '',
    activeChat: null
  };

  function showLogin() {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    $('#saveBar').hidden = true;
    setTimeout(function () { $('#loginUser').focus(); }, 50);
  }

  function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    route();
    refreshBadge();
  }

  $('#pwToggle').addEventListener('click', function () {
    var p = $('#loginPass');
    var show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    this.textContent = show ? 'Hide' : 'Show';
    this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#loginError');
    var btn = $('#loginBtn');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    api('POST', '/login', { username: $('#loginUser').value.trim(), password: $('#loginPass').value })
      .then(function (r) { state.user = r.user; $('#loginPass').value = ''; showApp(); })
      .catch(function (ex) { err.textContent = ex.message; err.hidden = false; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Sign in'; });
  });

  $('#logoutBtn').addEventListener('click', function () {
    if (state.dirty && !confirm('Discard unsaved changes and sign out?')) return;
    state.dirty = null;
    api('POST', '/logout').finally(function () { showLogin(); });
  });

  // ---------------------------------------------------------------------------
  // Routing + layout
  // ---------------------------------------------------------------------------
  var PAGES = {
    overview: { title: 'Overview', sub: 'How your website and AI coach are performing', render: renderOverview },
    enquiries: { title: 'Enquiries', sub: 'Messages sent from the website contact form', render: renderEnquiries },
    conversations: { title: 'AI conversations', sub: 'What visitors ask the AI coach (voice & chat)', render: renderConversations },
    subscribers: { title: 'Subscribers', sub: 'Newsletter sign-ups from the footer', render: renderSubscribers },
    content: { title: 'Website content', sub: 'Changes go live instantly — the AI coach uses this data too', render: renderContent },
    assistant: { title: 'AI assistant', sub: 'Personality, voice and behaviour of the AI coach', render: renderAssistant },
    system: { title: 'System', sub: 'AI, knowledge base and security status', render: renderSystem }
  };

  var lastRoute = null;
  function route() {
    var r = (location.hash || '#overview').slice(1);
    if (!PAGES[r]) r = 'overview';
    if (state.dirty && lastRoute && r !== lastRoute) {
      if (!confirm('You have unsaved changes. Leave without saving?')) {
        history.replaceState(null, '', '#' + lastRoute);
        return;
      }
      discard();
    }
    lastRoute = r;
    state.route = r;
    $$('#nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.route === r); });
    $('#pageTitle').textContent = PAGES[r].title;
    $('#pageSub').textContent = PAGES[r].sub;
    $('#pageActions').innerHTML = '';
    $('#page').innerHTML = '<div class="skeleton"></div>';
    $('.app').classList.remove('menu-open');
    PAGES[r].render();
    document.title = PAGES[r].title + ' · IRONFORGE Admin';
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  $('#menuBtn').addEventListener('click', function () { $('.app').classList.toggle('menu-open'); });
  $('#scrim').addEventListener('click', function () { $('.app').classList.remove('menu-open'); });

  function actions(html) { $('#pageActions').innerHTML = html; }
  function page(html) { $('#page').innerHTML = html; }
  function fail(ex) { page('<div class="card empty"><strong>Couldn\'t load this page</strong>' + esc(ex.message) + '</div>'); }

  function refreshBadge() {
    api('GET', '/leads').then(function (leads) {
      var n = leads.filter(function (l) { return l.status === 'new'; }).length;
      var b = $('#badgeLeads');
      b.textContent = n;
      b.hidden = !n;
    }).catch(function () {});
  }

  // ---------------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------------
  function renderOverview() {
    actions('<button class="btn" id="refreshBtn">' + ICON.refresh + '<span>Refresh</span></button>');
    $('#refreshBtn').onclick = renderOverview;
    api('GET', '/overview').then(function (d) {
      var t = d.totals;
      var s = d.system;
      page(
        '<div class="kpis">' +
          kpi('New enquiries', t.newLeads, t.leads + ' total', 'accent') +
          kpi('Enquiries · 7 days', t.leads7d, 'from the contact form') +
          kpi('AI conversations · 7 days', t.chats7d, t.chats + ' total') +
          kpi('Questions answered', t.questions, t.voiceShare + '% asked by voice') +
          kpi('Subscribers', t.subscribers, 'newsletter') +
        '</div>' +
        '<div class="cols-2">' +
          '<div class="cards">' +
            '<div class="card"><div class="card-head"><div><h2>Activity</h2><p>Last 14 days</p></div>' +
              '<div class="legend"><span><i style="background:var(--accent)"></i>Conversations</span><span><i style="background:var(--accent-2)"></i>Enquiries</span></div></div>' +
              '<div class="chart">' + chart(d.activity) + '</div></div>' +
            '<div class="card"><div class="card-head"><div><h2>Top questions</h2><p>Most asked to the AI coach</p></div></div>' +
              (d.topQuestions.length ? '<ul class="list">' + d.topQuestions.map(function (q) {
                return '<li><div class="grow"><div class="title">' + esc(q.q) + '</div></div><span class="count-pill">' + q.n + '×</span></li>';
              }).join('') + '</ul>' : '<div class="empty">No questions yet. Try the AI coach on your website.</div>') +
            '</div>' +
          '</div>' +
          '<div class="cards">' +
            '<div class="card"><div class="card-head"><div><h2>Recent enquiries</h2></div><a class="btn btn-sm" href="#enquiries">View all</a></div>' +
              (d.recentLeads.length ? '<ul class="list">' + d.recentLeads.map(function (l) {
                return '<li><div class="grow"><div class="title">' + esc(l.name) + '</div><div class="sub">' + esc(l.interest || l.email) + ' · ' + ago(l.createdAt) + '</div></div>' + badge(l.status) + '</li>';
              }).join('') + '</ul>' : '<div class="empty">No enquiries yet.</div>') +
            '</div>' +
            '<div class="card card-pad"><h2 style="font-size:.98rem;margin-bottom:.4rem">AI status</h2>' +
              statusRow('Gemini AI', s.aiConfigured ? '<span class="badge badge-ok">Connected</span>' : '<span class="badge badge-warn">Fallback mode</span>') +
              statusRow('Model', esc(s.model)) +
              statusRow('Knowledge chunks', s.ragChunks ? s.ragChunks + ' from PDFs' : '<span class="badge badge-warn">Not loaded</span>') +
              statusRow('Fallback answers', t.fallbackAnswers) +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).catch(fail);
  }

  function kpi(label, value, sub, cls) {
    return '<div class="card kpi ' + (cls || '') + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(sub || '') + '</small></div>';
  }
  function statusRow(k, v) { return '<div class="status-row"><span>' + esc(k) + '</span><span>' + v + '</span></div>'; }
  function badge(status) { return '<span class="badge badge-' + esc(status) + '">' + esc(status) + '</span>'; }

  function chart(a) {
    var W = 560, H = 170, pad = 22;
    var max = Math.max(4, Math.max.apply(null, a.chats.concat(a.leads)));
    var n = a.days.length;
    var slot = (W - pad) / n;
    var bw = Math.min(14, slot / 3);
    var y = function (v) { return H - (v / max) * (H - 16); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + (H + 20) + '" role="img" aria-label="Conversations and enquiries over the last 14 days">';
    [0, 0.5, 1].forEach(function (f) {
      var v = Math.round(max * f);
      svg += '<line class="grid-line" x1="' + pad + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      svg += '<text x="0" y="' + (y(v) + 3) + '">' + v + '</text>';
    });
    a.days.forEach(function (d, i) {
      var x = pad + i * slot + slot / 2;
      var c = a.chats[i], l = a.leads[i];
      if (c) svg += '<rect class="bar-a" rx="3" x="' + (x - bw - 1) + '" y="' + y(c) + '" width="' + bw + '" height="' + (H - y(c)) + '"><title>' + d + ': ' + c + ' conversations</title></rect>';
      if (l) svg += '<rect class="bar-b" rx="3" x="' + (x + 1) + '" y="' + y(l) + '" width="' + bw + '" height="' + (H - y(l)) + '"><title>' + d + ': ' + l + ' enquiries</title></rect>';
      if (i % 2 === 0 || n < 10) svg += '<text text-anchor="middle" x="' + x + '" y="' + (H + 15) + '">' + new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + '</text>';
    });
    return svg + '</svg>';
  }

  // ---------------------------------------------------------------------------
  // Enquiries
  // ---------------------------------------------------------------------------
  var leadsCache = [];
  function renderEnquiries() {
    actions('<a class="btn" href="/api/admin/leads.csv">' + ICON.download + '<span>Export CSV</span></a>');
    api('GET', '/leads').then(function (leads) {
      leadsCache = leads;
      page(
        '<div class="card">' +
          '<div class="toolbar">' +
            '<div class="seg" id="leadSeg">' + ['all', 'new', 'contacted', 'joined', 'closed'].map(function (s) {
              var n = s === 'all' ? leads.length : leads.filter(function (l) { return l.status === s; }).length;
              return '<button type="button" data-f="' + s + '" class="' + (state.leadFilter === s ? 'on' : '') + '">' + s.charAt(0).toUpperCase() + s.slice(1) + ' (' + n + ')</button>';
            }).join('') + '</div>' +
            '<input class="input" id="leadSearch" type="search" placeholder="Search name, email, message…" value="' + esc(state.leadSearch) + '" />' +
          '</div>' +
          '<div class="table-wrap" id="leadTable"></div>' +
        '</div>'
      );
      $('#leadSeg').addEventListener('click', function (e) {
        var b = e.target.closest('[data-f]');
        if (!b) return;
        state.leadFilter = b.dataset.f;
        $$('#leadSeg button').forEach(function (x) { x.classList.toggle('on', x === b); });
        drawLeads();
      });
      $('#leadSearch').addEventListener('input', function () { state.leadSearch = this.value; drawLeads(); });
      drawLeads();
    }).catch(fail);
  }

  function drawLeads() {
    var q = state.leadSearch.toLowerCase();
    var rows = leadsCache.filter(function (l) {
      if (state.leadFilter !== 'all' && l.status !== state.leadFilter) return false;
      if (!q) return true;
      return [l.name, l.email, l.phone, l.message, l.interest].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    var el = $('#leadTable');
    if (!rows.length) {
      el.innerHTML = '<div class="empty"><strong>No enquiries here</strong>New contact-form messages will appear in this list.</div>';
      return;
    }
    el.innerHTML = '<table><thead><tr><th>Name</th><th>Interest</th><th>Status</th><th>Message</th><th>Received</th></tr></thead><tbody>' +
      rows.map(function (l) {
        return '<tr class="clickable" data-id="' + esc(l.id) + '" tabindex="0">' +
          '<td><strong>' + esc(l.name) + '</strong><span class="sub">' + esc(l.email) + '</span></td>' +
          '<td>' + esc(l.interest || '—') + '</td>' +
          '<td>' + badge(l.status) + '</td>' +
          '<td><div class="truncate">' + esc(l.message) + '</div></td>' +
          '<td><span title="' + esc(fmtDate(l.createdAt, true)) + '">' + ago(l.createdAt) + '</span></td></tr>';
      }).join('') + '</tbody></table>';
    $$('tr[data-id]', el).forEach(function (tr) {
      var open = function () { openLead(tr.dataset.id); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
    });
  }

  function openLead(id) {
    var l = leadsCache.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    openDrawer(esc(l.name),
      '<dl class="kv">' +
        '<dt>Email</dt><dd><a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a></dd>' +
        '<dt>Phone</dt><dd>' + (l.phone ? '<a href="tel:' + esc(l.phone.replace(/[^\d+]/g, '')) + '">' + esc(l.phone) + '</a>' : '—') + '</dd>' +
        '<dt>Interest</dt><dd>' + esc(l.interest || '—') + '</dd>' +
        '<dt>Received</dt><dd>' + esc(fmtDate(l.createdAt, true)) + '</dd>' +
        '<dt>Source</dt><dd>' + esc(l.source === 'assistant' ? 'AI coach' : 'Contact form') + '</dd>' +
      '</dl>' +
      '<div class="message-box">' + esc(l.message) + '</div>' +
      '<label class="field"><span>Status</span><select id="leadStatus">' + ['new', 'contacted', 'joined', 'closed'].map(function (s) {
        return '<option value="' + s + '"' + (l.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="field"><span>Internal notes</span><textarea id="leadNotes" placeholder="Called on Monday, booked a trial…">' + esc(l.notes || '') + '</textarea></label>' +
      '<div class="drawer-actions">' +
        '<button class="btn btn-primary" id="leadSave">Save</button>' +
        '<a class="btn" href="mailto:' + esc(l.email) + '?subject=' + encodeURIComponent('Your IRONFORGE FITNESS enquiry') + '">' + ICON.mail + 'Reply by email</a>' +
        (l.phone ? '<a class="btn" href="tel:' + esc(l.phone.replace(/[^\d+]/g, '')) + '">' + ICON.phone + 'Call</a>' : '') +
        '<button class="btn btn-danger" id="leadDelete" style="margin-left:auto">' + ICON.trash + 'Delete</button>' +
      '</div>'
    );
    $('#leadSave').onclick = function () {
      api('PATCH', '/leads/' + id, { status: $('#leadStatus').value, notes: $('#leadNotes').value }).then(function (u) {
        Object.assign(l, u);
        toast('Enquiry updated');
        closeDrawer();
        renderEnquiries();
        refreshBadge();
      }).catch(function (ex) { toast(ex.message, 'err'); });
    };
    $('#leadDelete').onclick = function () {
      if (!confirm('Delete this enquiry permanently?')) return;
      api('DELETE', '/leads/' + id).then(function () {
        toast('Enquiry deleted');
        closeDrawer();
        renderEnquiries();
        refreshBadge();
      }).catch(function (ex) { toast(ex.message, 'err'); });
    };
  }

  // ---------------------------------------------------------------------------
  // Drawer
  // ---------------------------------------------------------------------------
  var lastFocus = null;
  function openDrawer(title, html) {
    lastFocus = document.activeElement;
    $('#drawerTitle').innerHTML = title;
    $('#drawerBody').innerHTML = html;
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    setTimeout(function () { var f = $('#drawerBody select, #drawerBody button'); if (f) f.focus(); }, 60);
  }
  function closeDrawer() {
    $('#drawer').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    if (lastFocus) lastFocus.focus();
  }
  $('#drawer').addEventListener('click', function (e) { if (e.target.closest('[data-close-drawer]')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#drawer').classList.contains('open')) closeDrawer(); });

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------
  function renderConversations() {
    api('GET', '/chats').then(function (chats) {
      if (!chats.length) {
        page('<div class="card empty"><strong>No conversations yet</strong>When visitors talk to the AI coach, transcripts appear here.</div>');
        return;
      }
      if (!state.activeChat || !chats.some(function (c) { return c.id === state.activeChat; })) state.activeChat = chats[0].id;
      page(
        '<div class="card convo">' +
          '<div class="convo-list" id="convoList">' + chats.map(function (c) {
            return '<button type="button" class="convo-item' + (c.id === state.activeChat ? ' on' : '') + '" data-id="' + esc(c.id) + '">' +
              '<div class="title">' + esc(c.preview || '(empty)') + '</div>' +
              '<div class="meta"><span>' + ago(c.updatedAt) + '</span><span>·</span><span>' + c.count + ' question' + (c.count === 1 ? '' : 's') + '</span>' +
              (c.voice ? '<span class="badge badge-voice">Voice</span>' : '') + '</div></button>';
          }).join('') + '</div>' +
          '<div class="transcript" id="transcript"></div>' +
        '</div>'
      );
      $('#convoList').addEventListener('click', function (e) {
        var b = e.target.closest('[data-id]');
        if (!b) return;
        state.activeChat = b.dataset.id;
        $$('.convo-item').forEach(function (x) { x.classList.toggle('on', x === b); });
        loadTranscript();
      });
      loadTranscript();
    }).catch(fail);
  }

  function loadTranscript() {
    var el = $('#transcript');
    el.innerHTML = '<div class="card-body"><div class="skeleton"></div></div>';
    api('GET', '/chats/' + state.activeChat).then(function (c) {
      el.innerHTML =
        '<div class="card-head"><div><h3>Conversation</h3><p>Started ' + esc(fmtDate(c.startedAt, true)) + (c.voice ? ' · used voice' : '') + '</p></div>' +
          '<button class="btn btn-sm btn-danger" id="chatDelete">' + ICON.trash + 'Delete</button></div>' +
        '<div class="transcript-body">' + c.messages.map(function (m) {
          return '<div class="msg ' + (m.role === 'user' ? 'msg-user' : 'msg-bot') + '">' + md(m.content) +
            '<span class="msg-meta">' + (m.role === 'user' ? (m.mode === 'voice' ? '🎙 Voice · ' : 'Typed · ') : (m.fallback ? 'Fallback answer · ' : 'AI · ')) + esc(fmtDate(m.at, true)) + '</span></div>';
        }).join('') + '</div>';
      $('#chatDelete').onclick = function () {
        if (!confirm('Delete this conversation?')) return;
        api('DELETE', '/chats/' + c.id).then(function () { toast('Conversation deleted'); state.activeChat = null; renderConversations(); });
      };
    }).catch(function (ex) { el.innerHTML = '<div class="empty">' + esc(ex.message) + '</div>'; });
  }

  // ---------------------------------------------------------------------------
  // Subscribers
  // ---------------------------------------------------------------------------
  function renderSubscribers() {
    api('GET', '/subscribers').then(function (subs) {
      actions(subs.length ? '<button class="btn" id="copyEmails">' + ICON.copy + '<span>Copy all emails</span></button>' : '');
      if ($('#copyEmails')) $('#copyEmails').onclick = function () {
        navigator.clipboard.writeText(subs.map(function (s) { return s.email; }).join(', ')).then(function () { toast(subs.length + ' emails copied'); });
      };
      if (!subs.length) {
        page('<div class="card empty"><strong>No subscribers yet</strong>Sign-ups from the website footer will appear here.</div>');
        return;
      }
      page('<div class="card"><div class="table-wrap"><table><thead><tr><th>Email</th><th>Subscribed</th><th></th></tr></thead><tbody>' +
        subs.map(function (s) {
          return '<tr><td>' + esc(s.email) + '</td><td>' + esc(fmtDate(s.createdAt, true)) + '</td><td style="text-align:right"><button class="icon-btn danger" data-del="' + esc(s.id) + '" aria-label="Remove ' + esc(s.email) + '">' + ICON.trash + '</button></td></tr>';
        }).join('') + '</tbody></table></div></div>');
      $$('[data-del]').forEach(function (b) {
        b.onclick = function () {
          if (!confirm('Remove this subscriber?')) return;
          api('DELETE', '/subscribers/' + b.dataset.del).then(function () { toast('Subscriber removed'); renderSubscribers(); });
        };
      });
    }).catch(fail);
  }

  // ---------------------------------------------------------------------------
  // Dirty-state handling for editable pages
  // ---------------------------------------------------------------------------
  function markDirty(kind) {
    state.dirty = kind;
    $('#saveBar').hidden = false;
  }
  function discard() {
    state.siteDraft = state.site ? clone(state.site) : null;
    state.settingsDraft = state.settings ? clone(state.settings) : null;
    state.dirty = null;
    $('#saveBar').hidden = true;
  }
  $('#discardBtn').addEventListener('click', function () {
    discard();
    PAGES[state.route].render();
  });
  $('#saveBtn').addEventListener('click', save);
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && state.dirty) { e.preventDefault(); save(); }
  });

  function save() {
    var btn = $('#saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    var p = state.dirty === 'settings'
      ? api('PUT', '/settings', state.settingsDraft).then(function (s) { state.settings = s; })
      : api('PUT', '/site', state.siteDraft).then(function (s) { state.site = s; });
    p.then(function () {
      discard();
      toast('Saved — your website is updated');
      PAGES[state.route].render();
    }).catch(function (ex) { toast(ex.message, 'err'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'Save changes'; });
  }

  // Generic binding: <input data-path="brand.name" data-type="number|bool|lines">
  function bindInputs(container, draftKey, kind) {
    container.addEventListener('input', onChange);
    container.addEventListener('change', onChange);
    function onChange(e) {
      var el = e.target;
      var path = el.dataset && el.dataset.path;
      if (!path) return;
      var v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.dataset.type === 'number') v = el.value === '' ? 0 : Number(el.value);
      else if (el.dataset.type === 'lines') v = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      else v = el.value;
      setPath(state[draftKey], path, v);
      if (el.dataset.live) updateLive(el.dataset.live);
      markDirty(kind);
    }
  }

  function input(label, path, draft, opts) {
    opts = opts || {};
    var v = getPath(draft, path);
    var common = ' data-path="' + path + '"' + (opts.type === 'number' ? ' data-type="number"' : '') + (opts.live ? ' data-live="' + opts.live + '"' : '') + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '');
    var control = opts.area
      ? '<textarea' + common + ' rows="' + (opts.rows || 3) + '">' + esc(v) + '</textarea>'
      : '<input' + common + ' type="' + (opts.type === 'number' ? 'number' : (opts.inputType || 'text')) + '" value="' + esc(v) + '"' + (opts.step ? ' step="' + opts.step + '"' : '') + ' />';
    return '<label class="field"><span>' + esc(label) + '</span>' + control + (opts.hint ? '<small>' + esc(opts.hint) + '</small>' : '') + '</label>';
  }

  function toggle(title, desc, path, draft) {
    return '<label class="switch"><span><strong>' + esc(title) + '</strong><small>' + esc(desc) + '</small></span>' +
      '<input type="checkbox" data-path="' + path + '"' + (getPath(draft, path) ? ' checked' : '') + ' /><span class="track"></span></label>';
  }

  function listTools(list, i, len) {
    return '<div class="repeat-tools">' +
      '<button type="button" class="icon-btn" data-act="up" data-list="' + list + '" data-i="' + i + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
      '<button type="button" class="icon-btn" data-act="down" data-list="' + list + '" data-i="' + i + '" aria-label="Move down"' + (i === len - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
      '<button type="button" class="icon-btn danger" data-act="remove" data-list="' + list + '" data-i="' + i + '" aria-label="Remove">' + ICON.trash + '</button></div>';
  }

  // Structural list actions (add / remove / reorder)
  function bindListActions(container, draftKey, kind, rerender, factories) {
    container.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var list = getPath(state[draftKey], b.dataset.list);
      var i = Number(b.dataset.i);
      if (b.dataset.act === 'add') list.push(factories[b.dataset.list] ? factories[b.dataset.list]() : '');
      if (b.dataset.act === 'remove') list.splice(i, 1);
      if (b.dataset.act === 'up' && i > 0) list.splice(i - 1, 0, list.splice(i, 1)[0]);
      if (b.dataset.act === 'down' && i < list.length - 1) list.splice(i + 1, 0, list.splice(i, 1)[0]);
      markDirty(kind);
      rerender();
    });
  }

  // ---------------------------------------------------------------------------
  // Website content
  // ---------------------------------------------------------------------------
  var CONTENT_TABS = [
    ['general', 'General'],
    ['announcement', 'Announcement'],
    ['plans', 'Memberships'],
    ['programs', 'Programs'],
    ['trainers', 'Trainers'],
    ['hours', 'Hours & contact'],
    ['faqs', 'FAQs']
  ];

  function renderContent() {
    actions('<a class="btn" href="/" target="_blank" rel="noopener">' + ICON.ext + '<span>Preview site</span></a>');
    var load = state.site ? Promise.resolve(state.site) : api('GET', '/site');
    load.then(function (site) {
      state.site = site;
      if (!state.siteDraft || !state.dirty) state.siteDraft = clone(site);
      page(
        '<div class="tabs" role="tablist" id="contentTabs">' + CONTENT_TABS.map(function (t) {
          return '<button type="button" role="tab" data-tab="' + t[0] + '" class="' + (state.contentTab === t[0] ? 'on' : '') + '" aria-selected="' + (state.contentTab === t[0]) + '">' + t[1] + '</button>';
        }).join('') + '</div><div id="tabBody"></div>'
      );
      $('#contentTabs').addEventListener('click', function (e) {
        var b = e.target.closest('[data-tab]');
        if (!b) return;
        state.contentTab = b.dataset.tab;
        $$('#contentTabs button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
        drawTab();
      });
      var body = $('#tabBody');
      bindInputs(body, 'siteDraft', 'site');
      bindListActions(body, 'siteDraft', 'site', drawTab, {
        trainers: function () { return { name: 'New trainer', role: 'Coach', image: '' }; },
        hours: function () { return { day: 'Day', time: '00:00 – 00:00', note: false }; },
        faqs: function () { return { q: 'New question?', a: 'Answer' }; },
        plans: function () { return { id: 'plan-' + Date.now(), name: 'New plan', tagline: '', price: 0, period: '/mo', featured: false, badge: '', features: [{ text: 'Feature', included: true }] }; }
      });
      body.addEventListener('click', function (e) {
        var b = e.target.closest('[data-feature]');
        if (!b) return;
        var plan = state.siteDraft.plans[Number(b.dataset.plan)];
        var i = Number(b.dataset.i);
        if (b.dataset.feature === 'add') plan.features.push({ text: '', included: true });
        if (b.dataset.feature === 'remove') plan.features.splice(i, 1);
        markDirty('site');
        drawTab();
      });
      drawTab();
    }).catch(fail);
  }

  function updateLive(key) {
    if (key === 'announce') {
      var a = state.siteDraft.announcement;
      var el = $('#announcePreview');
      if (el) el.innerHTML = esc(a.text || 'Your announcement text') + (a.linkText ? ' &nbsp;<u>' + esc(a.linkText) + '</u>' : '');
    }
  }

  function drawTab() {
    var d = state.siteDraft;
    var body = $('#tabBody');
    var t = state.contentTab;
    var html = '';

    if (t === 'general') {
      html = '<div class="card card-pad stack">' +
        '<div class="grid-2">' + input('Gym name', 'brand.name', d, { max: 80 }) + input('Founded (year)', 'brand.founded', d, { type: 'number' }) + '</div>' +
        input('Tagline (footer + AI)', 'brand.tagline', d, { area: true, rows: 2, max: 240 }) +
        '<div><p class="field-label" style="margin-bottom:.5rem">Stats counters</p><div class="grid-4">' +
          input('Active members', 'stats.members', d, { type: 'number' }) +
          input('Expert trainers', 'stats.trainers', d, { type: 'number' }) +
          input('Years running', 'stats.years', d, { type: 'number' }) +
          input('Equipment units', 'stats.equipment', d, { type: 'number' }) +
        '</div></div>' +
        '<div class="grid-4">' + input('Currency symbol', 'currency', d, { max: 4, hint: 'e.g. $, ₹, €' }) + '</div>' +
      '</div>';
    }

    if (t === 'announcement') {
      html = '<div class="card card-pad stack">' +
        toggle('Show announcement bar', 'A slim banner at the top of every page. The AI coach also mentions active offers.', 'announcement.enabled', d) +
        input('Message', 'announcement.text', d, { area: true, rows: 2, max: 240, live: 'announce' }) +
        '<div class="grid-2">' + input('Link text', 'announcement.linkText', d, { max: 40, live: 'announce', placeholder: 'Claim offer' }) +
          input('Link target', 'announcement.linkHref', d, { placeholder: '#contact', hint: 'A section like #contact, or a full https:// link' }) + '</div>' +
        '<div><p class="field-label" style="margin-bottom:.5rem">Preview</p><div class="preview-announce" id="announcePreview"></div></div>' +
      '</div>';
    }

    if (t === 'plans') {
      html = '<div class="section-note"><strong>Tip:</strong> mark one plan as featured to highlight it. Features that are not included show as crossed out.</div>' +
        d.plans.map(function (p, i) {
          return '<div class="plan-card">' +
            '<div class="plan-card-head"><h3>' + esc(p.name || 'Plan') + '</h3>' + listToolsRow('plans', i, d.plans.length) + '</div>' +
            '<div class="grid-4">' +
              input('Name', 'plans.' + i + '.name', d, { max: 40 }) +
              input('Price', 'plans.' + i + '.price', d, { type: 'number', step: '0.01' }) +
              input('Period', 'plans.' + i + '.period', d, { max: 12, placeholder: '/mo' }) +
              input('Badge', 'plans.' + i + '.badge', d, { max: 30, placeholder: 'Most Popular' }) +
            '</div>' +
            '<div style="margin-top:1rem">' + input('Short description', 'plans.' + i + '.tagline', d, { max: 120 }) + '</div>' +
            '<label class="check" style="margin:1rem 0"><input type="checkbox" data-path="plans.' + i + '.featured"' + (p.featured ? ' checked' : '') + ' /> Featured plan</label>' +
            '<p class="field-label" style="margin-bottom:.5rem">Features</p>' +
            p.features.map(function (f, j) {
              return '<div class="feature-row">' +
                '<input class="input" data-path="plans.' + i + '.features.' + j + '.text" value="' + esc(f.text) + '" maxlength="120" aria-label="Feature text" />' +
                '<label class="check"><input type="checkbox" data-path="plans.' + i + '.features.' + j + '.included"' + (f.included ? ' checked' : '') + ' /> Included</label>' +
                '<button type="button" class="icon-btn danger" data-feature="remove" data-plan="' + i + '" data-i="' + j + '" aria-label="Remove feature">' + ICON.trash + '</button></div>';
            }).join('') +
            '<button type="button" class="btn btn-sm" style="margin-top:.75rem" data-feature="add" data-plan="' + i + '">' + ICON.plus + 'Add feature</button>' +
          '</div>';
        }).join('') +
        (d.plans.length < 6 ? '<button type="button" class="btn" style="margin-top:1rem" data-act="add" data-list="plans">' + ICON.plus + 'Add plan</button>' : '');
    }

    if (t === 'programs') {
      html = '<div class="section-note">The five programs are linked to their photos and 3D previews, so you can edit their text but not add or remove them.</div>' +
        '<div class="stack">' + d.programs.map(function (p, i) {
          return '<div class="card card-pad"><div class="grid-2" style="grid-template-columns:1fr 2fr">' +
            input('Program name', 'programs.' + i + '.title', d, { max: 60 }) +
            input('Description', 'programs.' + i + '.description', d, { area: true, rows: 2, max: 400 }) +
          '</div></div>';
        }).join('') + '</div>';
    }

    if (t === 'trainers') {
      html = '<div class="section-note">Photos: put the image file in the <strong>public</strong> folder and type its file name (e.g. <strong>trainer5.jpg</strong>), or paste a full https:// image link.</div>' +
        '<div class="repeat">' + d.trainers.map(function (tr, i) {
          return '<div class="repeat-item"><div class="grow grid-3">' +
            input('Name', 'trainers.' + i + '.name', d, { max: 60 }) +
            input('Role / specialty', 'trainers.' + i + '.role', d, { max: 80 }) +
            input('Photo', 'trainers.' + i + '.image', d, { max: 300, placeholder: 'trainer1.jpg' }) +
          '</div>' + listTools('trainers', i, d.trainers.length) + '</div>';
        }).join('') + '</div>' +
        (d.trainers.length < 12 ? '<button type="button" class="btn" style="margin-top:1rem" data-act="add" data-list="trainers">' + ICON.plus + 'Add trainer</button>' : '');
    }

    if (t === 'hours') {
      html = '<div class="cols-2">' +
        '<div class="card"><div class="card-head"><h2>Opening hours</h2></div><div class="card-body">' +
          '<div class="repeat">' + d.hours.map(function (h, i) {
            return '<div class="repeat-item"><div class="grow stack" style="gap:.6rem"><div class="grid-2">' +
              input('Day(s)', 'hours.' + i + '.day', d, { max: 40 }) + input('Hours', 'hours.' + i + '.time', d, { max: 40 }) + '</div>' +
              '<label class="check"><input type="checkbox" data-path="hours.' + i + '.note"' + (h.note ? ' checked' : '') + ' /> Show as special note (e.g. holidays)</label>' +
            '</div>' + listTools('hours', i, d.hours.length) + '</div>';
          }).join('') + '</div>' +
          '<button type="button" class="btn" style="margin-top:1rem" data-act="add" data-list="hours">' + ICON.plus + 'Add row</button>' +
        '</div></div>' +
        '<div class="card"><div class="card-head"><h2>Location & contact</h2></div><div class="card-body stack">' +
          input('Address line 1', 'contact.addressLine1', d, { max: 120 }) +
          input('Address line 2', 'contact.addressLine2', d, { max: 120 }) +
          input('Phone', 'contact.phone', d, { max: 40, inputType: 'tel' }) +
          input('Email', 'contact.email', d, { max: 120, inputType: 'email' }) +
          input('Google Maps embed URL (optional)', 'contact.mapEmbedUrl', d, { area: true, rows: 2, hint: 'Google Maps → Share → Embed a map → copy only the src="https://www.google.com/maps/embed?..." link' }) +
        '</div></div>' +
      '</div>';
    }

    if (t === 'faqs') {
      html = '<div class="section-note">FAQs appear on the website <strong>and</strong> teach the AI coach how to answer these questions.</div>' +
        '<div class="repeat">' + d.faqs.map(function (f, i) {
          return '<div class="repeat-item"><div class="grow stack" style="gap:.6rem">' +
            input('Question', 'faqs.' + i + '.q', d, { max: 200 }) +
            input('Answer', 'faqs.' + i + '.a', d, { area: true, rows: 3, max: 1200 }) +
          '</div>' + listTools('faqs', i, d.faqs.length) + '</div>';
        }).join('') + '</div>' +
        '<button type="button" class="btn" style="margin-top:1rem" data-act="add" data-list="faqs">' + ICON.plus + 'Add FAQ</button>';
    }

    body.innerHTML = html;
    updateLive('announce');
  }

  function listToolsRow(list, i, len) {
    return '<div style="display:flex;gap:.15rem">' +
      '<button type="button" class="icon-btn" data-act="up" data-list="' + list + '" data-i="' + i + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
      '<button type="button" class="icon-btn" data-act="down" data-list="' + list + '" data-i="' + i + '" aria-label="Move down"' + (i === len - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
      '<button type="button" class="icon-btn danger" data-act="remove" data-list="' + list + '" data-i="' + i + '" aria-label="Remove plan">' + ICON.trash + '</button></div>';
  }

  // ---------------------------------------------------------------------------
  // AI assistant settings
  // ---------------------------------------------------------------------------
  var LANGS = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)'], ['en-AU', 'English (Australia)'], ['hi-IN', 'Hindi'], ['ml-IN', 'Malayalam'], ['ta-IN', 'Tamil'], ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['ar-SA', 'Arabic']];

  function renderAssistant() {
    var load = state.settings ? Promise.resolve(state.settings) : api('GET', '/settings');
    load.then(function (settings) {
      state.settings = settings;
      if (!state.settingsDraft || !state.dirty) state.settingsDraft = clone(settings);
      var d = state.settingsDraft;
      var a = d.assistant;
      page(
        '<div class="cols-2">' +
          '<div class="cards" id="assistantForm">' +
            '<div class="card"><div class="card-head"><div><h2>Identity</h2><p>What visitors see when they open the coach</p></div></div><div class="card-body stack">' +
              input('Assistant name', 'assistant.name', d, { max: 40 }) +
              input('Welcome headline', 'assistant.greeting', d, { max: 120 }) +
              input('Welcome text', 'assistant.subtitle', d, { area: true, rows: 2, max: 240 }) +
              '<label class="field"><span>Suggested questions</span><textarea data-path="assistant.suggestions" data-type="lines" rows="6">' + esc(a.suggestions.join('\n')) + '</textarea><small>One per line, up to 8. Shown as quick-start chips.</small></label>' +
            '</div></div>' +
            '<div class="card"><div class="card-head"><div><h2>Voice</h2><p>Speech recognition and spoken replies run in the visitor\'s browser</p></div></div><div class="card-body">' +
              toggle('Speak replies aloud by default', 'Every answer is shown in chat and read out. Visitors can mute it.', 'assistant.voiceReplies', d) +
              toggle('Hands-free conversation', 'In voice mode, the coach listens again automatically after it finishes speaking.', 'assistant.continuousConversation', d) +
              '<div class="grid-2" style="margin-top:1rem">' +
                '<label class="field"><span>Voice language</span><select data-path="assistant.voiceLang">' + LANGS.map(function (l) {
                  return '<option value="' + l[0] + '"' + (a.voiceLang === l[0] ? ' selected' : '') + '>' + l[1] + '</option>';
                }).join('') + '</select></label>' +
                '<label class="field"><span>Speaking speed</span><div class="range-row"><input type="range" min="0.6" max="1.6" step="0.05" data-path="assistant.voiceRate" data-type="number" value="' + a.voiceRate + '" id="rateInput" /><output id="rateOut">' + Number(a.voiceRate).toFixed(2) + '×</output></div></label>' +
              '</div>' +
              '<button type="button" class="btn btn-sm" id="voicePreview" style="margin-top:1rem">' + ICON.play + 'Preview voice</button>' +
            '</div></div>' +
            '<div class="card"><div class="card-head"><div><h2>Extra instructions</h2><p>Optional rules for the AI, e.g. promotions, tone, or topics to avoid</p></div></div><div class="card-body">' +
              '<label class="field"><textarea data-path="assistant.extraInstructions" rows="5" maxlength="2000" placeholder="e.g. Always mention our free consultation when someone asks about weight loss.">' + esc(a.extraInstructions) + '</textarea></label>' +
            '</div></div>' +
          '</div>' +
          '<div class="card" style="position:sticky;top:96px"><div class="card-head"><div><h2>Test the assistant</h2><p>Uses saved settings · not logged</p></div></div><div class="card-body test-box">' +
            '<div class="test-row"><input class="input" id="testQ" placeholder="e.g. Which plan includes personal training?" /><button class="btn btn-primary" id="testBtn">Ask</button></div>' +
            '<div class="test-answer" id="testA">The answer will appear here.</div>' +
            '<div class="test-meta" id="testMeta"></div>' +
          '</div></div>' +
        '</div>'
      );
      var form = $('#assistantForm');
      bindInputs(form, 'settingsDraft', 'settings');
      $('#rateInput').addEventListener('input', function () { $('#rateOut').textContent = Number(this.value).toFixed(2) + '×'; });
      $('#voicePreview').onclick = function () {
        if (!('speechSynthesis' in window)) return toast('This browser has no speech output', 'err');
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance('Hi! I\'m ' + a.name + '. Ask me about memberships, workouts or nutrition.');
        u.lang = a.voiceLang;
        u.rate = Number(a.voiceRate) || 1;
        speechSynthesis.speak(u);
      };
      var ask = function () {
        var q = $('#testQ').value.trim();
        if (!q) return;
        var out = $('#testA');
        out.className = 'test-answer';
        out.textContent = 'Thinking…';
        $('#testMeta').innerHTML = '';
        api('POST', '/test-chat', { message: q }).then(function (r) {
          out.className = 'test-answer has';
          out.innerHTML = md(r.answer);
          $('#testMeta').innerHTML =
            (r.fallback ? '<span class="badge badge-warn">Fallback answer</span>' : '<span class="badge badge-ok">Gemini</span>') +
            (r.actions && r.actions[0] ? '<span class="badge badge-contacted">Shows: ' + esc(r.actions[0].section) + '</span>' : '') +
            (r.sources || []).map(function (s) { return '<span class="badge badge-closed">' + esc(s.file) + '</span>'; }).join('');
        }).catch(function (ex) { out.textContent = ex.message; });
      };
      $('#testBtn').onclick = ask;
      $('#testQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(); });
    }).catch(fail);
  }

  // ---------------------------------------------------------------------------
  // System
  // ---------------------------------------------------------------------------
  function renderSystem() {
    api('GET', '/overview').then(function (d) {
      var s = d.system;
      page(
        '<div class="cols-2">' +
          '<div class="cards">' +
            '<div class="card card-pad"><h2 style="font-size:.98rem;margin-bottom:.4rem">AI engine</h2>' +
              statusRow('Gemini API key', s.aiConfigured ? '<span class="badge badge-ok">Configured</span>' : '<span class="badge badge-warn">Missing</span>') +
              statusRow('Chat model', esc(s.model)) +
              statusRow('Behaviour without key', 'Built-in answers from website data') +
            '</div>' +
            '<div class="card card-pad"><h2 style="font-size:.98rem;margin-bottom:.4rem">Knowledge base (PDF → RAG)</h2>' +
              statusRow('Indexed chunks', s.ragChunks || '<span class="badge badge-warn">None</span>') +
              (s.ragSources || []).map(function (f) { return statusRow('Source', esc(f)); }).join('') +
              (s.ragError ? statusRow('Error', esc(s.ragError)) : '') +
              '<p class="muted" style="font-size:.8rem;margin-top:.8rem">Add or replace PDFs in the <strong>knowledge</strong> folder, then run <code>npm run ingest</code> and restart the server. Live website content (this dashboard) always takes priority over PDFs.</p>' +
            '</div>' +
          '</div>' +
          '<div class="card card-pad"><h2 style="font-size:.98rem;margin-bottom:.6rem">Security checklist</h2>' +
            '<div class="stack" style="gap:.7rem;font-size:.86rem;color:var(--text-dim)">' +
              '<p>✔ This dashboard is not linked from the public website and is hidden from search engines.</p>' +
              '<p>✔ Sign-in is rate-limited and sessions expire after 12 hours.</p>' +
              '<p>→ Set a strong <strong>ADMIN_PASSWORD</strong> and a random <strong>SESSION_SECRET</strong> in <code>.env</code>.</p>' +
              '<p>→ Optionally change <strong>ADMIN_PATH</strong> in <code>.env</code> to a private URL instead of /admin.</p>' +
              '<p>→ In production set <strong>NODE_ENV=production</strong> and serve over HTTPS (secure cookies).</p>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).catch(fail);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  api('GET', '/me').then(function (r) { state.user = r.user; showApp(); }).catch(function () { showLogin(); });
})();
