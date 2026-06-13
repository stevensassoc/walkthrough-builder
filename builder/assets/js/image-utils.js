/* Image helpers. Pure functions are unit-tested in Node; the canvas/file
   functions are browser-only. UMD: window.ImageUtils + module.exports. */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
  root.ImageUtils = mod;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function slugify(name) {
    var s = String(name == null ? '' : name).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'item';
  }

  function uniqueSlug(base, existing) {
    var slug = slugify(base), s = slug, i = 2;
    while (existing.indexOf(s) !== -1) { s = slug + '-' + i; i++; }
    return s;
  }

  function downscaleDims(srcW, srcH, targetW) {
    if (!targetW || srcW <= targetW) { return { w: srcW, h: srcH }; }
    var scale = targetW / srcW;
    return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
  }

  // --- browser-only below (guarded so Node require() stays clean) ---
  function fileToBitmap(file) { return createImageBitmap(file); }

  function downscaleToBlob(bitmap, targetW) {
    var d = downscaleDims(bitmap.width, bitmap.height, targetW);
    var canvas = document.createElement('canvas');
    canvas.width = d.w; canvas.height = d.h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, d.w, d.h);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', 0.85);
    });
  }

  return {
    slugify: slugify,
    uniqueSlug: uniqueSlug,
    downscaleDims: downscaleDims,
    fileToBitmap: fileToBitmap,
    downscaleToBlob: downscaleToBlob
  };
});
