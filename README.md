# Lentil

Lentil is an installable, offline-capable web app for identifying lenticular
sheet pitch, calibrating a printer, and creating two-image flip prints. Image
processing stays in the browser.

## What it does

1. Calibrates the physical scale of a phone display against a bank card.
2. Narrows an unknown sheet pitch with three on-screen optical comparisons.
3. Generates an exact-size SVG printer test with a 100 mm scaling check.
4. Records the working pitch for that sheet, printer, paper, and driver setup.
5. Interlaces two images and exports a density-tagged PNG or exact-size SVG.

The phone measurement is intentionally treated as an estimate. The printed
pitch test is authoritative because it includes printer and paper scaling.

## Run locally

No build step or dependencies are required. Serve the repository over HTTP so
ES modules and the service worker are available:

```bash
npm run serve
```

Then open <http://localhost:4173>.

Run the calculation and file-format tests with:

```bash
npm test
```

## Publish with GitHub Pages

1. Create an empty GitHub repository and add it as this repository's `origin`.
2. Push `main`.
3. In **Settings → Pages**, select **GitHub Actions** as the source.

The included workflow tests the app and publishes the repository as a static
site on every push to `main`. All asset URLs are relative, so both a user site
and a project site such as `https://USERNAME.github.io/lentil/` work without
configuration changes.

## Print notes

- Print calibration SVGs at **100% / Actual size**.
- Disable Fit, Shrink, and borderless expansion.
- Verify the included 100 mm line before judging a pitch band.
- Keep the sheet's smooth side against the print and its ridges outward.
- Repeat calibration when the sheet batch, printer, paper, or driver setting
  changes.
