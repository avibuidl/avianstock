# Typefaces

Both are licensed under the SIL Open Font License 1.1, which permits
self-hosting and redistribution with the software. The full licence text ships
with each family upstream.

| family | used for | upstream |
|---|---|---|
| Geist | the wordmark, every heading, body copy and controls | https://github.com/vercel/geist-font |
| Geist Mono | amounts, addresses, token ids, the nav labels and the tags | https://github.com/vercel/geist-font |

The .woff2 files in this directory are the `latin` and `latin-ext` subsets
of the variable fonts as served by Google Fonts, fetched by
`scripts/fetch-fonts.mjs`. Re-run that script to refresh them.

Note from logo/final/README.md: an SVG cannot carry a font, so the lockups NAME
a family and fall back to a system stack wherever it is not loaded. That is
fine here, because this site loads the webfont. Anything going to print or to
a third party needs the wordmark converted to outlines first.
