# Cloudflare demo

The public site serves the React interface, sample audio, and a saved report as static assets. It has no Python API, upload endpoint, database, or paid bindings. Demo mode hides server upload and recording controls and loads the bundled report without an API request. The score follower retains audible replay, live Web MIDI, and local single-note microphone following on HTTPS; its reference-upload control is hidden. The piano studio offers an editable saved chord example, original-audio comparison, loops, browser-local sessions, quantized notation and client-side MIDI export; new-audio transcription requires the local Python server. Audio is processed locally, and score/position checkpoints remain in browser storage. The normal development build keeps all analysis inputs.

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


## Validate the public build

After `npm run build`, run `python tools/test_public_demo_browser.py` with the
browser dependencies in `tools/requirements-browser.txt` installed. This serves
`frontend/dist` without a Python API and checks replay, reload recovery, export,
and the absence of upload inputs and API requests. GitHub Actions runs it too.
Run `npx wrangler deploy --dry-run` to validate the Cloudflare asset configuration
without publishing. Use `npm run deploy` only with an authenticated Cloudflare
account; no credential belongs in the repository.

The `cloudflare-demo` branch backs hosting PR #2. Its refreshed version includes
the score follower and presentation media. If Cloudflare Builds is already
connected, its configured production branch determines which pushes deploy;
merging the PR into `main` only deploys automatically when that integration is
configured to watch `main`. Without that integration, run the authenticated
deploy command above. A Git push alone is not proof of a live deployment.
