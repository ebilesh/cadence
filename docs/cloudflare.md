# Cloudflare demo

The public site serves the React interface, sample audio, and a saved report as static assets. It has no Python API, upload endpoint, database, or paid bindings. Demo mode removes recording and upload controls and loads the bundled report without an API request. The normal development build keeps all analysis inputs.

From the repository root, install Node 22 or later and run:

```sh
npm ci
npm run build
npx wrangler login
npm run deploy
```

Wrangler prints the public workers.dev address. The worker name is `cadence-piano` in `wrangler.jsonc`. The configuration declares assets only, so static requests do not invoke a Worker script. Use a Cloudflare Free account; no paid service is required.

For local preview, build first and run `npm run preview`. A direct request to `/api/demo` returns 404 because the public demo does not expose an API.

For Git-based deployment in the Cloudflare dashboard, select this repository, keep its root directory at the repository root, use `npm run build` for the build command, and `npx wrangler deploy` for the deploy command. Cloudflare handles the deployment credentials. Never commit a token.

[Cloudflare static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
