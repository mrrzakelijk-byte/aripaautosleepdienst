(function () {
  'use strict';

  /* ---------- Jaartal in de footer ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Header: compacter bij scrollen + mobiel menu ---------- */
  var header = document.getElementById('siteHeader');
  var nav = header.querySelector('.nav');
  var toggle = document.getElementById('menuToggle');
  var menu = document.getElementById('mobileMenu');

  function onScroll() { header.classList.toggle('is-scrolled', window.scrollY > 40); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  }
  toggle.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
  });
  window.addEventListener('resize', function () { if (window.innerWidth > 1080) setMenu(false); });

  /* ---------- Prijsindicatie: extra vragen als de auto niet rijdt ---------- */
  var quoteForm = document.getElementById('quoteForm');
  var notDriving = document.getElementById('notDriving');

  function syncDriving() {
    var checked = quoteForm.querySelector('input[name="Kan de auto rijden"]:checked');
    var show = !!checked && checked.value === 'Nee';
    notDriving.hidden = !show;
    // Uitgeschakelde velden worden niet gevalideerd en niet meegestuurd
    Array.prototype.forEach.call(notDriving.querySelectorAll('input, select'), function (el) {
      el.disabled = !show;
    });
  }
  quoteForm.addEventListener('change', function (e) {
    if (e.target.name === 'Kan de auto rijden') syncDriving();
  });
  syncDriving();

  /* ---------- Kenteken: opmaak + opzoeken bij de RDW (open data) ---------- */
  var plateInput = document.getElementById('q-kenteken');
  var brandInput = document.getElementById('q-merk');
  var weightInput = document.getElementById('q-gewicht');
  var plateHint = document.getElementById('q-kenteken-hint');
  var defaultHint = plateHint.textContent;
  var lookupTimer = null;
  var lastLookup = '';
  var brandTouched = false;

  brandInput.addEventListener('input', function () { brandTouched = true; });

  function titleCase(str) {
    return str.toLowerCase().replace(/(^|[\s-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  function niceBrand(b) { return b.length <= 3 ? b.toUpperCase() : titleCase(b); }

  function lookupPlate(plate) {
    if (plate === lastLookup) return;
    lastLookup = plate;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
    fetch('https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=' + encodeURIComponent(plate),
      { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        clearTimeout(timer);
        var v = rows && rows[0];
        if (!v || !v.merk) { plateHint.textContent = 'Niet gevonden. Vul merk en type zelf in.'; plateHint.classList.remove('is-ok'); return; }
        var label = niceBrand(v.merk) + (v.handelsbenaming ? ' ' + titleCase(v.handelsbenaming) : '');
        if (!brandTouched || !brandInput.value) { brandInput.value = label; brandTouched = false; }
        if (!weightInput.value && v.massa_ledig_voertuig) weightInput.value = v.massa_ledig_voertuig;
        plateHint.textContent = 'Gevonden: ' + label + '. Klopt dit niet? Pas het gerust aan.';
        plateHint.classList.add('is-ok');
      })
      .catch(function () { clearTimeout(timer); plateHint.textContent = defaultHint; plateHint.classList.remove('is-ok'); });
  }

  plateInput.addEventListener('input', function () {
    var start = plateInput.selectionStart;
    plateInput.value = plateInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    try { plateInput.setSelectionRange(start, start); } catch (e) { /* niet ondersteund */ }
    plateHint.textContent = defaultHint;
    plateHint.classList.remove('is-ok');
    clearTimeout(lookupTimer);
    var plain = plateInput.value.replace(/-/g, '');
    if (plain.length === 6) lookupTimer = setTimeout(function () { lookupPlate(plain); }, 350);
  });

  /* ---------- Formulieren: echt verzenden naar e-mail (FormSubmit) ---------- */
  var PHONE = '+31 6 33007177';

  function setStatus(el, type, parts) {
    el.className = 'form__status' + (type ? ' is-' + type : '');
    while (el.firstChild) el.removeChild(el.firstChild);
    parts.forEach(function (p) {
      if (typeof p === 'string') { el.appendChild(document.createTextNode(p)); }
      else { var a = document.createElement('a'); a.href = p.href; a.textContent = p.text; el.appendChild(a); }
    });
  }
  function fallbackParts(prefix) {
    return [prefix + ' Bel ons op ', { href: 'tel:+31633007177', text: PHONE }, ' of mail naar ', { href: 'mailto:info@aripa.nl', text: 'info@aripa.nl' }, '.'];
  }

  function initForm(form) {
    var status = form.querySelector('.form__status');
    var button = form.querySelector('button[type="submit"]');
    var success = form.parentElement.querySelector('.success');
    var buttonText = button.textContent;
    var openedAt = Date.now();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      setStatus(status, '', []);

      if (!form.reportValidity()) return;

      // Spambeveiliging: verborgen selectievakje (honeypot) en te snel verzonden = bot
      var trap = form.elements['botcheck'];
      if ((trap && trap.checked) || Date.now() - openedAt < 2500) {
        // Doe alsof het gelukt is, maar verstuur niets
        form.hidden = true; success.hidden = false; return;
      }

      var action = form.getAttribute('action') || '';

      button.disabled = true;
      button.textContent = 'Bezig met verzenden...';

      fetch(action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            // Web3Forms meldt succes met { success: true }
            var ok = data && data.success === true;
            if (ok) {
              form.hidden = true;
              success.hidden = false;
              success.focus();
              success.scrollIntoView({ block: 'center' });
              return;
            }
            var msg = 'Verzenden is niet gelukt.';
            if (data && data.message && /valid|geldig/i.test(String(data.message))) {
              msg = 'Controleer uw invoer, bijvoorbeeld uw e-mailadres.';
            }
            setStatus(status, 'error', fallbackParts(msg + ' Probeer het opnieuw of neem direct contact op.'));
          });
        })
        .catch(function () {
          setStatus(status, 'error', fallbackParts('Verzenden is niet gelukt. Controleer uw internetverbinding en probeer het opnieuw.'));
        })
        .then(function () { button.disabled = false; button.textContent = buttonText; });
    });
  }
  initForm(quoteForm);
  initForm(document.getElementById('contactForm'));

  /* ---------- Galerij: lightbox ---------- */
  var grid = document.getElementById('galleryGrid');
  var items = Array.prototype.slice.call(grid.querySelectorAll('.g'));
  var box = document.getElementById('lightbox');
  var boxImg = document.getElementById('lbImg');
  var current = 0;

  function show(i) {
    current = (i + items.length) % items.length;
    var btn = items[current];
    boxImg.src = btn.getAttribute('data-full');
    boxImg.alt = btn.querySelector('img').alt;
  }
  items.forEach(function (btn, i) {
    btn.addEventListener('click', function () {
      show(i);
      if (typeof box.showModal === 'function') box.showModal(); else box.setAttribute('open', '');
    });
  });
  document.getElementById('lbClose').addEventListener('click', function () { box.close(); });
  document.getElementById('lbPrev').addEventListener('click', function () { show(current - 1); });
  document.getElementById('lbNext').addEventListener('click', function () { show(current + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
  box.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
})();
