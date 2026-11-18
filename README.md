# Aslant

A head in the browser for practising light on form. Turn it, put a lamp where you want, lay the Loomis construction over it, and band it into a few values the way [Askance](https://askance.julianjelfs.co.uk/) bands a photograph.

Live at https://aslant.julianjelfs.co.uk/

## What it does

- Drag to orbit, right-drag or two fingers to pan, scroll or pinch to zoom. The light is set relative to you, so orbiting reads as turning the head under a lamp that stays put.
- Light: drag the lamp round a lit sphere (`src/lightball.js`) that is shaded by the scene's own lights and bands into values with the head. Past the sphere's edge the lamp swings behind for a rim light. Arrow keys move it too.
- Light colour: colour temperature for the key and the fill, on a mired scale so equal steps look equally warmer or cooler, with named sources (candle, tungsten, north sky) along it. The key starts at noon sun and the fill at north sky.
- Head: roll, backdrop value, cast shadows on or off.
- Loomis overlay: ball, side planes, brow and hairline, nose and chin lines, jaw. Lines behind the head show faintly.
- Values: 2 to 7 bands of CIE L*, using the same maths as Askance's shader (`src/values.js`).
- Save picture: a PNG of the current view, ready to open in Askance.

## Running it

It's static files with no build step. three.js 0.170.0 comes from jsDelivr through an import map. Serve the folder with any static server, for example `npx serve .`, and open it. Opening `index.html` from disk won't work because browsers block ES modules on `file://`.

GitHub Pages serves `main` from the repo root.

## The head

`models/head.glb` is [Head Planes Reference](https://sketchfab.com/3d-models/head-planes-reference-7b6167ae3e484f1884ae0491a491e856) by [zsoltsulyok](https://sketchfab.com/zsoltsulyok), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `tool/prepare-head.mjs` turns the Sketchfab download into the shipped file. It welds the four chunks, reduces the mesh from 378k to 60k triangles with [meshoptimizer](https://github.com/zeux/meshoptimizer) (the surface moves by about 0.01% of the head's height), and rescales and recentres it. The download is 10 MB and the shipped file is about 1 MB.

```
npm install
node tool/prepare-head.mjs ~/Downloads/head_planes_reference.glb models/head.glb
```

The Loomis fit (`HEAD_FIT` in `src/loomis.js`) is measured in the units that script writes.

## Licence

Code: MIT. Typeface: Bricolage Grotesque, SIL Open Font License (`fonts/OFL-BricolageGrotesque.txt`). Head model: CC BY 4.0, "Head Planes Reference" by zsoltsulyok, reduced and rescaled.
