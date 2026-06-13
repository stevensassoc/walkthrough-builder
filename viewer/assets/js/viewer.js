(function () {
  'use strict';

  var screenfull = window.screenfull;
  var TourModel = window.TourModel;
  var TOUR = window.TOUR;

  // DOM refs
  var panoEl = document.getElementById('pano');
  var logoImg = document.getElementById('logoImg');
  var projTitle = document.getElementById('projTitle');
  var sceneTitle = document.getElementById('sceneTitle');
  var counterEl = document.getElementById('counter');
  var errorEl = document.getElementById('errorMsg');
  var spinnerEl = document.getElementById('spinner');
  var transEl = document.getElementById('transition');
  var transitioning = false;

  // State
  var meta = null;
  var engine = null;
  var scenes = [];          // { data, handle, broken }
  var currentIndex = 0;
  var playing = false;

  var ZOOM_STEP = 0.12;     // radians of fov per zoom-button press

  init();

  function init() {
    var v = TourModel.validateTour(TOUR);
    if (!v.ok) { showError('No tour loaded: ' + v.errors[0]); return; }

    meta = TourModel.resolveMeta(TOUR.meta);
    document.documentElement.style.setProperty('--accent', meta.accent);
    if (TOUR.scenes.length < 2) { document.body.classList.add('single-scene'); }

    applyBranding();
    applyBrandingWelcome();

    engine = PanoEngine(panoEl);
    engine.onInteract(function () { if (playing) { stopRotate(); } });
    engine.onReady(hideSpinner);   // hide the loading spinner when the active scene's texture arrives

    buildScenes();
    buildRail();
    wireNav();
    wireControls();
    wireWelcome();
    goToScene(0, { instant: true });   // no transition on first load (welcome covers it)
    if (meta.autoRotate) { startRotate(); }   // off by default; honors manifest opt-in
  }

  function applyBranding() {
    if (meta.logo) { logoImg.src = meta.logo; logoImg.alt = meta.title; }
    projTitle.textContent = meta.title;
  }

  function buildScenes() {
    scenes = TOUR.scenes.map(function (data) {
      var s = { data: data, handle: null, broken: false };
      s.handle = engine.load(data.image, function () {
        s.broken = true;
        if (scenes[currentIndex] === s) { showError('Image unavailable for "' + s.data.name + '"'); }
      });
      buildHotspots(s);
      return s;
    });
  }

  function showScene(s) {
    hideError();
    engine.show(s.handle, s.data.initialView);
    if (engine.isActiveReady()) { hideSpinner(); } else { showSpinner(); }
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function showTransition() { if (transEl) { transEl.classList.add('on'); } }
  function hideTransition() { if (transEl) { transEl.classList.remove('on'); } }

  // opts.dir = {yaw,pitch} of the clicked link → "move toward it" dolly; opts.instant skips effects.
  function goToScene(index, opts) {
    index = ((index % scenes.length) + scenes.length) % scenes.length;
    if (transitioning) { return; }
    var s = scenes[index];
    if (playing) { stopRotate(); }
    if (s.broken) { currentIndex = index; showError('Image unavailable for "' + s.data.name + '"'); updateChrome(); return; }

    var dir = opts && opts.dir;
    var useTransition = !(opts && opts.instant) && meta.transition !== 'none'
      && !engine.isReducedMotion() && scenes.length > 1;

    if (!useTransition) { currentIndex = index; showScene(s); updateChrome(); return; }

    transitioning = true;
    function swapUnderCover() {
      return wait(290).then(function () {           // wait for the cover to go fully opaque
        currentIndex = index; showScene(s); updateChrome();
        return wait(60);                            // let the new frame render under the cover
      }).then(function () { hideTransition(); transitioning = false; });
    }
    if (dir) {
      // 1) dolly toward the arrow IN THE CLEAR (no cover yet) so the movement is visible
      engine.animateView({ yaw: dir.yaw, pitch: dir.pitch, fov: engine.getView().fov * 0.5 }, 320)
        .then(function () { showTransition(); return swapUnderCover(); });   // 2) then fade + swap
    } else {
      showTransition(); swapUnderCover();           // rail / Next-Back: plain fade only
    }
  }

  function updateChrome() {
    var s = scenes[currentIndex];
    sceneTitle.textContent = s.data.name || '';
    counterEl.textContent = (currentIndex + 1) + ' / ' + scenes.length;
    document.title = meta.title + (s.data.name ? ' — ' + s.data.name : '');
    var titleBar = document.getElementById('titleBar');
    if (titleBar) { titleBar.title = meta.title + (s.data.name ? ' · ' + s.data.name : ''); }
    var nextBtn = document.getElementById('btnNext');
    if (nextBtn) { nextBtn.textContent = (currentIndex === scenes.length - 1) ? '↺ Start over' : 'Next ▶'; }
    updateRailHighlight();
  }

  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
  function hideError() { errorEl.hidden = true; }
  function showSpinner() { if (spinnerEl) { spinnerEl.hidden = false; panoEl.setAttribute('aria-busy', 'true'); } }
  function hideSpinner() { if (spinnerEl) { spinnerEl.hidden = true; panoEl.setAttribute('aria-busy', 'false'); } }
  function closeInfoCards() {
    var open = document.querySelectorAll('#hotspots .info-hotspot.open');
    for (var i = 0; i < open.length; i++) { open[i].classList.remove('open'); }
  }

  // ---------- branding / welcome ----------
  function applyBrandingWelcome() {
    var wLogo = document.getElementById('welcomeLogoImg');
    if (meta.logo) { wLogo.src = meta.logo; wLogo.alt = meta.title; }
    else { document.getElementById('welcomeLogo').style.display = 'none'; }
    document.getElementById('welcomeTitle').textContent = meta.title;
    document.getElementById('welcomeSubtitle').textContent = meta.subtitle;
    if (meta.cover) {
      var w = document.getElementById('welcome');
      w.style.background = 'linear-gradient(rgba(9,13,18,0.45), rgba(9,13,18,0.62)), url("' +
        meta.cover + '") center / cover no-repeat';
      w.classList.add('has-cover');
    }
  }

  function wireWelcome() {
    var welcome = document.getElementById('welcome');
    if (!meta.showWelcome) { welcome.classList.add('hidden'); return; }
    var beginBtn = document.getElementById('welcomeBegin');
    beginBtn.focus();
    function dismiss() {
      welcome.classList.add('hidden');
      var nb = document.getElementById('btnNext'); if (nb) { nb.focus(); }
    }
    beginBtn.addEventListener('click', dismiss);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !welcome.classList.contains('hidden')) { dismiss(); }
    });
  }

  // ---------- area rail ----------
  function buildRail() {
    var list = document.getElementById('railList');
    var label = document.createElement('div');
    label.className = 'rail-label';
    label.textContent = 'Areas';
    list.appendChild(label);

    scenes.forEach(function (s, i) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'rail-item';
      item.setAttribute('data-index', String(i));

      var thumb = document.createElement('img');
      thumb.className = 'rail-thumb';
      thumb.src = s.data.image;
      thumb.alt = '';

      var name = document.createElement('span');
      name.className = 'rail-name';
      name.textContent = s.data.name || ('Area ' + (i + 1));

      item.appendChild(thumb);
      item.appendChild(name);
      item.addEventListener('click', function () { goToScene(i); });
      list.appendChild(item);
    });

    // Rail toggle — move it into the header so it's visible/clickable.
    var rail = document.getElementById('rail');
    var toggle = document.getElementById('railToggle');
    toggle.style.cssText = '';
    toggle.className = 'ctl';
    toggle.setAttribute('aria-label', 'Toggle area menu');
    toggle.style.position = 'absolute';
    toggle.style.top = '14px';
    toggle.style.left = '14px';
    toggle.style.zIndex = '35';
    toggle.style.opacity = '1';
    toggle.style.width = '38px';
    toggle.style.height = '38px';
    document.getElementById('brandHeader').style.left = '62px';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.addEventListener('click', function () {
      var collapsed = rail.classList.toggle('collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  function updateRailHighlight() {
    var items = document.querySelectorAll('.rail-item');
    for (var i = 0; i < items.length; i++) {
      if (Number(items[i].getAttribute('data-index')) === currentIndex) {
        items[i].classList.add('current'); items[i].setAttribute('aria-current', 'true');
      } else {
        items[i].classList.remove('current'); items[i].removeAttribute('aria-current');
      }
    }
  }

  // ---------- guided navigation ----------
  function wireNav() {
    document.getElementById('btnBack').addEventListener('click', function () {
      goToScene(TourModel.prevIndex(currentIndex, scenes.length));
    });
    document.getElementById('btnNext').addEventListener('click', function () {
      goToScene(TourModel.nextIndex(currentIndex, scenes.length));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { goToScene(TourModel.nextIndex(currentIndex, scenes.length)); }
      else if (e.key === 'ArrowLeft') { goToScene(TourModel.prevIndex(currentIndex, scenes.length)); }
    });
  }

  // ---------- controls ----------
  function wireControls() {
    var playBtn = document.getElementById('btnPlay');
    var fullBtn = document.getElementById('btnFull');

    document.getElementById('btnZoomIn').addEventListener('click', function () { engine.nudgeFov(-ZOOM_STEP); });
    document.getElementById('btnZoomOut').addEventListener('click', function () { engine.nudgeFov(ZOOM_STEP); });

    playBtn.addEventListener('click', function () { playing ? stopRotate() : startRotate(); });

    panoEl.addEventListener('pointerdown', closeInfoCards);   // dragging the pano closes any open note

    if (screenfull && screenfull.enabled) {
      fullBtn.addEventListener('click', function () { screenfull.toggle(); });
      screenfull.on('change', function () {
        fullBtn.classList.toggle('active', screenfull.isFullscreen);
      });
    } else {
      fullBtn.style.display = 'none';
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'f' || e.key === 'F') { if (screenfull && screenfull.enabled) { screenfull.toggle(); } }
      else if (e.key === ' ') { e.preventDefault(); playing ? stopRotate() : startRotate(); }
      else if (e.key === 'Escape') { closeInfoCards(); if (screenfull && screenfull.isFullscreen) { screenfull.exit(); } }
    });
  }

  function startRotate() {
    if (scenes[currentIndex].broken) { return; }
    playing = true;
    engine.startAutorotate();
    var pb = document.getElementById('btnPlay');
    pb.classList.add('active'); pb.textContent = '❚❚'; pb.setAttribute('aria-label', 'Pause auto-rotation');
  }

  function stopRotate() {
    playing = false;
    engine.stopAutorotate();
    var pb = document.getElementById('btnPlay');
    pb.classList.remove('active'); pb.textContent = '▶'; pb.setAttribute('aria-label', 'Play auto-rotation');
  }

  // ---------- hotspots ----------
  function buildHotspots(s) {
    (s.data.linkHotspots || []).forEach(function (h) {
      var idx = TourModel.sceneIndexById(TOUR.scenes, h.target);
      if (idx === -1) { return; }  // skip unknown targets (validateTour already warns)

      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'hotspot link-hotspot';
      el.setAttribute('aria-label', 'Go to ' + (TOUR.scenes[idx].name || 'area'));

      var arrow = document.createElement('span');
      arrow.className = 'link-arrow';
      arrow.textContent = '➤';
      if (h.rotation) { arrow.style.transform = 'rotate(' + h.rotation + 'rad)'; }
      el.appendChild(arrow);

      var tip = document.createElement('div');
      tip.className = 'link-tooltip';
      tip.textContent = h.label || (TOUR.scenes[idx].name || 'Go');
      el.appendChild(tip);

      el.addEventListener('click', function (ev) { ev.stopPropagation(); goToScene(idx, { dir: { yaw: h.yaw, pitch: h.pitch } }); });
      stopPropagation(el);
      engine.addHotspot(s.handle, el, h.yaw, h.pitch);
    });

    (s.data.infoHotspots || []).forEach(function (h) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'hotspot info-hotspot';
      el.setAttribute('aria-label', 'Information: ' + (h.title || 'note'));
      el.appendChild(document.createTextNode('i'));

      var card = document.createElement('div');
      card.className = 'info-card';
      card.innerHTML = '<h4></h4><p></p>';
      card.querySelector('h4').textContent = h.title || '';
      card.querySelector('p').textContent = h.text || '';
      el.appendChild(card);

      el.addEventListener('click', function (ev) { ev.stopPropagation(); el.classList.toggle('open'); });
      stopPropagation(el);
      engine.addHotspot(s.handle, el, h.yaw, h.pitch);
    });
  }

  function stopPropagation(el) {
    ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach(function (type) {
      el.addEventListener(type, function (e) { e.stopPropagation(); });
    });
  }
})();
