# Spotify Plaque Generator

Backend + simple frontend to fetch Spotify track metadata and generate a laser‑ready SVG plaque (Spotify player style).

## Structure
```
backend/    Express API + SVG generator
frontend/   Static test UI served by backend
```

## Quick Start (Windows / PowerShell)
From repository root:
```
./run-backend.ps1
```
Then open http://localhost:3001/ in the browser.

Alternatively run manually:
```
cd backend
npm install   # first time
npm start
```

## Endpoints
- GET `/api/health` – health check
- POST `/api/spotify-metadata` `{ url }` → metadata JSON
- POST `/api/generate-plaque` `{ url, style, progressTime }` → SVG (download)

`progressTime` format: `M:SS` (e.g. `2:30`). `style` can be `minimal` (Spotify player) or `detailed`.

## Common Issue: "Site can’t be reached"
Likely causes & fixes:
1. Wrong working directory – must start server from `backend` or use `run-backend.ps1`.
2. Port already in use – stop old Node: `Get-Process node | Stop-Process -Force` then restart.
3. Server crashed at startup – check console output for stack traces.
4. Firewall blocking localhost: add Node.js to allowed apps.
5. Using `node src/server.js` from repo root (fails because relative paths differ). Always run inside `backend`.

## Clean Generated Artifacts
Remove temporary SVG/tests:
```
cd backend
npm run clean
```

## Tests
```
cd backend
npm test
```

## Deployment Notes
- Only `backend/src` & `frontend/index.html` are required.
- Generated SVGs are dynamic; none are stored now.
- Set `PORT` env var if hosting on a different port.

### Quick Docker Build & Run
```
docker build -t spotify-plaque .
docker run --rm -p 8080:8080 --env-file backend/.env.example spotify-plaque
```
Then visit: http://localhost:8080/

Provide real Spotify credentials instead of the example values.

### Deploy to Fly.io (example)
1. Install flyctl
2. `fly launch --no-deploy` (choose 8080 internal port)
3. Set secrets:
```
fly secrets set SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy
```
4. `fly deploy`

### Deploy to Render / Railway / Cyclic
- Create new Web Service from repo.
- Build command: `docker build -t spotify-plaque .` (or let platform auto-detect Node & run `npm install`).
- Start command (if not using Dockerfile): `node backend/src/server.js`
- Add environment variables.
- Expose port (platform usually injects `PORT`).

### Static CDN + API Separation (Optional)
You can serve `frontend/index.html` + assets from a static host (Netlify, Vercel) and deploy only the Express API separately; just update fetch URLs in frontend to point to the API domain (set a base URL variable).

### Environment Variables
Create `.env` (not committed):
```
SPOTIFY_CLIENT_ID=... 
SPOTIFY_CLIENT_SECRET=...
```

### Hardening Ideas
- Rate limiting (e.g., express-rate-limit)
- Add simple in-memory metadata cache with TTL
- Add /api/version endpoint exposing git commit hash
- Disable fallback scraping if policy-restricted

### Laser Output Integrity
Downloaded SVG omits raster album art (outline only) and uses color channel mapping: Red (#ff0000 stroke) = cut, Black fill = engrave.


## License
MIT
