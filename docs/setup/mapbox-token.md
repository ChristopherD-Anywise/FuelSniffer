# Mapbox Token Setup

The trip planner uses Mapbox for two things:

1. **Directions** — calculate routes between two points
2. **Geocoding** — turn a typed address into `lat`/`lng`

Both share one server-side secret token, `MAPBOX_TOKEN`. Without it, `/dashboard/trip` shows a "requires configuration" panel and `/api/geocode` returns `503 geocoding_unavailable`.

## 1. Get a token

1. Sign up at [mapbox.com](https://account.mapbox.com/auth/signup/). The free tier (100k geocoding + 100k directions requests per month) is far more than FuelSniffer's self-hosted usage.
2. Go to [Access tokens](https://account.mapbox.com/access-tokens/).
3. Click **Create a token**.
4. Name it (e.g. `fuelsniffer-prod`).
5. Under **Secret scopes**, enable:
   - `directions:read`
   - `geocoding:read`
6. Click **Create token** and copy the `sk.eyJ…` value. You will not be able to view it again — store it now.

> The token is **secret** and stays server-side. It is never shipped to browsers.

## 2. Add it to your environment

### Local development / self-hosted

Edit `.env` in the repo root (the same file that holds `DB_PASSWORD`, `SESSION_SECRET`, etc.):

```env
MAPBOX_TOKEN=sk.eyJ1Ijoi...
```

### Docker

`docker-compose.yml` already wires `MAPBOX_TOKEN` into the `app` service's environment. Once `.env` has the variable, rebuild the app container:

```bash
cd fuelsniffer
docker compose up -d --build app
```

The scraper scheduler will restart; existing price history is preserved.

## 3. Verify

```bash
curl -s "http://localhost:3000/api/geocode?q=brisbane" | head -100
```

Expected: a JSON array like

```json
[
  { "label": "Brisbane, Queensland, Australia", "lat": -27.4698, "lng": 153.0251 },
  …
]
```

Visit `http://localhost:3000/dashboard/trip` — the form should render with address inputs. Type an address, see suggestions.

## 4. Troubleshooting

- **`503 geocoding_unavailable`** — token not set in the `app` container's environment.
  ```bash
  docker compose exec app printenv MAPBOX_TOKEN
  ```
  Empty output ⇒ `.env` missing the variable or container wasn't rebuilt.

- **`502 geocoding_failed`** — Mapbox returned 5xx or the request couldn't reach api.mapbox.com. Check [Mapbox status](https://status.mapbox.com/) and your outbound network.

- **`/dashboard/trip` shows the "requires configuration" panel even with the token set** — the Next.js server reads env vars at request time, but the token is captured by the running node process. Confirm with the `printenv` check above and restart the container if necessary.

## 5. Rotating the token

1. Create a new token in the Mapbox dashboard.
2. Update `MAPBOX_TOKEN` in `.env`.
3. `docker compose up -d app`.
4. Verify with `/api/geocode?q=brisbane`.
5. Delete the old token from the Mapbox dashboard.

There is no in-app invalidation step — tokens are only referenced at request time.
