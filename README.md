# Stevens & Associates — Walkthrough Builder

A static, in-browser tool for building branded 360° virtual walkthroughs from
panorama photos and publishing them to GitHub Pages.

## Use it

Once this repo's **GitHub Pages** is enabled (Settings → Pages → Deploy from
branch `main`, root `/`), open:

```
https://stevensassoc.github.io/walkthrough-builder/builder/
```

- **Build:** drop 360° panoramas, name/order areas, place link arrows + notes,
  set each area's start view.
- **Publish:** one-time **Publish → Settings** (a GitHub classic token with the
  `repo` scope, stored only in your browser), then **Publish** to push the tour
  to `stevensassoc/tours` and get a shareable link.

See `builder/` (the editor) and `viewer/` (the walkthrough template the editor
bundles into every published/exported tour).

## Notes

- Fully static — no server. `builder/` and `viewer/` must stay side-by-side
  (the builder loads/bundles the viewer via `../viewer/...`).
- This repo is **public** so GitHub Pages can serve it for free; it contains no
  secrets (each user's token lives only in their own browser).
- First-time setup details: see the main project's `docs/first-publish-checklist.md`.
