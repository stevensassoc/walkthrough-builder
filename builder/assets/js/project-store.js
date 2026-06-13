/* Project model + persistence. Pure model functions are unit-tested in Node;
   IndexedDB and file IO are browser-only (added in a later task). UMD. */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
  root.ProjectStore = mod;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var IU = (typeof require !== 'undefined') ? require('./image-utils.js') : root.ImageUtils;

  function createProject(opts) {
    opts = opts || {};
    var title = opts.title || 'Untitled Tour';
    return {
      id: IU.slugify(title),
      title: title,
      subtitle: opts.subtitle || '',
      accent: '#3a8f9c',
      logo: null,
      cover: null,        // optional welcome-screen cover image (Blob)
      transition: 'move', // area-change effect: 'move' | 'none'
      quality: 4096,
      scenes: []
    };
  }

  function addScene(project, opts) {
    var ids = project.scenes.map(function (s) { return s.id; });
    var scene = {
      id: IU.uniqueSlug(opts.name || 'area', ids),
      name: opts.name || ('Area ' + (project.scenes.length + 1)),
      image: opts.image,
      initialView: { yaw: 0, pitch: 0, fov: 1.2 },
      linkHotspots: [],
      infoHotspots: []
    };
    project.scenes.push(scene);
    return scene;
  }

  function removeScene(project, id) {
    project.scenes = project.scenes.filter(function (s) { return s.id !== id; });
  }

  function reorderScenes(project, fromIdx, toIdx) {
    var s = project.scenes.splice(fromIdx, 1)[0];
    project.scenes.splice(toIdx, 0, s);
  }

  function projectToManifest(project) {
    var meta = {
      title: project.title,
      subtitle: project.subtitle,
      logo: 'assets/logo.png',
      accent: project.accent,
      autoRotate: false,
      showWelcome: true
    };
    if (project.cover) { meta.cover = 'assets/cover.jpg'; }
    if (project.transition === 'none') { meta.transition = 'none'; }   // 'move' is the default
    return {
      meta: meta,
      scenes: project.scenes.map(function (s) {
        return {
          id: s.id,
          name: s.name,
          image: 'assets/panos/' + s.id + '.jpg',
          initialView: s.initialView,
          linkHotspots: s.linkHotspots,
          infoHotspots: s.infoHotspots
        };
      })
    };
  }

  // ---------- browser persistence (IndexedDB) ----------
  var DB_NAME = 'sa-walkthrough', STORE = 'projects';

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no-indexeddb')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }

  function saveProject(project) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var r = tx(db, 'readwrite').put(project);
        r.onsuccess = function () { resolve(); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function loadProject(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var r = tx(db, 'readonly').get(id);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function listProjects() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var r = tx(db, 'readonly').getAll();
        r.onsuccess = function () { resolve(r.result || []); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function deleteProject(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var r = tx(db, 'readwrite').delete(id);
        r.onsuccess = function () { resolve(); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  // ---------- portable project file (.satour.zip) ----------
  function saveProjectFile(project) {
    var JSZip = root.JSZip;
    var zip = new JSZip();
    var meta = JSON.parse(JSON.stringify(project));     // strip blobs for json
    meta.scenes.forEach(function (s) { s.image = 'panos/' + s.id + '.jpg'; });
    meta.logo = project.logo ? 'logo.png' : null;
    meta.cover = project.cover ? 'cover.jpg' : null;
    zip.file('project.json', JSON.stringify(meta, null, 2));
    project.scenes.forEach(function (s) { zip.file('panos/' + s.id + '.jpg', s.image); });
    if (project.logo) { zip.file('logo.png', project.logo); }
    if (project.cover) { zip.file('cover.jpg', project.cover); }
    return zip.generateAsync({ type: 'blob' });
  }

  function openProjectFile(file) {
    var JSZip = root.JSZip;
    return JSZip.loadAsync(file).then(function (zip) {
      return zip.file('project.json').async('string').then(function (txt) {
        var project = JSON.parse(txt);
        function readEntry(path) {
          var e = zip.file(path);
          if (!e) { return Promise.reject(new Error('Project file is missing "' + path + '"')); }
          return e.async('blob');
        }
        var jobs = project.scenes.map(function (s) {
          return readEntry('panos/' + s.id + '.jpg').then(function (b) { s.image = b; });
        });
        if (project.logo) { jobs.push(readEntry('logo.png').then(function (b) { project.logo = b; })); }
        if (project.cover) { jobs.push(readEntry('cover.jpg').then(function (b) { project.cover = b; })); }
        return Promise.all(jobs).then(function () { return project; });
      });
    });
  }

  return {
    createProject: createProject,
    addScene: addScene,
    removeScene: removeScene,
    reorderScenes: reorderScenes,
    projectToManifest: projectToManifest,
    saveProject: saveProject,
    loadProject: loadProject,
    listProjects: listProjects,
    deleteProject: deleteProject,
    saveProjectFile: saveProjectFile,
    openProjectFile: openProjectFile
  };
});
