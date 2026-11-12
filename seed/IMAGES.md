# Images — source → optimized mapping

Source of truth: `~/workspace/gendler-girls/media/` (23 files, 9,108,794 bytes
total). Originals stay in the workspace archive and are NOT committed to the
repo. Optimized copies live in `public/images/` (20 files, 1,697,895 bytes).

## Optimization

Tool: ffmpeg (`/usr/bin/ffmpeg`, v8.1.2). Every photo was re-encoded as JPEG,
max 1600px wide, quality ~80:

```
ffmpeg -i <source> -vf "scale='min(1600,iw)':-2" -q:v 3 -map_metadata -1 <out.jpg>
```

- WebP sources → `.jpg`; `chattanooga.avif` → `chattanooga.jpg` (ffmpeg
  decoded the AVIF directly via libdav1d — no PIL fallback needed).
- EXIF metadata stripped (`-map_metadata -1`); EXIF rotation auto-applied.
- Heights of 667px sources became 668px (`-2` rounds to an even height).
  Harmless.
- A few small files got slightly *larger* (e.g. `camp.jpg`, `chattanooga.jpg`,
  `sisters2-webp.jpg`): WebP/AVIF compress better than JPEG, and the original
  JPEGs were encoded at lower quality. JPEG was chosen for universal
  compatibility; the overall saving is still 81.5%.

## Mapping (16 photos converted)

| Source (`media/`) | Optimized (`public/images/`) | Before | After | Section | Album |
|---|---|---|---|---|---|
| camp.jpg | camp.jpg | 1000×667, 135,940 B | 1000×668, 155,520 B | their-legacy | Misc. Photos |
| candles.webp | candles.jpg | 1903×929, 67,504 B | 1600×782, 73,930 B | their-legacy | Misc. Photos |
| chattanooga.avif | chattanooga.jpg | 600×408, 68,918 B | 600×408, 80,754 B | references | — |
| chaya.jpg | chaya.jpg | 1000×667, 69,956 B | 1000×668, 60,931 B | home | — |
| gendler-hero.jpg | gendler-hero.jpg | 1920×700, 163,258 B | 1600×584, 73,504 B | home | — (hero) |
| leah-and-naomi-gendler.jpg | leah-and-naomi-gendler.jpg | 1920×700, 243,131 B | 1600×584, 111,409 B | their-legacy | Misc. Photos |
| leah-naomi-gendler.jpg | leah-naomi-gendler.jpg | 1920×700, 212,199 B | 1600×584, 89,719 B | their-legacy | Leah's Family Photos |
| sisters0.jpg | sisters0.jpg | 591×382, 44,955 B | 591×382, 30,282 B | their-legacy | Misc. Photos |
| sisters1-full.jpg | sisters1-full.jpg | 460×337, 27,783 B | 460×338, 18,904 B | their-legacy | Naomi's Family Photos |
| sisters1.webp | sisters1.jpg | 460×337, 12,754 B | 460×338, 18,756 B | their-legacy | Leah's Family Photos |
| sisters2.jpg | sisters2.jpg | 1000×667, 129,180 B | 1000×668, 127,659 B | home | — |
| sisters2.webp | sisters2-webp.jpg | 458×337, 30,526 B | 458×338, 38,063 B | their-legacy | Naomi's Family Photos |
| wix-IMG_20180408.jpg | wix-IMG_20180408.jpg | 4032×3024, 5,072,135 B | 1600×1200, 422,077 B | references | — |
| wix-IMG_3225.jpg | wix-IMG_3225.jpg | 4032×3024, 2,127,202 B | 1600×1200, 127,538 B | their-legacy | Misc. Photos |
| wix-PHOTO-2023-04-16.jpg | wix-PHOTO-2023-04-16.jpg | 1414×908, 210,543 B | 1414×908, 118,613 B | their-legacy | Misc. Photos |
| wix-family-israel.jpeg | wix-family-israel.jpg | 902×630, 472,798 B | 902×630, 136,199 B | their-legacy | Misc. Photos |

**Totals (converted files):** 9,088,782 B (8.67 MB) → 1,683,858 B (1.61 MB),
an 81.5% reduction. The two 4032px Wix originals account for most of it
(7.20 MB → 0.55 MB).

**Filename note:** `sisters2.webp` became `sisters2-webp.jpg` (not
`sisters2.jpg`) because a different `sisters2.jpg` already exists — the two
are different crops of the same outing. Every other file keeps its base name
with a `.jpg` extension.

## Copied unchanged (4 files, 14,037 B)

| File | Notes |
|---|---|
| logo.svg (3,265 B) | Site logo |
| logo-svg-white.svg (2,548 B) | White logo variant |
| favicon-1.png (3,782 B) | Favicon, 512×512 |
| cropped-favicon-1.png (4,442 B) | Cropped favicon, 512×512 |

## Skipped (3 files, 5,975 B — not needed)

`radiant-gradient.svg`, `rainbow-vortex.svg`, `rose-petals.svg` — decorative
WordPress-theme gradients, not used by the new site.

## Album assignments

The old site's exact per-album assignment was not recoverable (see
`content.json` gaps), so photos were assigned sensibly; the family can
reassign any photo in admin. Seeded photo entities carry the album **slug**
in their `album` column (e.g. `misc-photos`) — this is what the admin
dropdown stores and the public frontend matches on.

| Album | Photos |
|---|---|
| Leah's Family Photos | leah-naomi-gendler.jpg, sisters1.jpg |
| Naomi's Family Photos | sisters1-full.jpg, sisters2-webp.jpg |
| Misc. Photos | camp.jpg, candles.jpg, leah-and-naomi-gendler.jpg, sisters0.jpg, wix-IMG_3225.jpg, wix-PHOTO-2023-04-16.jpg, wix-family-israel.jpg |
| Naomi's 90th Birthday | *(no photos — its video is the 90th-birthday video; no photos invented)* |

Not in any album: `gendler-hero.jpg`, `sisters2.jpg`, `chaya.jpg` (home
section) and `chattanooga.jpg`, `wix-IMG_20180408.jpg` (references section —
both are the March 23, 1939 Chattanooga News front page; the Wix one is a
photograph of the physical newspaper).

## Captions / alt text

- WordPress photos: alt text verbatim from the WordPress media library
  (`data/wp-media.json`); used as both caption and alt.
- Wix photos (no alt text on record): described from the images themselves —
  `wix-IMG_3225.jpg` (two women in dark fur-collared coats, black-and-white),
  `wix-PHOTO-2023-04-16.jpg` (two young women, vintage sepia outdoor
  portrait), `wix-family-israel.jpg` (two couples outdoors near the water).
- `chattanooga.jpg` caption is the verbatim References text from
  `content.json`; `wix-IMG_20180408.jpg` was visually confirmed to be the
  Chattanooga News front page, March 23, 1939 ("Hitler Greeted In Memel;
  Says He Got Even").
