/* Enflame demo site script (by Moosach): animations and small interactions shared by every page. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  /* headline words rise in one by one */
  var wi = 0;
  function split(node) {
    [].slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var w = document.createElement('span'); w.className = 'w';
          var s = document.createElement('span'); s.textContent = part; s.style.setProperty('--d', wi++);
          w.appendChild(s); frag.appendChild(w);
        });
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1) split(n);
    });
  }
  if (!reduce) $$('[data-split]').forEach(function (h) { wi = 0; split(h); });

  /* office open or closed, in UK time */
  var open = null;
  try {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var g = function (t) { return p.filter(function (x) { return x.type === t; })[0].value; };
    var day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g('weekday')], m = (parseInt(g('hour'), 10) % 24) * 60 + parseInt(g('minute'), 10);
    open = day >= 1 && day <= 5 && m >= 540 && m < 1020;
    $$('[data-status]').forEach(function (el) {
      var t = el.querySelector('span');
      if (t) t.textContent = open ? 'Office open now. Call or message us' : 'Office closed. Our assistant is taking messages';
      if (!open) el.classList.add('closed');
    });
    var row = $('.hours [data-day="' + day + '"]'); if (row) row.classList.add('today');
  } catch (e) {}

  /* endless logo band: duplicate the logos once */
  var strip = $('#strip');
  if (strip) {
    strip.innerHTML += strip.innerHTML;
    [].slice.call(strip.children).slice(strip.children.length / 2).forEach(function (li) { li.setAttribute('aria-hidden', 'true'); });
  }

  /* reviews (all from Enflame's Google reviews) */
  var R = [
    ['Phil Cox', 'Rosli installed a new Combi boiler for us 12 months ago giving excellent advice when changing from our previous gravity fed system. We signed up for his annual service plan and he is always on hand when needed. Great to have such peace of mind. Absolutely superb service.'],
    ['Chris Escott', "Having been let down by another company, Enflame were recommended and I couldn't speak more highly of them. Prompt, professional, reliable and extremely helpful. Rosli and the team were superb."],
    ['Ancella Lombard', "Massive shoutout to Roz. He's just completed my annual boiler service and as always, he was fantastic. Quick, professional, and finished the whole job in under 45 minutes with a full report included."],
    ['Jim Morris', "I've been with Rosli for years now. Always a quality service and job. He's great on communication, turns up on time and helps you out when you need it. Couldn't recommend enough."],
    ['Joe Dyer', 'Quick, easy, friendly service, many thanks!'],
    ['Gordon Kochane', 'Good reliable service.'],
    ['Bobby A7wal', 'As always good service.']
  ];
  var G = '<svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  function card(r, hidden) {
    var initials = r[0].split(' ').map(function (x) { return x.charAt(0); }).join('').slice(0, 2);
    return '<figure class="rcard"' + (hidden ? ' aria-hidden="true"' : '') + '><div class="rtop"><div class="stars" aria-label="5 out of 5 stars">★★★★★</div>' + G + '</div><blockquote>“' + r[1] + '”</blockquote><cite><i aria-hidden="true">' + initials + '</i><span style="display:block">' + r[0] + '<span>Verified Google review</span></span></cite></figure>';
  }
  function fill(el, list) { el.innerHTML = list.map(function (r) { return card(r, false); }).join('') + list.map(function (r) { return card(r, true); }).join(''); }
  var r1 = $('#row1'), r2 = $('#row2'), rg = $('#revgrid');
  if (r1) fill(r1, [R[0], R[4], R[1], R[5]]);
  if (r2) fill(r2, [R[2], R[6], R[3], R[4]]);
  if (rg) rg.innerHTML = R.map(function (r) { return card(r, false); }).join('');

  /* reveal on scroll, staggered lists, count-up numbers */
  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-count')), dec = parseInt(el.getAttribute('data-dec') || '0', 10), suf = el.getAttribute('data-suffix') || '';
    if (reduce) { el.textContent = to.toFixed(dec) + suf; return; }
    var t0 = null, dur = 1400;
    function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = (to * e).toFixed(dec) + (k === 1 ? suf : ''); if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  $$('.areas li').forEach(function (li, i) { li.style.setProperty('--i', i); });
  var els = $$('.rv, .areas');
  if (!('IntersectionObserver' in window) || reduce) {
    els.forEach(function (e) { e.classList.add('in'); });
    $$('[data-count]').forEach(countUp);
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        var c = e.target.querySelector('[data-count]'); if (c) countUp(c);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* header shrink, scroll progress, parallax photos */
  var hdr = $('#hdr'), bar = $('#progress'), par = $$('[data-parallax]'), ticking = false;
  function onScroll() {
    var y = window.scrollY || 0, h = document.documentElement.scrollHeight - innerHeight;
    if (hdr) hdr.classList.toggle('scrolled', y > 10);
    if (bar) bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
    if (!reduce) par.forEach(function (img) {
      var r = img.parentNode.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      var k = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      img.style.setProperty('--py', (-k * 40 - 20).toFixed(1) + 'px');
    });
    ticking = false;
  }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* 3D tilt on cards (mouse only) */
  if (!reduce && matchMedia('(hover:hover) and (pointer:fine)').matches) {
    $$('.tilt').forEach(function (c) {
      c.addEventListener('mousemove', function (e) { c.style.transitionDelay = '0s'; var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; c.style.transform = 'perspective(900px) rotateY(' + (x * 6) + 'deg) rotateX(' + (-y * 6) + 'deg) translateY(-6px)'; });
      c.addEventListener('mouseleave', function () { c.style.transform = ''; });
    });
  }

  /* service plan filter tabs with a sliding pill */
  $$('.ptabs').forEach(function (wrap) {
    var tabs = $$('button', wrap), pill = $('.pill', wrap), plans = $$('.plan', wrap.parentNode);
    function movePill(b) { if (!pill) return; pill.style.width = b.offsetWidth + 'px'; pill.style.transform = 'translateX(' + (b.offsetLeft - 5) + 'px)'; }
    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        tabs.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        movePill(b);
        var f = b.getAttribute('data-f');
        plans.forEach(function (p) { p.classList.toggle('dim', f !== 'all' && p.getAttribute('data-k') !== f); });
      });
    });
    function init() { var on = tabs.filter(function (x) { return x.getAttribute('aria-selected') === 'true'; })[0]; if (on) movePill(on); }
    init(); addEventListener('resize', init);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  });

  /* phone menu */
  var burger = $('#burger'), mnav = $('#mnav');
  if (burger && mnav) {
    var setOpen = function (on) {
      burger.setAttribute('aria-expanded', on ? 'true' : 'false');
      var sheet = mnav.querySelector('.sheet'); if (sheet && hdr) sheet.style.paddingTop = (Math.max(0, hdr.getBoundingClientRect().bottom) + 14) + 'px';
      mnav.classList.toggle('open', on); mnav.setAttribute('aria-hidden', on ? 'false' : 'true');
      document.body.classList.toggle('menu-open', on);
      $$('a.l', mnav).forEach(function (a, i) { a.style.transitionDelay = on ? (80 + i * 35) + 'ms' : '0ms'; a.tabIndex = on ? 0 : -1; });
    };
    setOpen(false);
    burger.addEventListener('click', function () { setOpen(burger.getAttribute('aria-expanded') !== 'true'); });
    mnav.addEventListener('click', function (e) { if (e.target === mnav || e.target.closest('a,button[data-chat]')) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }

  /* contact form: writes the enquiry into a WhatsApp message (nothing is sent until they press send) */
  var f = $('#enq');
  if (f) f.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = function (n) { return (f.elements[n] && f.elements[n].value || '').trim(); };
    if (!v('name') || !v('message')) { (v('name') ? f.elements.message : f.elements.name).focus(); return; }
    var lines = ['Hi Enflame, I have an enquiry from your website.', '', '*Name:* ' + v('name')];
    if (v('postcode')) lines.push('*Postcode / area:* ' + v('postcode'));
    if (v('service')) lines.push('*Service:* ' + v('service'));
    lines.push('*Message:* ' + v('message'));
    window.open('https://wa.me/441952300008?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
  });
})();
