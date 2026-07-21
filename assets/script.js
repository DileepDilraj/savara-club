/* ============================================================
   SAVARA CLUB - shared interactions (all pages)
   Guarded by element presence, so one file drives every page.
   ============================================================ */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = window.gsap;
  const ST = window.ScrollTrigger;
  const useGSAP = !!(G && ST && !reduceMotion);
  if (useGSAP) G.registerPlugin(ST);
  document.documentElement.classList.toggle('gsap', useGSAP);

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.prototype.slice.call(c.querySelectorAll(s));

  /* ---------- Nav: scrolled state ---------- */
  const nav = $('#nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Full-screen menu ---------- */
  const menu = $('#menu');
  const menuBtn = $('#navToggle');
  let menuOpen = false;
  let menuTl = null;

  if (menu && menuBtn) {
    if (useGSAP) {
      // Start states are defined in CSS (.gsap .menu__*). We only animate TO the open state.
      menuTl = G.timeline({ paused: true })
        .to('.menu__bg', { scaleY: 1, duration: 0.7, ease: 'power4.inOut' }, 0)
        .to('.menu__label', { y: 0, duration: 0.6, stagger: 0.07, ease: 'power3.out' }, '-=0.3')
        .to('.menu__num', { opacity: 1, duration: 0.4, stagger: 0.07 }, '<')
        .to('.menu__aside > *', { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 }, '-=0.4')
        .to('.menu__phoenix', { opacity: 0.07, scale: 1, duration: 0.7, ease: 'power3.out' }, '-=0.6');
      menuTl.eventCallback('onReverseComplete', () => menu.classList.remove('open'));
    }
    const setMenu = (open) => {
      menuOpen = open;
      menuBtn.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('menu-lock', open);
      menu.setAttribute('aria-hidden', String(!open));
      if (open) {
        menu.classList.add('open');
        if (menuTl) { menuTl.timeScale(1); menuTl.play(); }
      } else if (menuTl) {
        menuTl.timeScale(1.8); menuTl.reverse();
      } else {
        menu.classList.remove('open');
      }
    };
    menuBtn.addEventListener('click', () => setMenu(!menuOpen));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) setMenu(false); });
    // Expose so the transition layer can force-close instantly if needed
    window.__closeMenu = () => { if (menuOpen) { menuOpen = false; menuBtn.classList.remove('open'); document.body.classList.remove('menu-lock'); } };
  }

  /* ---------- Page transitions ("eject" panel wipe) ---------- */
  const pt = $('#pageTransition');
  const cols = pt ? $$('.pt__col', pt) : [];
  const ptLogo = pt ? $('.pt__logo', pt) : null;

  function playEnter() {
    if (!pt) return;
    if (!useGSAP) { pt.classList.add('pt--done'); return; }
    G.set(pt, { pointerEvents: 'auto' });
    G.set(cols, { scaleY: 1, transformOrigin: 'top' });
    const tl = G.timeline({ onComplete: () => { pt.classList.add('pt--done'); G.set(pt, { pointerEvents: 'none' }); } });
    if (ptLogo) tl.to(ptLogo, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0);
    tl.to(cols, { scaleY: 0, duration: 0.62, ease: 'power3.inOut', stagger: 0.055 }, 0.05);
  }

  function playExit(href) {
    if (!pt || !useGSAP) { window.location.href = href; return; }
    pt.classList.remove('pt--done');
    G.set(pt, { pointerEvents: 'auto' });
    G.set(cols, { transformOrigin: 'bottom', scaleY: 0 });
    const tl = G.timeline({ onComplete: () => { window.location.href = href; } });
    tl.to(cols, { scaleY: 1, duration: 0.5, ease: 'power3.inOut', stagger: 0.05 }, 0);
    if (ptLogo) tl.to(ptLogo, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 0.22);
  }

  // Enter reveal for pages that load covered
  if (pt && pt.classList.contains('pt--enter')) {
    if (useGSAP) requestAnimationFrame(playEnter);
    else pt.classList.add('pt--done');
  }
  // bfcache restore
  window.addEventListener('pageshow', (e) => { if (e.persisted && pt) playEnter(); });

  // Intercept internal links
  const isInternal = (a) => {
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.charAt(0) === '#' || raw.indexOf('mailto:') === 0 || raw.indexOf('tel:') === 0) return false;
    if (a.target === '_blank' || a.hasAttribute('download') || a.dataset.noTransition !== undefined) return false;
    let url;
    try { url = new URL(a.href, window.location.href); } catch (_) { return false; }
    if (url.origin !== window.location.origin) return false;
    if (url.pathname === window.location.pathname && url.hash) return false; // same-page anchor
    return /\.html$/.test(url.pathname);
  };
  document.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    const a = e.target.closest('a');
    if (!a || !isInternal(a)) return;
    e.preventDefault();
    if (window.__closeMenu) window.__closeMenu();
    playExit(a.href);
  });

  /* ---------- Preloader (home only) ---------- */
  const pre = $('#preloader');
  if (pre) {
    document.body.classList.add('preloading');
    const finish = () => { document.body.classList.remove('preloading'); pre.style.display = 'none'; };
    if (!useGSAP) {
      finish();
    } else {
      // Reveal by opening a circular hole from the center that grows outward.
      const maxR = Math.hypot(window.innerWidth, window.innerHeight) / 2 + 40;
      const hole = { r: 0 };
      const setHole = () => {
        const g = 'radial-gradient(circle at 50% 50%, transparent 0 ' + hole.r + 'px, #000 ' + (hole.r + 36) + 'px)';
        pre.style.webkitMaskImage = g;
        pre.style.maskImage = g;
      };
      if (sessionStorage.getItem('savaraSeen')) {
        G.timeline({ onComplete: finish })
          .set('.preloader__prog', { strokeDashoffset: 0 })
          .to(hole, { r: maxR, duration: 0.8, ease: 'power2.inOut', onUpdate: setHole });
      } else {
        sessionStorage.setItem('savaraSeen', '1');
        const prog = $('.preloader__prog', pre);
        const pct = $('.preloader__pct', pre);
        const ph = $('.preloader__phoenix', pre);
        const counter = { v: 0 };
        G.timeline()
          .from(ph, { scale: 0.55, opacity: 0, duration: 0.7, ease: 'power3.out' })
          .from('.preloader__ring', { scale: 0.8, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.5')
          .to(prog, { strokeDashoffset: 0, duration: 1.7, ease: 'power1.inOut' }, '-=0.15')
          .to(counter, {
            v: 100, duration: 1.7, ease: 'power1.inOut',
            onUpdate: () => { if (pct) pct.textContent = Math.round(counter.v) + '%'; }
          }, '<')
          .to([ph, '.preloader__ring', pct], { scale: 0.8, opacity: 0, duration: 0.4, ease: 'power2.in', transformOrigin: '50% 50%' }, '+=0.1')
          .to(hole, { r: maxR, duration: 1.05, ease: 'power2.inOut', onUpdate: setHole }, '-=0.1')
          .add(finish);
      }
    }
  }

  /* ---------- Scroll reveals ---------- */
  const reveals = $$('.reveal');
  if (useGSAP) {
    G.set(reveals, { opacity: 0, y: 30 });
    ST.batch('.reveal', {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => G.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.09, overwrite: true })
    });
    initParallax();
    initMagnetic();
  } else if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in'), (i % 4) * 90);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  function initParallax() {
    const phoenix = $('.hero__phoenix');
    const heroContent = $('.hero__content');
    const hero = $('.hero');
    if (hero && phoenix) {
      G.to(phoenix, { yPercent: 26, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    }
    if (hero && heroContent) {
      G.to(heroContent, { yPercent: -8, opacity: 0.35, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    }
    const cocktail = $('.dining__cocktail');
    if (cocktail) {
      G.to(cocktail, { yPercent: -18, ease: 'none', scrollTrigger: { trigger: '.dining', start: 'top bottom', end: 'bottom top', scrub: true } });
    }
    const pageHeroBg = $('.page-hero__bg');
    if (pageHeroBg) {
      G.to(pageHeroBg, { yPercent: 18, scale: 1.1, ease: 'none', scrollTrigger: { trigger: '.page-hero', start: 'top top', end: 'bottom top', scrub: true } });
    }
  }

  function initMagnetic() {
    $$('.magnetic').forEach((el) => {
      const xTo = G.quickTo(el, 'x', { duration: 0.4, ease: 'power3' });
      const yTo = G.quickTo(el, 'y', { duration: 0.4, ease: 'power3' });
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.35);
        yTo((e.clientY - r.top - r.height / 2) * 0.5);
      });
      el.addEventListener('mouseleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------- Stat counters ---------- */
  const counters = $$('[data-count]');
  if (counters.length) {
    const animateCount = (el) => {
      const target = +el.dataset.count;
      const dur = 1400, start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if ('IntersectionObserver' in window) {
      const co = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { animateCount(entry.target); co.unobserve(entry.target); }
        });
      }, { threshold: 0.6 });
      counters.forEach((el) => co.observe(el));
    } else {
      counters.forEach((el) => { el.textContent = el.dataset.count; });
    }
  }

  /* ---------- DJ preview toggle ---------- */
  const djCards = $$('.dj');
  djCards.forEach((card) => {
    const btn = $('.dj__play', card);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const active = card.classList.contains('playing');
      djCards.forEach((c) => { c.classList.remove('playing'); const b = $('.dj__play', c); if (b) b.textContent = '▶'; });
      if (!active) { card.classList.add('playing'); btn.textContent = '❚❚'; }
    });
  });

  /* ---------- Events filter ---------- */
  const filterBar = $('.filter-bar');
  if (filterBar) {
    const rows = $$('[data-cat]');
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      $$('button', filterBar).forEach((b) => b.classList.toggle('active', b === btn));
      const f = btn.dataset.filter;
      rows.forEach((row) => {
        const show = f === 'all' || (row.dataset.cat || '').split(' ').indexOf(f) > -1;
        if (useGSAP) {
          G.to(row, { opacity: show ? 1 : 0.12, height: 'auto', duration: 0.3, ease: 'power2.out' });
          row.style.display = '';
          row.style.pointerEvents = show ? '' : 'none';
        } else {
          row.style.display = show ? '' : 'none';
        }
      });
    });
  }

  /* ---------- Newsletter / contact forms ---------- */
  $$('form[data-form]').forEach((form) => {
    const email = $('input[type=email]', form);
    const scope = form.parentNode || form;
    const msg = $('.form-msg', form) || $('.form-msg, .footer__msg, .newsletter__msg', scope);
    const valid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (email && !valid(email.value.trim())) {
        if (msg) { msg.textContent = 'Please enter a valid email.'; msg.style.color = '#e9b866'; }
        return;
      }
      if (msg) { msg.textContent = '🔥 You’re on the list. Watch your inbox for the next rise.'; msg.style.color = '#f6d78a'; }
      form.reset();
    });
  });

  /* ---------- Ember particles ---------- */
  const canvas = $('#embers');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    let w, h, embers;
    const COUNT = 60;
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const spawn = () => ({ x: rnd(0, w), y: rnd(0, h) + h, r: rnd(0.6, 2.2), sp: rnd(0.2, 1.1), drift: rnd(-0.4, 0.4), a: rnd(0.2, 0.9), hue: rnd(36, 46) });
    const init = () => { resize(); embers = Array.from({ length: COUNT }, spawn); };
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const e of embers) {
        e.y -= e.sp; e.x += e.drift + Math.sin(e.y * 0.01) * 0.3;
        if (e.y < -10) Object.assign(e, spawn(), { y: h + 10 });
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${e.hue}, 80%, 62%, ${e.a})`;
        ctx.shadowBlur = 8; ctx.shadowColor = `hsla(${e.hue}, 90%, 60%, ${e.a})`;
        ctx.fill();
      }
      requestAnimationFrame(tick);
    };
    init();
    window.addEventListener('resize', resize);
    requestAnimationFrame(tick);
  }

  /* ---------- Year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  if (useGSAP) window.addEventListener('load', () => ST.refresh());
})();
