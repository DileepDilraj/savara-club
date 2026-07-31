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
  const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- Intro gate ----------
     The home preloader covers the screen for ~2.8s. Anything animating before it
     lifts is never seen, so reveals + counters queue up behind this. */
  const introQueue = [];
  let introDone = !document.getElementById('preloader');
  const onIntroDone = (fn) => { introDone ? fn() : introQueue.push(fn); };
  const markIntroDone = () => {
    if (introDone) return;
    introDone = true;
    introQueue.splice(0).forEach((fn) => fn());
  };

  /* ---------- GSAP smooth scrolling ----------
     ScrollSmoother is a paid Club plugin and isn't vendored here, and its
     transform-wrapper technique would break the position:sticky panels on
     Book / Contact / Privacy. This eases the real scroll position instead, so
     sticky, fixed and ScrollTrigger all keep behaving normally.
     Wheel only - touch and trackpad momentum are already good natively. */
  let smoothTo = null; // set below when the smoother is running
  if (useGSAP && hasHover) {
    const root = document.documentElement;
    root.classList.add('has-smooth'); // CSS drops scroll-behavior:smooth so it can't double-ease

    let current = window.scrollY;
    let target = current;
    let running = false;
    const LAMBDA = 11; // damping rate - higher is snappier

    const maxY = () => Math.max(0, root.scrollHeight - window.innerHeight);
    const locked = () => document.body.classList.contains('menu-lock')
      || document.body.classList.contains('lb-lock')
      || document.body.classList.contains('preloading');

    /* One continuous lerp on the ticker rather than a tween restarted per wheel
       event - restarting kept resetting the easing curve, which is what made
       this feel floaty and imprecise. Exponential damping keeps the motion
       identical at 60 / 120 / 144Hz. */
    G.ticker.add((time, deltaMS) => {
      if (!running) return;
      const dt = Math.min(deltaMS, 50) / 1000;
      current += (target - current) * (1 - Math.exp(-LAMBDA * dt));
      if (Math.abs(target - current) < 0.35) { current = target; running = false; }
      window.scrollTo({ top: current, behavior: 'auto' });
    });

    // Scrollbar drags, keyboard, find-in-page and focus jumps: adopt their position
    window.addEventListener('scroll', () => {
      if (running && Math.abs(window.scrollY - current) < 2) return; // that write was ours
      current = target = window.scrollY;
      running = false;
    }, { passive: true });

    window.addEventListener('resize', () => { target = Math.min(target, maxY()); }, { passive: true });

    smoothTo = (y) => {
      current = window.scrollY;
      target = Math.max(0, Math.min(maxY(), y));
      running = true;
    };

    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.shiftKey || locked()) return;          // pinch-zoom / shift-wheel / modal
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;      // sideways gestures pass through
      // Regions with their own vertical scroll keep native behaviour. Carousels are
      // deliberately absent: their horizontal wheel already returned above, so a
      // vertical wheel over one should still scroll the page with everything else.
      if (e.target && e.target.closest &&
          e.target.closest('.cselect__list, .menu, .lightbox')) return;

      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 16
               : e.deltaMode === 2 ? e.deltaY * window.innerHeight
               : e.deltaY;
      if (!running) current = window.scrollY;
      target = Math.max(0, Math.min(maxY(), target + px));
      running = true;
    }, { passive: false });
  }

  /* Same-page anchors have to go through the smoother too - with CSS
     scroll-behavior off they would otherwise jump instantly. */
  document.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    const a = e.target && e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const y = window.scrollY + el.getBoundingClientRect().top - offset;
    if (smoothTo) smoothTo(y);
    else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
    if (window.history && history.replaceState) history.replaceState(null, '', '#' + id);
  });

  /* ---------- Nav: scroll state + direction-aware reveal ---------- */
  const nav = $('#nav');
  if (nav) {
    let lastScrollY = Math.max(0, window.scrollY);
    let navTicking = false;
    const directionThreshold = 6;

    const showNav = () => nav.classList.remove('nav--hidden');
    const updateNav = (force) => {
      const currentScrollY = Math.max(0, window.scrollY);
      const delta = currentScrollY - lastScrollY;
      const hideAfter = Math.max(110, nav.offsetHeight + 32);

      nav.classList.toggle('scrolled', currentScrollY > 30);

      // Keep navigation available at the top and throughout the open-menu state.
      if (force || currentScrollY <= hideAfter || nav.classList.contains('menu-active')) {
        showNav();
        lastScrollY = currentScrollY;
      } else if (Math.abs(delta) >= directionThreshold) {
        nav.classList.toggle('nav--hidden', delta > 0);
        lastScrollY = currentScrollY;
      }

      navTicking = false;
    };
    const onScroll = () => {
      if (navTicking) return;
      navTicking = true;
      requestAnimationFrame(() => updateNav(false));
    };

    updateNav(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pageshow', () => updateNav(true));
    // Keyboard users must never tab into controls that are visually off-screen.
    nav.addEventListener('focusin', showNav);
  }

  /* ---------- Full-screen menu ---------- */
  const menu = $('#menu');
  const menuBtn = $('#navToggle');
  let menuOpen = false;
  let menuTl = null;
  let closeMenu = () => {};

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
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('menu-lock', open);
      if (nav) {
        nav.classList.toggle('menu-active', open);
        nav.classList.remove('nav--hidden');
      }
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
    // Clicking the backdrop (anything that isn't a link/button) closes it
    menu.addEventListener('click', (e) => { if (!e.target.closest('a, button')) setMenu(false); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuOpen) { setMenu(false); menuBtn.focus(); }
    });

    // instant=true wipes every trace at once (used under the page-transition curtain);
    // otherwise it plays the normal close so the state never desyncs from the visuals.
    closeMenu = (instant) => {
      if (!menuOpen) return;
      if (!instant) { setMenu(false); return; }
      menuOpen = false;
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('menu-lock');
      if (nav) nav.classList.remove('menu-active', 'nav--hidden');
      menu.setAttribute('aria-hidden', 'true');
      menu.classList.remove('open');
      if (menuTl) menuTl.pause(0);
    };
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
    // Link to the page we're already on (e.g. "Home" in the menu): close + go up,
    // don't tear the whole document down and rebuild it.
    if (new URL(a.href, window.location.href).pathname === window.location.pathname) {
      closeMenu();
      if (smoothTo) smoothTo(0);
      else window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    closeMenu(true);
    playExit(a.href);
  });

  /* ---------- Preloader (home only) ---------- */
  const pre = $('#preloader');
  if (pre) {
    document.body.classList.add('preloading');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      document.body.classList.remove('preloading');
      pre.style.display = 'none';
      markIntroDone();
    };
    // Failsafe: a stalled tween must never leave the page covered and scroll-locked.
    const guard = setTimeout(finish, 6000);
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
    initParallax();
    initMagnetic();
    const revealIn = (els) => G.to(els, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.09, overwrite: true });
    onIntroDone(() => {
      // Sort by where things sit the moment the curtain lifts. A trigger created now
      // won't retroactively fire for what's already on screen, so play those directly
      // and hand ScrollTrigger only the ones still below the fold.
      const vh = window.innerHeight;
      const passed = [], onscreen = [], below = [];
      reveals.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0) passed.push(el);          // reload restored a scroll position
        else if (r.top < vh * 0.88) onscreen.push(el);
        else below.push(el);
      });
      if (passed.length) G.set(passed, { opacity: 1, y: 0 });
      if (onscreen.length) revealIn(onscreen);
      if (below.length) requestAnimationFrame(() => {
        ST.batch(below, { start: 'top 88%', once: true, onEnter: revealIn });
        ST.refresh();
      });
    });
  } else if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in'), (i % 4) * 90);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    onIntroDone(() => reveals.forEach((el) => io.observe(el)));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  function initParallax() {
    const heroMedia = $('.hero__media');
    const heroContent = $('.hero__content');
    const hero = $('.hero');
    if (hero && heroMedia) {
      // Video drifts slower than the page, so the copy lifts away from it
      G.to(heroMedia, { yPercent: 16, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
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
    // On touch, a tap fires a single mousemove with no matching mouseleave,
    // which leaves the button stuck off-centre. Pointer-fine devices only.
    if (!hasHover) return;
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
      // The hero stats sit in view at load - left to themselves they'd count up and
      // settle behind the preloader, so the curtain lifts on finished numbers.
      // Anything already on screen when it lifts runs now; the rest waits for scroll.
      onIntroDone(() => counters.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) animateCount(el);
        else co.observe(el);
      }));
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
        if (!useGSAP) { row.style.display = show ? '' : 'none'; return; }
        // Actually remove non-matches from the flow - leaving them dimmed but
        // present made the filter look broken.
        if (show) {
          G.set(row, { display: '' });
          G.to(row, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', overwrite: true });
        } else {
          G.to(row, {
            opacity: 0, y: -6, duration: 0.22, ease: 'power2.in', overwrite: true,
            onComplete: () => G.set(row, { display: 'none' })
          });
        }
      });
      if (useGSAP) ST.refresh();
    });
  }

  /* ============================================================
     FORMS - custom select, custom date picker, inline validation
     Native controls stay in the DOM and keep the value, so the form
     still submits correctly if any of this fails to run.
     ============================================================ */
  const ICO_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  const ICO_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
  const ICO_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const ICO_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

  const openPopup = { close: null };
  const closeOpenPopup = () => { if (openPopup.close) openPopup.close(); };
  document.addEventListener('pointerdown', (e) => {
    if (!openPopup.close) return;
    if (e.target && e.target.closest && e.target.closest('.cselect, .cdate')) return;
    closeOpenPopup();
  });

  /* ---------- Custom select ---------- */
  function enhanceSelect(sel) {
    const options = $$('option', sel);
    const label = sel.id && $('label[for="' + sel.id + '"]');
    const wrap = document.createElement('div');
    wrap.className = 'cselect';
    wrap.dataset.open = 'false';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cselect__btn';
    btn.id = sel.id + '-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const text = document.createElement('span');
    btn.appendChild(text);
    btn.insertAdjacentHTML('beforeend', ICO_CHEV);

    const list = document.createElement('ul');
    list.className = 'cselect__list';
    list.setAttribute('role', 'listbox');
    if (label) { label.htmlFor = btn.id; list.setAttribute('aria-label', label.textContent); }

    let active = Math.max(0, options.findIndex((o) => o.selected));

    const paint = () => {
      const cur = options[sel.selectedIndex] || options[0];
      text.textContent = cur ? cur.textContent : '';
      btn.classList.toggle('is-placeholder', !sel.value);
      $$('li', list).forEach((li, i) => {
        li.setAttribute('aria-selected', String(i === sel.selectedIndex));
        li.classList.toggle('is-active', i === active);
      });
    };

    options.forEach((o, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.textContent = o.textContent;
      li.addEventListener('click', () => { pick(i); });
      li.addEventListener('pointerenter', () => { active = i; paint(); });
      list.appendChild(li);
    });

    const close = () => {
      wrap.dataset.open = 'false';
      btn.setAttribute('aria-expanded', 'false');
      if (openPopup.close === close) openPopup.close = null;
    };
    const open = () => {
      closeOpenPopup();
      wrap.dataset.open = 'true';
      btn.setAttribute('aria-expanded', 'true');
      active = Math.max(0, sel.selectedIndex);
      paint();
      openPopup.close = close;
    };
    const pick = (i) => {
      sel.selectedIndex = i;
      active = i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      paint();
      close();
      btn.focus();
    };

    btn.addEventListener('click', () => (wrap.dataset.open === 'true' ? close() : open()));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (wrap.dataset.open !== 'true') { open(); return; }
        if (e.key === 'Enter' || e.key === ' ') { pick(active); return; }
        active = Math.min(options.length - 1, Math.max(0, active + (e.key === 'ArrowDown' ? 1 : -1)));
        paint();
      } else if (e.key === 'Escape') { close(); }
      else if (e.key === 'Tab') { close(); }
    });

    sel.classList.add('is-enhanced');
    sel.setAttribute('tabindex', '-1');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(btn);
    wrap.appendChild(list);
    wrap.appendChild(sel);
    paint();
    sel.__resetUI = paint;
    sel.__focusUI = () => btn.focus();
  }

  /* ---------- Custom date picker ---------- */
  function enhanceDate(input) {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const OPEN_DAYS = [0, 4, 5, 6];              // Sun, Thu, Fri, Sat - venue is shut Mon-Wed
    const label = input.id && $('label[for="' + input.id + '"]');
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const wrap = document.createElement('div');
    wrap.className = 'cdate';
    wrap.dataset.open = 'false';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cdate__btn is-placeholder';
    btn.id = input.id + '-btn';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    const text = document.createElement('span');
    text.textContent = 'Select a date';
    btn.appendChild(text);
    btn.insertAdjacentHTML('beforeend', ICO_CAL);
    if (label) label.htmlFor = btn.id;

    const pop = document.createElement('div');
    pop.className = 'cdate__pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Choose a date');
    pop.innerHTML =
      '<div class="cdate__head">' +
        '<button type="button" data-prev aria-label="Previous month">' + ICO_L + '</button>' +
        '<span class="cdate__month"></span>' +
        '<button type="button" data-next aria-label="Next month">' + ICO_R + '</button>' +
      '</div>' +
      '<div class="cdate__dows">' + DOW.map((d) => '<span>' + d[0] + '</span>').join('') + '</div>' +
      '<div class="cdate__grid"></div>' +
      '<p class="cdate__note">We\'re open Thursday – Sunday</p>';

    const monthEl = $('.cdate__month', pop);
    const grid = $('.cdate__grid', pop);
    const prevBtn = $('[data-prev]', pop);
    const nextBtn = $('[data-next]', pop);

    let view = new Date(today.getFullYear(), today.getMonth(), 1);
    let chosen = null;

    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const pretty = (d) => DOW[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();

    const render = () => {
      monthEl.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
      prevBtn.disabled = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();
      grid.innerHTML = '';
      const first = new Date(view.getFullYear(), view.getMonth(), 1);
      const pad = (first.getDay() + 6) % 7;            // grid starts on Monday
      const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (let i = 0; i < pad; i++) {
        const s = document.createElement('span');
        s.className = 'cdate__day cdate__day--pad';
        grid.appendChild(s);
      }
      for (let d = 1; d <= days; d++) {
        const date = new Date(view.getFullYear(), view.getMonth(), d);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cdate__day';
        b.textContent = d;
        if (date < today || OPEN_DAYS.indexOf(date.getDay()) === -1) b.disabled = true;
        if (+date === +today) b.classList.add('is-today');
        if (chosen && +date === +chosen) { b.classList.add('is-selected'); b.setAttribute('aria-current', 'date'); }
        b.addEventListener('click', () => {
          chosen = date;
          input.value = iso(date);
          text.textContent = pretty(date);
          btn.classList.remove('is-placeholder');
          input.dispatchEvent(new Event('change', { bubbles: true }));
          close();
          btn.focus();
        });
        grid.appendChild(b);
      }
    };

    const close = () => {
      wrap.dataset.open = 'false';
      btn.setAttribute('aria-expanded', 'false');
      if (openPopup.close === close) openPopup.close = null;
    };
    const open = () => {
      closeOpenPopup();
      wrap.dataset.open = 'true';
      btn.setAttribute('aria-expanded', 'true');
      render();
      openPopup.close = close;
    };

    prevBtn.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
    nextBtn.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
    btn.addEventListener('click', () => (wrap.dataset.open === 'true' ? close() : open()));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });

    input.classList.add('is-enhanced');
    input.setAttribute('tabindex', '-1');
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(btn);
    wrap.appendChild(pop);
    wrap.appendChild(input);
    input.__resetUI = () => {
      chosen = null;
      view = new Date(today.getFullYear(), today.getMonth(), 1); // back to this month
      text.textContent = 'Select a date';
      btn.classList.add('is-placeholder');
    };
    input.__focusUI = () => btn.focus();
  }

  $$('select[data-select]').forEach(enhanceSelect);
  $$('input[data-datepicker]').forEach(enhanceDate);

  /* ---------- Validation ---------- */
  const MESSAGES = {
    name: 'Please tell us your name.',
    email: 'Enter a valid email address.',
    date: 'Pick the night you\'d like to visit.',
    guests: 'Choose how many guests.',
    message: 'Tell us a little about your night.'
  };
  const errorFor = (el) => {
    const v = (el.value || '').trim();
    if (el.hasAttribute('required') && !v) return MESSAGES[el.name] || 'This field is required.';
    if (!v) return '';
    if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return MESSAGES.email;
    const min = parseInt(el.getAttribute('minlength'), 10);
    if (min && v.length < min) return 'Please use at least ' + min + ' characters.';
    return '';
  };

  $$('form[data-form]').forEach((form) => {
    const fields = $$('input, select, textarea', form).filter((el) => el.type !== 'submit' && el.name);
    const msg = $('.form-msg', form);

    const mark = (el, err) => {
      const field = el.closest('.field');
      if (!field) return;
      const box = $('.field__err', field);
      field.classList.toggle('is-invalid', !!err);
      field.classList.toggle('is-valid', !err && !!(el.value || '').trim());
      if (box) {
        box.textContent = err;
        el.setAttribute('aria-invalid', err ? 'true' : 'false');
        // Only point at the error node while it actually says something,
        // otherwise screen readers announce an empty description.
        if (box.id && err) el.setAttribute('aria-describedby', box.id);
        else el.removeAttribute('aria-describedby');
      }
      return !err;
    };

    fields.forEach((el) => {
      el.addEventListener('blur', () => mark(el, errorFor(el)), true);
      el.addEventListener('change', () => mark(el, errorFor(el)));
      el.addEventListener('input', () => {
        const field = el.closest('.field');
        if (field && field.classList.contains('is-invalid')) mark(el, errorFor(el));
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let firstBad = null;
      fields.forEach((el) => {
        const err = errorFor(el);
        mark(el, err);
        if (err && !firstBad) firstBad = el;
      });

      if (firstBad) {
        if (msg) { msg.textContent = 'Please check the highlighted fields.'; msg.style.color = '#e9b866'; }
        if (firstBad.__focusUI) firstBad.__focusUI(); else firstBad.focus();
        if (useGSAP) G.fromTo(form, { x: -7 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.35)' });
        return;
      }

      if (msg) { msg.textContent = 'Thanks — your request is in. We\'ll come back to you shortly.'; msg.style.color = '#f6d78a'; }
      form.reset();
      fields.forEach((el) => {
        const field = el.closest('.field');
        if (field) field.classList.remove('is-invalid', 'is-valid');
        if (el.__resetUI) el.__resetUI();
      });
      if (useGSAP && msg) G.fromTo(msg, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
    });
  });

  /* ---------- Privacy: highlight the section you're reading ---------- */
  const toc = $('.legal-toc');
  if (toc && 'IntersectionObserver' in window) {
    const links = $$('a[href^="#"]', toc);
    const byId = {};
    links.forEach((a) => { byId[a.getAttribute('href').slice(1)] = a; });
    const seen = new Set();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) seen.add(en.target.id); else seen.delete(en.target.id);
      });
      links.forEach((a) => a.classList.remove('is-current'));
      const first = links.find((a) => seen.has(a.getAttribute('href').slice(1)));
      if (first) first.classList.add('is-current');
    }, { rootMargin: '-120px 0px -55% 0px' });
    Object.keys(byId).forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
  }

  /* ---------- Ember particles ---------- */
  const canvas = $('#embers');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, embers;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Shadow-blurred circles are one of canvas' most expensive ops - a fixed 60 of
    // them chewed enough frame budget on phones to make the whole page scroll rough.
    const COUNT = Math.round(Math.max(18, Math.min(60, (window.innerWidth * window.innerHeight) / 26000)));
    const resize = () => {
      const nw = window.innerWidth, nh = window.innerHeight;
      // Ignore mobile URL-bar height jitter, which would clear the field on every scroll
      if (nw === w && Math.abs(nh - h) < 130) return;
      w = nw; h = nh;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
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

  /* ---------- Carousels (events + reels) ---------- */
  $$('.carousel').forEach((car) => {
    const track = $('.carousel__track', car);
    if (!track) return;
    const owner = car.closest('.section') || car.parentElement;
    const controlSelector = track.id ? '[aria-controls="' + track.id + '"]' : null;
    // The controls live in the section header, beside (not inside) `.carousel`.
    // Prefer the explicit aria-controls link and retain a scoped fallback for
    // carousels on older pages.
    const prev = controlSelector
      ? $('[data-carousel-prev]' + controlSelector, owner)
      : $('[data-carousel-prev]', owner);
    const next = controlSelector
      ? $('[data-carousel-next]' + controlSelector, owner)
      : $('[data-carousel-next]', owner);
    const step = () => {
      const first = track.firstElementChild;
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 20;
      return first ? first.getBoundingClientRect().width + gap : track.clientWidth * 0.85;
    };
    const update = () => {
      if (!prev || !next) return;
      const max = Math.max(0, track.scrollWidth - track.clientWidth);
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = max <= 2 || track.scrollLeft >= max - 2;
    };
    const move = (direction) => {
      track.scrollBy({
        left: direction * step(),
        behavior: reduceMotion ? 'auto' : 'smooth'
      });
    };
    if (prev) prev.addEventListener('click', () => move(-1));
    if (next) next.addEventListener('click', () => move(1));
    track.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      move(e.key === 'ArrowLeft' ? -1 : 1);
    });
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
    update();

    /* Mouse drag-to-scroll. Touch and pen are deliberately left alone: the track
       already scrolls natively there, and driving scrollLeft on top of that made
       every swipe travel twice as far and fight the snap points. */
    /* NB: deliberately NOT setPointerCapture. While the track holds capture the
       pointerup is retargeted to it, so the browser computes the click target as
       the track rather than the button underneath - which made every "Book Now"
       unclickable. Window-level listeners keep the drag alive outside the track
       without touching where the click lands. */
    let down = false, moved = false, sx = 0, sl = 0;

    const onMove = (e) => {
      if (!down) return;
      const dx = e.clientX - sx;
      // Snap has to go while dragging, or it keeps yanking the track back mid-drag.
      if (!moved && Math.abs(dx) > 4) { moved = true; track.classList.add('is-dragging'); }
      if (moved) { e.preventDefault(); track.scrollLeft = sl - dx; }
    };
    const endDrag = () => {
      if (!down) return;
      down = false;
      track.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };

    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; sx = e.clientX; sl = track.scrollLeft;
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    });
    // Stop the browser's native image/link drag from hijacking the gesture
    track.addEventListener('dragstart', (e) => { if (down) e.preventDefault(); });
    // Swallow only the click that actually ends a drag, so plain clicks pass through
    track.addEventListener('click', (e) => {
      if (!moved) return;
      moved = false;
      e.preventDefault(); e.stopPropagation();
    }, true);
  });

  /* ---------- Reels (LIVE Performances) ---------- */
  const ICON_MUTED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';
  const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a4 4 0 0 1 0 7"/></svg>';
  const reelCtl = [];
  $$('.reel').forEach((reel) => {
    const video = $('video', reel);
    if (!video) return;
    const sound = $('.reel__sound', reel);
    const playBtn = $('.reel__play', reel);
    let userPaused = false; // sticky, so scrolling can't undo an explicit pause

    video.muted = true;
    if (sound) sound.innerHTML = ICON_MUTED;

    const setMuted = (m) => {
      video.muted = m;
      if (sound) sound.innerHTML = m ? ICON_MUTED : ICON_SOUND;
    };
    const play = () => { userPaused = false; reel.classList.remove('paused'); video.play().catch(() => {}); };
    const pause = (byUser) => { if (byUser) userPaused = true; video.pause(); reel.classList.add('paused'); };

    if (playBtn) playBtn.addEventListener('click', () => { video.paused ? play() : pause(true); });
    if (sound) sound.addEventListener('click', (e) => {
      e.stopPropagation();
      const unmuting = video.muted;
      setMuted(!unmuting);
      if (unmuting) {
        // One reel at a time - otherwise every reel you unmute keeps playing over the last.
        reelCtl.forEach((c) => { if (c.reel !== reel) c.setMuted(true); });
        if (video.paused) play();
      }
    });

    // Autoplay only while in view (saves battery, feels alive)
    if ('IntersectionObserver' in window && !reduceMotion) {
      new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { if (!userPaused) play(); }
          // Keep the overlay honest and never leave audio running off-screen
          else { video.pause(); reel.classList.add('paused'); setMuted(true); }
        });
      }, { threshold: 0.55 }).observe(reel);
    }

    reelCtl.push({ reel, setMuted });
  });

  /* ---------- Ambient video (hero + media tiles): only decode what's on screen ---------- */
  const tileVideos = $$('.hero__video, .gallery__item video');
  if (tileVideos.length && 'IntersectionObserver' in window) {
    const vo = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && !reduceMotion) en.target.play().catch(() => {});
        else en.target.pause();
      });
    }, { threshold: 0.15 });
    tileVideos.forEach((v) => vo.observe(v));
  }

  /* ---------- Media lightbox ----------
     The tiles are plain links to Instagram in the markup so they still do
     something without JS; here we upgrade the click into a real viewer. */
  const lbItems = $$('.gallery__item[data-media]');
  if (lbItems.length) {
    const ICO_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const ICO_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    const ICO_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Media viewer');
    lb.setAttribute('aria-hidden', 'true');
    lb.innerHTML =
      '<div class="lightbox__backdrop" data-lb-close></div>' +
      '<button class="lightbox__close" type="button" aria-label="Close viewer" data-lb-close>' + ICO_CLOSE + '</button>' +
      '<button class="lightbox__nav lightbox__nav--prev" type="button" aria-label="Previous item">' + ICO_PREV + '</button>' +
      '<button class="lightbox__nav lightbox__nav--next" type="button" aria-label="Next item">' + ICO_NEXT + '</button>' +
      '<figure class="lightbox__stage">' +
        '<div class="lightbox__frame"></div>' +
        '<figcaption class="lightbox__cap">' +
          '<span class="lightbox__count"></span><span class="lightbox__text"></span>' +
          '<a class="lightbox__ig" href="https://instagram.com/savara_goa" target="_blank" rel="noopener" data-no-transition>View on Instagram</a>' +
        '</figcaption>' +
      '</figure>';
    document.body.appendChild(lb);

    const frame = $('.lightbox__frame', lb);
    const capText = $('.lightbox__text', lb);
    const capCount = $('.lightbox__count', lb);
    const btnClose = $('.lightbox__close', lb);
    const gridVideos = $$('.gallery__item video');
    let current = -1, lastFocus = null;

    const clearFrame = () => {
      const v = $('video', frame);
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      frame.innerHTML = '';
    };

    const render = (i) => {
      const el = lbItems[i];
      if (!el) return;
      current = i;
      clearFrame();
      if (el.dataset.type === 'video') {
        const v = document.createElement('video');
        v.src = el.dataset.media;
        v.controls = true; v.loop = true; v.playsInline = true; v.autoplay = true;
        if (el.dataset.poster) v.poster = el.dataset.poster;
        frame.appendChild(v);
        v.play().catch(() => {});
      } else {
        const img = document.createElement('img');
        img.src = el.dataset.media;
        img.alt = ($('img', el) || {}).alt || el.dataset.caption || '';
        frame.appendChild(img);
      }
      capText.textContent = el.dataset.caption || '';
      capCount.textContent = (i + 1) + ' / ' + lbItems.length;
    };

    const go = (d) => render((current + d + lbItems.length) % lbItems.length);

    const open = (i, trigger) => {
      lastFocus = trigger || null;
      render(i);
      lb.classList.add('is-open');
      lb.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lb-lock');
      gridVideos.forEach((v) => v.pause()); // nothing decoding behind the backdrop
      btnClose.focus();
    };

    const close = () => {
      clearFrame();
      lb.classList.remove('is-open');
      lb.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lb-lock');
      current = -1;
      if (!reduceMotion) gridVideos.forEach((v) => v.play().catch(() => {}));
      if (lastFocus) lastFocus.focus();
    };

    lbItems.forEach((el, i) => {
      el.addEventListener('click', (e) => {
        // Leave modified clicks alone so the Instagram link still works
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        open(i, el);
      });
    });
    $$('[data-lb-close]', lb).forEach((el) => el.addEventListener('click', close));
    $('.lightbox__nav--prev', lb).addEventListener('click', () => go(-1));
    $('.lightbox__nav--next', lb).addEventListener('click', () => go(1));

    window.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowLeft') { go(-1); return; }
      if (e.key === 'ArrowRight') { go(1); return; }
      if (e.key !== 'Tab') return;
      // Keep focus inside the dialog
      const f = $$('button, a[href], video[controls]', lb);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // Swipe between items on touch
    let sx = 0, sy = 0;
    lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /* ---------- Events rail: image preview that trails the cursor ---------- */
  const evRail = $('.ev-rail');
  const evPeek = $('.ev-peek');
  if (evRail && evPeek && useGSAP && hasHover) {
    const peekImg = $('img', evPeek);
    // Centred on the pointer. The old version offset the box's top-left corner,
    // which put its centre ~158px right of the cursor, and a 0.5s ease meant it
    // was still catching up from the previous row - so it read as detached.
    let tx = 0, ty = 0, cx = 0, cy = 0, tracking = false;

    G.set(evPeek, { scale: 0.9, transformOrigin: '50% 50%' });

    const aim = (e) => {
      const w = evPeek.offsetWidth || 260;
      const h = evPeek.offsetHeight || 195;
      // keep it fully on screen near the viewport edges
      tx = Math.min(Math.max(e.clientX - w / 2, 10), window.innerWidth - w - 10);
      ty = Math.min(Math.max(e.clientY - h / 2, 10), window.innerHeight - h - 10);
    };

    G.ticker.add(() => {
      if (!tracking) return;
      cx += (tx - cx) * 0.2;
      cy += (ty - cy) * 0.2;
      G.set(evPeek, { x: cx, y: cy });
    });

    evRail.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      aim(e);
    });

    $$('.ev-row', evRail).forEach((row) => {
      row.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse' || !row.dataset.img) return;
        if (peekImg.getAttribute('src') !== row.dataset.img) peekImg.src = row.dataset.img;
        aim(e);
        // Land on the cursor rather than gliding in from wherever it was left
        cx = tx; cy = ty;
        G.set(evPeek, { x: cx, y: cy });
        tracking = true;
        G.to(evPeek, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'power3.out', overwrite: true });
      });
      row.addEventListener('pointerleave', () => {
        tracking = false;
        G.to(evPeek, { autoAlpha: 0, scale: 0.9, duration: 0.25, ease: 'power2.in', overwrite: true });
      });
    });
  }

  /* ---------- Booker: chips compose a real WhatsApp message ---------- */
  const booker = $('#booker');
  if (booker) {
    const WA = 'https://wa.me/917397956179?text=';
    const sendBtn = $('#bookerSend');
    const msgEl = $('#bookerMsg');
    const noteEl = $('[data-field="note"]', booker);
    const picked = {};

    const compose = () => {
      let s = 'Hi Savara, I\'d like to book a table';
      if (picked.guests) s += ' for ' + picked.guests + (picked.guests === '2' ? ' people' : picked.guests === '8+' ? ' guests' : ' people');
      if (picked.night) s += ' on ' + picked.night;
      if (picked.occasion) s += ' for ' + picked.occasion;
      s += '.';
      const note = (noteEl && noteEl.value.trim()) || '';
      if (note) s += ' ' + note.charAt(0).toUpperCase() + note.slice(1) + (/[.!?]$/.test(note) ? '' : '.');
      return s;
    };

    const sync = () => {
      const text = compose();
      if (msgEl) {
        msgEl.textContent = text;
        // Small pulse so the preview visibly responds to every choice
        if (useGSAP) G.fromTo(msgEl, { opacity: 0.35, y: 4 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', overwrite: true });
      }
      if (sendBtn) sendBtn.href = WA + encodeURIComponent(text);
    };

    $$('.chips', booker).forEach((group) => {
      const field = group.dataset.field;
      group.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const isOn = chip.classList.contains('is-active');
        $$('.chip', group).forEach((c) => c.classList.remove('is-active'));
        if (isOn) { delete picked[field]; }               // tapping again clears it
        else { chip.classList.add('is-active'); picked[field] = chip.dataset.value; }
        const step = group.closest('[data-step]');
        if (step) step.classList.toggle('is-filled', !!picked[field]);
        if (useGSAP && !isOn) G.fromTo(chip, { scale: 0.92 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' });
        sync();
      });
    });
    if (noteEl) {
      noteEl.addEventListener('input', () => {
        const step = noteEl.closest('[data-step]');
        if (step) step.classList.toggle('is-filled', !!noteEl.value.trim());
        sync();
      });
    }
    sync();
  }

  /* ---------- Year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  if (useGSAP) window.addEventListener('load', () => ST.refresh());
})();
