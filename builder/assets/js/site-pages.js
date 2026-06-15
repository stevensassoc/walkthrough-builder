/* Branded root pages for the published tours site: the splash served at `/`
   and the 404 GitHub Pages serves for any unknown path. Both are pure string
   generators (HTML in → out) so they're unit-tested; the publisher commits
   their output to the repo root on every publish (like CNAME). Inline CSS +
   logo-as-data-URI keep each page self-contained, so the 404 renders correctly
   at any URL depth and nothing is requested off-domain. UMD. */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) { module.exports = mod; }
  root.SitePages = mod;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  function pageHead(title) {
    return '<!doctype html><html lang="en"><head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + title + '</title>\n' +
      '<style>\n' +
      '  * { box-sizing: border-box; }\n' +
      '  html, body { height: 100%; margin: 0; }\n' +
      '  body {\n' +
      '    display: flex; align-items: center; justify-content: center; padding: 24px;\n' +
      '    background: radial-gradient(circle at 50% 28%, #16212c 0%, #0d1218 68%);\n' +
      '    color: #e7eef4; -webkit-font-smoothing: antialiased;\n' +
      '    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;\n' +
      '  }\n' +
      '  .card { text-align: center; max-width: 460px; animation: rise .6s cubic-bezier(.2,.7,.2,1) both; }\n' +
      '  .chip { display: inline-block; background: #fff; border-radius: 14px; padding: 16px 26px;\n' +
      '          box-shadow: 0 14px 48px rgba(0,0,0,.45); }\n' +
      '  .chip img { display: block; max-height: 50px; width: auto; }\n' +
      '  h1 { margin: 30px 0 0; font-size: 26px; font-weight: 600; letter-spacing: .01em; }\n' +
      '  .sub { margin-top: 11px; color: #6fd0df; font-size: 12px; font-weight: 600;\n' +
      '         letter-spacing: .26em; text-transform: uppercase; }\n' +
      '  .muted { margin-top: 24px; color: #93a6b6; font-size: 14px; line-height: 1.55; }\n' +
      '  .code { font-size: 58px; font-weight: 700; color: #6fd0df; letter-spacing: .04em;\n' +
      '          margin: 30px 0 4px; }\n' +
      '  .btn { display: inline-block; margin-top: 26px; padding: 11px 24px; text-decoration: none;\n' +
      '         color: #d7eef2; font-size: 14px; border: 1px solid rgba(111,208,223,.4);\n' +
      '         border-radius: 999px; transition: background .15s, border-color .15s; }\n' +
      '  .btn:hover { background: rgba(111,208,223,.12); border-color: #6fd0df; }\n' +
      '  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }\n' +
      '</style>\n</head><body>\n';
  }
  var FOOT = '\n</body></html>\n';

  function logoChip(logoDataUri) {
    return '<div class="chip"><img src="' + logoDataUri + '" alt="Stevens &amp; Associates"></div>';
  }

  function landingHtml(logoDataUri) {
    return pageHead('Stevens & Associates — Virtual Tours') +
      '<main class="card">\n' +
      '  ' + logoChip(logoDataUri) + '\n' +
      '  <h1>Stevens &amp; Associates</h1>\n' +
      '  <div class="sub">Virtual Tours</div>\n' +
      '  <p class="muted">Tours are shared by direct link.</p>\n' +
      '</main>' + FOOT;
  }

  function notFoundHtml(logoDataUri) {
    return pageHead('Not found — Stevens & Associates') +
      '<main class="card">\n' +
      '  ' + logoChip(logoDataUri) + '\n' +
      '  <div class="code">404</div>\n' +
      '  <h1>That tour isn’t here</h1>\n' +
      '  <p class="muted">It may have been moved or removed.</p>\n' +
      '  <a class="btn" href="/">&larr; Back to tours</a>\n' +
      '</main>' + FOOT;
  }

  return { landingHtml: landingHtml, notFoundHtml: notFoundHtml };
});
