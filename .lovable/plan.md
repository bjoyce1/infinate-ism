Collect every image asset referenced in this project and package them into a single downloadable ZIP under `/mnt/documents/` so you can grab them all at once.

## What I'll include

Every `src/assets/*.asset.json` pointer that has an image content-type (png, jpg, jpeg, webp, svg, gif). From the current tree, that's the ~25 files visible in context, including:

- `swishahouse-logo.webp`
- `paul-wall.png` / `paul-wall.jpg`
- `dj-screw.png`, `dj-screw-tape.png`
- `lil-keke.png` / `lil-keke.jpg`
- `k-rino.png`, `klondike-kat.png`, `point-blank.png`
- `spc-logo.png`, `spc-favicon.png`, `spc-betn-on-me-remix.png`
- `screwed-up-click-logo.png`, `screwed-up-records-and-tapes.png`
- `713mixhouse-logo.png`, `absoulutelycaptivating-logo.png`, `ac-og.jpg`
- `dabsheets-logo.png`, `maasa-logo.png`, `mortuary-media-logo.png`
- `mrcap1-coin.png`, `yates-logo.png`
- `today-was-a-great-day.jpg`, `today-was-a-great-day-single.png`

Plus any additional image assets in `src/assets/` or `public/` I find during the scan (favicons, og images, etc.).

## How

1. Enumerate all `.asset.json` files in `src/assets/` and any images in `public/`.
2. Download each asset from its CDN `url` into a temp dir, preserving `original_filename`.
3. Zip them into `/mnt/documents/infinite-ism-images.zip`.
4. Present the ZIP as a downloadable artifact.

No app code changes — this is a one-off export.
