# Locator

Your live latitude and longitude on a map, each with a one-tap copy button.
The position updates continuously while the page is open.

## Run locally

```bash
cp .env.example .env.local   # then fill in NEXT_PUBLIC_MAPBOX_TOKEN
npm install
npm run dev
```

Browsers only share location over **https** or on `localhost`. To test on a
phone over your local network, run `npm run dev -- --experimental-https` and
accept the self-signed certificate once.

## Deploy on Vercel

1. Push this folder to a Git repository and import it at
   [vercel.com/new](https://vercel.com/new) (or run `npx vercel` from this
   folder). The framework is detected as Next.js; no build settings need
   changing.
2. In **Project Settings → Environment Variables**, add
   `NEXT_PUBLIC_MAPBOX_TOKEN` (the Mapbox public `pk.` token) for
   Production and Preview.
3. Deploy. The token is baked in at build time, so redeploy after changing it.

Vercel serves over https, so location works on the deployed URL with no
extra setup.

### Mapbox token

The token is public (it ships to the browser). In the Mapbox account, restrict
it to the deployed domain(s) under **Access tokens → URL restrictions** so it
can't be reused elsewhere. Remember to include preview URLs if you use them.

## Notes

- Location can't be forced on by a website. If access is denied, the app
  explains how to allow it and resumes on its own once it's granted.
- Tracking pauses while the tab is in the background or the screen is
  locked (a browser limit), and restarts when you return.
