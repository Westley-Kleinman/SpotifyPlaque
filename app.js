// Configuration
const CONFIG = {
    STRIPE_PUBLISHABLE_KEY: 'pk_live_51RNeOtJC2sHLBdH8nQ1YgyeBJ7EgzZIYnNvP5ceaIOo5u59YJ0c0uiekDVVPDLTODpKRnuORTviYt7o9W7q8vwOg00p07VBlqy',
    EMAILJS_SERVICE_ID: 'YOUR_SERVICE_ID',
    EMAILJS_TEMPLATE_ID: 'YOUR_TEMPLATE_ID', 
    EMAILJS_PUBLIC_KEY: 'YOUR_PUBLIC_KEY',
    SPOTIFY_CLIENT_ID: 'YOUR_SPOTIFY_CLIENT_ID'
};

// Global state
let currentTrack = null;
let coverOptions = [];
let coverIndex = 0;
let currentProgress = 30; // Default 30% progress
let cart = JSON.parse(localStorage.getItem('plaqueify_cart') || '[]');
let totalDuration = 210; // Default song length in seconds

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

function setupEventListeners() {
    // Search functionality
    elements.songSearch.addEventListener('input', debounce(handleSearch, 300));
    
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
    // For now, using mock data - replace with real Spotify API
    const mockResults = [
        {
            id: 'mock1',
            name: 'Blinding Lights',
            artist: 'The Weeknd',
            album: 'After Hours',
            duration: 200,
            images: [
                { url: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' }
            ],
            external_urls: { spotify: 'https://open.spotify.com/track/0VjIjW4GlULA8ooDgAKVfS' }
        },
        {
            id: 'mock2', 
            name: 'Shape of You',
            artist: 'Ed Sheeran',
            album: '÷ (Divide)',
            duration: 233,
            images: [
                { url: 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96' }
            ],
            external_urls: { spotify: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3' }
        }
    ];

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // For demo purposes, select first result
    if (mockResults.length > 0) {
        selectTrack(mockResults[0]);
    }
}

function selectTrack(track) {
    currentTrack = track;
    totalDuration = track.duration;
    
    // Update display
    elements.songTitle.textContent = track.name;
    elements.artistName.textContent = track.artist;
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
    
    return `
    <svg width="400" height="600" viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="400" height="600" fill="#000000" rx="20"/>
        
        <!-- Album Cover -->
        <foreignObject x="50" y="50" width="300" height="300">
            <img src="${data.albumCover}" width="300" height="300" style="border-radius: 15px; object-fit: cover;" />
        </foreignObject>
        
        <!-- Song Title -->
        <text x="200" y="390" text-anchor="middle" fill="#FFFFFF" font-family="Arial, sans-serif" font-size="24" font-weight="bold">
            ${data.songName.length > 20 ? data.songName.substring(0, 20) + '...' : data.songName}
        </text>
        
        <!-- Artist Name -->
        <text x="200" y="420" text-anchor="middle" fill="#B3B3B3" font-family="Arial, sans-serif" font-size="18">
            ${data.artistName.length > 25 ? data.artistName.substring(0, 25) + '...' : data.artistName}
        </text>
        
        <!-- Album Name -->
        <text x="200" y="445" text-anchor="middle" fill="#888888" font-family="Arial, sans-serif" font-size="14" font-style="italic">
            ${data.albumName.length > 30 ? data.albumName.substring(0, 30) + '...' : data.albumName}
        </text>
        
        <!-- Progress Bar -->
        <rect x="50" y="480" width="300" height="4" fill="#333333" rx="2"/>
        <rect x="50" y="480" width="${300 * data.progress / 100}" height="4" fill="#1DB954" rx="2"/>
        
        <!-- Time Display -->
        <text x="50" y="505" fill="#B3B3B3" font-family="Arial, sans-serif" font-size="12">
            ${formatTime(currentTime)}
        </text>
        <text x="350" y="505" text-anchor="end" fill="#B3B3B3" font-family="Arial, sans-serif" font-size="12">
            ${formatTime(totalTime)}
        </text>
        
        <!-- Spotify Logo & QR Code -->
        <circle cx="80" cy="540" r="20" fill="#1DB954"/>
        <text x="80" y="547" text-anchor="middle" fill="#000000" font-family="Arial, sans-serif" font-size="16" font-weight="bold">♫</text>
        
        <!-- QR Code Placeholder -->
        <rect x="280" y="520" width="70" height="70" fill="#FFFFFF" stroke="#000000" stroke-width="2" rx="5"/>
        <text x="315" y="560" text-anchor="middle" fill="#000000" font-family="Arial, sans-serif" font-size="10">QR CODE</text>
        
        <!-- Spotify URL -->
        <text x="200" y="580" text-anchor="middle" fill="#1DB954" font-family="Arial, sans-serif" font-size="10" text-decoration="underline">
            Listen on Spotify
        </text>
    </svg>`;
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