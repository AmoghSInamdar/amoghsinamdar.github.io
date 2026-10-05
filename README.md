# amoghsinamdar.github.io

My personal website. Static HTML/CSS/JS, no build step, served by GitHub Pages.

## Local preview

`index.html` loads its content with `fetch` and uses an ES module, so opening the
file directly (`file://`) will not work. Serve it over HTTP:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Layout

| Path | What it holds |
| --- | --- |
| `index.html` | Page shell, nav, and the hand-written About / CV / Personal prose |
| `styles.css` | All styling; theme values live in the custom properties at the top |
| `main.js` | Theme toggle, CSS toggle, tabs, and the renderers for the data files |
| `data/*.json` | Everything that is a list: publications, experience, service, photos |
| `assets/` | CV, profile photo, social icons, favicon |
| `photos/originals/` | Full-resolution sources. **Gitignored — keep your own backup** |
| `photos/thumb/`, `photos/large/` | Generated WebP derivatives, committed and served |
| `tools/build_photos.py` | Regenerates the derivatives and `data/photos.json` |

## Editing content

Repeating content lives in `data/`, not in the markup. Adding a paper means
adding an object to `data/publications.json`:

```json
{
  "title": "Paper Title",
  "year": 2026,
  "authors": ["A Inamdar", "R Zemel"],
  "venue": "NeurIPS 2026",
  "abstract": "…",
  "links": [{ "label": "Paper", "href": "https://arxiv.org/abs/…" }]
}
```

`authors` entries matching `A Inamdar` are bolded automatically; a trailing `*`
marks equal contribution. Every field is optional except `title`.

`data/experience.json` and `data/service.json` follow the same idea. To take an
entry off the page without deleting it, set `"hidden": true` rather than
commenting it out.

## Turning a tab off

Add the `hidden` attribute to the tab's link in the `navbar-links` block of
`index.html`. On load, `main.js` removes that link and the tab's panel from the
page, so the tab is not a route at all: its `#hash` is treated like any other
unrecognized hash, which shows the default tab and leaves the URL untouched.
Delete the attribute to bring the tab back.

The markup of a switched-off tab is still in the `index.html` source; it is
only the live page that no longer contains it.

## Adding photos

Drop the full-resolution files into `photos/originals/` and run:

```sh
python3 tools/build_photos.py     # --force to rebuild everything
```

That writes an 800px grid thumbnail and a 2000px display copy as WebP, reads the
camera, lens, and exposure settings out of EXIF, and regenerates
`data/photos.json` sorted newest-first. Originals stay on your machine; only the
derivatives are committed, and they carry no EXIF, so location data never ships.

EXIF has no caption field, so the script seeds `caption` from the filename and
tells you which ones still need writing. Edit `caption`, `alt`, and the optional
`location` in `data/photos.json`, then re-run — the script preserves those three
fields and overwrites everything else.

Grid tiles are a uniform 4:3 crop; expanding a card drops the crop and shows the
photo at its true aspect ratio, along with the camera and settings.

## Notes

- The theme is resolved by an inline script in `<head>` before first paint, and
  persisted in `localStorage` under `darkMode`. With JavaScript off it falls
  back to the `prefers-color-scheme` media query in `styles.css`.
- The `CSS` button in the header disables the stylesheet to show the page as
  plain text. Photography is hidden in that mode — a hundred full-size images
  stacked unstyled is not a readable fallback.
