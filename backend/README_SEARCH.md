# Spotify Search Configuration

The plaque generator now supports entering a plain song name instead of a full Spotify URL.

## How Search Works
1. If Spotify Web API credentials are provided via environment variables, it uses the official Search API (reliable).
2. Otherwise it falls back to scraping the public search page (often incomplete because dynamic content requires client-side JS), so results may fail.

## Provide Credentials
Create a Spotify application at https://developer.spotify.com/dashboard and note the Client ID and Client Secret.

Set environment variables before starting the backend (PowerShell examples):

```powershell
$env:SPOTIFY_CLIENT_ID = 'your_client_id_here'
$env:SPOTIFY_CLIENT_SECRET = 'your_client_secret_here'
npm start
```

or in one line:

```powershell
SPOTIFY_CLIENT_ID=your_client_id SPOTIFY_CLIENT_SECRET=your_client_secret node src/server.js
```

## Behavior
If credentials are missing you will see errors like:
```
No matching track found (configure SPOTIFY_CLIENT_ID/SECRET for reliable search)
```
Add the variables and restart the server.

## Caching
An access token is cached in memory until ~5 seconds before it expires (default 3600s).

## Future Ideas
- Return multiple matches for user selection
- Local caching of last N lookups
- Fuzzy match refinement when multiple close results
