/* =========================================================
   IRONFORGE FITNESS — script.js
   Table of Contents:
   1. Preloader
   2. Sticky Navbar + Active Link
   3. Mobile Menu
   4. Smooth Scroll (anchor links)
   5. Scroll Reveal (IntersectionObserver)
   6. Animated Counters
   7. Cursor Glow
   8. Testimonial Slider
   9. Feature Video Play Button
   10. Contact Form Validation
   11. Newsletter Form
   12. Back To Top
   13. Footer Year
   14. Light / Dark Theme
   ========================================================= */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initPreloader();
    initNavbar();
    initMobileMenu();
    initSmoothScroll();
    initScrollReveal();
    initCounters();
    initCursorGlow();
    initTestimonialSlider();
    initFeatureVideo();
    initContactForm();
    initNewsletterForm();
    initBackToTop();
    initFooterYear();
    initThemeToggle();
  }

  /* ============ 1. Preloader ============ */
  function initPreloader() {
    var preloader = document.getElementById('preloader');
    var pctEl = document.getElementById('preloaderPct');
    if (!preloader) return;

    var hidden = false;
    function hide() {
      if (hidden) return;
      hidden = true;
      if (pctEl) pctEl.textContent = '100%';
      preloader.classList.add('loaded');
      document.body.classList.remove('no-scroll');
    }

    document.body.classList.add('no-scroll');

    // Animate the percentage readout in step with the CSS progress bar
    // (loadBar keyframe runs 1.6s — see style.css). Purely cosmetic;
    // actual hide timing is driven by window 'load' + fallback below.
    if (pctEl) {
      var start = null;
      var duration = 1600;
      function stepPct(ts) {
        if (hidden) return;
        if (!start) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        pctEl.textContent = Math.floor(progress * 100) + '%';
        if (progress < 1) requestAnimationFrame(stepPct);
      }
      requestAnimationFrame(stepPct);
    }

    window.addEventListener('load', function () {
      setTimeout(hide, 400);
    });

    // Fallback in case 'load' takes too long or already fired
    setTimeout(hide, 2500);
  }

  /* ============ 2. Sticky Navbar + Active Link ============ */
  function initNavbar() {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;

    function onScroll() {
      if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id], .hero[id]'));
    var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));

    if (!sections.length || !navLinks.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.getAttribute('id');
          navLinks.forEach(function (link) {
            var match = link.getAttribute('href') === '#' + id;
            link.classList.toggle('active', match);
          });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* ============ 3. Mobile Menu ============ */
  function initMobileMenu() {
    var hamburger = document.getElementById('hamburger');
    var mobileMenu = document.getElementById('mobileMenu');
    if (!hamburger || !mobileMenu) return;

    function closeMenu() {
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileMenu.classList.remove('open');
      document.body.classList.remove('no-scroll');
    }

    function toggleMenu() {
      var isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('active', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
      document.body.classList.toggle('no-scroll', isOpen);
    }

    hamburger.addEventListener('click', toggleMenu);

    var mobileLinks = mobileMenu.querySelectorAll('.mobile-link, .mobile-menu-footer a');
    mobileLinks.forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ============ 4. Smooth Scroll ============ */
  function initSmoothScroll() {
    var links = document.querySelectorAll('a[href^="#"]');
    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        var targetId = link.getAttribute('href');
        if (!targetId || targetId === '#') return;
        var target = document.querySelector(targetId);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ============ 5. Scroll Reveal ============ */
  function initScrollReveal() {
    var revealEls = document.querySelectorAll('[data-reveal]');
    if (!revealEls.length) return;

    if (!('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('in-view'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ============ 6. Animated Counters ============ */
  function initCounters() {
    var counters = document.querySelectorAll('[data-counter]');
    if (!counters.length) return;

    function animateCounter(el) {
      var target = parseInt(el.getAttribute('data-target'), 10) || 0;
      var duration = 1800;
      var startTime = null;

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        var value = Math.floor(eased * target);
        el.textContent = value.toLocaleString();

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = target.toLocaleString();
        }
      }
      requestAnimationFrame(step);
    }

    if (!('IntersectionObserver' in window)) {
      counters.forEach(animateCounter);
      return;
    }

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ============ 7. Cursor Glow ============ */
  function initCursorGlow() {
    var glow = document.getElementById('cursorGlow');
    if (!glow) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var mouseX = window.innerWidth / 2;
    var mouseY = window.innerHeight / 2;
    var currentX = mouseX;
    var currentY = mouseY;

    window.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    function animate() {
      currentX += (mouseX - currentX) * 0.12;
      currentY += (mouseY - currentY) * 0.12;
      glow.style.transform = 'translate(' + currentX + 'px,' + currentY + 'px) translate(-50%,-50%)';
      requestAnimationFrame(animate);
    }
    animate();
  }

  /* ============ 8. Testimonial Slider ============ */
  function initTestimonialSlider() {
    var slidesWrap = document.getElementById('testimonialSlides');
    var dotsWrap = document.getElementById('testimonialDots');
    var prevBtn = document.getElementById('testimonialPrev');
    var nextBtn = document.getElementById('testimonialNext');
    if (!slidesWrap || !dotsWrap || !prevBtn || !nextBtn) return;

    var slides = Array.prototype.slice.call(slidesWrap.querySelectorAll('.testimonial-card'));
    if (!slides.length) return;

    var current = 0;
    var intervalId = null;

    slides.forEach(function (_, i) {
      var dot = document.createElement('button');
      dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
      dot.addEventListener('click', function () {
        goTo(i);
        restartAutoplay();
      });
      dotsWrap.appendChild(dot);
    });

    var dots = Array.prototype.slice.call(dotsWrap.querySelectorAll('.testimonial-dot'));

    function goTo(index) {
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
    }

    prevBtn.addEventListener('click', function () {
      goTo(current - 1);
      restartAutoplay();
    });

    nextBtn.addEventListener('click', function () {
      goTo(current + 1);
      restartAutoplay();
    });

    function startAutoplay() {
      intervalId = setInterval(function () {
        goTo(current + 1);
      }, 6000);
    }

    function restartAutoplay() {
      clearInterval(intervalId);
      startAutoplay();
    }

    startAutoplay();
  }

  /* ============ 9. Feature Video Play Button ============ */
  function initFeatureVideo() {
    var playBtn = document.getElementById('playBtn');
    var video = document.getElementById('featureVideo');
    if (!playBtn || !video) return;

    playBtn.addEventListener('click', function () {
      if (video.paused) {
        video.play().catch(function () {
          /* Autoplay/play blocked or source missing — no-op placeholder video */
        });
        video.muted = false;
        playBtn.classList.add('is-playing');
        playBtn.querySelector('.play-btn-icon').innerHTML = '&#10074;&#10074;';
      } else {
        video.pause();
        playBtn.classList.remove('is-playing');
        playBtn.querySelector('.play-btn-icon').innerHTML = '&#9658;';
      }
    });
  }

  /* ============ 10. Contact Form Validation ============ */
  function initContactForm() {
    var form = document.getElementById('contactForm');
    var successMsg = document.getElementById('formSuccess');
    if (!form || !successMsg) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      successMsg.classList.remove('show');

      var isValid = true;
      var requiredFields = form.querySelectorAll('[required]');

      requiredFields.forEach(function (field) {
        var group = field.closest('.form-group');
        if (!group) return;

        var valid = field.checkValidity() && field.value.trim() !== '';
        group.classList.toggle('invalid', !valid);
        if (!valid) isValid = false;
      });

      if (!isValid) {
        var firstInvalid = form.querySelector('.invalid input, .invalid textarea');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var failMsg = document.getElementById('formFail');
      var submitBtn = form.querySelector('button[type="submit"]');
      if (failMsg) failMsg.classList.remove('show');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('is-loading'); }

      var payload = {
        name: form.fullName.value,
        email: form.email.value,
        phone: form.phone.value,
        interest: form.interest.options[form.interest.selectedIndex].text,
        message: form.message.value,
        website: form.website ? form.website.value : ''
      };

      fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('Request failed');
        successMsg.classList.add('show');
        form.reset();
        setTimeout(function () { successMsg.classList.remove('show'); }, 6000);
      }).catch(function () {
        if (failMsg) failMsg.classList.add('show');
      }).finally(function () {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('is-loading'); }
      });
    });

    var fields = form.querySelectorAll('input, textarea, select');
    fields.forEach(function (field) {
      field.addEventListener('input', function () {
        var group = field.closest('.form-group');
        if (group && group.classList.contains('invalid') && field.checkValidity() && field.value.trim() !== '') {
          group.classList.remove('invalid');
        }
      });
    });
  }

  /* ============ 11. Newsletter Form ============ */
  function initNewsletterForm() {
    var form = document.getElementById('newsletterForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      if (!input || !input.value.trim()) return;

      var button = form.querySelector('button');
      var originalHTML = button.innerHTML;
      var email = input.value.trim();
      button.disabled = true;

      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      }).then(function (res) {
        if (!res.ok) throw new Error('Request failed');
        button.innerHTML = '&#10003;';
        input.value = '';
        input.placeholder = 'Subscribed — thank you!';
      }).catch(function () {
        button.innerHTML = '!';
        input.placeholder = 'Please try again';
      }).finally(function () {
        button.disabled = false;
        setTimeout(function () { button.innerHTML = originalHTML; input.placeholder = 'Your email address'; }, 2500);
      });
    });
  }

  /* ============ 12. Back To Top ============ */
  function initBackToTop() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;

    function onScroll() {
      btn.classList.toggle('show', window.scrollY > 600);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ============ 13. Footer Year ============ */
  function initFooterYear() {
    var yearEl = document.getElementById('year');
    if (!yearEl) return;
    yearEl.textContent = new Date().getFullYear();
  }


  /* ============ 14. Light / Dark Theme ============ */
  function initThemeToggle() {
    var root = document.documentElement;
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    var meta = document.querySelector('meta[name="theme-color"]');

    function apply(theme, persist) {
      root.setAttribute('data-theme', theme);
      if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f5f2' : '#0a0a0c');
      buttons.forEach(function (btn) {
        btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
        btn.setAttribute('aria-pressed', String(theme === 'light'));
      });
      document.querySelectorAll('[data-theme-label]').forEach(function (el) {
        el.textContent = theme === 'light' ? 'Light' : 'Dark';
      });
      if (persist) {
        try { localStorage.setItem('if-theme', theme); } catch (e) {}
      }
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
    }

    apply(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        root.classList.add('theme-transition');
        apply(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
        setTimeout(function () { root.classList.remove('theme-transition'); }, 450);
      });
    });

    // Follow the OS setting until the visitor picks a theme themselves
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: light)');
      var onChange = function (e) {
        var saved = null;
        try { saved = localStorage.getItem('if-theme'); } catch (err) {}
        if (!saved) apply(e.matches ? 'light' : 'dark', false);
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    }
  }

})();
