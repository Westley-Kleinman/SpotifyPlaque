/**
 * Spotify Metadata Utility Module
 * 
 * This module provides functions to fetch metadata from Spotify track URLs
 * using web scraping. It handles URL validation, data extraction,
 * and error scenarios gracefully.
 */

const https = require('https');
const http = require('http');
const querystring = require('querystring');

// --- Optional Spotify Web API integration (improves reliable search) ---
// Provide environment variables SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
// to enable official API search. Falls back to HTML scraping if absent.
let _spotifyToken = null;
let _spotifyTokenExpiry = 0; // epoch ms

async function getSpotifyAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null; // credentials not configured
  const now = Date.now();
  if (_spotifyToken && now < _spotifyTokenExpiry - 5000) { // 5s early refresh buffer
    return _spotifyToken;
  }
  const body = querystring.stringify({ grant_type: 'client_credentials' });
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const token = await new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data='';
      res.on('data', d=> data+=d);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error('Token request failed status '+res.statusCode));
        }
        try {
          const json = JSON.parse(data);
            if (json.access_token) {
              _spotifyToken = json.access_token;
              _spotifyTokenExpiry = Date.now() + (json.expires_in||3600)*1000;
              resolve(_spotifyToken);
            } else {
              reject(new Error('No access_token in response'));
            }
        } catch(e){
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  return token;
}

async function searchTrackViaAPI(query) {
  const token = await getSpotifyAccessToken();
  if (!token) return null; // credentials not configured
  const params = querystring.stringify({ q: query, type: 'track', limit: 1 });
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'GET',
      hostname: 'api.spotify.com',
      path: `/v1/search?${params}`,
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let data='';
      res.on('data', d=> data+=d);
      res.on('end', () => {
        if (res.statusCode === 401) { // token expired maybe
          _spotifyToken = null; _spotifyTokenExpiry = 0;
          return resolve(null); // allow fallback
        }
        if (res.statusCode !== 200) return resolve(null); // fallback gracefully
        try {
          const json = JSON.parse(data);
          const track = json?.tracks?.items?.[0];
          if (!track) return resolve(null);
          const trackId = track.id;
          const resolvedUrl = `https://open.spotify.com/track/${trackId}`;
          const metadata = {
            title: track.name || null,
            artist: (track.artists && track.artists[0] && track.artists[0].name) || null,
            image: (track.album && track.album.images && track.album.images[0] && track.album.images[0].url) || null,
            duration: track.duration_ms ? formatDuration(track.duration_ms) : null,
            preview: track.preview_url || null
          };
          resolve({ resolvedUrl, trackId, metadataFromAPI: metadata });
        } catch(e){
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

/**
 * Find alternate album cover URLs for a query by using Spotify Web API.
 * Returns a deduped array of cover image URLs (highest available resolution).
 * If API creds are not configured, falls back to the primary image via scraping.
 */
async function searchAlbumCovers(query) {
  if (!query || typeof query !== 'string' || !query.trim()) return [];
  const token = await getSpotifyAccessToken().catch(()=>null);
  const out = new Set();
  const push = (url) => { if (!url) return; const base = url.split('?')[0]; out.add(base); };

  if (token) {
    // Search both tracks and albums to capture alternate editions/deluxe
    const makeReq = (path) => new Promise((resolve) => {
      const req = https.request({
        method: 'GET',
        hostname: 'api.spotify.com',
        path,
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res) => {
        let data=''; res.on('data', d=> data+=d);
        res.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.end();
    });

    const q = encodeURIComponent(query.trim());
    const [trackRes, albumRes] = await Promise.all([
      makeReq(`/v1/search?q=${q}&type=track&limit=10`),
      makeReq(`/v1/search?q=${q}&type=album&limit=10`)
    ]);

    const tracks = trackRes?.tracks?.items || [];
    tracks.forEach(t => { const img = t.album?.images?.[0]?.url; push(img); });
    const albums = albumRes?.albums?.items || [];
    albums.forEach(a => { const img = a.images?.[0]?.url; push(img); });
  }

  if (out.size === 0) {
    // Fallback: single image via scraping
    try {
      const { metadata } = await fetchSpotifyMetadataFlexible(query);
      push(metadata?.image || null);
    } catch { /* ignore */ }
  }
  return Array.from(out);
}

/**
 * Strict cover search: only covers from tracks that match the exact title and primary artist.
 * Requires Spotify Web API credentials. Falls back to [].
 */
async function searchAlbumCoversStrict(exact) {
  try {
    const token = await getSpotifyAccessToken();
    if (!token) return [];
    if (!exact || !exact.title || !exact.artist) return [];

    const normalize = (s) => (s||'')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\([^)]*\)|\[[^\]]*\]/g, '') // remove parenthetical/bracketed content
      .replace(/-\s*remaster(?:ed)?\s*\d{0,4}/g, '')
      .replace(/feat\.?[^-]*$/g, '')
      .trim();

    const q = `track:"${exact.title}" artist:"${exact.artist}"`;
    const params = `/v1/search?q=${encodeURIComponent(q)}&type=track&limit=20`;
    const json = await new Promise((resolve) => {
      const req = https.request({ method:'GET', hostname:'api.spotify.com', path: params, headers:{ Authorization:`Bearer ${token}` } }, (res) => {
        let data=''; res.on('data', d=> data+=d); res.on('end', ()=>{ try{ resolve(JSON.parse(data)); } catch{ resolve(null); } });
      });
      req.on('error', ()=>resolve(null)); req.end();
    });
    const wantTitle = normalize(exact.title);
    const wantArtist = normalize(Array.isArray(exact.artist)? exact.artist[0] : exact.artist);
    const out = new Set();
    const push = (url) => { if (!url) return; out.add(url.split('?')[0]); };
    const items = json?.tracks?.items || [];
    for (const t of items) {
      const titleOk = normalize(t.name) === wantTitle;
      const artistName = t.artists?.[0]?.name || '';
      const artistOk = normalize(artistName) === wantArtist;
      if (titleOk && artistOk) {
        const img = t.album?.images?.[0]?.url;
        push(img);
      }
    }
    return Array.from(out);
  } catch { return []; }
}

/**
 * Validates if a given URL is a valid Spotify track URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if valid Spotify track URL, false otherwise
 */
function isValidSpotifyTrackUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // Spotify track URL patterns:
  // https://open.spotify.com/track/TRACK_ID
  // https://open.spotify.com/track/TRACK_ID?si=...
  // spotify:track:TRACK_ID
  const spotifyTrackRegex = /^(https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+(\?.*)?|spotify:track:[a-zA-Z0-9]+)$/;
  return spotifyTrackRegex.test(url);
}

/**
 * Attempts to resolve a free-form search query (song name, optionally artist) to a Spotify track URL
 * by scraping Spotify's public search page. We avoid the official Web API (no auth needed) and
 * reuse existing HTML scraping logic once we have a concrete track URL.
 * @param {string} query - Raw user search text
 * @returns {Promise<{resolvedUrl:string, trackId:string}>}
 */
async function resolveQueryToTrack(query) {
  if (!query || typeof query !== 'string') {
    throw new Error('Empty search query');
  }
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Empty search query');
  // 1. Try official Web API if credentials provided
  try {
    const apiResult = await searchTrackViaAPI(trimmed);
    if (apiResult) return apiResult; // includes metadataFromAPI
  } catch (e) {
    // ignore & fallback
  }

  // 2. Fallback: Fetch Spotify search HTML (may often be empty without JS execution)
  const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(trimmed)}`;
  let html = '';
  try { html = await fetchHTML(searchUrl); } catch (e) { /* swallow */ }
  if (html) {
    const idRegex = /spotify:track:([a-zA-Z0-9]{10,})/g;
    const seen = new Set();
    let match;
    while ((match = idRegex.exec(html)) !== null) {
      const id = match[1];
      if (!seen.has(id)) {
        const resolvedUrl = `https://open.spotify.com/track/${id}`;
        return { resolvedUrl, trackId: id };
      }
    }
  }

  const credsMissing = !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  if (credsMissing) {
    throw new Error('No matching track found (configure SPOTIFY_CLIENT_ID/SECRET for reliable search)');
  }
  throw new Error('No matching track found');
}

/**
 * High level helper: given either a Spotify track URL or a free-form query, return metadata.
 * If input is a valid URL we just fetch; otherwise we attempt a search.
 * @param {string} input - URL or search text
 * @returns {Promise<{ metadata: Object, resolvedUrl: string }>} metadata plus canonical track URL
 */
async function fetchSpotifyMetadataFlexible(input) {
  if (!input || typeof input !== 'string') throw new Error('No input provided');
  if (isValidSpotifyTrackUrl(input)) {
    const metadata = await fetchSpotifyMetadata(input);
    // Normalize https form for client usage
    let resolvedUrl = input;
    if (input.startsWith('spotify:track:')) {
      const trackId = input.replace('spotify:track:', '');
      resolvedUrl = `https://open.spotify.com/track/${trackId}`;
    }
    return { metadata, resolvedUrl };
  }
  // Treat as search query
  const sr = await resolveQueryToTrack(input);
  let metadata = sr.metadataFromAPI; // may exist if API search used
  if (!metadata) {
    // fallback to scraping the resolved track page for parity
    metadata = await fetchSpotifyMetadata(sr.resolvedUrl);
  }
  return { metadata, resolvedUrl: sr.resolvedUrl };
}

/**
 * Converts duration from milliseconds to a readable format
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} - Duration in format "MM:SS"
 */
function formatDuration(durationMs) {
  if (!durationMs || typeof durationMs !== 'number') {
    return null;
  }
  
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Fetches Spotify track metadata from a given URL
 * @param {string} url - Spotify track URL
 * @returns {Promise<Object>} - Promise resolving to metadata object
 * @throws {Error} - Throws error for invalid URLs or fetch failures
 */
/**
 * Fetches HTML content from a URL
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} - HTML content
 */
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Extracts metadata from Spotify HTML page
 * @param {string} html - HTML content
 * @returns {Object} - Extracted metadata
 */
function parseSpotifyHTML(html) {
  const metadata = {
    title: null,
    artist: null,
    image: null,
    duration: null
  };

  try {
    // Extract title from meta property="og:title"
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (titleMatch) {
      metadata.title = titleMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    }

    // Extract description which usually contains artist info
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    if (descMatch) {
      const desc = descMatch[1];
      // Usually format is "Artist · Song · Album" or "Song · Artist"
      if (desc.includes(' · ')) {
        const parts = desc.split(' · ');
        if (parts.length >= 2) {
          metadata.artist = parts[0].trim();
        }
      }
    }

    // Extract image from meta property="og:image"
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (imageMatch) {
      metadata.image = imageMatch[1];
    }

    // Try to extract duration from multiple sources
    
    // Method 1: Look for duration in JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
    if (jsonLdMatch) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        if (jsonData.name) metadata.title = jsonData.name;
        if (jsonData.creator && jsonData.creator.name) metadata.artist = jsonData.creator.name;
        if (jsonData.image) metadata.image = jsonData.image;
        if (jsonData.duration) {
          // Parse ISO 8601 duration (PT3M45S format)
          const durationMatch = jsonData.duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
          if (durationMatch) {
            const minutes = parseInt(durationMatch[1] || '0');
            const seconds = parseInt(durationMatch[2] || '0');
            metadata.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }
        }
      } catch (e) {
        console.log('Could not parse JSON-LD data:', e.message);
      }
    }

    // Method 2: Look for duration in window.__data or other JS variables
    const windowDataMatch = html.match(/window\.__data\s*=\s*({.*?});/s);
    if (windowDataMatch && !metadata.duration) {
      try {
        const data = JSON.parse(windowDataMatch[1]);
        // Look for duration in various nested paths
        const findDuration = (obj, path = '') => {
          if (typeof obj !== 'object' || obj === null) return null;
          
          for (const [key, value] of Object.entries(obj)) {
            if (key === 'duration_ms' && typeof value === 'number') {
              return formatDuration(value);
            }
            if (key === 'duration' && typeof value === 'number') {
              return formatDuration(value);
            }
            if (typeof value === 'object') {
              const result = findDuration(value, `${path}.${key}`);
              if (result) return result;
            }
          }
          return null;
        };
        
        const duration = findDuration(data);
        if (duration) metadata.duration = duration;
      } catch (e) {
        console.log('Could not parse window.__data:', e.message);
      }
    }

    // Method 3: Look for duration in any JSON data blocks
    if (!metadata.duration) {
      const allJsonMatches = html.match(/"duration_ms":\s*(\d+)/g);
      if (allJsonMatches && allJsonMatches.length > 0) {
        const durationMs = parseInt(allJsonMatches[0].match(/(\d+)/)[1]);
        metadata.duration = formatDuration(durationMs);
      }
    }

    // Method 4: Look for time pattern in text (like "3:45")
    if (!metadata.duration) {
      const timePattern = /\b(\d{1,2}):(\d{2})\b/g;
      const timeMatches = [...html.matchAll(timePattern)];
      
      // Filter out obviously wrong times (like years or IDs)
      const validTimes = timeMatches.filter(match => {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        return minutes >= 0 && minutes <= 15 && seconds >= 0 && seconds <= 59;
      });
      
      if (validTimes.length > 0) {
        // Take the first reasonable time found
        const match = validTimes[0];
        metadata.duration = `${match[1]}:${match[2]}`;
      }
    }

    // Method 5: Look for duration in meta tags
    if (!metadata.duration) {
      const metaDurationMatch = html.match(/<meta[^>]*name="music:duration"[^>]*content="([^"]+)"/);
      if (metaDurationMatch) {
        const seconds = parseInt(metaDurationMatch[1]);
        if (!isNaN(seconds)) {
          metadata.duration = formatDuration(seconds * 1000);
        }
      }
    }

  } catch (error) {
    console.log('Error parsing HTML:', error.message);
  }

  return metadata;
}

async function fetchSpotifyMetadata(url) {
  // Validate URL format
  if (!isValidSpotifyTrackUrl(url)) {
    throw new Error('Invalid Spotify track URL format');
  }

  // Convert spotify: URI to https: URL if needed
  let httpUrl = url;
  if (url.startsWith('spotify:track:')) {
    const trackId = url.replace('spotify:track:', '');
    httpUrl = `https://open.spotify.com/track/${trackId}`;
  }

  try {
    console.log('Fetching HTML from:', httpUrl);
    
    // Fetch HTML content
    const html = await fetchHTML(httpUrl);
    
    // Parse metadata from HTML
    let metadata = parseSpotifyHTML(html);
    
    // If duration is still null, try to get it from Spotify's embed API
    if (!metadata.duration) {
      try {
        const trackId = httpUrl.match(/track\/([a-zA-Z0-9]+)/)?.[1];
        if (trackId) {
          const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
          console.log('Trying embed URL for duration:', embedUrl);
          
          const embedHtml = await fetchHTML(embedUrl);
          const embedMetadata = parseSpotifyHTML(embedHtml);
          
          if (embedMetadata.duration) {
            metadata.duration = embedMetadata.duration;
          }
        }
      } catch (embedError) {
        console.log('Could not fetch from embed URL:', embedError.message);
      }
    }
    
    // If still no duration, try a more aggressive search in the HTML
    if (!metadata.duration) {
      console.log('Trying aggressive duration search...');
      
      // Look for any patterns that might be duration
      const possibleDurations = [
        ...html.matchAll(/"duration[^"]*":\s*(\d+)/gi),
        ...html.matchAll(/duration[^:]*:\s*(\d+)/gi),
        ...html.matchAll(/(\d{1,2}):(\d{2})/g)
      ];
      
      for (const match of possibleDurations) {
        if (match[1] && match[2]) {
          // Format: MM:SS
          const minutes = parseInt(match[1]);
          const seconds = parseInt(match[2]);
          if (minutes >= 0 && minutes <= 15 && seconds >= 0 && seconds <= 59) {
            metadata.duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            console.log('Found duration from pattern:', metadata.duration);
            break;
          }
        } else if (match[1]) {
          // Might be milliseconds
          const ms = parseInt(match[1]);
          if (ms > 30000 && ms < 900000) { // Between 30 seconds and 15 minutes
            metadata.duration = formatDuration(ms);
            console.log('Found duration from ms:', metadata.duration);
            break;
          }
        }
      }
    }
    
    console.log('Final parsed metadata:', JSON.stringify(metadata, null, 2));

    return metadata;

  } catch (error) {
    // Re-throw with more context for different error types
    if (error.message.includes('Invalid Spotify track URL')) {
      throw error; // Already handled above
    } else if (error.message.includes('timeout') || error.message.includes('ENOTFOUND')) {
      throw new Error('Network error: Unable to fetch data from Spotify');
    } else if (error.message.includes('404')) {
      throw new Error('Track not found: The Spotify track may not exist or be unavailable');
    } else {
      throw new Error(`Failed to fetch Spotify metadata: ${error.message}`);
    }
  }
}

module.exports = {
  fetchSpotifyMetadata,
  isValidSpotifyTrackUrl,
  formatDuration,
  fetchSpotifyMetadataFlexible,
  resolveQueryToTrack,
  searchAlbumCovers,
  searchAlbumCoversStrict
};
