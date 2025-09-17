// Configuration
const CONFIG = {
    STRIPE_PUBLISHABLE_KEY: 'pk_live_51RNeOtJC2sHLBdH8nQ1YgyeBJ7EgzZIYnNvP5ceaIOo5u59YJ0c0uiekDVVPDLTODpKRnuORTviYt7o9W7q8vwOg00p07VBlqy',
    EMAILJS_SERVICE_ID: 'YOUR_SERVICE_ID',
    EMAILJS_TEMPLATE_ID: 'YOUR_TEMPLATE_ID', 
    EMAILJS_PUBLIC_KEY: 'YOUR_PUBLIC_KEY',
    SPOTIFY_CLIENT_ID: '362a6b4f86a34a8bb2cba6ec127d4a9b',
    SPOTIFY_CLIENT_SECRET: '078083103aa74598bf03b0eea14846e7'
};

const SPOTIFY_CONFIG = {
    CLIENT_ID: CONFIG.SPOTIFY_CLIENT_ID,
    // NOTE: Do NOT use CLIENT_SECRET in the browser. Kept here for historical reasons; unused below.
    CLIENT_SECRET: CONFIG.SPOTIFY_CLIENT_SECRET,
    API_BASE: 'https://api.spotify.com/v1',
    TOKEN_URL: 'https://accounts.spotify.com/api/token',
    AUTH_URL: 'https://accounts.spotify.com/authorize',
    SCOPES: ''
};

// Global state
let currentTrack = null;
let coverOptions = [];
let coverIndex = 0;
let currentProgress = 30; // Default 30% progress
let cart = JSON.parse(localStorage.getItem('plaqueify_cart') || '[]');
let totalDuration = 210; // Default song length in seconds
let spotifyAccessToken = localStorage.getItem('spotify_access_token') || null;
let spotifyTokenExpires = localStorage.getItem('spotify_token_expires') || 0;

// DOM elements
const elements = {
    songSearch: document.getElementById('songSearch'),
    albumCover: document.getElementById('albumCover'),
    songTitle: document.getElementById('songTitle'),
    artistName: document.getElementById('artistName'),
    albumName: document.getElementById('albumName'),
    progressTrack: document.getElementById('progressTrack'),
    progressFill: document.getElementById('progressFill'),
    progressHandle: document.getElementById('progressHandle'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    addToCartBtn: document.getElementById('addToCartBtn'),
    svgPreview: document.getElementById('svgPreview'),
    cartBadge: document.getElementById('cartBadge'),
    cartItems: document.getElementById('cartItems'),
    cartSummary: document.getElementById('cartSummary'),
    subtotal: document.getElementById('subtotal'),
    total: document.getElementById('total'),
    checkoutBtn: document.getElementById('checkoutBtn')
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    updateCartDisplay();
    setupEventListeners();
    handleSpotifyCallback();
    initializeSpotifyAuth();
});

function initializeApp() {
    // Initialize Stripe
    if (typeof Stripe !== 'undefined') {
        window.stripe = Stripe(CONFIG.STRIPE_PUBLISHABLE_KEY);
    }
    
    // Set initial time display
    elements.totalTime.textContent = formatTime(totalDuration);
    elements.currentTime.textContent = formatTime(Math.floor(totalDuration * currentProgress / 100));
    
    // Set initial progress
    updateProgressDisplay();
}

// Spotify Authentication
function initializeSpotifyAuth() {
    // Attempt background token fetch; if it fails, we'll fallback on demand
    if (!hasValidToken()) {
        getSpotifyToken();
    }
}

function getRedirectUri() {
    // Always use the canonical production domain for Spotify auth
    return 'https://plaqueify.me/';
}

function hasValidToken() {
    if (!spotifyAccessToken) return false;
    const exp = Number(localStorage.getItem('spotify_token_expires')) || 0;
    return Date.now() < exp;
}

function loginWithSpotify() {
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem('spotify_auth_state', state);
    const params = new URLSearchParams({
        client_id: SPOTIFY_CONFIG.CLIENT_ID,
        response_type: 'token',
        redirect_uri: getRedirectUri(),
        scope: SPOTIFY_CONFIG.SCOPES,
        state,
        show_dialog: 'false'
    });
    window.location.href = `${SPOTIFY_CONFIG.AUTH_URL}?${params.toString()}`;
}

function handleSpotifyCallback() {
    // Handle OAuth callback if present
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    const state = params.get('state');
    
    if (accessToken) {
        // Optional state validation
        const expected = sessionStorage.getItem('spotify_auth_state');
        if (expected && state && expected !== state) {
            console.warn('Spotify state mismatch; ignoring token');
            return;
        }
        spotifyAccessToken = accessToken;
        localStorage.setItem('spotify_access_token', accessToken);
        if (expiresIn) {
            spotifyTokenExpires = Date.now() + (parseInt(expiresIn, 10) * 1000) - 60000;
            localStorage.setItem('spotify_token_expires', spotifyTokenExpires);
        }
        sessionStorage.removeItem('spotify_auth_state');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Resume pending search if any
        const pending = sessionStorage.getItem('pending_search_query');
        if (pending) {
            sessionStorage.removeItem('pending_search_query');
            searchSpotify(pending);
        }
    }
}

function setupEventListeners() {
    // Search functionality
    elements.songSearch.addEventListener('input', debounce(handleSearch, 300));
    
    // Progress bar interaction
    elements.progressTrack.addEventListener('click', handleProgressClick);
    elements.progressHandle.addEventListener('mousedown', handleProgressDragStart);
    
    // Button events
    elements.addToCartBtn.addEventListener('click', addToCart);
    elements.checkoutBtn.addEventListener('click', handleCheckout);
}

// Search functionality
function handleSearch(e) {
    const query = e.target.value.trim();
    if (query.length < 2) return;
    searchSpotify(query);
}

async function searchSpotify(query) {
    try {
        // Show loading state
        elements.songTitle.textContent = 'Searching...';
        elements.artistName.textContent = 'Please wait...';
        elements.albumName.textContent = '';

        // Debug: show token status
        console.log('[Plaqueify] Token valid?', hasValidToken(), 'Token:', spotifyAccessToken);

        // Ensure we have a valid token; try client-credentials first, then fallback to implicit grant
        if (!hasValidToken()) {
            const ok = await getSpotifyToken();
            if (!ok) {
                // Persist query so we can resume after auth
                sessionStorage.setItem('pending_search_query', query);
                loginWithSpotify();
                return;
            }
        }

        // Make API call to Spotify
        let response = await fetch(`${SPOTIFY_CONFIG.API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
        });

        // Debug: log response status
        console.log('[Plaqueify] Spotify search response:', response.status);

        if (!response.ok) {
            if (response.status === 401) {
                // Token expired; refresh with client-credentials and retry once
                spotifyAccessToken = null;
                localStorage.removeItem('spotify_access_token');
                await getSpotifyToken();
                if (!hasValidToken()) {
                    showError('Spotify token expired and could not be refreshed. Please reload and try again.');
                    return fallbackSearch(query);
                }
                response = await fetch(`${SPOTIFY_CONFIG.API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
                    headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
                });
                if (!response.ok) throw new Error(`Spotify API error after refresh: ${response.status}`);
            }
            showError('Spotify API error: ' + response.status);
            return fallbackSearch(query);
        }

        const data = await response.json();
        console.log('[Plaqueify] Spotify search data:', data);

        if (data.tracks && data.tracks.items.length > 0) {
            // Use the first search result
            const track = data.tracks.items[0];
            selectTrack({
                id: track.id,
                name: track.name,
                artist: track.artists[0].name,
                album: track.album.name,
                duration: Math.floor(track.duration_ms / 1000),
                images: track.album.images,
                external_urls: track.external_urls
            });
        } else {
            // No results found
            showError('No results found for your search. Try a different song or artist.');
            elements.songTitle.textContent = 'No results found';
            elements.artistName.textContent = 'Try a different search term';
            elements.albumName.textContent = '';
        }

    } catch (error) {
        console.error('[Plaqueify] Spotify search error:', error);
        showError('A network or Spotify error occurred. Please try again.');
        // As a last resort, try demo fallback so the UI still works
        fallbackSearch(query);
    }
function showError(msg) {
    // Show error in UI and as notification
    showNotification(msg, 'error');
    // Optionally, could add a visible error div here
}
}

async function getSpotifyAccessToken() {
    // For compatibility: same as getSpotifyToken (client credentials)
    return getSpotifyToken();
}

function getSpotifyToken() {
    // Use Spotify's Client Credentials flow (EXPOSES SECRET; user accepts risk)
    const clientId = SPOTIFY_CONFIG.CLIENT_ID;
    const clientSecret = SPOTIFY_CONFIG.CLIENT_SECRET;
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    return fetch(SPOTIFY_CONFIG.TOKEN_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    })
    .then(res => res.json())
    .then(data => {
        if (data.access_token) {
            spotifyAccessToken = data.access_token;
            spotifyTokenExpires = Date.now() + (data.expires_in * 1000) - 60000; // 1 min early
            localStorage.setItem('spotify_access_token', spotifyAccessToken);
            localStorage.setItem('spotify_token_expires', spotifyTokenExpires);
            return true;
        }
        console.warn('Failed to get Spotify token.', data);
        return false;
    })
    .catch(err => {
        console.warn('Spotify token error (likely CORS in browser): ' + err);
        return false;
    });
}

function fallbackSearch(query) {
    // Enhanced fallback with more realistic search results based on query
    const fallbackResults = {
        'blinding lights': {
            id: 'track1',
            name: 'Blinding Lights',
            artist: 'The Weeknd',
            album: 'After Hours',
            duration: 200,
            images: [
                { url: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' }
            ],
            external_urls: { spotify: 'https://open.spotify.com/track/0VjIjW4GlULA8ooDgAKVfS' }
        },
        'shape of you': {
            id: 'track2',
            name: 'Shape of You',
            artist: 'Ed Sheeran',
            album: '÷ (Divide)',
            duration: 233,
            images: [
                { url: 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96' }
            ],
            external_urls: { spotify: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3' }
        },
        'bad guy': {
            id: 'track3',
            name: 'bad guy',
            artist: 'Billie Eilish',
            album: 'WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?',
            duration: 194,
            images: [
                { url: 'https://i.scdn.co/image/ab67616d0000b27350a3147b4edd7701a876c6ce' }
            ],
            external_urls: { spotify: 'https://open.spotify.com/track/2Fxmhks0bxGSBdJ92vM42m' }
        },
        'watermelon sugar': {
            id: 'track4',
            name: 'Watermelon Sugar',
            artist: 'Harry Styles',
            album: 'Fine Line',
            duration: 174,
            images: [
                { url: 'https://i.scdn.co/image/ab67616d0000b273277b3ff6dfa06e0a30f587aa' }
            ],
            external_urls: { spotify: 'https://open.spotify.com/track/6UelLqGlWMcVH1E5c4H7lY' }
        },
        'levitating': {
            id: 'track5',
            name: 'Levitating',
            artist: 'Dua Lipa',
            album: 'Future Nostalgia',
            duration: 203,
            images: [
                { url: 'https://i.scdn.co/image/ab67616d0000b273ef24c3fdbf9d4ab1e961c5b8' }
            ],
            external_urls: { spotify: 'https://open.spotify.com/track/463CkQjx2Zk1yXoBuierM9' }
        },
        'this love': {
            id: 'track6',
            name: 'This Love (Taylor\'s Version)',
            artist: 'Taylor Swift',
            album: 'Speak Now (Taylor\'s Version)',
            duration: 235,
            images: [
                { url: 'https://i.scdn.co/image/ab67616d0000b273bb54dde68cd23e2a268ae0f5' }
            ],
            external_urls: { spotify: 'https://open.spotify.com/track/1dGr1c8CrMLDpV6mPbImSI' }
        }
    };
    
    // Find best match
    const queryLower = query.toLowerCase();
    let bestMatch = null;
    
    // Direct match
    if (fallbackResults[queryLower]) {
        bestMatch = fallbackResults[queryLower];
    } else {
        // Partial match
        for (const key in fallbackResults) {
            if (key.includes(queryLower) || queryLower.includes(key)) {
                bestMatch = fallbackResults[key];
                break;
            }
        }
        
        // Artist match
        if (!bestMatch) {
            for (const key in fallbackResults) {
                const track = fallbackResults[key];
                if (track.artist.toLowerCase().includes(queryLower)) {
                    bestMatch = track;
                    break;
                }
            }
        }
    }
    
    if (bestMatch) {
        selectTrack(bestMatch);
    } else {
        // Default fallback
        elements.songTitle.textContent = 'Song not found in demo';
        elements.artistName.textContent = 'Try: "blinding lights", "shape of you", "bad guy", etc.';
        elements.albumName.textContent = '';
        
        // Reset album cover
        elements.albumCover.innerHTML = '<div class="album-placeholder">🎵</div>';
    }
}

function selectTrack(track) {
    // Defensive: ensure images[0] and external_urls exist for SVG
    if (!track.images || !Array.isArray(track.images) || !track.images[0] || !track.images[0].url) {
        track.images = [{ url: '' }];
    }
    if (!track.external_urls || !track.external_urls.spotify) {
        track.external_urls = { spotify: '' };
    }
    currentTrack = track;
    totalDuration = track.duration;

    // Update display
    elements.songTitle.textContent = track.name;
    elements.artistName.textContent = track.artist;
    elements.albumName.textContent = track.album;
    elements.totalTime.textContent = formatTime(track.duration);

    // Enable buttons
    elements.addToCartBtn.disabled = false;

    // Update both progress bar and SVG preview
    updateProgressAndSvg();
}

// Progress bar functionality
function handleProgressClick(e) {
    const rect = elements.progressTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;
    
    currentProgress = Math.max(0, Math.min(100, percentage));
    updateProgressAndSvg();
}

function handleProgressDragStart(e) {
    e.preventDefault();
    
    function handleMouseMove(e) {
        const rect = elements.progressTrack.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const percentage = (mouseX / rect.width) * 100;
        currentProgress = Math.max(0, Math.min(100, percentage));
        updateProgressAndSvg();
    }
// Update both the progress bar and SVG preview so they always match
function updateProgressAndSvg() {
    // Update progress bar
    const percentage = currentProgress;
    elements.progressFill.style.width = `${percentage}%`;
    elements.progressHandle.style.left = `${percentage}%`;
    const currentSeconds = Math.floor(totalDuration * percentage / 100);
    elements.currentTime.textContent = formatTime(currentSeconds);
    // Update SVG preview
    if (currentTrack) {
        const albumCoverUrl = (currentTrack.images && currentTrack.images[0] && currentTrack.images[0].url) ? currentTrack.images[0].url : '';
        const spotifyUrl = (currentTrack.external_urls && currentTrack.external_urls.spotify) ? currentTrack.external_urls.spotify : '';
        elements.albumCover.innerHTML = `
            <div class="svg-outline-wrapper">
                ${generateSpotifyPlaqueSVG({
                    songName: currentTrack.name,
                    artistName: currentTrack.artist,
                    albumName: currentTrack.album,
                    albumCover: albumCoverUrl,
                    spotifyUrl: spotifyUrl,
                    progress: currentProgress,
                    duration: totalDuration
                })}
            </div>
        `;
    }
}
    
    function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

function updateProgressDisplay() {
    // Deprecated: use updateProgressAndSvg instead
}

// SVG Generation
function generatePreview() {
    if (!currentTrack) return;
    
    const svg = generateSpotifyPlaqueSVG({
        songName: currentTrack.name,
        artistName: currentTrack.artist,
        albumName: currentTrack.album,
        albumCover: currentTrack.images[0].url,
        spotifyUrl: currentTrack.external_urls.spotify,
        progress: currentProgress,
        duration: totalDuration
    });
    
    elements.svgPreview.innerHTML = svg;
    elements.svgPreview.style.display = 'block';
}


function generateSpotifyPlaqueSVG(data) {
    // Map frontend data to backend-style metadata
    const metadata = {
        title: data.songName,
        artist: data.artistName,
        image: data.albumCover || '',
        duration: formatTime(data.duration)
    };
    // Use preview mode for client-side SVG
    const options = {
        progressPosition: (typeof data.progress === 'number' && data.duration) ? (data.progress / 100) : 0.4,
        embedImage: true,
        omitAlbum: false,
        isPreview: true
    };

    // --- SVG Plaque Template (from backend/src/svgGenerator.js, commit 7dd97d7...) ---
    // (This is a direct port, with only variable names adapted for frontend use)
    // --- Begin SVG Generation ---
    function escapeXML(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/[\u0080-\uFFFF]/g, function(match) {
                return '&#' + match.charCodeAt(0) + ';';
            });
    }

    const { progressPosition = 0.4, embedImage = false, omitAlbum = false, isPreview = false } = options;
    const title = escapeXML(metadata.title || 'Unknown Track');
    const artist = escapeXML(metadata.artist || 'Unknown Artist');
    const duration = metadata.duration || '0:00';

    // --- Color Palette ---
    const engraveFill = isPreview ? '#334155' : '#000000';
    const lightFill = isPreview ? '#FFFFFF' : '#FFFFFF';
    const plaqueFill = 'transparent';
    const plaqueStroke = isPreview ? 'transparent' : '#000000';
    const cutOutlineColor = isPreview ? 'transparent' : '#ff0000';

    // Time calculation based on progress
    const [m, s] = duration.split(':').map(Number);
    const total = (m || 0) * 60 + (s || 0);
    const current = Math.floor(total * progressPosition);
    const curM = Math.floor(current / 60);
    const curS = (current % 60).toString().padStart(2, '0');
    const currentTime = `${curM}:${curS}`;

    // Dimensions
    const borderWidth = 36;
    const originalWidth = 535.19;
    const originalHeight = 781.99;
    const totalWidth = originalWidth + (borderWidth * 2);
    const totalHeight = originalHeight + (borderWidth * 2);
    const cornerRadius = 30;

    // Album cover
    const albumX = 0;
    const albumY = 0;
    const albumW = originalWidth;
    const albumH = albumW;
    const albumBottom = albumY + albumH;
    const titleY = albumBottom + 10;
    const barY = albumBottom + 120;
    let TITLE_FONT_SIZE = 41;
    const ARTIST_FONT_SIZE = 24;
    const artistTopGap = 5;
    const barX = 0;
    const barWidth = originalWidth;
    const barHeight = 6.8;
    const rawFill = barWidth * progressPosition;
    const fillWidth = Math.max(0, Math.min(barWidth, rawFill));
    const knobRadius = 8.5;
    const knobX = Math.max(barX + knobRadius, Math.min(barX + barWidth - knobRadius, barX + fillWidth));
    const MAX_ARTIST = 60;
    const safeArtist = artist.length > MAX_ARTIST ? artist.substring(0, MAX_ARTIST - 1) + '…' : artist;
    const charFactor = (ch) => {
        if (/[_\-—–:+]/.test(ch)) return 0.50;
        if (/[ilI\'`\.,!]/.test(ch)) return 0.35;
        if (/[mwMW@#&%]/.test(ch)) return 0.85;
        if (/[A-Z]/.test(ch)) return 0.64;
        if (/[0-9]/.test(ch)) return 0.58;
        return 0.58;
    };
    const estimateWidth = (text, fontSize) => {
        return [...text].reduce((w, ch) => w + charFactor(ch) * fontSize, 0);
    };
    const HEART_SCALE = 2;
    const HEART_WIDTH_EST = (ARTIST_FONT_SIZE + 6) * 1.15 * HEART_SCALE;
    const HEART_RESERVE = Math.round(HEART_WIDTH_EST + 8);
    const MAX_TEXT_WIDTH = Math.max(180, barWidth - HEART_RESERVE);
    const LINE_GAP = 6;
    const EXTRA_ARTIST_GAP = 10;
    const ARTIST_BAR_MIN_GAP = 28;
    function splitToTwoLines(t, fontSize, maxWidth) {
        const words = t.split(/\s+/);
        let line1 = '';
        let line2 = '';
        for (let i = 0; i < words.length; i++) {
            const test = line1 ? line1 + ' ' + words[i] : words[i];
            if (estimateWidth(test, fontSize) <= maxWidth) {
                line1 = test;
            } else {
                line2 = words.slice(i).join(' ');
                break;
            }
        }
        if (!line2) return { lines: [t], twoLine: false };
        let l2 = line2;
        while (l2 && estimateWidth(l2, fontSize) > maxWidth) {
            const lastSpace = l2.lastIndexOf(' ');
            l2 = (lastSpace > 0 ? l2.slice(0, lastSpace) : l2.slice(0, -1)).trim();
        }
        if (l2 !== line2) l2 = (l2 || '').trim() + '…';
        if (!l2) {
            const l1Words = line1.split(' ');
            const moved = l1Words.pop();
            line1 = l1Words.join(' ');
            l2 = moved + '…';
        }
        return { lines: [line1, l2], twoLine: true };
    }
    const SAFE_PAD = 10;
    let titleFit = splitToTwoLines(title, TITLE_FONT_SIZE, MAX_TEXT_WIDTH);
    if (titleFit.twoLine) {
        TITLE_FONT_SIZE = Math.max(26, Math.round(TITLE_FONT_SIZE * 0.85));
        titleFit = splitToTwoLines(title, TITLE_FONT_SIZE, MAX_TEXT_WIDTH);
    }
    for (let i = 0; i < 10; i++) {
        const lines = titleFit.twoLine ? 2 : 1;
        const needed = (lines * TITLE_FONT_SIZE) + ((lines - 1) * LINE_GAP) + artistTopGap + ARTIST_FONT_SIZE;
        const available = barY - titleY - SAFE_PAD;
        if (needed <= available) break;
        TITLE_FONT_SIZE = Math.max(26, Math.floor(TITLE_FONT_SIZE * 0.92));
        titleFit = splitToTwoLines(title, TITLE_FONT_SIZE, MAX_TEXT_WIDTH);
    }
    const leftTimeX = barX;
    const rightTimeX = barX + barWidth;
    const textLeftX = barX;
    let timesY = barY + barHeight + 25;
    const computedArtistY = titleFit.twoLine
        ? (titleY + TITLE_FONT_SIZE + LINE_GAP + TITLE_FONT_SIZE + artistTopGap + EXTRA_ARTIST_GAP)
        : (titleY + TITLE_FONT_SIZE + artistTopGap);
    const artistBottom = computedArtistY + ARTIST_FONT_SIZE;
    const finalBarY = Math.max(barY, artistBottom + ARTIST_BAR_MIN_GAP);
    timesY = finalBarY + barHeight + 25;
    const blockTop = titleY;
    const blockBottom = artistBottom;
    const heartCenterY = (blockTop + blockBottom) / 2;
    const heartH = (ARTIST_FONT_SIZE + 6) * HEART_SCALE;
    const heartW = heartH * 1.15;
    const heartRightX = barX + barWidth;
    const heartX = heartRightX - heartW;
    const heartY = heartCenterY - heartH / 2;
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <defs>
    <style>
      .cls-1 { fill: ${plaqueFill}; stroke-width: .4px; stroke: ${plaqueStroke}; stroke-miterlimit:10; }
      .light-fill { fill:${lightFill}; stroke:none; }
      .engrave { fill:${engraveFill}; stroke:none; }
      .cut-outline { fill:none; stroke:${cutOutlineColor}; stroke-width:0.1mm; }
      .dyn-text { fill:${engraveFill}; stroke:none; font-family: Arial, sans-serif; }
      .dyn-title { font-size:${TITLE_FONT_SIZE}px; font-weight:900; font-family:'Arial Black','Helvetica Neue',Arial,sans-serif; letter-spacing:-1px; font-stretch:condensed; }
      .dyn-artist { font-size:${ARTIST_FONT_SIZE}px; font-weight:600; font-family:Arial,'Helvetica Neue',Arial,sans-serif; letter-spacing:0; }
      .score { fill:none; stroke:${engraveFill}; stroke-width:0.1mm; stroke-linecap:round; }
      .dyn-time { fill:${engraveFill}; font-size:20px; font-weight:500; font-family:Arial,'Helvetica Neue',Arial,sans-serif; text-anchor:start; letter-spacing:0; }
      .dyn-time-end { text-anchor:end; }
    </style>
  </defs>

  <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" 
        rx="${cornerRadius}" ry="${cornerRadius}" class="cut-outline"/>

  <g transform="translate(${borderWidth}, ${borderWidth})">
  <g transform="translate(0, 20)">
    <g transform="translate(65.6475, 180.3725) scale(0.75)">
      <circle class="engrave" cx="262.59" cy="721.49" r="60"/>
      <path class="light-fill" d="M287.71,718.9l-39.46-22.78c-2-1.15-4.5.29-4.5,2.6v45.57c0,2.31,2.5,3.75,4.5,2.6l39.46-22.78c2-1.15,2-4.04,0-5.2Z"/>
    </g>
  <path class="engrave" d="M416.92,698.86v19.16l-32.57-18.81c-1.75-1.01-3.95.25-3.95,2.28v39.99c0,2.03,2.19,3.29,3.95,2.28l32.57-18.81v19.16h6v-45.26h-6Z"/>
  <path class="engrave" d="M108.25,698.86v19.16s32.57-18.81,32.57-18.81c1.75-1.01,3.95.25,3.95,2.28v39.99c0,2.03-2.19,3.29-3.95,2.28l-32.57-18.81v19.16h-6v-45.26h6Z"/>
  <path class="engrave" d="M34.86,697.63c.56,0,1.04.2,1.45.6l8.13,8.13c.39.39.59.87.59,1.43s-.2,1.05-.59,1.45l-8.13,8.13c-.39.39-.87.59-1.45.59s-1.04-.2-1.44-.6-.6-.88-.6-1.44.2-1.02.59-1.43l4.67-4.67h-3.22c-1.91,0-3.7.42-5.37,1.25s-3.08,1.97-4.21,3.41c-1.75,2.22-2.62,4.74-2.62,7.54s-.68,5.45-2.03,7.88c-.72,1.3-1.59,2.47-2.62,3.51-1.5,1.54-3.26,2.73-5.26,3.59-2,.86-4.12,1.29-6.35,1.29H2.33c-.56,0-1.04-.2-1.44-.6-.4-.4-.6-.88-.6-1.44,0-.56.2-1.04.6-1.44.4-.4.88-.6,1.44-.6h4.07c1.92,0,3.71-.41,5.38-1.24s3.07-1.96,4.2-3.4c1.75-2.22,2.62-4.74,2.62-7.56s.68-5.45,2.03-7.88c.73-1.31,1.6-2.48,2.62-3.49,1.5-1.54,3.26-2.73,5.26-3.6s4.12-1.29,6.35-1.29h3.22l-4.67-4.65c-.39-.41-.59-.89-.59-1.45s.2-1.04.6-1.44c.4-.4.88-.6,1.44-.6h0ZM34.86,726.09c.56,0,1.04.2,1.45.6l8.13,8.13c.39.39.59.87.59,1.45s-.2,1.04-.59,1.43l-8.13,8.13c-.39.39-.87.59-1.45.59s-1.04-.2-1.44-.59c-.4-.39-.6-.87-.6-1.43s.2-1.03.59-1.45l4.67-4.67h-3.22c-2.23,0-4.35-.43-6.35-1.29s-3.75-2.05-5.26-3.59c.82-1.2,1.49-2.47,2.03-3.83,1.13,1.44,2.53,2.57,4.2,3.4,1.67.83,3.46,1.24,5.38,1.24h3.22l-4.67-4.65c-.39-.41-.59-.89-.59-1.45,0-.56.2-1.04.6-1.44s.88-.6,1.44-.6h0ZM2.33,705.76h4.07c2.23,0,4.35.43,6.35,1.29,2,.86,3.75,2.06,5.26,3.6-.83,1.22-1.5,2.49-2.03,3.83-1.13-1.44-2.54-2.58-4.21-3.41-1.67-.83-3.46-1.25-5.37-1.25H2.33c-.56,0-1.04-.2-1.44-.6-.4-.4-.6-.88-.6-1.44,0-.56.2-1.04.6-1.44.4-.4.88-.6,1.44-.6h0Z"/>
  <path class="engrave" d="M532.33,713.03c-1.4,0-2.55,1.15-2.55,2.55v5.92c0,5.6-4.54,10.16-10.16,10.16h-20.94l1.58-1.58c.46-.46.73-1.1.73-1.79,0-1.4-1.15-2.55-2.55-2.55-.71,0-1.33.28-1.79.76l-5.92,5.92c-.46.46-.73,1.1-.73,1.79s.28,1.33.73,1.79l5.96,5.92c.46.46,1.1.73,1.79.73,1.4,0,2.55-1.15,2.55-2.55,0-.71-.28-1.33-.73-1.79l-1.58-1.58h20.94c8.42,0,15.23-6.81,15.23-15.23v-5.92c-.02-1.4-1.17-2.55-2.57-2.55ZM512.88,711.36h4.01l-1.58,1.58c-.46.46-.76,1.1-.76,1.79,0,1.4,1.15,2.55,2.55,2.55.71,0,1.33-.28,1.79-.76l5.92-5.92c.46-.46.76-1.1.76-1.79s-.28-1.33-.73-1.79l-5.92-5.94c-.46-.46-1.1-.73-1.79-.73-1.4,0-2.55,1.15-2.55,2.55,0,.71.28,1.33.76,1.79l1.58,1.58h-20.94c-8.42,0-15.23,6.81-15.23,15.23v5.92c0,1.4,1.15,2.55,2.55,2.55s2.55-1.15,2.55-2.55v-5.92c0-5.6,4.54-10.16,10.16-10.16l16.88.02h0Z"/>
  </g>

  <rect class="engrave" x="${barX}" y="${finalBarY}" width="${barWidth}" height="${barHeight}" rx="1" ry="1" />
  <circle class="engrave" cx="${knobX}" cy="${finalBarY + barHeight/2}" r="${knobRadius}" />

  ${omitAlbum
        ? (()=>{
            const corner = (x,y,dx,dy,len)=>`<path class="score" d="M${x} ${y} l${dx*len} 0 M${x} ${y} l0 ${dy*len}"/>`;
            const len = Math.max(8, Math.min(28, Math.round(albumW * 0.035)));
            const tl = corner(albumX, albumY, 1, 1, len);
            const tr = corner(albumX+albumW, albumY, -1, 1, len);
            const bl = corner(albumX, albumY+albumH, 1, -1, len);
            const br = corner(albumX+albumW, albumY+albumH, -1, -1, len);
            return tl+tr+bl+br;
        })()
        : (embedImage && metadata.image
            ? `<image x="${albumX}" y="${albumY}" width="${albumW}" height="${albumH}" href="${metadata.image}" preserveAspectRatio="xMidYMid slice" />`
            : `<rect class="cls-1" x="${albumX}" y="${albumY}" width="${albumW}" height="${albumH}"/>`)}

  <g class="engrave" transform="translate(${heartX}, ${heartY})">
    ${(()=>{
      const w = heartW, h = heartH;
      const sx = w/24, sy = h/22;
      const d = [
        `M ${sx*12} ${sy*21}`,
        `C ${sx*5} ${sy*16} ${sx*2} ${sy*13} ${sx*2} ${sy*9}`,
        `C ${sx*2} ${sy*6} ${sx*4.5} ${sy*4} ${sx*7} ${sy*4}`,
        `C ${sx*9} ${sy*4} ${sx*10.5} ${sy*5.5} ${sx*12} ${sy*7}`,
        `C ${sx*13.5} ${sy*5.5} ${sx*15} ${sy*4} ${sx*17} ${sy*4}`,
        `C ${sx*19.5} ${sy*4} ${sx*22} ${sy*6} ${sx*22} ${sy*9}`,
        `C ${sx*22} ${sy*13} ${sx*19} ${sy*16} ${sx*12} ${sy*21}`,
        'Z'
      ].join(' ');
      return `<path d="${d}" />`;
    })()}
  </g>

  ${titleFit.twoLine
        ? `<text x="${textLeftX}" y="${titleY}" dominant-baseline="hanging" class="dyn-text dyn-title" text-anchor="start">
             <tspan x="${textLeftX}" dy="0">${escapeXML(titleFit.lines[0])}</tspan>
             <tspan x="${textLeftX}" dy="${LINE_GAP + TITLE_FONT_SIZE}">${escapeXML(titleFit.lines[1])}</tspan>
           </text>`
        : `<text x="${textLeftX}" y="${titleY}" dominant-baseline="hanging" class="dyn-text dyn-title" text-anchor="start">${escapeXML(titleFit.lines[0])}</text>`}
  <text x="${textLeftX}" y="${computedArtistY}" dominant-baseline="hanging" class="dyn-text dyn-artist" text-anchor="start">${safeArtist}</text>

  <text x="${leftTimeX}" y="${timesY}" class="dyn-time" text-anchor="start">${currentTime}</text>
  <text x="${rightTimeX}" y="${timesY}" class="dyn-time dyn-time-end">${duration}</text>
  </g>
</svg>`;
    return svgContent;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Cart functionality
function addToCart() {
    if (!currentTrack) return;
    
    const cartItem = {
        id: Date.now(),
        track: currentTrack,
        progress: currentProgress,
        price: 24.99
    };
    
    cart.push(cartItem);
    saveCart();
    updateCartDisplay();
    
    // Show success message
    showNotification('Added to cart!', 'success');
}

function removeFromCart(itemId) {
    cart = cart.filter(item => item.id !== itemId);
    saveCart();
    updateCartDisplay();
}

function updateCartDisplay() {
    elements.cartBadge.textContent = cart.length;
    
    if (cart.length === 0) {
        elements.cartItems.innerHTML = `
            <div class="empty-cart">
                <div class="icon">🛒</div>
                <p>Your cart is empty</p>
                <p style="font-size: 0.9rem; margin-top: 0.5rem;">Add some plaques to get started!</p>
            </div>
        `;
        elements.cartSummary.style.display = 'none';
        return;
    }
    
    // Render cart items
    elements.cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-image">
                <img src="${item.track.images[0].url}" alt="${item.track.album}">
            </div>
            <div class="cart-item-info">
                <div class="cart-item-title">${item.track.name}</div>
                <div class="cart-item-artist">${item.track.artist}</div>
            </div>
            <div class="cart-item-price">$${item.price.toFixed(2)}</div>
            <button class="remove-item" onclick="removeFromCart(${item.id})">×</button>
        </div>
    `).join('');
    
    // Update summary
    const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
    const total = subtotal + 4.99; // Shipping
    
    elements.subtotal.textContent = `$${subtotal.toFixed(2)}`;
    elements.total.textContent = `$${total.toFixed(2)}`;
    elements.cartSummary.style.display = 'block';
}

function saveCart() {
    localStorage.setItem('plaqueify_cart', JSON.stringify(cart));
}

// Checkout
async function handleCheckout() {
    if (cart.length === 0) return;
    try {
        // Create checkout session
        const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cart.map(item => ({
                    meta: {
                        title: item.track.name,
                        artist: item.track.artist,
                        image: item.track.images[0].url,
                        duration: item.track.duration || totalDuration
                    },
                    progress: item.progress,
                    size: 'small', // or 'large' if you support multiple sizes
                    coverUrl: item.track.images[0].url
                }))
            })
        });
        const session = await response.json();
        if (!session.id) throw new Error(session.error || 'No session ID returned');
        // Redirect to Stripe Checkout
        const { error } = await stripe.redirectToCheckout({
            sessionId: session.id
        });
        if (error) {
            console.error('Stripe error:', error);
            showNotification('Checkout failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        showNotification('Checkout failed. Please try again.', 'error');
    }
}

async function sendOrderEmail() {
    // Placeholder for EmailJS integration
    console.log('Sending order email...', cart);
    
    // Clear cart after successful order
    cart = [];
    saveCart();
    updateCartDisplay();
    
    showNotification('Order placed! Check your email for details.', 'success');
}

// Utility functions
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#1DB954' : type === 'error' ? '#ff4757' : '#333'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 10000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after delay
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Make removeFromCart globally accessible
window.removeFromCart = removeFromCart;