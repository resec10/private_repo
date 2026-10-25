# Expiry Tracker

A phone app for tracking product expiry dates in a shop. It runs in the browser and can be
installed on the home screen. It works offline, and there's no account, server or app store.

- **Add a product:** type its name, pick the expiry date, and optionally take or choose a photo.
- **Reminders:** you get a reminder when a product is **10 days or less** from expiring, and
  again each day until you remove it. Expired products count too.
- **Bread:** turn on the **Bread** switch and the product never sends alerts; it just shows its
  expiry date. The switch turns itself on when the name looks like bread ("pane", "pâine",
  "bread", "baguette", "focaccia"…), and you can always change it.
- **The list:** products are grouped into *Expiring within 10 days*, *Bread* and *Later*,
  soonest first, and you can search them by name.
- **Changing products:** tap a product to edit it or delete it (with Undo). Use
  **Save as new batch** for a new delivery of the same product: it keeps the name and photo,
  and you just set the new date.

## Put it on your phone

The app is a folder of static files. It has to be served over **https** for installation,
offline use and notifications to work. Any static web host will do, for example:

- **Netlify Drop:** drag the `expiry-tracker` folder onto <https://app.netlify.com/drop> and
  open the link it gives you on your phone.
- **GitHub Pages:** publish this folder from the repository (repository Settings → Pages).

Then install it:

- **Android (Chrome):** open the link, then tap ⋮ → *Install app* (or *Add to Home screen*).
- **iPhone (Safari, iOS 16.4 or newer):** open the link, then tap Share → *Add to Home Screen*.
  Open the app from the home screen icon. Notifications only work on iPhone when the app is
  opened this way.

Open the app and tap **Turn on alerts**.

## How alerts work

You get **one summary a day**, for example *"3 products expire within 10 days"*, listing them
soonest first. Bread is never included. When the summary arrives depends on the phone:

| Phone | When the daily summary arrives |
|-------|--------------------------------|
| Android, app installed | In the background, even when the app is closed. Chrome decides the timing, at most twice a day, and less often if the app is rarely used. It also arrives whenever you open the app. |
| iPhone / other browsers | When you open the app (or bring it back to the screen). |

Web apps can't wake an iPhone on a schedule. So on iPhone, also use **Settings →
Add reminders to calendar**. It saves a calendar file with every product except bread.
Each product gets a reminder at 09:00 ten days before it expires, and another on the day.
Open the file and add the events, and your calendar will remind you even if the app is
never opened. Do this again after adding new products.

The app icon also shows the number of products that need attention, on phones that support
icon badges.

## Your data

Everything, including the photos, is stored **only on the phone**, inside the browser. The app
asks the browser to keep this storage permanently. Still, deleting the app or clearing the
browser's site data erases it.

- **Settings → Save backup file** saves all products and photos into one `.json` file.
- **Settings → Restore backup** loads that file, on the same phone or a new one.

Each phone has its own list. To share one list between phones, restore the same backup on each.

Photos are shrunk to 900 pixels before saving, so hundreds of products take only a few MB.

## Files

| File | What it does |
|------|--------------|
| `index.html`, `styles.css` | The page and its design. Mobile-first, with light and dark mode. |
| `app.js` | The list, the add/edit form, photos, backup and calendar export |
| `shared.js` | Storage (IndexedDB), date maths, bread detection and the daily alert. Used by both `app.js` and `sw.js`. |
| `sw.js` | Service worker: offline cache, the background daily check, and opening the app from a notification |
| `manifest.webmanifest`, `icons/` | What makes the app installable |
| `tests/logic.test.mjs` | Unit tests for the date and alert rules |

## Development

```sh
cd expiry-tracker
python3 -m http.server 8000      # then open http://localhost:8000
node --test                      # unit tests (Node 18+, no install needed)
```

Browsers allow service workers and notifications on `http://localhost`, so local testing works
without https.

The 10-day window is `ALERT_DAYS` in `shared.js`. After you deploy changes, phones pick them up
the second time the app is opened, because the service worker serves the cached copy first and
refreshes it in the background.
