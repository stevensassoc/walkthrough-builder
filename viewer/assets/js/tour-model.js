/* Pure tour logic — no DOM, no Marzipano. Works in Node and the browser. */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
  root.TourModel = mod;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function nextIndex(i, len) { return len <= 0 ? 0 : (i + 1) % len; }
  function prevIndex(i, len) { return len <= 0 ? 0 : (i - 1 + len) % len; }

  function sceneIndexById(scenes, id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].id === id) { return i; }
    }
    return -1;
  }

  function validateTour(tour) {
    var errors = [];
    if (!tour || typeof tour !== 'object') {
      return { ok: false, errors: ['Tour is missing or not an object'] };
    }
    if (!Array.isArray(tour.scenes) || tour.scenes.length === 0) {
      return { ok: false, errors: ['Tour has no scenes'] };
    }
    var seen = {};
    tour.scenes.forEach(function (s, i) {
      if (!s.id) { errors.push('Scene ' + i + ' is missing an id'); }
      else if (seen[s.id]) { errors.push('Duplicate scene id: ' + s.id); }
      else { seen[s.id] = true; }
      if (!s.image) { errors.push('Scene "' + (s.id || i) + '" is missing an image'); }
    });
    tour.scenes.forEach(function (s) {
      (s.linkHotspots || []).forEach(function (h) {
        if (sceneIndexById(tour.scenes, h.target) === -1) {
          errors.push('Link in "' + s.id + '" points to unknown target "' + h.target + '"');
        }
      });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  function resolveMeta(meta) {
    meta = meta || {};
    return {
      title: meta.title || 'Walkthrough',
      subtitle: meta.subtitle || '',
      logo: meta.logo || null,
      cover: meta.cover || null,
      accent: meta.accent || '#3a8f9c',
      autoRotate: meta.autoRotate === true,
      showWelcome: meta.showWelcome !== false
    };
  }

  return {
    nextIndex: nextIndex,
    prevIndex: prevIndex,
    sceneIndexById: sceneIndexById,
    validateTour: validateTour,
    resolveMeta: resolveMeta
  };
});
