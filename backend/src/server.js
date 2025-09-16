/**
 * Spotify Plaque Backend Server
 * 
 * Express.js server providing API endpoints for Spotify metadata fetching.
 * Main endpoint: POST /api/spotify-metadata
 */

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

// Check if Stripe keys are available
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY not found in environment variables');
  console.warn('⚠️  Stripe functionality will be disabled');
}

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const { fetchSpotifyMetadata, fetchSpotifyMetadataFlexible, searchAlbumCovers, searchAlbumCoversStrict } = require('./spotifyMetadata');
const { generateSpotifyPlaqueSVG, generateDetailedPlaqueSVG } = require('./svgGenerator');
const { products, discounts } = require('./products');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const { addOrder, loadOrders, getOrder } = require('./orderStore');

const app = express();
// Allow port override by CLI arg: `node src/server.js 3010`
const PORT = process.env.PORT || process.argv[2] || 3001;

// Stripe Webhook must use raw body for signature verification; define this route BEFORE json middleware
if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
  if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const itemsMeta = (() => { try { return JSON.parse(session.metadata?.items || '[]'); } catch { return []; } })();
        const customerEmail = session.customer_details?.email || null;
        // Build attachments using the same logic as test-checkout
        const attachments = [];
        for (const it of itemsMeta) {
          const meta = {
            title: it.title,
            artist: it.artist,
            duration: it.duration || '--:--',
            image: it.image || ''
          };
          const progress = it.progress || 0;
          const size = it.size || 'large';
          const svg = generateSpotifyPlaqueSVG(meta, {
            progressPosition: (() => {
              const [dm, ds] = (meta.duration||'0:00').split(':').map(Number);
              const dt = (dm||0)*60 + (ds||0); if (!dt) return 0; return Math.min(1, progress/dt);
            })(),
            omitAlbum: true,
            plaqueHeightInch: size === 'large' ? 12 : 5
          });
          attachments.push({ filename: `plaque_${meta.artist}_${meta.title}.svg`, content: Buffer.from(svg,'utf8'), contentType: 'image/svg+xml' });
          try {
            if (meta.image) {
              const resp = await fetch(meta.image);
              if (resp.ok) {
                const buf = Buffer.from(await resp.arrayBuffer());
                const plaqueHeightInch = size === 'large' ? 12 : 5;
                const borderUnits = 36, originalWidth = 535.19, originalHeight = 781.99;
                const totalHeightUnits = originalHeight + borderUnits * 2;
                const albumWidthInch = (originalWidth / totalHeightUnits) * plaqueHeightInch;
                const DPI = 300; const targetPx = Math.max(300, Math.round(albumWidthInch * DPI));
                const out = await sharp(buf).resize({ width: targetPx, height: targetPx, fit: 'cover' }).withMetadata({ density: DPI }).jpeg({ quality: 92 }).toBuffer();
                attachments.push({ filename: `cover_${meta.artist}_${meta.title}.jpg`, content: out, contentType: 'image/jpeg' });
              }
            }
          } catch (e) { console.warn('Webhook cover fetch/resize failed:', e.message); }
        }

        if (!process.env.MAIL_HOST) {
          console.error('Email not configured; cannot send files on webhook');
          return res.status(500).send('Email not configured');
        }
        const transporter = nodemailer.createTransport({
          host: process.env.MAIL_HOST,
          port: parseInt(process.env.MAIL_PORT || '587', 10),
          secure: !!process.env.MAIL_SECURE,
          auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined
        });
        const RECIPIENT = process.env.ORDER_RECEIVER || 'westkleinman@hotmail.com';
        const summaryLines = itemsMeta.map((it, idx) => `#${idx+1} ${it.title} — ${it.artist} [${it.size}] @ ${formatTime(it.progress||0)}`);
        const subject = `Plaqueify order (paid) — ${itemsMeta.length} item${itemsMeta.length>1?'s':''}`;
        const text = FLAGS.sendAttachments
          ? `Stripe Checkout complete.\n\nOrder summary\n${summaryLines.join('\n')}\n\nFiles attached. Receiver: ${RECIPIENT}${customerEmail?`\nCustomer: ${customerEmail}`:''}`
          : `Stripe Checkout complete.\n\nOrder summary\n${summaryLines.join('\n')}\n\nNo files attached (summary-only mode). Receiver: ${RECIPIENT}${customerEmail?`\nCustomer: ${customerEmail}`:''}`;

        // Persist order for admin
        const order = {
          id: 'ord_' + Date.now().toString(36),
          created: new Date().toISOString(),
          items: itemsMeta.map(it => ({
            title: it.title,
            artist: it.artist,
            duration: it.duration,
            progress: it.progress,
            size: it.size,
            image: it.image,
            query: it.query || ''
          })),
          customerEmail: customerEmail,
          source: 'stripe',
          emailed: FLAGS.sendAttachments ? 'files' : 'summary'
        };
        addOrder(order);

        await transporter.sendMail({ from: process.env.MAIL_FROM || 'no-reply@example.com', to: RECIPIENT, cc: customerEmail || undefined, replyTo: customerEmail || undefined, subject, text, attachments: FLAGS.sendAttachments ? attachments : [] });
      }
      res.json({ received: true });
    } catch (e) {
      console.error('Webhook processing error:', e);
      res.status(500).send('Webhook handler error');
    }
  });
}

// Middleware
app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-cookie-secret'));
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
const FLAGS = {
  freeCheckout: process.env.FREE_CHECKOUT === '1',
  stripeEnabled: !!stripe && process.env.FREE_CHECKOUT !== '1',
  allowPublicDownloads: process.env.ALLOW_PUBLIC_DOWNLOADS === '1',
  sendAttachments: process.env.SEND_ATTACHMENTS !== '0',
};

function isAdmin(req){
  return !!(req.signedCookies && req.signedCookies.admin === '1');
}
function requireAdmin(req, res, next){
  if (isAdmin(req)) return next();
  return res.status(403).json({ error: 'Admin only' });
}

app.get('/api/version', (req, res) => {
  res.json({
    name: 'spotify-plaque-backend',
    version: require('../package.json').version,
    uptimeSeconds: Math.floor(process.uptime()),
    node: process.version,
    port: PORT,
    ...FLAGS,
    isAdmin: isAdmin(req)
  });
});

// Admin login/logout
app.post('/api/admin/login', (req, res) => {
  const { key } = req.body || {};
  if (!key || key !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' });
  res.cookie('admin', '1', { httpOnly: true, signed: true, sameSite: 'lax', maxAge: 12*60*60*1000 });
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('admin'); res.json({ ok: true }); });

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

app.get('/api/orders', requireAdmin, (req,res)=>{ const list = loadOrders(); res.json({ count: list.length, orders: list }); });

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

// Optional helper: return only preview URL for a query/url
app.post('/api/track-preview', async (req, res) => {
  try {
  const { url, query, imageOverride } = req.body || {};
    const input = (url || query || '').trim();
    if (!input) return res.status(400).json({ success:false, error:'Missing required field: url or query' });
  const { metadata } = await fetchSpotifyMetadataFlexible(input);
  if (imageOverride && /^https?:\/\//i.test(imageOverride)) metadata.image = imageOverride;
    res.json({ success:true, preview: metadata.preview || null });
  } catch(e){
    res.status(500).json({ success:false, error: e.message });
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
  const { url, query, style = 'minimal', options = {}, progressTime = "0:00", imageOverride } = req.body;
    const input = (url || query || '').trim();
    if (!input) {
      return res.status(400).json({ error:'Missing required field: url or query', message:'Provide a Spotify track URL or a search query' });
    }
    console.log(`[${new Date().toISOString()}] Generating plaque input="${input}"`);
    const { metadata, resolvedUrl } = await fetchSpotifyMetadataFlexible(input);
    if (imageOverride && /^https?:\/\//i.test(imageOverride)) metadata.image = imageOverride;
    
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
      // Spotify player-style; allow caller to specify physical height in inches and omit album
      const plaqueOptions = {
        progressPosition: Math.max(0, Math.min(1, progressPosition)),
        style: 'spotify-player',
        omitAlbum: true,
        ...options,
      };
      svgContent = generateSpotifyPlaqueSVG(metadata, plaqueOptions);
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

// Return possible album cover options for a query
app.post('/api/cover-options', async (req, res) => {
  try {
    const { url, query } = req.body || {};
    const input = (url || query || '').trim();
    if (!input) return res.status(400).json({ success:false, error:'Missing required field: url or query' });
  const { metadata } = await fetchSpotifyMetadataFlexible(input);
  // Strict only: exact title + artist
  let images = await searchAlbumCoversStrict({ title: metadata.title, artist: metadata.artist });
  // Ensure the scraped image is present as a fallback option (when strict none)
  const base = (metadata.image||'').split('?')[0];
  if (!images.length && base) images = [base];
  else if (base && !images.find(u => u.split('?')[0] === base)) images.unshift(base);
  res.json({ success:true, images });
  } catch (e) {
    console.error('cover-options error:', e.message);
    res.status(500).json({ success:false, error: e.message });
  }
});

/**
 * Prepare album cover image for printing at exact physical width
 * POST /api/prepare-cover { imageUrl, size } where size: 'large'|'small'
 * Returns: JPEG with 300 DPI, width sized to album area for the selected plaque height
 */
app.post('/api/prepare-cover', async (req, res) => {
  try {
    const { imageUrl, size } = req.body || {};
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      return res.status(400).json({ success:false, error: 'Valid imageUrl required' });
    }
    const plaqueHeightInch = size === 'large' ? 12 : 5; // defaults
    // Geometry from svgGenerator
    const borderUnits = 36;
    const originalWidth = 535.19;
    const originalHeight = 781.99;
    const totalHeightUnits = originalHeight + borderUnits * 2;
    const albumWidthUnits = originalWidth; // album area is full content width
    const albumWidthInch = (albumWidthUnits / totalHeightUnits) * plaqueHeightInch;
    const DPI = 300;
    const targetPx = Math.max(300, Math.round(albumWidthInch * DPI));

    // Fetch and process image
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`Image fetch failed: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const out = await sharp(buf).resize({ width: targetPx, height: targetPx, fit: 'cover' }).withMetadata({ density: DPI }).jpeg({ quality: 92 }).toBuffer();

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="album-cover-${size}-${Date.now()}.jpg"`);
    res.send(out);
  } catch (e) {
    console.error('prepare-cover error:', e.message);
    res.status(500).json({ success:false, error: e.message });
  }
});

/**
 * Live preview endpoint (no download headers, embeds album art)
 * POST /api/preview-plaque { url, progressTime }
 */
app.post('/api/preview-plaque', async (req, res) => {
  try {
  const { url, query, progressTime = '0:00', imageOverride } = req.body;
  const input = (url || query || '').trim();
  if (!input) return res.status(400).json({ success:false, error:'Missing required field: url or query' });
  const { metadata, resolvedUrl } = await fetchSpotifyMetadataFlexible(input);
    if (imageOverride && /^https?:\/\//i.test(imageOverride)) metadata.image = imageOverride;
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

    // Convert cart items to Stripe line items. For testing, allow $0 pricing via env flag.
    const freeMode = process.env.FREE_CHECKOUT === '1';
  const line_items = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${item.size === 'large' ? 'Large' : 'Small'} Spotify Plaque - ${item.meta.title}`,
          description: `Artist: ${item.meta.artist} | Progress: ${formatTime(item.progress)}`,
          images: [item.coverUrl || item.meta.image],
        },
    unit_amount: freeMode ? 0 : (item.size === 'large' ? 3999 : 2999),
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
          size: item.size,
          image: item.coverUrl || item.meta.image,
          duration: item.meta.duration,
          query: item.query || ''
        })))
      }
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});
/**
 * POST /api/test-checkout
 * Accepts { items, email } without charging, generates files, and emails them to the provided address.
 * Required env for SMTP: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM
 */
app.post('/api/test-checkout', async (req, res) => {
  try {
  const { items, email } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success:false, error:'No items provided' });
  const RECIPIENT = process.env.ORDER_RECEIVER || 'westkleinman@hotmail.com';

    // Generate assets for each item
    const attachments = [];
    for (const item of items) {
      const { query, progress, size, meta } = item;
      const progressTime = formatTime(progress || 0);
      // SVG for production (omitAlbum true, physical size by plaqueHeightInch)
      const svg = generateSpotifyPlaqueSVG(meta, {
        progressPosition: (()=>{
          const [dm, ds] = (meta.duration||'0:00').split(':').map(Number);
          const dt = (dm||0)*60 + (ds||0); if (!dt) return 0;
          return Math.min(1, (progress||0)/dt);
        })(),
        omitAlbum: true,
        plaqueHeightInch: size === 'large' ? 12 : 5
      });
      attachments.push({
        filename: `plaque_${meta.artist}_${meta.title}.svg`,
        content: Buffer.from(svg, 'utf8'),
        contentType: 'image/svg+xml'
      });

      // Cover image 300 DPI, sized to album area width
      try {
        const coverResp = await fetch(item.coverUrl || meta.image);
        if (coverResp.ok) {
          const buf = Buffer.from(await coverResp.arrayBuffer());
          // Compute target width as in prepare-cover
          const plaqueHeightInch = size === 'large' ? 12 : 5;
          const borderUnits = 36;
          const originalWidth = 535.19;
          const originalHeight = 781.99;
          const totalHeightUnits = originalHeight + borderUnits * 2;
          const albumWidthUnits = originalWidth;
          const albumWidthInch = (albumWidthUnits / totalHeightUnits) * plaqueHeightInch;
          const DPI = 300;
          const targetPx = Math.max(300, Math.round(albumWidthInch * DPI));
          const out = await sharp(buf).resize({ width: targetPx, height: targetPx, fit: 'cover' }).withMetadata({ density: DPI }).jpeg({ quality: 92 }).toBuffer();
          attachments.push({ filename: `cover_${meta.artist}_${meta.title}.jpg`, content: out, contentType: 'image/jpeg' });
        }
      } catch (e) {
        console.warn('Cover fetch/resize failed:', e.message);
      }
    }

    // Send email
    if (!process.env.MAIL_HOST) {
      return res.status(500).json({ success:false, error:'Email not configured. Set MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM' });
    }
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT || '587', 10),
      secure: !!process.env.MAIL_SECURE, // true for 465
      auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined
    });

    const summaryLines = items.map((it, idx) => `#${idx+1} ${it.meta.title} — ${it.meta.artist} [${it.size}] @ ${formatTime(it.progress||0)}`);
    const subject = `Plaqueify order (${items.length} item${items.length>1?'s':''})`;
    const customerEmail = (typeof email === 'string' && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(email)) ? email.trim() : null;
    const text = FLAGS.sendAttachments
      ? `Order summary\n${summaryLines.join('\n')}\n\nFiles attached for each item:\n- Laser-ready SVG (inches embedded, album corners marked)\n- Cover JPG (300 DPI, sized to album area)\n\nReceiver: ${RECIPIENT}${customerEmail?`\nCustomer: ${customerEmail}`:''}`
      : `Order summary\n${summaryLines.join('\n')}\n\nNo files attached (summary-only mode).\nReceiver: ${RECIPIENT}${customerEmail?`\nCustomer: ${customerEmail}`:''}`;
    const mailOptions = {
      from: process.env.MAIL_FROM || 'no-reply@example.com',
      to: RECIPIENT,
      cc: customerEmail || undefined,
      replyTo: customerEmail || undefined,
      subject,
      text,
      attachments: FLAGS.sendAttachments ? attachments : []
    };
    // Save order summary regardless of email behavior
    const order = {
      id: 'ord_' + Date.now().toString(36),
      created: new Date().toISOString(),
      items: items.map(it => ({
        title: it.meta.title,
        artist: it.meta.artist,
        duration: it.meta.duration,
        progress: it.progress,
        size: it.size,
        image: it.meta.image,
        query: it.query || ''
      })),
      customerEmail: (typeof email === 'string' ? email.trim() : null)
    };
    addOrder(order);

    // If emailing is configured, send summary or files depending on flag
    if (process.env.MAIL_HOST) {
      const info = await transporter.sendMail(mailOptions);
      return res.json({ success:true, message: FLAGS.sendAttachments ? 'Email sent (attachments)' : 'Email sent (summary only)', id: info.messageId, orderId: order.id });
    }

    res.json({ success:true, message: 'Order saved (no email configured)', orderId: order.id });
  } catch (e) {
    console.error('test-checkout error:', e);
    res.status(500).json({ success:false, error:e.message });
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
 * Handle 404 for unmatched routes
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`
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
