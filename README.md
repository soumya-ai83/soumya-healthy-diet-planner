# Soumya Healthy Diet Planner

Soumya Healthy Diet Planner is a local-first meal, recipe, weight, and calorie tracker. Version 1.3 adds installable Progressive Web App support without changing the existing data model or interface.

## Run locally

Service workers require HTTPS, except on `localhost`. From the project folder, start a simple local server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Opening `index.html` directly as a `file:` URL will not enable the service worker.

## Test the PWA and offline mode

1. Open the app in Chrome or Edge over HTTPS or on localhost.
2. In DevTools, open **Application**.
3. Confirm that `manifest.webmanifest` is detected and `service-worker.js` is activated.
4. Load the app once while online.
5. In DevTools **Network**, select **Offline**, then refresh.
6. Confirm that the app opens, navigation works, and locally stored meals and recipes remain available.

The app-shell cache version is the `CACHE_VERSION` constant near the top of `service-worker.js`. Increment it whenever cached application assets change. During development, use DevTools **Application → Service workers → Unregister**, then reload, to force a complete PWA asset refresh.

## Install

### iPhone and iPad

Open the app in Safari, tap **Share**, then **Add to Home Screen**. Launch the saved icon to use standalone mode.

### Android, Chrome, and Edge

Use the browser's **Install app** action, or open **Settings → Install App** inside the planner when the browser offers installation.

## Data safety

Meals, recipes, settings, and weight history remain in the current browser or installed app's local storage. Version 1.3 does not add accounts, cloud backup, or cross-device synchronization.

Export a backup from **Settings → Data Management** before clearing browser storage, removing site data, or changing devices. Clearing cached application files is different from clearing browser storage; clearing site storage can remove personal app data.
