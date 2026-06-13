(function () {
  'use strict';
  var PS = window.ProjectStore, IU = window.ImageUtils;

  var panoEl = document.getElementById('pano');
  var areaListEl = document.getElementById('areaList');
  var fileInput = document.getElementById('fileInput');
  var dropzone = document.getElementById('dropzone');
  var titleEl = document.getElementById('projTitle');
  var subtitleEl = document.getElementById('projSubtitle');
  var qualityEl = document.getElementById('quality');
  var hintEl = document.getElementById('stageHint');

  var engine = PanoEngine(panoEl);
  var project = PS.createProject({ title: '' });
  var currentId = null;
  var urlCache = {};      // sceneId -> object URL for preview
  var handleCache = {};   // sceneId -> engine scene handle (created once per scene)

  titleEl.addEventListener('input', function () { project.title = titleEl.value; project.id = IU.slugify(titleEl.value || 'untitled-tour'); scheduleSave(); });
  subtitleEl.addEventListener('input', function () { project.subtitle = subtitleEl.value; scheduleSave(); });
  qualityEl.addEventListener('change', function () { project.quality = Number(qualityEl.value); scheduleSave(); });

  // ---- import ----
  fileInput.addEventListener('change', function () { importFiles(fileInput.files); fileInput.value = ''; });
  dropzone.addEventListener('click', function () { fileInput.click(); });
  ['dragover', 'dragenter'].forEach(function (t) {
    dropzone.addEventListener(t, function (e) { e.preventDefault(); dropzone.classList.add('drag'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    dropzone.addEventListener(t, function (e) { e.preventDefault(); dropzone.classList.remove('drag'); });
  });
  dropzone.addEventListener('drop', function (e) { importFiles(e.dataTransfer.files); });

  function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) { toast('Please drop JPG/PNG images.'); return; }
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        return IU.fileToBitmap(f)
          .then(function (bmp) { return IU.downscaleToBlob(bmp, project.quality); })
          .then(function (blob) {
            var name = f.name.replace(/\.[^.]+$/, '');
            var scene = PS.addScene(project, { name: name, image: blob });
            renderFilmstrip();
            if (!currentId) { selectArea(scene.id); }
          });
      });
    });
    chain.then(scheduleSave);
  }

  // ---- filmstrip ----
  function renderFilmstrip() {
    areaListEl.innerHTML = '';
    project.scenes.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'area' + (s.id === currentId ? ' current' : '');
      var img = document.createElement('img'); img.src = urlFor(s); img.alt = '';
      var nm = document.createElement('input'); nm.className = 'nm'; nm.value = s.name;
      nm.addEventListener('click', function (e) { e.stopPropagation(); });
      nm.addEventListener('change', function () { s.name = nm.value; scheduleSave(); });

      var del = document.createElement('span'); del.className = 'del'; del.textContent = '✕';
      del.addEventListener('click', function (e) { e.stopPropagation(); removeArea(s.id); });

      row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', String(i)); });
      row.addEventListener('dragover', function (e) { e.preventDefault(); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        var from = Number(e.dataTransfer.getData('text/plain'));
        if (from !== i) { PS.reorderScenes(project, from, i); renderFilmstrip(); scheduleSave(); }
      });

      row.appendChild(img); row.appendChild(nm); row.appendChild(del);
      row.addEventListener('click', function () { selectArea(s.id); });
      areaListEl.appendChild(row);
    });
  }

  function urlFor(scene) {
    if (!urlCache[scene.id]) { urlCache[scene.id] = URL.createObjectURL(scene.image); }
    return urlCache[scene.id];
  }

  function handleFor(scene) {
    if (!handleCache[scene.id]) { handleCache[scene.id] = engine.load(urlFor(scene)); }
    return handleCache[scene.id];
  }

  function sceneById(id) {
    for (var i = 0; i < project.scenes.length; i++) { if (project.scenes[i].id === id) { return project.scenes[i]; } }
    return null;
  }

  function selectArea(id) {
    currentId = id;
    var s = sceneById(id);
    engine.show(handleFor(s), s.initialView);
    hintEl.textContent = '';
    renderFilmstrip();
    selected = null; renderProps(); refreshHotspots();
  }

  function removeArea(id) {
    var sc = sceneById(id);
    if (sc && !window.confirm('Remove area "' + sc.name + '"? This cannot be undone.')) { return; }
    if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; }
    if (handleCache[id]) { engine.dispose(handleCache[id]); delete handleCache[id]; }
    PS.removeScene(project, id);
    if (currentId === id) {
      currentId = project.scenes[0] ? project.scenes[0].id : null;
      if (currentId) { selectArea(currentId); }
      else { engine.clear(); selected = null; renderProps(); }
    }
    renderFilmstrip(); scheduleSave();
  }

  // ---- autosave ----
  var saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!project.scenes.length && !project.title) { return; }
      PS.saveProject(project).catch(function () { /* e.g. private mode: ignore */ });
    }, 600);
  }

  function toast(msg, persist) {
    var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
    t.onclick = function () { t.hidden = true; };   // click to dismiss
    clearTimeout(toast._t);
    if (!persist) { toast._t = setTimeout(function () { t.hidden = true; }, 2600); }
  }
  function hideToast() { var t = document.getElementById('toast'); t.hidden = true; clearTimeout(toast._t); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- modal focus management (a11y) ----
  var MODAL_IDS = ['help', 'exported', 'settings', 'published', 'mytours', 'branding', 'picker'];
  function modalFocusables(el) {
    return Array.prototype.slice.call(el.querySelectorAll('button, input, select, textarea, a[href]'))
      .filter(function (n) { return !n.disabled && n.offsetParent !== null; });
  }
  function focusInto(el) { var f = modalFocusables(el); if (f[0]) { try { f[0].focus(); } catch (e) {} } }
  function openModalEl(id) { var el = document.getElementById(id); el.hidden = false; focusInto(el); }
  // One handler traps Tab inside, and closes on Esc, for whichever dialog is open.
  document.addEventListener('keydown', function (e) {
    var openEl = null;
    for (var i = 0; i < MODAL_IDS.length; i++) { var d = document.getElementById(MODAL_IDS[i]); if (d && !d.hidden) { openEl = d; } }
    if (!openEl) { return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); openEl.hidden = true; return; }
    if (e.key === 'Tab') {
      var f = modalFocusables(openEl); if (!f.length) { return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  // ---- authoring: modes + hotspots + properties ----
  var mode = 'look';                 // 'look' | 'link' | 'note'
  var selected = null;               // { scene, kind:'link'|'info', index }
  var dragHot = null;                // hotspot currently being dragged to reposition
  var propsBody = document.getElementById('propsBody');

  function initAuthoring() {
    document.querySelectorAll('.mode').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });
    document.getElementById('btnStartView').addEventListener('click', function () {
      var s = sceneById(currentId); if (!s) { return; }
      s.initialView = engine.getView(); scheduleSave(); toast('Start view saved');
    });
    panoEl.addEventListener('click', function (e) {
      if (mode === 'look') { return; }
      var s = sceneById(currentId); if (!s) { return; }
      var v = engine.screenToView(e.clientX, e.clientY);
      if (mode === 'link') {
        var others = project.scenes.filter(function (x) { return x.id !== s.id; });
        s.linkHotspots.push({ yaw: v.yaw, pitch: v.pitch, rotation: 0,
          target: others[0] ? others[0].id : s.id, label: '' });
        select(s, 'link', s.linkHotspots.length - 1);
      } else {
        s.infoHotspots.push({ yaw: v.yaw, pitch: v.pitch, title: 'Note', text: '' });
        select(s, 'info', s.infoHotspots.length - 1);
      }
      refreshHotspots(); scheduleSave();
    });

    // drag a placed hotspot to reposition it (yaw/pitch follow the cursor)
    document.addEventListener('pointermove', function (e) {
      if (!dragHot) { return; }
      if (!dragHot.moved) {   // ignore tiny jitter so a select-click doesn't nudge the hotspot
        if (Math.abs(e.clientX - dragHot.startX) < 4 && Math.abs(e.clientY - dragHot.startY) < 4) { return; }
        dragHot.moved = true;
      }
      var v = engine.screenToView(e.clientX, e.clientY);
      var arr = dragHot.kind === 'link' ? dragHot.scene.linkHotspots : dragHot.scene.infoHotspots;
      var h = arr[dragHot.index];
      h.yaw = v.yaw; h.pitch = v.pitch;
      refreshHotspots();
    });
    document.addEventListener('pointerup', function () {
      if (dragHot) { dragHot = null; scheduleSave(); }
    });

    document.addEventListener('keydown', function (e) {
      // (modal Esc/focus-trap is handled globally by the capture-phase handler above)
      var tag = e.target && e.target.tagName;
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') {
        if (typing) { e.target.blur(); return; }
        selected = null; renderProps(); markSelected(); setMode('look'); return;
      }
      if (typing) { return; }
      if (e.key === '?') { helpEl.hidden = !helpEl.hidden; return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
      if (e.key === 'v' || e.key === 'V') { setMode('look'); return; }
      if (e.key === 'l' || e.key === 'L') { setMode('link'); return; }
      if (e.key === 'n' || e.key === 'N') { setMode('note'); return; }
      if (selected && e.key.indexOf('Arrow') === 0) {
        e.preventDefault();
        var step = e.shiftKey ? 0.04 : 0.01;
        if (e.key === 'ArrowLeft') { nudgeSelected(-step, 0); }
        else if (e.key === 'ArrowRight') { nudgeSelected(step, 0); }
        else if (e.key === 'ArrowUp') { nudgeSelected(0, step); }
        else if (e.key === 'ArrowDown') { nudgeSelected(0, -step); }
      }
    });
  }

  function refreshHotspots() {
    var s = sceneById(currentId); if (!s) { return; }
    var handle = handleFor(s);
    var spots = [];
    s.linkHotspots.forEach(function (h, i) {
      var el = document.createElement('div'); el.className = 'hotspot link-hotspot';
      var arrow = document.createElement('span'); arrow.className = 'link-arrow'; arrow.textContent = '➤';
      arrow.style.transform = 'rotate(' + (h.rotation || 0) + 'rad)';
      el.appendChild(arrow);
      el.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); select(s, 'link', i); dragHot = { scene: s, kind: 'link', index: i, startX: ev.clientX, startY: ev.clientY, moved: false }; });
      el.addEventListener('click', function (ev) { ev.stopPropagation(); select(s, 'link', i); });
      spots.push({ el: el, yaw: h.yaw, pitch: h.pitch });
    });
    s.infoHotspots.forEach(function (h, i) {
      var el = document.createElement('div'); el.className = 'hotspot info-hotspot'; el.textContent = 'i';
      el.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); select(s, 'info', i); dragHot = { scene: s, kind: 'info', index: i, startX: ev.clientX, startY: ev.clientY, moved: false }; });
      el.addEventListener('click', function (ev) { ev.stopPropagation(); select(s, 'info', i); });
      spots.push({ el: el, yaw: h.yaw, pitch: h.pitch });
    });
    engine.setHotspots(handle, spots);   // re-render hotspots without a full show() (no view reset / inertia kill)
    markSelected();
  }

  function select(scene, kind, index) { selected = { scene: scene, kind: kind, index: index }; renderProps(); markSelected(); }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-mode') === m); });
    hintEl.textContent = m === 'link' ? 'Click the photo to place a link arrow'
      : m === 'note' ? 'Click the photo to place a note' : '';
  }

  function deleteSelected() {
    if (!selected) { return; }
    var arr = selected.kind === 'link' ? selected.scene.linkHotspots : selected.scene.infoHotspots;
    arr.splice(selected.index, 1);
    selected = null;
    refreshHotspots(); renderProps(); scheduleSave();
  }

  function nudgeSelected(dyaw, dpitch) {
    if (!selected) { return; }
    var arr = selected.kind === 'link' ? selected.scene.linkHotspots : selected.scene.infoHotspots;
    var h = arr[selected.index];
    h.yaw += dyaw; h.pitch = Math.max(-1.5, Math.min(1.5, h.pitch + dpitch));
    refreshHotspots(); scheduleSave();
  }

  function markSelected() {
    var els = document.querySelectorAll('#hotspots .hotspot');
    els.forEach(function (el) { el.classList.remove('selected'); });
    if (!selected) { return; }
    var s = selected.scene, offset = (selected.kind === 'info') ? s.linkHotspots.length : 0;
    if (els[offset + selected.index]) { els[offset + selected.index].classList.add('selected'); }
  }

  function renderProps() {
    if (!selected) { propsBody.innerHTML = '<p class="muted">Select an area or hotspot.</p>'; return; }
    var s = selected.scene;
    if (selected.kind === 'link') {
      var h = s.linkHotspots[selected.index];
      var opts = project.scenes.filter(function (x) { return x.id !== s.id; })
        .map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === h.target ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
      var deg = Math.round((((h.rotation || 0) * 180 / Math.PI) % 360 + 360) % 360);
      propsBody.innerHTML = '<label>Link &rarr; target area</label><select id="pTarget">' + opts + '</select>'
        + '<label>Arrow direction <span id="pRotVal" class="muted">' + deg + '&deg;</span></label><input id="pRot" type="range" min="0" max="355" step="5" value="' + deg + '">'
        + '<label>Label (optional)</label><input id="pLabel" value="' + esc(h.label) + '">'
        + '<p class="muted" style="margin-top:12px;font-size:11px">Drag the arrow in the photo to reposition it.</p>'
        + '<div class="danger" id="pDel">Delete this link</div>';
      document.getElementById('pTarget').addEventListener('change', function (e) { h.target = e.target.value; scheduleSave(); });
      document.getElementById('pRot').addEventListener('input', function (e) {
        var d = Number(e.target.value);
        h.rotation = d * Math.PI / 180;
        document.getElementById('pRotVal').textContent = d + '°';
        refreshHotspots(); scheduleSave();
      });
      document.getElementById('pLabel').addEventListener('input', function (e) { h.label = e.target.value; scheduleSave(); });
      document.getElementById('pDel').addEventListener('click', deleteSelected);
    } else {
      var n = s.infoHotspots[selected.index];
      propsBody.innerHTML = '<label>Note title</label><input id="pTitle" value="' + esc(n.title) + '">'
        + '<label>Note text</label><textarea id="pText">' + esc(n.text) + '</textarea>'
        + '<p class="muted" style="margin-top:12px;font-size:11px">Drag the note in the photo to reposition it.</p>'
        + '<div class="danger" id="pDel">Delete this note</div>';
      document.getElementById('pTitle').addEventListener('input', function (e) { n.title = e.target.value; scheduleSave(); });
      document.getElementById('pText').addEventListener('input', function (e) { n.text = e.target.value; scheduleSave(); });
      document.getElementById('pDel').addEventListener('click', deleteSelected);
    }
  }

  initAuthoring();

  function download(blob, filename) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function reflectMeta() {
    titleEl.value = project.title; subtitleEl.value = project.subtitle;
    qualityEl.value = String(project.quality);
  }

  function loadProjectIntoEditor(p) {
    Object.keys(urlCache).forEach(function (k) { URL.revokeObjectURL(urlCache[k]); });
    Object.keys(handleCache).forEach(function (k) { engine.dispose(handleCache[k]); });
    project = p; reflectMeta(); updateCoverButton(); applyAccent();
    urlCache = {}; handleCache = {}; currentId = project.scenes[0] ? project.scenes[0].id : null;
    renderFilmstrip();
    if (currentId) { selectArea(currentId); } else { engine.clear(); }
  }

  function initTopbar() {
    document.getElementById('btnExport').addEventListener('click', function () {
      var manifest = PS.projectToManifest(project);
      var v = window.TourModel.validateTour(manifest);
      if (!v.ok) { toast('Cannot export: ' + v.errors[0]); return; }
      toast('Building ZIP…', true);
      window.Exporter.buildTourZip(project, manifest)
        .then(function (blob) { hideToast(); download(blob, project.id + '.zip'); openModalEl('exported'); })
        .catch(function (err) { toast((err && err.message) || 'Export failed', true); });
    });
    document.getElementById('btnSaveFile').addEventListener('click', function () {
      PS.saveProjectFile(project).then(function (blob) { download(blob, project.id + '.satour.zip'); })
        .catch(function (err) { toast((err && err.message) || 'Could not save project'); });
    });
    document.getElementById('btnOpenFile').addEventListener('click', function () {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.zip,.satour.zip';
      inp.addEventListener('change', function () {
        PS.openProjectFile(inp.files[0])
          .then(function (p) { loadProjectIntoEditor(p); scheduleSave(); toast('Project opened'); })
          .catch(function (err) { toast((err && err.message) || 'Could not open project file'); });
      });
      inp.click();
    });

    var help = document.getElementById('help');
    document.getElementById('btnHelp').addEventListener('click', function () { openModalEl('help'); });
    document.getElementById('helpClose').addEventListener('click', function () { help.hidden = true; });
    help.addEventListener('click', function (e) { if (e.target === help) { help.hidden = true; } });

    var exported = document.getElementById('exported');
    document.getElementById('exportedClose').addEventListener('click', function () { exported.hidden = true; });
    document.getElementById('exportedOk').addEventListener('click', function () { exported.hidden = true; });
    exported.addEventListener('click', function (e) { if (e.target === exported) { exported.hidden = true; } });
  }

  function bootPicker() {
    PS.listProjects().then(function (projects) {
      if (!projects.length) { return; }
      var pick = document.getElementById('picker');
      pick.innerHTML = '<div class="help-panel" style="max-width:380px">'
        + '<h2>Open a saved tour</h2><div id="pkList"></div>'
        + '<button id="pkNew" class="tb" style="margin-top:12px">Start a new tour</button></div>';
      var list = pick.querySelector('#pkList');
      projects.forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'tb';
        b.style.cssText = 'display:block;width:100%;text-align:left;margin-bottom:8px';
        b.textContent = (p.title || p.id) + '  ·  ' + p.scenes.length + ' areas';
        b.addEventListener('click', function () { loadProjectIntoEditor(p); pick.hidden = true; });
        list.appendChild(b);
      });
      pick.querySelector('#pkNew').addEventListener('click', function () { pick.hidden = true; });
      openModalEl('picker');
    }).catch(function () { /* no IndexedDB: just start empty */ });
  }

  initTopbar(); bootPicker();

  // ---- publish: settings ----
  var SS = window.SettingsStore;
  function openSettings() {
    var s = SS.load() || {};
    document.getElementById('setToken').value = s.token || '';
    document.getElementById('setOwner').value = s.owner || 'stevensassoc';
    document.getElementById('setIsOrg').checked = s.isOrg !== false;
    document.getElementById('setRepo').value = s.repo || 'tours';
    document.getElementById('setDomain').value = s.customDomain || '';
    openModalEl('settings');
  }
  function initPublishSettings() {
    document.getElementById('settingsClose').addEventListener('click', function () { document.getElementById('settings').hidden = true; });
    document.getElementById('settingsSave').addEventListener('click', function () {
      var s = {
        token: document.getElementById('setToken').value.trim(),
        owner: document.getElementById('setOwner').value.trim(),
        isOrg: document.getElementById('setIsOrg').checked,
        repo: document.getElementById('setRepo').value.trim() || 'tours',
        customDomain: document.getElementById('setDomain').value.trim()
      };
      if (!SS.isComplete(s)) { toast('Token, owner and repo are required.'); return; }
      SS.save(s); document.getElementById('settings').hidden = true; toast('Settings saved');
    });
    document.getElementById('settingsClear').addEventListener('click', function () {
      SS.clear();
      document.getElementById('setToken').value = '';
      toast('Saved settings cleared from this browser');
    });
  }
  initPublishSettings();

  // ---- publish: action ----
  function initPublish() {
    var published = document.getElementById('published');
    document.getElementById('publishedClose').addEventListener('click', function () { published.hidden = true; });
    document.getElementById('publishedCopy').addEventListener('click', function () {
      var link = document.getElementById('publishedLink').href;
      if (navigator.clipboard) { navigator.clipboard.writeText(link); toast('Link copied'); }
    });

    document.getElementById('btnPublish').addEventListener('click', function () {
      var settings = SS.load();
      if (!SS.isComplete(settings)) { toast('Set up publishing first.'); openSettings(); return; }
      if (!project.scenes.length) { toast('Add at least one area first.'); return; }

      var manifest = PS.projectToManifest(project);
      var v = window.TourModel.validateTour(manifest);
      if (!v.ok) { toast('Cannot publish: ' + v.errors[0]); return; }

      var totalMB = project.scenes.reduce(function (n, s) { return n + (s.image ? s.image.size : 0); }, 0) / (1024 * 1024);
      if (totalMB > 80 && !window.confirm('This tour is ~' + Math.round(totalMB) + ' MB. Large tours approach GitHub Pages limits and publish slowly. Continue?')) { return; }

      toast('Publishing… preparing files', true);
      var client = window.GitHubClient(settings.token, window.fetch.bind(window));
      window.Exporter.gatherTourFiles(project, manifest)
        .then(window.Publisher.encodeFiles)
        .then(function (files) {
          toast('Publishing… uploading to GitHub', true);
          return window.Publisher.publish(client, {
            owner: settings.owner, repo: settings.repo, isOrg: settings.isOrg,
            slug: project.id, title: project.title || project.id, subtitle: project.subtitle,
            settings: settings, files: files, nowIso: new Date().toISOString()
          });
        })
        .then(function (res) {
          hideToast();
          var a = document.getElementById('publishedLink');
          a.href = /^https:\/\//.test(res.url) ? res.url : '#';   // never trust into href without https
          a.textContent = res.url;
          openModalEl('published');
        })
        .catch(function (err) { console.error('[publish] failed:', err, err && err.status); toast(publishError(err), true); });
    });
  }

  function publishError(err) {
    if (err && err.status === 401) { return 'GitHub rejected the token — check it in Settings.'; }
    if (err && err.status === 403) {
      var remaining = err.headers && err.headers.get && err.headers.get('x-ratelimit-remaining');
      if (remaining === '0') { return 'GitHub rate limit hit — wait a few minutes and try again.'; }
      return 'GitHub refused this — the org may block classic tokens (see Settings), or you lack permission.';
    }
    var detail = (err && err.message) || (err && err.status && ('HTTP ' + err.status)) ||
      (err && err.data && err.data.message) || 'see the browser console (F12)';
    return 'Publish failed: ' + detail;
  }
  initPublish();

  // ---- publish: my tours ----
  function initMyTours() {
    var dlg = document.getElementById('mytours');
    document.getElementById('mytoursClose').addEventListener('click', function () { dlg.hidden = true; });
    document.getElementById('btnMyTours').addEventListener('click', function () {
      var settings = SS.load();
      if (!SS.isComplete(settings)) { toast('Set up publishing first.'); openSettings(); return; }
      openModalEl('mytours');
      var list = document.getElementById('mytoursList');
      list.innerHTML = '<p class="muted">Loading…</p>';
      var client = window.GitHubClient(settings.token, window.fetch.bind(window));
      window.Publisher.listTours(client, settings.owner, settings.repo).then(function (tours) {
        if (!tours.length) { list.innerHTML = '<p class="muted">No published tours yet.</p>'; return; }
        list.innerHTML = '';
        tours.forEach(function (t) {
          var row = document.createElement('div'); row.className = 'mytour';
          var main = document.createElement('div'); main.className = 'mt-main';
          main.innerHTML = '<b></b><span></span>';
          main.querySelector('b').textContent = t.title || t.slug;
          main.querySelector('span').textContent = t.url;
          var copy = document.createElement('span'); copy.className = 'mt-act'; copy.textContent = 'Copy';
          copy.addEventListener('click', function () { if (navigator.clipboard) { navigator.clipboard.writeText(t.url); toast('Link copied'); } });
          var open = document.createElement('span'); open.className = 'mt-act'; open.textContent = 'Open';
          open.addEventListener('click', function () { if (/^https:\/\//.test(t.url)) { window.open(t.url, '_blank', 'noopener'); } });
          var del = document.createElement('span'); del.className = 'mt-del'; del.textContent = 'Remove';
          del.addEventListener('click', function () {
            if (!window.confirm('Remove "' + (t.title || t.slug) + '" from the published site?')) { return; }
            toast('Removing…');
            window.Publisher.deleteTour(client, { owner: settings.owner, repo: settings.repo, slug: t.slug })
              .then(function () { toast('Removed'); row.remove(); })
              .catch(function (err) { toast(publishError(err)); });
          });
          row.appendChild(main); row.appendChild(copy); row.appendChild(open); row.appendChild(del);
          list.appendChild(row);
        });
      }).catch(function (err) {
        list.innerHTML = '';
        var p = document.createElement('p'); p.className = 'muted'; p.textContent = publishError(err);
        list.appendChild(p);
      });
    });
  }
  initMyTours();

  // ---- welcome cover (snapshot the current view, like "Set start view") ----
  function updateCoverButton() {
    var b = document.getElementById('btnSetCover');
    if (!b) { return; }
    b.classList.toggle('set', !!project.cover);
    b.title = project.cover
      ? 'Cover set from a view — click to replace, Shift-click to remove'
      : 'Use the current view as the welcome cover — Shift-click to remove';
  }
  function initCover() {
    updateCoverButton();
    document.getElementById('btnSetCover').addEventListener('click', function (e) {
      if (project.cover && e.shiftKey) { project.cover = null; updateCoverButton(); scheduleSave(); toast('Cover removed'); return; }
      if (!sceneById(currentId)) { toast('Open an area first.'); return; }
      engine.snapshot()
        .then(function (blob) { return IU.fileToBitmap(blob); })
        .then(function (bmp) { return IU.downscaleToBlob(bmp, 1920); })
        .then(function (blob) { project.cover = blob; updateCoverButton(); scheduleSave(); toast('Cover set from current view'); });
    });
  }
  initCover();

  // ---- branding (logo + accent color) ----
  var brandLogoUrl = null;
  function applyAccent() { document.documentElement.style.setProperty('--accent', project.accent || '#3a8f9c'); }
  function reflectBrand() {
    var img = document.getElementById('brandLogoImg');
    if (brandLogoUrl) { URL.revokeObjectURL(brandLogoUrl); brandLogoUrl = null; }
    if (project.logo) { brandLogoUrl = URL.createObjectURL(project.logo); img.src = brandLogoUrl; }
    else { img.src = '../viewer/assets/logo.png'; }
    document.getElementById('brandAccent').value = project.accent || '#3a8f9c';
    document.getElementById('brandTransition').checked = project.transition !== 'none';
  }
  function initBranding() {
    applyAccent();
    var dlg = document.getElementById('branding');
    document.getElementById('btnBrand').addEventListener('click', function () { reflectBrand(); openModalEl('branding'); });
    document.getElementById('brandingClose').addEventListener('click', function () { dlg.hidden = true; });
    document.getElementById('brandingDone').addEventListener('click', function () { dlg.hidden = true; });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { dlg.hidden = true; } });
    document.getElementById('brandAccent').addEventListener('input', function (e) { project.accent = e.target.value; applyAccent(); scheduleSave(); });
    document.getElementById('brandTransition').addEventListener('change', function (e) { project.transition = e.target.checked ? 'move' : 'none'; scheduleSave(); });
    document.getElementById('brandLogoUpload').addEventListener('click', function () {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/svg+xml';
      inp.addEventListener('change', function () { var f = inp.files[0]; if (!f) { return; } project.logo = f; reflectBrand(); scheduleSave(); toast('Logo updated'); });
      inp.click();
    });
    document.getElementById('brandLogoDefault').addEventListener('click', function () { project.logo = null; reflectBrand(); scheduleSave(); toast('Using default logo'); });
  }
  initBranding();

  // dev-only debug hook (not exposed on the public hosted site)
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.__builder = { get project() { return project; }, get currentId() { return currentId; },
      sceneById: sceneById, renderFilmstrip: renderFilmstrip, selectArea: selectArea,
      engine: engine, toast: toast, scheduleSave: function () { scheduleSave(); } };
  }
})();
