# Car Trip Price

A tiny iPhone web app that tracks a car trip with GPS and shows what it costs in fuel:

```
price = km × consumption (l/100 km) / 100 × petrol price (Ft/l)
```

Plain static files (no build step): `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, icons.

## Usage

- **Start / Pause** — big button; distance only counts while running.
- **Reset** — sets the trip back to 0 km / 0 Ft (asks for confirmation).
- **⚙ Settings** — average consumption and petrol price; saved on the phone. Changing them re-prices the whole trip.
- The trip is saved on the phone, so a reload doesn't lose it (tap Start again to continue).
- Keep the screen on while tracking: iOS stops GPS for web apps when the phone is locked or the app is in the background. The app requests a screen wake lock while running.

## Run locally

```sh
python3 -m http.server 8000
```

GPS on iPhone requires HTTPS, so for phone use deploy it (below).

## Deploy to GitHub Pages

```sh
git init && git add . && git commit -m "Initial commit"
gh repo create car-trip-price --public --source . --push
gh api -X POST repos/{owner}/car-trip-price/pages -f 'source[branch]=main' -f 'source[path]=/'
```

Then on the iPhone open `https://<user>.github.io/car-trip-price/` in Safari → Share → **Add to Home Screen**.
