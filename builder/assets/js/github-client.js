/* Thin GitHub REST wrapper. Constructed with a token and an optional fetch
   (injectable for tests). Methods return parsed JSON or throw an Error whose
   .status / .data carry the response. UMD (exports the constructor). */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
  root.GitHubClient = mod;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var API = 'https://api.github.com';

  function decodeBase64(b64) {
    var clean = String(b64).replace(/\n/g, '');
    if (root.atob) { return root.atob(clean); }
    return Buffer.from(clean, 'base64').toString('utf8');
  }

  function GitHubClient(token, fetchImpl) {
    var doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : root.fetch);

    function req(method, path, body) {
      var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' };
      var opts = { method: method, headers: headers };
      if (body !== undefined) { opts.body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
      return doFetch(API + path, opts).then(function (res) {
        return res.text().then(function (text) {
          var data = text ? JSON.parse(text) : null;
          if (!(res.status >= 200 && res.status < 300)) {
            var err = new Error((data && data.message) || ('GitHub ' + res.status));
            err.status = res.status; err.data = data; err.headers = res.headers; throw err;
          }
          return data;
        });
      });
    }

    return {
      getRepo: function (o, r) { return req('GET', '/repos/' + o + '/' + r); },
      createOrgRepo: function (org, body) { return req('POST', '/orgs/' + org + '/repos', body); },
      createUserRepo: function (body) { return req('POST', '/user/repos', body); },
      getPages: function (o, r) { return req('GET', '/repos/' + o + '/' + r + '/pages'); },
      enablePages: function (o, r, source) { return req('POST', '/repos/' + o + '/' + r + '/pages', { source: source }); },
      getRef: function (o, r, ref) { return req('GET', '/repos/' + o + '/' + r + '/git/ref/' + ref); },
      getCommit: function (o, r, sha) { return req('GET', '/repos/' + o + '/' + r + '/git/commits/' + sha); },
      getTree: function (o, r, sha, recursive) { return req('GET', '/repos/' + o + '/' + r + '/git/trees/' + sha + (recursive ? '?recursive=1' : '')); },
      createBlob: function (o, r, content, encoding) { return req('POST', '/repos/' + o + '/' + r + '/git/blobs', { content: content, encoding: encoding }); },
      createTree: function (o, r, baseTree, tree) {
        var body = { tree: tree };
        if (baseTree) { body.base_tree = baseTree; }   // omit for the first commit on an empty repo
        return req('POST', '/repos/' + o + '/' + r + '/git/trees', body);
      },
      createCommit: function (o, r, message, tree, parents) { return req('POST', '/repos/' + o + '/' + r + '/git/commits', { message: message, tree: tree, parents: parents }); },
      updateRef: function (o, r, ref, sha) { return req('PATCH', '/repos/' + o + '/' + r + '/git/refs/' + ref, { sha: sha }); },
      putFile: function (o, r, path, content, message, branch) {
        var body = { message: message, content: content };
        if (branch) { body.branch = branch; }
        return req('PUT', '/repos/' + o + '/' + r + '/contents/' + path, body);
      },
      getFileJson: function (o, r, path) {
        return req('GET', '/repos/' + o + '/' + r + '/contents/' + path).then(function (data) {
          return JSON.parse(decodeBase64(data.content));
        });
      }
    };
  }

  return GitHubClient;
});
