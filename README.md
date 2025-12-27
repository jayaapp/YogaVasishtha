# Yoga Vasishtha EPUB Reader

A modern EPUB reader for the Yoga Vasishtha with integrated Sanskrit lexicon, powerful search, passage extraction, and optional cloud sync.

This project provides a browser-based EPUB reader with features tailored for Sanskrit scholarship and close reading: lexicon lookup (Devanagari & IAST), robust regex search across volumes, notes and bookmarks, passage extraction/mapping scripts, and PWA support for offline use.

## Key features

- Multi-volume EPUB reading (pre-bundled EPUBs in `/epub`).
- Integrated lexicons (Devanagari and IAST) and word→passage mapping and passage translation JSON files.
- Powerful search supporting regex patterns and context-aware results.
- Bookmarks, notes, TOC, and reading-position persistence.
- Export/import tools and utilities for lexicon/passage extraction and mapping (scripts in the repo).
- PWA support (service worker + manifest) for offline usage.

## Quick start (local)

1. Clone the repository:

```bash
git clone https://github.com/jayaapp/YogaVasishtha.git
cd YogaVasishtha
```

2. Serve the directory with a static server (recommended) — for quick local testing you can use Python's built-in server:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

Alternatively, use a Node static server or your preferred tooling. The app expects the `epub/` and `assets/` directories to be accessible at the web root.

## Development

- Main application logic: `app.js` (large, well-documented). See `CONFIG` at the top of `app.js` for configurable paths (EPUB files, lexicon filenames, defaults).
- CSS & UI: `app.css` (plus `trueheart-style.css` and `donate.css`).
- Utilities and extraction scripts: `extract-sanskrit-passages.js`, `create-words-passages-mapping.js`, `passage-manager.js`, and others.
- Tests: there is a small test file `test-words-passages-mapping.js` for mapping utilities.

### Installing dependencies (development / tools)

Some utilities or development scripts require Node packages (listed in `package.json`). Install them with:

```bash
npm install
```

The runtime front-end uses only browser-side libs (JSZip, Showdown) that are loaded from CDNs in `index.html`.

## PWA / Deployment

- Manifest: `manifest.json` (icons in `/assets`).
- Service worker: `sw.js` (registered in `index.html`).
- Deploy by placing the project on any static hosting platform (GitHub Pages, Netlify, static server) or by running the included `server.sh` / `deploy.sh` if you have custom recipes.

## Contributing

Contributions are welcome — please open issues and PRs on the repository. If you work on lexicon extraction or passage mapping scripts, include tests and ensure reproducible outputs (the repo includes `Yoga-Vasishtha-*.json` datasets for reference).

## License & Acknowledgments

- License: MIT (see repository).  
- The EPUB sources and passages were collected from public-domain sources (refer to headers in `/epub` files and `Yoga-Vasishtha*.txt`).
- Many tooling and AI helpers were used during development — please see headers in code for more details.