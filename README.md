# Aslant

A head in the browser for practising light on form. Turn it, put a lamp where you want, lay the Loomis construction over it, and band it into a few values the way [Askance](https://askance.julianjelfs.co.uk/) bands a photograph.

Live at https://aslant.julianjelfs.co.uk/

## What it does

- Drag to orbit, right-drag or two fingers to pan, scroll or pinch to zoom. The key light is set relative to you, so orbiting reads as turning the head under a lamp that stays put.
- Light: direction (around and height), strength, fill, cast shadows on or off.
- Head: roll, smooth or faceted ("Planes"), backdrop value.
- Loomis overlay: ball, side planes, brow and hairline, nose and chin lines, jaw. Lines behind the head show faintly.
- Values: 2 to 7 bands of CIE L*, using the same maths as Askance's shader (`src/values.js`).
- Save picture: a PNG of the current view, ready to open in Askance.

## Running it

It's static files with no build step. three.js 0.170.0 comes from jsDelivr through an import map. Serve the folder with any static server, for example `npx serve .`, and open it. Opening `index.html` from disk won't work because browsers block ES modules on `file://`.

GitHub Pages serves `main` from the repo root.

## The head

`models/head.glb` is the head and neck cut from the [MakeHuman](https://github.com/makehumancommunity/makehuman) hm08 base mesh, which MakeHuman released under CC0. `tool/extract-head.mjs` makes it. It's a placeholder: a real planes head (an Asaro-style model with a licence that allows redistribution) would replace it, and the Loomis fit in `src/loomis.js` would need re-measuring for that model.

"Planes" mode collapses the mesh to about 1,600 vertices with three.js's `SimplifyModifier` and shades it flat. It's a rough stand-in for a sculpted planes head.

## Licence

Code: MIT. Head model: CC0 (MakeHuman).
