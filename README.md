# Aslant

A head in the browser for practising light on form. Turn it, put a lamp where you want, lay the Loomis construction over it, and band it into a few values the way [Askance](https://askance.julianjelfs.co.uk/) bands a photograph.

Live at https://aslant.julianjelfs.co.uk/

## What it does

- Drag to orbit, right-drag or two fingers to pan, scroll or pinch to zoom. The light is set relative to you, so orbiting reads as turning the head under a lamp that stays put.
- Light: drag the lamp round a lit sphere (`src/lightball.js`) that is shaded by the scene's own lights and bands into values with the head. Past the sphere's edge the lamp swings behind for a rim light. Arrow keys move it too.
- Reflected light: the light bounced into the shadow side, set as a share of the lit side's brightness ("1/12 of the lamp"), so it keeps its relationship to the lamp when you change the lamp's strength. Its colour only shows in the shadows.
- Light colour: colour temperature for the lamp and the reflected light, on a mired scale so equal steps look equally warmer or cooler, with named sources (candle, tungsten, north sky) along it. The lamp starts at noon sun and the reflected light at north sky.
- Head: roll (slider, a sideways two-finger swipe on a trackpad, or a two-finger twist on a touch screen) and backdrop value.
- Loomis overlay: ball, side planes, brow and hairline, nose and chin lines, jaw. Lines behind the head show faintly. Switch the model off to see the frame on its own; the lines then hide behind the Loomis ball instead.
- Values: 2 to 7 bands of CIE L*, using the same maths as Askance's shader (`src/values.js`). The bands are absolute, so the lamp is exposed for the light: at 100% strength a plane facing it squarely lands at L* 95, whatever the lamp's colour.
- Open in Askance: opens Askance in a new tab and hands it a clean picture of the head (no Loomis lines or value bands, cropped to portrait) with your values setting, which Askance opens as a new study. It needs Askance's matching receiver (`lib/ui/aslant/` in Askance). Where the two tabs can't talk, as an installed app on a phone may not, Aslant says so and Save is the way across.
- Save: a PNG of exactly what's on screen.
- Every setting, the view included, is kept in this browser's localStorage, so a refresh changes nothing. "Reset everything" goes back to the defaults.

## Running it

It's static files with no build step. three.js 0.170.0 comes from jsDelivr through an import map. Serve the folder with any static server, for example `npx serve .`, and open it. Opening `index.html` from disk won't work because browsers block ES modules on `file://`.

GitHub Pages serves `main` from the repo root.

## Installing and offline

Aslant is a PWA: add it to a home screen and it opens full screen, and after the first visit it works offline. `sw.js` caches every file the deploy ships plus the three.js modules from jsDelivr. The page is fetched network-first, so an installed copy picks up a new deploy whenever it's online.

Deploys go through `.github/workflows/pages.yml`, which runs `tool/stamp.mjs` to stamp the commit onto every local URL in `index.html` and onto the worker's cache, and to list the files the worker caches. A new script under `src/` needs an entry in the import map in `index.html` to get the stamp.

The icon is a Loomis head drawn from the overlay's own construction. `node tool/make-icons.mjs` redraws `icons/` (it uses headless Chrome to rasterise).

## The head

`models/head.glb` is [Head Planes Reference](https://sketchfab.com/3d-models/head-planes-reference-7b6167ae3e484f1884ae0491a491e856) by [zsoltsulyok](https://sketchfab.com/zsoltsulyok), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `tool/prepare-head.mjs` turns the Sketchfab download into the shipped file. It welds the four chunks, reduces the mesh from 378k to 60k triangles with [meshoptimizer](https://github.com/zeux/meshoptimizer) (the surface moves by about 0.01% of the head's height), and rescales and recentres it. The download is 10 MB and the shipped file is about 1 MB.

```
npm install
node tool/prepare-head.mjs ~/Downloads/head_planes_reference.glb models/head.glb
```

The Loomis fit (`HEAD_FIT` in `src/loomis.js`) is measured in the units that script writes.

## Licence

Code: MIT. Typeface: Bricolage Grotesque, SIL Open Font License (`fonts/OFL-BricolageGrotesque.txt`). Head model: CC BY 4.0, "Head Planes Reference" by zsoltsulyok, reduced and rescaled.
