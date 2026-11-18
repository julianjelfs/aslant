# Aslant

A head in the browser for practising light on form. Turn it, put a lamp where you want, lay the Loomis construction over it, and band it into a few values the way [Askance](https://askance.julianjelfs.co.uk/) bands a photograph.

Live at https://aslant.julianjelfs.co.uk/

## What it does

- Drag to orbit, right-drag or two fingers to pan, scroll or pinch to zoom. The key light is set relative to you, so orbiting reads as turning the head under a lamp that stays put.
- Light: direction (around and height), strength, fill, cast shadows on or off.
- Head: roll, smooth or planes (with a plane size slider), backdrop value.
- Loomis overlay: ball, side planes, brow and hairline, nose and chin lines, jaw. Lines behind the head show faintly.
- Values: 2 to 7 bands of CIE L*, using the same maths as Askance's shader (`src/values.js`).
- Save picture: a PNG of the current view, ready to open in Askance.

## Running it

It's static files with no build step. three.js 0.170.0 comes from jsDelivr through an import map. Serve the folder with any static server, for example `npx serve .`, and open it. Opening `index.html` from disk won't work because browsers block ES modules on `file://`.

GitHub Pages serves `main` from the repo root.

## The head

`models/head.glb` is the head and neck cut from the [MakeHuman](https://github.com/makehumancommunity/makehuman) hm08 base mesh, which MakeHuman released under CC0. `tool/extract-head.mjs` makes it: it trims the body below the neck, keeps the eyes as a separate mesh, and snaps the two halves to exact mirror images. The Loomis fit in `src/loomis.js` is measured against this file.

"Planes" runs the head through [meshoptimizer](https://github.com/zeux/meshoptimizer)'s simplifier (`src/planes.js`), which merges near-flat runs of triangles into single planes and keeps the breaks where the form turns. It simplifies the right half and mirrors it, so the planes are symmetrical. The Plane size slider sets how far the surface may drift, from small planes around the lids and lips to big blocks. The eyes are left out of the simplification.

## Licence

Code: MIT. Head model: CC0 (MakeHuman).
