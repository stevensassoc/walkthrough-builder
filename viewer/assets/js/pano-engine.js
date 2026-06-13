/*
 * pano-engine.js — a small 360° panorama engine built on Three.js.
 * Encapsulates ALL Three.js so viewer.js stays engine-agnostic.
 *
 * Convention: yaw rotates around the vertical axis (0 looks toward -Z; increasing
 * yaw looks to the right), pitch is the up/down angle (0 = horizon, positive = up),
 * fov is the vertical field of view. All angles are radians (matching the manifest).
 *
 * Public API — var engine = PanoEngine(panoEl):
 *   engine.load(image, onError)          -> sceneHandle (texture loads async)
 *   engine.show(handle, initialView)     -> make handle active, set the view
 *   engine.addHotspot(handle, el, yaw, pitch)  -> DOM hotspot positioned every frame
 *   engine.getView() / engine.setView({yaw,pitch,fov})
 *   engine.nudgeFov(deltaRadians)        -> zoom buttons (negative = zoom in)
 *   engine.startAutorotate() / engine.stopAutorotate()
 *   engine.onInteract(cb)                -> cb() fires on user drag/wheel
 */
(function (root) {
  'use strict';

  var MIN_FOV = 30 * Math.PI / 180;
  var MAX_FOV = 100 * Math.PI / 180;
  var MAX_PITCH = 85 * Math.PI / 180;
  var AUTO_SPEED = 0.0016;   // radians/frame of yaw while auto-rotating
  var FRICTION = 0.92;       // inertia decay per frame after a drag
  var ZOOM_WHEEL = 0.05;     // radians of fov per wheel notch

  function PanoEngine(panoEl) {
    var THREE = window.THREE;

    // --- Three.js core ---
    // preserveDrawingBuffer lets us read the canvas (snapshot) on demand for covers.
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    if ('outputEncoding' in renderer) { renderer.outputEncoding = THREE.sRGBEncoding; }
    panoEl.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);

    // Inward-facing sphere: scaling x by -1 un-mirrors the equirect texture.
    var geometry = new THREE.SphereGeometry(500, 64, 40);
    geometry.scale(-1, 1, 1);
    var material = new THREE.MeshBasicMaterial({ color: 0x222a33 });
    var mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    var loader = new THREE.TextureLoader();

    // --- Hotspot layer (over the canvas, transparent to drags) ---
    var hotspotLayer = document.createElement('div');
    hotspotLayer.id = 'hotspots';
    panoEl.appendChild(hotspotLayer);

    // --- View state ---
    var yaw = 0, pitch = 0, fov = 75 * Math.PI / 180;
    var yawV = 0, pitchV = 0;
    var dragging = false, lastX = 0, lastY = 0;
    var autorotating = false;
    var active = null;            // active scene handle
    var interactCb = null;

    var tmp = new THREE.Vector3();
    var camDir = new THREE.Vector3();

    // ---------- scene handles ----------
    function load(image, onError) {
      var handle = { image: image, texture: null, ready: false, broken: false, hotspots: [] };
      loader.load(
        image,
        function (tex) {
          tex.minFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          if ('encoding' in tex) { tex.encoding = THREE.sRGBEncoding; }
          handle.texture = tex;
          handle.ready = true;
          if (active === handle) { applyTexture(handle); }
        },
        undefined,
        function () { handle.broken = true; if (onError) { onError(handle); } }
      );
      return handle;
    }

    function applyTexture(handle) {
      material.map = handle.texture || null;
      material.color.set(handle.texture ? 0xffffff : 0x222a33);
      material.needsUpdate = true;
    }

    function show(handle, initialView) {
      active = handle;
      applyTexture(handle);
      if (initialView) {
        yaw = initialView.yaw || 0;
        pitch = clampPitch(initialView.pitch || 0);
        fov = clampFov(initialView.fov || fov);
      }
      yawV = pitchV = 0;
      // Render this scene's hotspots, hide the rest.
      hotspotLayer.innerHTML = '';
      handle.hotspots.forEach(function (hs) { hotspotLayer.appendChild(hs.el); });
    }

    function addHotspot(handle, el, yawA, pitchA) {
      handle.hotspots.push({ el: el, yaw: yawA, pitch: pitchA });
      if (active === handle) { hotspotLayer.appendChild(el); }
    }

    // ---------- view ----------
    function getView() { return { yaw: yaw, pitch: pitch, fov: fov }; }
    function setView(v) {
      if (v.yaw != null) { yaw = v.yaw; }
      if (v.pitch != null) { pitch = clampPitch(v.pitch); }
      if (v.fov != null) { fov = clampFov(v.fov); }
    }
    function nudgeFov(delta) { fov = clampFov(fov + delta); }

    function clampFov(f) { return Math.max(MIN_FOV, Math.min(MAX_FOV, f)); }
    function clampPitch(p) { return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p)); }

    function startAutorotate() { autorotating = true; }
    function stopAutorotate() { autorotating = false; }
    function onInteract(cb) { interactCb = cb; }
    function fireInteract() { if (interactCb) { interactCb(); } }

    // ---------- direction math ----------
    function direction(y, p, out) {
      var cp = Math.cos(p);
      out.set(Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
      return out;
    }

    // ---------- controls ----------
    panoEl.addEventListener('pointerdown', function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY; yawV = pitchV = 0;
      try { panoEl.setPointerCapture(e.pointerId); } catch (err) {}
      fireInteract();
    });
    panoEl.addEventListener('pointermove', function (e) {
      if (!dragging) { return; }
      var h = panoEl.clientHeight || 1;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      // A drag of one viewport-height rotates by ~one fov — natural "grab the world" feel.
      var dyaw = -(dx / h) * fov;
      var dpitch = (dy / h) * fov;
      yaw += dyaw; pitch = clampPitch(pitch + dpitch);
      yawV = dyaw; pitchV = dpitch;
    });
    function endDrag(e) {
      if (!dragging) { return; }
      dragging = false;
      try { panoEl.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    panoEl.addEventListener('pointerup', endDrag);
    panoEl.addEventListener('pointercancel', endDrag);
    panoEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      fov = clampFov(fov + (e.deltaY > 0 ? ZOOM_WHEEL : -ZOOM_WHEEL));
      fireInteract();
    }, { passive: false });

    // ---------- render loop ----------
    function resize() {
      var w = panoEl.clientWidth || 1, h = panoEl.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    function positionHotspots() {
      if (!active) { return; }
      var w = panoEl.clientWidth, h = panoEl.clientHeight;
      camera.getWorldDirection(camDir);
      active.hotspots.forEach(function (hs) {
        direction(hs.yaw, hs.pitch, tmp);
        var inFront = tmp.dot(camDir) > 0;
        tmp.project(camera);
        if (!inFront) { hs.el.style.display = 'none'; return; }
        hs.el.style.display = '';
        hs.el.style.left = ((tmp.x * 0.5 + 0.5) * w) + 'px';
        hs.el.style.top = ((-tmp.y * 0.5 + 0.5) * h) + 'px';
      });
    }

    function animate() {
      requestAnimationFrame(animate);
      if (autorotating && !dragging) { yaw += AUTO_SPEED; }
      else if (!dragging) {
        yaw += yawV; pitch = clampPitch(pitch + pitchV);
        yawV *= FRICTION; pitchV *= FRICTION;
        if (Math.abs(yawV) < 1e-5) { yawV = 0; }
        if (Math.abs(pitchV) < 1e-5) { pitchV = 0; }
      }
      camera.fov = fov * 180 / Math.PI;
      camera.updateProjectionMatrix();
      direction(yaw, pitch, tmp);
      camera.lookAt(tmp.x, tmp.y, tmp.z);
      renderer.render(scene, camera);
      positionHotspots();
    }
    animate();

    function screenToView(clientX, clientY) {
      var rect = panoEl.getBoundingClientRect();
      var w = rect.width || 1, h = rect.height || 1;   // guard against a zero-sized stage
      var ndcX = ((clientX - rect.left) / w) * 2 - 1;
      var ndcY = -(((clientY - rect.top) / h) * 2 - 1);
      var v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).normalize();
      return viewFromDirection(v.x, v.y, v.z);
    }

    // Snapshot the current panorama view (no hotspots — they're separate DOM) as a JPEG Blob.
    function snapshot() {
      return new Promise(function (resolve) {
        renderer.render(scene, camera);   // ensure the latest frame is in the buffer
        renderer.domElement.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', 0.9);
      });
    }

    return {
      load: load,
      show: show,
      addHotspot: addHotspot,
      getView: getView,
      setView: setView,
      nudgeFov: nudgeFov,
      startAutorotate: startAutorotate,
      stopAutorotate: stopAutorotate,
      onInteract: onInteract,
      resize: resize,
      screenToView: screenToView,
      snapshot: snapshot,
    };
  }

  // Pure inverse of direction(yaw,pitch); used by screenToView and unit-tested.
  function viewFromDirection(x, y, z) {
    var pitch = Math.asin(Math.max(-1, Math.min(1, y)));
    var yaw = Math.atan2(x, -z);
    return { yaw: yaw, pitch: pitch };
  }
  PanoEngine.viewFromDirection = viewFromDirection;

  if (typeof module !== 'undefined' && module.exports) { module.exports = PanoEngine; }
  else { root.PanoEngine = PanoEngine; }
})(typeof window !== 'undefined' ? window : globalThis);
