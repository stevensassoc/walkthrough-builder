/* Publish orchestration + pure helpers. Pure helpers are unit-tested; the
   network orchestration is tested against a fake client; encode helpers are
   browser-only. UMD. */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
  root.Publisher = mod;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function tourUrl(settings, slug) {
    if (settings.customDomain) {
      return 'https://' + settings.customDomain.replace(/\/+$/, '') + '/' + slug + '/';
    }
    return 'https://' + settings.owner + '.github.io/' + settings.repo + '/' + slug + '/';
  }

  function upsertToursIndex(index, entry) {
    var tours = (index && index.tours ? index.tours.slice() : [])
      .filter(function (t) { return t.slug !== entry.slug; });
    tours.push(entry);
    tours.sort(function (a, b) { return (a.title || a.slug).localeCompare(b.title || b.slug); });
    return { tours: tours };
  }

  function removeFromIndex(index, slug) {
    return { tours: (index && index.tours ? index.tours : []).filter(function (t) { return t.slug !== slug; }) };
  }

  function slugTreePath(slug, path) { return slug + '/' + path; }

  function ensureRepo(client, p) {
    return client.getRepo(p.owner, p.repo).catch(function (e) {
      if (e.status === 404) {
        // auto_init:false → a deterministically empty repo; we create the first
        // commit ourselves (see commitFiles) so there's no async branch-creation race.
        var body = { name: p.repo, private: false, auto_init: false };
        return p.isOrg ? client.createOrgRepo(p.owner, body) : client.createUserRepo(body);
      }
      throw e;
    });
  }

  function ensurePages(client, o, r, branch) {
    return client.getPages(o, r).catch(function (e) {
      if (e.status === 404) { return client.enablePages(o, r, { branch: branch, path: '/' }); }
      throw e;
    });
  }

  function loadIndex(client, o, r) {
    return client.getFileJson(o, r, 'tours.json').catch(function (e) {
      if (e.status === 404 || e.status === 409) { return { tours: [] }; }  // missing file / empty repo
      throw e;
    });
  }

  // Resolve the branch's base commit + tree, or null if the repo/branch is empty
  // (a brand-new repo: getRef returns 404, or 409 "Git Repository is empty").
  function getBaseOrNull(client, o, r, branch) {
    return client.getRef(o, r, 'heads/' + branch).then(function (ref) {
      return client.getCommit(o, r, ref.object.sha).then(function (commit) {
        return { sha: ref.object.sha, tree: commit.tree.sha };
      });
    }).catch(function (e) {
      if (e.status === 404 || e.status === 409) { return null; }
      throw e;
    });
  }

  // Guarantee the branch has at least one commit, returning its base {sha, tree}.
  // A brand-new/empty repo has zero commits, and the Git Data API can't build a
  // tree on nothing — so we seed the first commit via the Contents API, which can.
  function ensureBranch(client, o, r, branch) {
    return getBaseOrNull(client, o, r, branch).then(function (base) {
      if (base) { return base; }
      var seed = '# Stevens & Associates virtual tours\n';
      var content = root.btoa ? root.btoa(seed) : Buffer.from(seed).toString('base64');
      return client.putFile(o, r, 'README.md', content, 'Initialize tours site').then(function (res) {
        // Use the seed commit's own sha/tree — avoids a 2nd getRef that can race GitHub replication.
        if (res && res.commit && res.commit.sha && res.commit.tree) {
          return { sha: res.commit.sha, tree: res.commit.tree.sha };
        }
        return getBaseOrNull(client, o, r, branch);
      });
    });
  }

  function commitFiles(client, o, r, branch, treeEntriesSpec, message) {
    return ensureBranch(client, o, r, branch).then(function (base) {
      return Promise.all(treeEntriesSpec.map(function (spec) {
        if (spec.delete) { return Promise.resolve({ path: spec.path, mode: '100644', type: 'blob', sha: null }); }
        return client.createBlob(o, r, spec.content, spec.encoding).then(function (b) {
          return { path: spec.path, mode: '100644', type: 'blob', sha: b.sha };
        });
      })).then(function (treeEntries) {
        return client.createTree(o, r, base.tree, treeEntries).then(function (tree) {
          return client.createCommit(o, r, message, tree.sha, [base.sha]).then(function (c) {
            return client.updateRef(o, r, 'heads/' + branch, c.sha);
          });
        });
      });
    });
  }

  function publish(client, p) {
    return ensureRepo(client, p).then(function (repo) {
      var branch = (repo && repo.default_branch) || 'main';
      var url = tourUrl(p.settings, p.slug);
      return loadIndex(client, p.owner, p.repo).then(function (index) {
        var newIndex = upsertToursIndex(index, {
          slug: p.slug, title: p.title, subtitle: p.subtitle, updated: p.nowIso, url: url
        });
        var specs = p.files.map(function (f) {
          return { path: slugTreePath(p.slug, f.path), content: f.content, encoding: f.encoding };
        });
        specs.push({ path: 'tours.json', content: JSON.stringify(newIndex, null, 2), encoding: 'utf-8' });
        var customDomain = p.settings && p.settings.customDomain;   // one source of truth (matches tourUrl)
        if (customDomain) { specs.push({ path: 'CNAME', content: customDomain, encoding: 'utf-8' }); }
        // Commit first (this creates `main` with content), THEN enable Pages — so
        // the branch always exists before Pages is turned on.
        return commitFiles(client, p.owner, p.repo, branch, specs, 'Publish ' + p.slug).then(function () {
          return ensurePages(client, p.owner, p.repo, branch).then(function () { return { url: url }; });
        });
      });
    });
  }

  function listTours(client, o, r) { return loadIndex(client, o, r).then(function (i) { return i.tours || []; }); }

  function deleteTour(client, p) {
    return client.getRepo(p.owner, p.repo).then(function (repo) {
      var branch = (repo && repo.default_branch) || 'main';
      return client.getRef(p.owner, p.repo, 'heads/' + branch).then(function (ref) {
        return client.getCommit(p.owner, p.repo, ref.object.sha).then(function (commit) {
          return client.getTree(p.owner, p.repo, commit.tree.sha, true).then(function (tree) {
            if (tree.truncated) { throw new Error('This repository is too large to remove a tour automatically — delete the folder on GitHub.'); }
            var specs = tree.tree
              .filter(function (e) { return e.type === 'blob' && e.path.indexOf(p.slug + '/') === 0; })
              .map(function (e) { return { path: e.path, delete: true }; });
            return loadIndex(client, p.owner, p.repo).then(function (index) {
              specs.push({ path: 'tours.json', content: JSON.stringify(removeFromIndex(index, p.slug), null, 2), encoding: 'utf-8' });
              return commitFiles(client, p.owner, p.repo, branch, specs, 'Remove ' + p.slug);
            });
          });
        });
      });
    });
  }

  // browser-only: turn gathered files (string | Blob content) into blob specs
  function encodeFiles(files) {
    return Promise.all(files.map(function (f) {
      if (typeof f.content === 'string') { return Promise.resolve({ path: f.path, content: f.content, encoding: 'utf-8' }); }
      return blobToBase64(f.content).then(function (b64) { return { path: f.path, content: b64, encoding: 'base64' }; });
    }));
  }
  function blobToBase64(blob) {
    // arrayBuffer() is more robust than FileReader for larger image blobs.
    return blob.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), binary = '', chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return root.btoa(binary);
    });
  }

  return {
    tourUrl: tourUrl,
    upsertToursIndex: upsertToursIndex,
    removeFromIndex: removeFromIndex,
    slugTreePath: slugTreePath,
    publish: publish,
    listTours: listTours,
    deleteTour: deleteTour,
    encodeFiles: encodeFiles
  };
});
