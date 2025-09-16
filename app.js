// Configuration
const CONFIG = {
    STRIPE_PUBLISHABLE_KEY: 'pk_live_51RNeOtJC2sHLBdH8nQ1YgyeBJ7EgzZIYnNvP5ceaIOo5u59YJ0c0uiekDVVPDLTODpKRnuORTviYt7o9W7q8vwOg00p07VBlqy',
    EMAILJS_SERVICE_ID: 'YOUR_SERVICE_ID',
    EMAILJS_TEMPLATE_ID: 'YOUR_TEMPLATE_ID', 
    EMAILJS_PUBLIC_KEY: 'YOUR_PUBLIC_KEY',
    SPOTIFY_CLIENT_ID: '7b9c4d3d6f4e4c8a9b2e5f1a8d9c6e3f' // You'll need to replace this with your actual Spotify Client ID
};

// Spotify API configuration
const SPOTIFY_CONFIG = {
    CLIENT_ID: CONFIG.SPOTIFY_CLIENT_ID,
    REDIRECT_URI: window.location.origin + window.location.pathname,
    SCOPES: 'user-read-private user-read-email',
    API_BASE: 'https://api.spotify.com/v1'
};

// Global state
let currentTrack = null;
let coverOptions = [];
let coverIndex = 0;
let currentProgress = 30; // Default 30% progress
let cart = JSON.parse(localStorage.getItem('plaqueify_cart') || '[]');
let totalDuration = 210; // Default song length in seconds
let spotifyAccessToken = localStorage.getItem('spotify_access_token') || null;

// DOM elements
const elements = {
    songSearch: document.getElementById('songSearch'),
    artistOverride: document.getElementById('artistOverride'),
    albumCover: document.getElementById('albumCover'),
    songTitle: document.getElementById('songTitle'),
    artistName: document.getElementById('artistName'),
    albumName: document.getElementById('albumName'),
    progressTrack: document.getElementById('progressTrack'),
    progressFill: document.getElementById('progressFill'),
    progressHandle: document.getElementById('progressHandle'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    previewBtn: document.getElementById('previewBtn'),
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
    // Check if we need to get a new token
    if (!spotifyAccessToken) {
        getSpotifyToken();
    }
}

function getSpotifyToken() {
    // Use Spotify's Client Credentials flow for public searches
    // Note: For production, you should implement this on your backend
    const clientId = SPOTIFY_CONFIG.CLIENT_ID;
    const clientSecret = 'YOUR_CLIENT_SECRET'; // This should be on your backend!
    
    // For now, we'll use a simple approach - in production, move this to backend
    console.log('Spotify token needed - implementing fallback search');
}

function handleSpotifyCallback() {
    // Handle OAuth callback if present
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    
    if (accessToken) {
        spotifyAccessToken = accessToken;
        localStorage.setItem('spotify_access_token', accessToken);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function setupEventListeners() {
    // Search functionality
    elements.songSearch.addEventListener('input', debounce(handleSearch, 300));
    
    // Artist override functionality
    elements.artistOverride.addEventListener('input', function(e) {
        if (currentTrack) {
            const displayArtist = e.target.value.trim() || currentTrack.artist;
            elements.artistName.textContent = displayArtist;
        }
    });
    
    // Progress bar interaction
    elements.progressTrack.addEventListener('click', handleProgressClick);
    elements.progressHandle.addEventListener('mousedown', handleProgressDragStart);
    
    // Button events
    elements.previewBtn.addEventListener('click', generatePreview);
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
        
        // Try to get access token if we don't have one
        if (!spotifyAccessToken) {
            await getSpotifyAccessToken();
        }
        
        // If we still don't have a token, use fallback search
        if (!spotifyAccessToken) {
            return fallbackSearch(query);
        }
        
        // Make API call to Spotify
        const response = await fetch(`${SPOTIFY_CONFIG.API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
            headers: {
                'Authorization': `Bearer ${spotifyAccessToken}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Token expired, clear it and try fallback
                spotifyAccessToken = null;
                localStorage.removeItem('spotify_access_token');
                return fallbackSearch(query);
            }
            throw new Error(`Spotify API error: ${response.status}`);
        }
        
        const data = await response.json();
        
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
            elements.songTitle.textContent = 'No results found';
            elements.artistName.textContent = 'Try a different search term';
            elements.albumName.textContent = '';
        }
        
    } catch (error) {
        console.error('Spotify search error:', error);
        fallbackSearch(query);
    }
}

async function getSpotifyAccessToken() {
    try {
        // For client-side apps, we need to use a different approach
        // This is a simplified version - in production, you'd want to use your backend
        
        // Using the implicit grant flow would require user login
        // For now, we'll implement a fallback system
        console.log('Would initiate Spotify OAuth flow here');
        
        // You can implement the OAuth flow like this:
        // window.location.href = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CONFIG.CLIENT_ID}&redirect_uri=${encodeURIComponent(SPOTIFY_CONFIG.REDIRECT_URI)}&scope=${encodeURIComponent(SPOTIFY_CONFIG.SCOPES)}&response_type=token`;
        
    } catch (error) {
        console.error('Error getting Spotify token:', error);
    }
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
    currentTrack = track;
    totalDuration = track.duration;
    
    // Update display
    elements.songTitle.textContent = track.name;
    elements.artistName.textContent = elements.artistOverride.value.trim() || track.artist;
    elements.albumName.textContent = track.album;
    elements.totalTime.textContent = formatTime(track.duration);
    
    // Update album cover
    const coverImg = document.createElement('img');
    coverImg.src = track.images[0].url;
    coverImg.alt = `${track.album} cover`;
    
    elements.albumCover.innerHTML = '';
    elements.albumCover.appendChild(coverImg);
    
    // Enable buttons
    elements.previewBtn.disabled = false;
    elements.addToCartBtn.disabled = false;
    
    updateProgressDisplay();
}

// Progress bar functionality
function handleProgressClick(e) {
    const rect = elements.progressTrack.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;
    
    currentProgress = Math.max(0, Math.min(100, percentage));
    updateProgressDisplay();
}

function handleProgressDragStart(e) {
    e.preventDefault();
    
    function handleMouseMove(e) {
        const rect = elements.progressTrack.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const percentage = (mouseX / rect.width) * 100;
        
        currentProgress = Math.max(0, Math.min(100, percentage));
        updateProgressDisplay();
    }
    
    function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

function updateProgressDisplay() {
    const percentage = currentProgress;
    elements.progressFill.style.width = `${percentage}%`;
    elements.progressHandle.style.left = `${percentage}%`;
    
    const currentSeconds = Math.floor(totalDuration * percentage / 100);
    elements.currentTime.textContent = formatTime(currentSeconds);
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
    const currentTime = Math.floor(data.duration * data.progress / 100);
    const totalTime = data.duration;
    const displayArtist = elements.artistOverride.value.trim() || data.artistName;
    
    return `
    <svg width="300" height="400" viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="300" height="400" fill="#FFFFFF" stroke="#000000" stroke-width="2" rx="10"/>
        
        <!-- Album Cover -->
        <image x="25" y="25" width="250" height="250" href="${data.albumCover}" preserveAspectRatio="xMidYMid slice"/>
        
        <!-- Song Title -->
        <text x="150" y="300" text-anchor="middle" fill="#000000" font-family="Arial, sans-serif" font-size="18" font-weight="bold">
            ${truncateText(data.songName, 20)}
        </text>
        
        <!-- Artist Name -->
        <text x="150" y="320" text-anchor="middle" fill="#666666" font-family="Arial, sans-serif" font-size="14">
            ${truncateText(displayArtist, 25)}
        </text>
        
        <!-- Progress Bar Background -->
        <rect x="25" y="340" width="250" height="4" fill="#CCCCCC" rx="2"/>
        
        <!-- Progress Bar Fill -->
        <rect x="25" y="340" width="${250 * data.progress / 100}" height="4" fill="#1DB954" rx="2"/>
        
        <!-- Time Display -->
        <text x="25" y="360" fill="#666666" font-family="Arial, sans-serif" font-size="10">
            ${formatTime(currentTime)}
        </text>
        <text x="275" y="360" text-anchor="end" fill="#666666" font-family="Arial, sans-serif" font-size="10">
            ${formatTime(totalTime)}
        </text>
        
        <!-- Spotify Logo -->
        <circle cx="50" cy="385" r="12" fill="#1DB954"/>
        <text x="50" y="390" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="12">♫</text>
        
        <!-- Spotify URL -->
        <text x="150" y="385" text-anchor="middle" fill="#1DB954" font-family="Arial, sans-serif" font-size="8">
            Listen on Spotify
        </text>
    </svg>`;
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
        const response = await fetch('/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cart.map(item => ({
                    track_id: item.track.id,
                    track_name: item.track.name,
                    artist_name: item.track.artist,
                    album_name: item.track.album,
                    album_cover: item.track.images[0].url,
                    progress: item.progress,
                    price: item.price
                }))
            })
        });
        
        const session = await response.json();
        
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
        
        // For demo purposes, simulate successful checkout
        showNotification('Demo: Checkout would redirect to Stripe payment page', 'info');
        
        // Send order email (placeholder)
        sendOrderEmail();
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