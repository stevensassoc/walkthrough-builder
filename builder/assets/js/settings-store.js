/* Publish settings persisted in localStorage. isComplete is pure (tested);
   load/save/clear are browser-only. UMD. */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
  root.SettingsStore = mod;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var KEY = 'sa-publish-settings';

  // Firm defaults — the publish target ships pre-configured so a fresh browser
  // only needs a token. customDomain writes the Pages CNAME (see publisher.js).
  var DEFAULTS = { owner: 'stevensassoc', repo: 'tours', isOrg: true, customDomain: 'tours.stevens-assoc.com' };

  function isComplete(s) { return !!(s && s.token && s.owner && s.repo); }

  function load() {
    try { return JSON.parse(root.localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save(s) { root.localStorage.setItem(KEY, JSON.stringify(s)); }
  function clear() { root.localStorage.removeItem(KEY); }

  return { KEY: KEY, DEFAULTS: DEFAULTS, isComplete: isComplete, load: load, save: save, clear: clear };
});
