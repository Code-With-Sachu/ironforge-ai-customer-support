/* =========================================================
   IRONFORGE FITNESS — site-content.js
   Loads live website content (managed in the private admin
   panel) from /api/site and renders it into the page.
   The static HTML stays as the no-JS / SEO fallback.
   ========================================================= */
(function () {
  'use strict';

  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var get = function (obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  };

  function revealNow(container) {
    // Newly rendered cards should be visible immediately (scroll reveal already ran)
    Array.prototype.forEach.call(container.querySelectorAll('[data-reveal]'), function (el) {
      el.classList.add('in-view');
    });
  }

  function renderBindings(site) {
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var value = get(site, el.getAttribute('data-bind'));
      if (value == null || value === '') return;
      el.textContent = value;
      var hrefType = el.getAttribute('data-href');
      if (hrefType === 'tel') el.setAttribute('href', 'tel:' + String(value).replace(/[^\d+]/g, ''));
      if (hrefType === 'mailto') el.setAttribute('href', 'mailto:' + value);
    });

    document.querySelectorAll('[data-stat]').forEach(function (el) {
      var v = site.stats && site.stats[el.getAttribute('data-stat')];
      if (v == null) return;
      el.setAttribute('data-target', v);
      // If the counter already finished animating, update the number directly
      if (el.textContent !== '0') el.textContent = Number(v).toLocaleString();
    });
  }

  function renderAnnouncement(a) {
    var bar = document.getElementById('announceBar');
    if (!bar) return;
    var dismissedKey = 'if-announce-dismissed';
    var dismissed = null;
    try { dismissed = sessionStorage.getItem(dismissedKey); } catch (e) {}
    if (!a || !a.enabled || !a.text || dismissed === a.text) { bar.hidden = true; return; }

    document.getElementById('announceText').textContent = a.text;
    var link = document.getElementById('announceLink');
    if (a.linkText && a.linkHref) {
      link.textContent = a.linkText;
      link.setAttribute('href', a.linkHref);
      link.hidden = false;
    } else {
      link.hidden = true;
    }
    bar.hidden = false;
    document.documentElement.classList.add('has-announce');

    document.getElementById('announceClose').onclick = function () {
      bar.hidden = true;
      document.documentElement.classList.remove('has-announce');
      try { sessionStorage.setItem(dismissedKey, a.text); } catch (e) {}
    };
  }

  function renderPrograms(programs) {
    (programs || []).forEach(function (p) {
      var card = document.querySelector('.program-card[data-module="' + p.id + '"]');
      if (!card) return;
      var h = card.querySelector('.program-body h3');
      var d = card.querySelector('.program-body p');
      if (h) h.textContent = p.title;
      if (d) d.textContent = p.description;
      card.setAttribute('aria-label', 'Open 3D preview: ' + p.title);
      var img = card.querySelector('.program-media img');
      if (img) img.alt = p.title + ' program at IRONFORGE FITNESS';
    });
  }

  function renderPlans(plans, currency) {
    var grid = document.getElementById('pricingGrid');
    if (!grid || !plans || !plans.length) return;
    grid.innerHTML = plans.map(function (p) {
      return '<article class="price-card reveal' + (p.featured ? ' price-card-featured' : '') + '" data-reveal>' +
        (p.featured && p.badge ? '<span class="price-badge">' + esc(p.badge) + '</span>' : '') +
        '<div class="price-head"><h3>' + esc(p.name) + '</h3><p>' + esc(p.tagline) + '</p></div>' +
        '<div class="price-value"><span class="price-currency">' + esc(currency || '$') + '</span>' +
        '<span class="price-amount">' + esc(p.price) + '</span><span class="price-period">' + esc(p.period) + '</span></div>' +
        '<ul class="price-features">' + p.features.map(function (f) {
          return '<li' + (f.included ? '' : ' class="disabled"') + '>' + esc(f.text) + '</li>';
        }).join('') + '</ul>' +
        '<a href="#contact" class="btn ' + (p.featured ? 'btn-primary' : 'btn-outline') + ' btn-block" data-plan="' + esc(p.name) + '"><span>Get Started</span></a>' +
        '</article>';
    }).join('');
    grid.style.setProperty('--plan-count', plans.length);
    revealNow(grid);
  }

  function renderTrainers(trainers) {
    var grid = document.getElementById('trainersGrid');
    if (!grid || !trainers || !trainers.length) return;
    grid.innerHTML = trainers.map(function (t, i) {
      var img = t.image || ('trainer' + ((i % 4) + 1) + '.jpg');
      return '<article class="trainer-card reveal" data-reveal>' +
        '<div class="trainer-media"><img src="' + esc(img) + '" alt="' + esc(t.name + ', ' + t.role) + ' at IRONFORGE FITNESS" loading="lazy" />' +
        '<div class="trainer-socials"><a href="#" aria-label="Instagram">IG</a><a href="#" aria-label="LinkedIn">IN</a><a href="#" aria-label="Twitter">TW</a></div></div>' +
        '<div class="trainer-info"><h3>' + esc(t.name) + '</h3><span>' + esc(t.role) + '</span></div>' +
        '</article>';
    }).join('');
    revealNow(grid);
  }

  function renderHours(hours) {
    var list = document.getElementById('hoursList');
    if (!list || !hours || !hours.length) return;
    list.innerHTML = hours.map(function (h) {
      return '<li' + (h.note ? ' class="hours-note"' : '') + '><span>' + esc(h.day) + '</span><span>' + esc(h.time) + '</span></li>';
    }).join('');
  }

  function renderMap(url) {
    var box = document.getElementById('mapBox');
    if (!box || !url) return;
    box.classList.add('has-map');
    box.innerHTML = '<iframe title="IRONFORGE FITNESS location map" src="' + esc(url) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>';
  }

  function renderFaqs(faqs) {
    var list = document.getElementById('faqList');
    var section = document.getElementById('faq');
    if (!list || !section) return;
    if (!faqs || !faqs.length) { section.hidden = true; return; }
    section.hidden = false;
    list.innerHTML = faqs.map(function (f, i) {
      return '<details class="faq-item reveal" data-reveal' + (i === 0 ? ' open' : '') + '>' +
        '<summary><span>' + esc(f.q) + '</span><i aria-hidden="true"></i></summary>' +
        '<div class="faq-answer"><p>' + esc(f.a) + '</p></div></details>';
    }).join('');
    revealNow(list);
  }

  function wirePlanButtons() {
    // "Get Started" on a plan pre-fills the enquiry message
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-plan]');
      if (!btn) return;
      var msg = document.getElementById('message');
      if (msg && !msg.value.trim()) {
        msg.value = 'Hi! I\'m interested in the ' + btn.getAttribute('data-plan') + ' membership. Please get in touch.';
      }
      e.preventDefault();
      var target = document.getElementById('contact');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function render(data) {
    var site = data.site;
    window.IRONFORGE_DATA = data;
    renderBindings(site);
    renderAnnouncement(site.announcement);
    renderPrograms(site.programs);
    renderPlans(site.plans, site.currency);
    renderTrainers(site.trainers);
    renderHours(site.hours);
    renderMap(site.contact && site.contact.mapEmbedUrl);
    renderFaqs(site.faqs);
    window.dispatchEvent(new CustomEvent('ironforge:data', { detail: data }));
  }

  function load() {
    wirePlanButtons();
    fetch('/api/site', { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('site data unavailable'); return r.json(); })
      .then(render)
      .catch(function () {
        // Static HTML stays in place; hide the empty FAQ block
        var section = document.getElementById('faq');
        if (section) section.hidden = true;
        window.dispatchEvent(new CustomEvent('ironforge:data', { detail: null }));
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
