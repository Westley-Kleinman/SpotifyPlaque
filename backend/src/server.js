/**
 * Spotify Plaque Backend Server
 * 
 * Express.js server providing API endpoints for Spotify metadata fetching.
 * Main endpoint: POST /api/spotify-metadata
 */

require('dotenv').config();
const express = require('express');
const path = require('path');

// Check if Stripe keys are available
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY not found in environment variables');
  console.warn('⚠️  Stripe functionality will be disabled');
}

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const { fetchSpotifyMetadata, fetchSpotifyMetadataFlexible } = require('./spotifyMetadata');
const { generateSpotifyPlaqueSVG, generateDetailedPlaqueSVG } = require('./svgGenerator');
const { products, discounts } = require('./products');

const app = express();
// Allow port override by CLI arg: `node src/server.js 3010`
const PORT = process.env.PORT || process.argv[2] || 3001;

// Middleware
app.use(express.json({ limit: '10mb' }));
// basic in-memory order store (ephemeral)
const orders = [];

// Static frontend (serve index.html UI for testing at http://localhost:PORT/)
const frontendDir = path.join(__dirname, '../../frontend');
console.log('🖥️  Serving frontend from:', frontendDir);
app.use(express.static(frontendDir));
// Explicit root route to guarantee index.html delivery
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// CORS middleware for development (adjust origins for production)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'spotify-plaque-backend'
  });
});

// Simple version / uptime endpoint for deployment verification
app.get('/api/version', (req, res) => {
  res.json({
    name: 'spotify-plaque-backend',
    version: require('../package.json').version,
    uptimeSeconds: Math.floor(process.uptime()),
    node: process.version,
    port: PORT
  });
});

// --- Ecommerce endpoints ---
app.get('/api/products', (req, res) => {
  res.json({ products });
});

// Price calculation utility
function calcPrice(selection){
  const base = products[0];
  let price = base.basePrice;
  if(selection){
    const { size, material, stand } = selection;
    const opt = base.options;
    const add = (group, id) => {
      if(!id) return; const found = opt[group].find(o=>o.id===id); if(found) price += found.priceDelta;
    };
    add('size', size); add('material', material); add('stand', stand);
  }
  return parseFloat(price.toFixed(2));
}

function applyDiscounts(subtotal, codes){
  let total = subtotal; let applied = [];
  (codes||[]).forEach(code=>{
    const d = discounts.find(d=>d.code.toUpperCase()===code.toUpperCase());
    if(d){
      if(d.percent){ total = total * (1 - d.percent/100); }
      else if(d.amount){ total = Math.max(0, total - d.amount); }
      applied.push({ code: d.code, description: d.description });
    }
  });
  return { total: parseFloat(total.toFixed(2)), applied };
}

app.post('/api/price-estimate', (req,res)=>{
  try {
    const { selection, codes } = req.body || {}; 
    const basePrice = calcPrice(selection);
    const { total, applied } = applyDiscounts(basePrice, codes);
    res.json({ success:true, basePrice, total, discounts: applied });
  } catch(e){ res.status(400).json({ success:false, error: e.message }); }
});

app.post('/api/checkout', (req,res)=>{
  try {
    const { customer, selection, codes, track } = req.body || {};
    if(!customer || !customer.email) return res.status(400).json({ success:false, error:'Missing customer.email' });
    const basePrice = calcPrice(selection);
    const { total, applied } = applyDiscounts(basePrice, codes);
    const order = { id: 'ord_'+Date.now().toString(36), created: new Date().toISOString(), basePrice, total, discounts: applied, selection, track, customer };
    orders.push(order);
    res.json({ success:true, order });
  } catch(e){ res.status(400).json({ success:false, error:e.message }); }
});

app.get('/api/orders', (req,res)=>{ res.json({ count: orders.length, orders }); });

/**
 * Spotify metadata endpoint
 * POST /api/spotify-metadata
 * 
 * Expected body: { url: "spotify_track_url" }
 * Returns: { title, artist, image, duration } or error
 */
app.post('/api/spotify-metadata', async (req, res) => {
  try {
    const { url, query } = req.body;
    const input = (url || query || '').trim();
    if (!input) {
      return res.status(400).json({ success:false, error:'Missing required field: url or query', message:'Provide a Spotify track URL or a search query' });
    }
    console.log(`[${new Date().toISOString()}] Metadata request input="${input}"`);
    const { metadata, resolvedUrl } = await fetchSpotifyMetadataFlexible(input);
    console.log(`[${new Date().toISOString()}] Metadata resolved to ${resolvedUrl}`);
    res.json({ success:true, data: metadata, resolvedUrl });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching metadata:`, error.message);
    let statusCode = 500;
    if (error.message.includes('Invalid Spotify track URL') || error.message.includes('Empty search query')) {
      statusCode = 400;
    } else if (error.message.includes('No matching track')) {
      statusCode = 404;
    } else if (error.message.includes('Network error')) {
      statusCode = 503;
    }
    res.status(statusCode).json({ success:false, error:error.message, code:statusCode });
  }
});

/**
 * Spotify plaque generator endpoint
 * POST /api/generate-plaque
 * 
 * Expected body: { url: "spotify_track_url", style: "minimal|detailed", options: {...} }
 * Returns: SVG file for laser cutting
 */
app.post('/api/generate-plaque', async (req, res) => {
  try {
    const { url, query, style = 'minimal', options = {}, progressTime = "0:00" } = req.body;
    const input = (url || query || '').trim();
    if (!input) {
      return res.status(400).json({ error:'Missing required field: url or query', message:'Provide a Spotify track URL or a search query' });
    }
    console.log(`[${new Date().toISOString()}] Generating plaque input="${input}"`);
    const { metadata, resolvedUrl } = await fetchSpotifyMetadataFlexible(input);
    
    // Convert progressTime (MM:SS) to position (0-1)
    let progressPosition = 0;
    if (progressTime && progressTime !== "0:00") {
      const [progressMinutes, progressSeconds] = progressTime.split(':').map(Number);
      const progressTotalSeconds = (progressMinutes || 0) * 60 + (progressSeconds || 0);
      
      // Parse song duration to get total seconds
      const [durationMinutes, durationSeconds] = (metadata.duration || "0:00").split(':').map(Number);
      const durationTotalSeconds = (durationMinutes || 0) * 60 + (durationSeconds || 0);
      
      if (durationTotalSeconds > 0) {
        progressPosition = Math.min(progressTotalSeconds / durationTotalSeconds, 1);
      }
    }

    // Generate SVG based on style
    let svgContent;
    if (style === 'detailed') {
      svgContent = generateDetailedPlaqueSVG(metadata, options);
    } else {
      // Use new Spotify player-style layout with 8.5x11 inch format
      const plaqueOptions = {
        width: 216,        // 8.5 inches in mm
        height: 279,       // 11 inches in mm
        progressPosition: Math.max(0, Math.min(1, progressPosition)), // Clamp between 0-1
        style: 'spotify-player',
        ...options
      };
  svgContent = generateSpotifyPlaqueSVG(metadata, { ...plaqueOptions, omitAlbum: true });
    }

    // Log success
  console.log(`[${new Date().toISOString()}] Generated ${style} plaque for: ${metadata.title} by ${metadata.artist} at ${progressTime} (source ${resolvedUrl})`);

    // Set appropriate headers for SVG download
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="spotify-plaque-${Date.now()}.svg"`);
    
    // Return SVG content
    res.send(svgContent);

  } catch (error) {
    // Log error for debugging
    console.error(`[${new Date().toISOString()}] Error generating plaque:`, error.message);

    // Determine appropriate HTTP status code based on error type
    let statusCode = 500;
    if (error.message.includes('Invalid Spotify track URL')) {
      statusCode = 400;
    } else if (error.message.includes('Track not found')) {
      statusCode = 404;
    } else if (error.message.includes('Network error')) {
      statusCode = 503;
    }

    // Return error response
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: statusCode
    });
  }
});

/**
 * Live preview endpoint (no download headers, embeds album art)
 * POST /api/preview-plaque { url, progressTime }
 */
app.post('/api/preview-plaque', async (req, res) => {
  try {
  const { url, query, progressTime = '0:00' } = req.body;
  const input = (url || query || '').trim();
  if (!input) return res.status(400).json({ success:false, error:'Missing required field: url or query' });
  const { metadata, resolvedUrl } = await fetchSpotifyMetadataFlexible(input);
    // Convert progress time to position
    let progressPosition = 0;
    if (progressTime && progressTime !== '0:00') {
      const [pm, ps] = progressTime.split(':').map(Number);
      const pt = (pm||0)*60 + (ps||0);
      const [dm, ds] = (metadata.duration||'0:00').split(':').map(Number);
      const dt = (dm||0)*60 + (ds||0);
      if (dt>0) progressPosition = Math.min(pt/dt,1);
    }
  const svg = generateSpotifyPlaqueSVG(metadata, { progressPosition, embedImage:true, isPreview: true });
    res.setHeader('Content-Type','image/svg+xml');
    res.send(svg);
  } catch (e) {
    console.error('Preview error:', e.message);
    res.status(500).json({ success:false, error:e.message });
  }
});

/**
 * Handle 404 for unmatched routes
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`
  });
});

/**
 * POST /api/create-checkout-session
 * Creates a Stripe checkout session for cart items
 */
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      return res.status(500).json({ 
        error: 'Payment system not configured. Please contact support.' 
      });
    }

    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Convert cart items to Stripe line items
    const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${item.size === 'large' ? 'Large' : 'Small'} Spotify Plaque - ${item.meta.title}`,
          description: `Artist: ${item.meta.artist} | Progress: ${formatTime(item.progress)}`,
          images: [item.meta.image],
        },
        unit_amount: item.size === 'large' ? 3999 : 2999, // $39.99 for large, $29.99 for small
      },
      quantity: 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${req.headers.origin || 'http://localhost:3001'}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:3001'}?canceled=true`,
      metadata: {
        items: JSON.stringify(items.map(item => ({
          title: item.meta.title,
          artist: item.meta.artist,
          progress: item.progress,
          size: item.size
        })))
      }
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Helper function for formatting time
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Global error handler
 */
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

/**
 * Start server
 */
const server = app.listen(PORT, () => {
  console.log(`🎵 Spotify Plaque Backend running on port ${PORT}`);
  if (process.argv[2]) {
    console.log('🔧 Port provided via CLI argument.');
  }
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎯 Metadata endpoint: POST http://localhost:${PORT}/api/spotify-metadata`);
  console.log(`🎨 Plaque generator: POST http://localhost:${PORT}/api/generate-plaque`);
});

// --- Diagnostic instrumentation to investigate unexpected exits/crashes ---
const startTime = Date.now();
function uptime() { return ((Date.now() - startTime)/1000).toFixed(1)+'s'; }

// Heartbeat every 10s so we know process is still alive
const heartbeat = setInterval(() => {
  console.log(`[heartbeat] alive at ${uptime()} | memory RSS ${(process.memoryUsage().rss/1024/1024).toFixed(1)} MB`);
}, 10000).unref();

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});
process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down (uptime '+uptime()+')');
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down (uptime '+uptime()+')');
  server.close(() => process.exit(0));
});
process.on('exit', (code) => {
  console.log(`[process exit] code ${code} after ${uptime()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
