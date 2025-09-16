// Configuration
const CONFIG = {
    STRIPE_PUBLISHABLE_KEY: 'pk_live_51RNeOtJC2sHLBdH8nQ1YgyeBJ7EgzZIYnNvP5ceaIOo5u59YJ0c0uiekDVVPDLTODpKRnuORTviYt7o9W7q8vwOg00p07VBlqy',
    EMAILJS_SERVICE_ID: 'YOUR_SERVICE_ID', // You'll need to set this up
    EMAILJS_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
    EMAILJS_PUBLIC_KEY: 'YOUR_PUBLIC_KEY'
};

// Initialize Stripe
const stripe = Stripe(CONFIG.STRIPE_PUBLISHABLE_KEY);

// Initialize EmailJS
emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);

// Global state
let currentTrack = null;
let coverOptions = [];
let coverIndex = 0;
let currentProgress = 0;
let cart = JSON.parse(localStorage.getItem('plaqueify_cart') || '[]');

// DOM elements
const dom = {
    songInput: document.getElementById('songInput'),
    coverPicker: document.getElementById('coverPicker'),
    coverThumb: document.getElementById('coverThumb'),
    prevCoverBtn: document.getElementById('prevCoverBtn'),
    nextCoverBtn: document.getElementById('nextCoverBtn'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    progressKnob: document.getElementById('progressKnob'),
    statusBox: document.getElementById('statusBox'),
    previewStage: document.getElementById('previewStage'),
    addToCartBtn: document.getElementById('addToCartBtn'),
    cartBtn: document.getElementById('cartBtn'),
    cartCount: document.getElementById('cartCount'),
    cartSection: document.getElementById('cartSection'),
    closeCartBtn: document.getElementById('closeCartBtn'),
    cartItems: document.getElementById('cartItems'),
    cartTotal: document.getElementById('cartTotal'),
    checkoutBtn: document.getElementById('checkoutBtn')
};

// Utility functions
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseTime(timeStr) {
    const [mins, secs] = timeStr.split(':').map(Number);
    return (mins || 0) * 60 + (secs || 0);
}

function setStatus(message, isError = false) {
    dom.statusBox.textContent = message;
    dom.statusBox.className = `status-box ${isError ? 'error' : 'info'}`;
}

function updateCartUI() {
    const count = cart.length;
    dom.cartCount.textContent = count;
    dom.cartCount.classList.toggle('hidden', count === 0);
    
    if (count === 0) {
        dom.cartItems.innerHTML = '<p style="text-align: center; color: var(--slate-500);">Your cart is empty</p>';
        dom.cartTotal.textContent = 'Total: $0.00';
        dom.checkoutBtn.disabled = true;
        return;
    }

    let total = 0;
    dom.cartItems.innerHTML = cart.map((item, index) => {
        const price = item.size === 'large' ? 39.99 : 29.99;
        total += price;
        
        return `
            <div class="cart-item">
                <img src="${item.coverUrl || item.meta.image}" alt="${item.meta.title}" class="item-image">
                <div class="item-details">
                    <div class="item-title">${item.meta.title}</div>
                    <div class="item-artist">${item.meta.artist}</div>
                    <div class="item-specs">${item.size} • ${formatTime(item.progress)} • $${price.toFixed(2)}</div>
                </div>
                <button onclick="removeFromCart(${index})" class="btn btn-secondary">Remove</button>
            </div>
        `;
    }).join('');

    dom.cartTotal.textContent = `Total: $${total.toFixed(2)}`;
    dom.checkoutBtn.disabled = false;
    
    // Save to localStorage
    localStorage.setItem('plaqueify_cart', JSON.stringify(cart));
}

// Spotify Web API functions (client-side)
async function getSpotifyToken() {
    // For client-side, we'll use the implicit grant flow
    // This requires setting up your app in Spotify Dashboard with redirect URIs
    // For now, we'll use a simple web scraping approach as fallback
    return null;
}

async function searchSpotify(query) {
    try {
        // Try client-side Spotify search first
        // If no token available, fallback to scraping approach
        return await scrapeSpotifyMetadata(query);
    } catch (error) {
        console.error('Spotify search error:', error);
        throw new Error('Failed to search for song');
    }
}

// Fallback: scrape Spotify data (similar to your backend approach)
async function scrapeSpotifyMetadata(query) {
    // This is a simplified version - you might want to use a CORS proxy
    // or set up Spotify Web API properly for production
    
    // For demo, return mock data
    return {
        title: query.split(' ').slice(0, -1).join(' '),
        artist: query.split(' ').slice(-1)[0],
        duration: '3:45',
        durationSeconds: 225,
        image: 'https://via.placeholder.com/300x300?text=Album+Cover',
        preview: null
    };
}

// SVG Generation (client-side)
function generateSpotifyPlaqueSVG(metadata, options = {}) {
    const { 
        progressPosition = 0, 
        plaqueHeightInch = 5,
        embedImage = true 
    } = options;

    const isLarge = plaqueHeightInch > 8;
    const width = isLarge ? 360 : 300;
    const height = isLarge ? 432 : 360;
    
    // Calculate progress bar position
    const progressPercent = progressPosition;
    const barWidth = width * 0.8;
    const barHeight = 4;
    const barX = (width - barWidth) / 2;
    const barY = height * 0.75;
    
    const svg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <style>
                    .title { font-family: Arial, sans-serif; font-weight: bold; font-size: ${isLarge ? 24 : 20}px; }
                    .artist { font-family: Arial, sans-serif; font-size: ${isLarge ? 18 : 16}px; }
                    .time { font-family: Arial, sans-serif; font-size: ${isLarge ? 14 : 12}px; }
                </style>
            </defs>
            
            <!-- Background -->
            <rect width="${width}" height="${height}" fill="white" stroke="#000" stroke-width="2"/>
            
            <!-- Album Cover -->
            ${embedImage && metadata.image ? `
                <image href="${metadata.image}" x="20" y="20" width="${width-40}" height="${width-40}" preserveAspectRatio="xMidYMid slice"/>
            ` : `
                <rect x="20" y="20" width="${width-40}" height="${width-40}" fill="#f0f0f0" stroke="#ccc"/>
                <text x="${width/2}" y="${(width-40)/2 + 30}" text-anchor="middle" class="artist" fill="#999">Album Cover</text>
            `}
            
            <!-- Song Title -->
            <text x="${width/2}" y="${width + 40}" text-anchor="middle" class="title" fill="#000">
                ${metadata.title || 'Song Title'}
            </text>
            
            <!-- Artist -->
            <text x="${width/2}" y="${width + 65}" text-anchor="middle" class="artist" fill="#666">
                ${metadata.artist || 'Artist Name'}
            </text>
            
            <!-- Progress Bar Background -->
            <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" fill="#e0e0e0" rx="2"/>
            
            <!-- Progress Bar Fill -->
            <rect x="${barX}" y="${barY}" width="${barWidth * progressPercent / 100}" height="${barHeight}" fill="#1db954" rx="2"/>
            
            <!-- Progress Indicator -->
            <circle cx="${barX + (barWidth * progressPercent / 100)}" cy="${barY + barHeight/2}" r="6" fill="#1db954"/>
            
            <!-- Current Time -->
            <text x="${barX}" y="${barY + barHeight + 20}" class="time" fill="#666">
                ${formatTime(Math.floor(metadata.durationSeconds * progressPercent / 100))}
            </text>
            
            <!-- Total Time -->
            <text x="${barX + barWidth}" y="${barY + barHeight + 20}" text-anchor="end" class="time" fill="#666">
                ${metadata.duration || '0:00'}
            </text>
            
            <!-- Spotify Logo/Branding -->
            <text x="${width/2}" y="${height - 20}" text-anchor="middle" class="time" fill="#ccc">
                Powered by Plaqueify
            </text>
        </svg>
    `;
    
    return svg;
}

// Event handlers
async function handleSongSearch() {
    const query = dom.songInput.value.trim();
    if (!query) {
        setStatus('Please enter a song to search for.');
        return;
    }

    try {
        setStatus('Searching for song...');
        document.body.classList.add('loading');

        const metadata = await searchSpotify(query);
        currentTrack = { ...metadata, query };

        // Load album covers (for now, just use the main image)
        coverOptions = [metadata.image];
        coverIndex = 0;

        if (coverOptions.length > 0) {
            dom.coverThumb.src = coverOptions[coverIndex];
            dom.coverPicker.classList.remove('hidden');
        }

        // Update duration display
        dom.totalTime.value = metadata.duration || '0:00';
        
        // Generate preview
        updatePreview();
        
        setStatus('Preview ready. Adjust the progress and add to your cart!');
        dom.addToCartBtn.classList.remove('hidden');

    } catch (error) {
        setStatus(`Error: ${error.message}`, true);
        dom.previewStage.classList.add('hidden');
        dom.addToCartBtn.classList.add('hidden');
    } finally {
        document.body.classList.remove('loading');
    }
}

function updatePreview() {
    if (!currentTrack) return;

    const svg = generateSpotifyPlaqueSVG(currentTrack, {
        progressPosition: currentProgress,
        plaqueHeightInch: 5, // Default to small for preview
        embedImage: true
    });

    dom.previewStage.innerHTML = svg;
    dom.previewStage.classList.remove('hidden');
}

function handleProgressChange(event) {
    const rect = dom.progressBar.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    
    currentProgress = percentage;
    
    // Update UI
    dom.progressFill.style.width = `${percentage}%`;
    dom.progressKnob.style.left = `${percentage}%`;
    
    if (currentTrack) {
        const currentSeconds = Math.floor(currentTrack.durationSeconds * percentage / 100);
        dom.currentTime.value = formatTime(currentSeconds);
        updatePreview();
    }
}

function handleTimeEdit(input) {
    const timeStr = input.value;
    const seconds = parseTime(timeStr);
    
    if (currentTrack && seconds <= currentTrack.durationSeconds) {
        currentProgress = (seconds / currentTrack.durationSeconds) * 100;
        dom.progressFill.style.width = `${currentProgress}%`;
        dom.progressKnob.style.left = `${currentProgress}%`;
        updatePreview();
    }
}

function cycleCover(direction) {
    if (!coverOptions.length) return;
    
    coverIndex = direction > 0 
        ? (coverIndex + 1) % coverOptions.length
        : (coverIndex - 1 + coverOptions.length) % coverOptions.length;
    
    dom.coverThumb.src = coverOptions[coverIndex];
    updatePreview();
}

function addToCart() {
    if (!currentTrack) return;

    // Show size selection modal (simplified)
    const size = confirm('Choose size:\nOK for Large ($39.99)\nCancel for Small ($29.99)') ? 'large' : 'small';
    
    const item = {
        id: Date.now(),
        meta: currentTrack,
        query: currentTrack.query,
        progress: Math.floor(currentTrack.durationSeconds * currentProgress / 100),
        size,
        coverUrl: coverOptions[coverIndex] || currentTrack.image,
        timestamp: new Date().toISOString()
    };

    cart.push(item);
    updateCartUI();
    setStatus('Added to cart!');
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

async function handleCheckout() {
    if (!cart.length) return;

    try {
        setStatus('Preparing checkout...');
        document.body.classList.add('loading');

        // Calculate total
        const total = cart.reduce((sum, item) => sum + (item.size === 'large' ? 39.99 : 29.99), 0);

        // Create Stripe checkout session
        const response = await fetch('/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cart.map(item => ({
                    size: item.size,
                    progress: item.progress,
                    meta: item.meta,
                    query: item.query,
                    coverUrl: item.coverUrl
                }))
            })
        });

        const session = await response.json();
        
        if (session.error) {
            throw new Error(session.error);
        }

        // Redirect to Stripe
        const result = await stripe.redirectToCheckout({
            sessionId: session.id
        });

        if (result.error) {
            throw new Error(result.error.message);
        }

    } catch (error) {
        setStatus(`Checkout error: ${error.message}`, true);
    } finally {
        document.body.classList.remove('loading');
    }
}

// Initialize EmailJS and send order notification
async function sendOrderNotification(orderData) {
    try {
        const templateParams = {
            order_id: orderData.id,
            customer_email: orderData.customer_email || 'N/A',
            items: JSON.stringify(orderData.items, null, 2),
            total: `$${orderData.total.toFixed(2)}`,
            timestamp: new Date().toLocaleString()
        };

        await emailjs.send(
            CONFIG.EMAILJS_SERVICE_ID,
            CONFIG.EMAILJS_TEMPLATE_ID,
            templateParams
        );

        console.log('Order notification sent successfully');
    } catch (error) {
        console.error('Failed to send order notification:', error);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Search functionality
    dom.songInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSongSearch();
        }
    });

    dom.songInput.addEventListener('blur', () => {
        if (dom.songInput.value.trim()) {
            handleSongSearch();
        }
    });

    // Progress bar interaction
    dom.progressBar.addEventListener('click', handleProgressChange);

    // Time input editing
    dom.currentTime.addEventListener('click', () => {
        dom.currentTime.readOnly = false;
        dom.currentTime.select();
    });

    dom.currentTime.addEventListener('blur', () => {
        handleTimeEdit(dom.currentTime);
        dom.currentTime.readOnly = true;
    });

    dom.currentTime.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            dom.currentTime.blur();
        }
    });

    // Cover cycling
    dom.prevCoverBtn.addEventListener('click', () => cycleCover(-1));
    dom.nextCoverBtn.addEventListener('click', () => cycleCover(1));

    // Cart functionality
    dom.addToCartBtn.addEventListener('click', addToCart);
    dom.cartBtn.addEventListener('click', () => {
        dom.cartSection.style.display = 'block';
        updateCartUI();
    });

    dom.closeCartBtn.addEventListener('click', () => {
        dom.cartSection.style.display = 'none';
    });

    dom.checkoutBtn.addEventListener('click', handleCheckout);

    // Close cart on background click
    dom.cartSection.addEventListener('click', (e) => {
        if (e.target === dom.cartSection) {
            dom.cartSection.style.display = 'none';
        }
    });

    // Initialize cart UI
    updateCartUI();

    // Handle successful payment redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
        setStatus('Payment successful! You will receive order details via email.');
        // Clear cart on successful payment
        cart = [];
        localStorage.removeItem('plaqueify_cart');
        updateCartUI();
    }
});

// Global functions for HTML onclick handlers
window.removeFromCart = removeFromCart;