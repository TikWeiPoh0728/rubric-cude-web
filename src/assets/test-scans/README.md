# Scanner test set

One photo of one cube face per file, plus a label with the same base name:

```
scan1-F.jpg
scan1-F.json   { "face": "F", "stickers": ["F","U","R", ...9], "scramble": "R U ..." }
```

`stickers` are face letters, row-major as the face appears in kociemba orientation:
U is seen from above with B at the top, D from below with F at the top, and R F L B
from outside with U at the top. Photograph each face that way up (auto-rotation is
not implemented yet).

`index.json` lists the photo file names; the runner reads only what it lists
(a browser cannot list a folder).

Instead of labeling by hand: on `/dev/scan`, under "Labels from a scramble", enter
the scramble you applied to a solved cube (yellow on top, green in front). Download
the six labels and add the index entries it shows.

The runner calibrates `classify()` from these photos' own center stickers: it uses the
mean center color per face, so the set needs at least one photo of every face.

This folder is served by `ng serve` (development build) only, never in production.
