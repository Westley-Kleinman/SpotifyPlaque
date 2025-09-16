const express = require('express');
const { generateSpotifyPlaqueSVG } = require('../backend/src/svgGenerator');
const sharp = require('sharp');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const open = require('open');

const app = express();
const PORT = 3002;

app.use(express.static('public'));
app.use(express.json());

// Serve the main HTML interface
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Plaqueify SVG Generator - Local Tool</title>
        <style>
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f8fafc;
                color: #1e293b;
                line-height: 1.6;
                padding: 2rem;
            }

            .container {
                max-width: 1200px;
                margin: 0 auto;
            }

            h1 {
                color: #1db954;
                margin-bottom: 0.5rem;
                font-size: 2rem;
            }

            .subtitle {
                color: #64748b;
                margin-bottom: 2rem;
                font-size: 1.1rem;
            }

            .section {
                background: white;
                border-radius: 12px;
                padding: 2rem;
                margin-bottom: 2rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                border: 1px solid #e2e8f0;
            }

            .section h2 {
                color: #1e293b;
                margin-bottom: 1rem;
                font-size: 1.5rem;
            }

            .form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1rem;
                margin-bottom: 1rem;
            }

            .form-group {
                margin-bottom: 1rem;
            }

            label {
                display: block;
                font-weight: 600;
                margin-bottom: 0.5rem;
                color: #374151;
            }

            input, textarea, select {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid #e2e8f0;
                border-radius: 6px;
                font-size: 1rem;
                transition: border-color 0.2s;
            }

            input:focus, textarea:focus, select:focus {
                outline: none;
                border-color: #1db954;
            }

            textarea {
                resize: vertical;
                height: 150px;
            }

            .btn {
                display: inline-block;
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 6px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                text-decoration: none;
                text-align: center;
                transition: all 0.2s;
                margin-right: 1rem;
                margin-bottom: 0.5rem;
            }

            .btn-primary {
                background: #1db954;
                color: white;
            }

            .btn-primary:hover {
                background: #1ed760;
                transform: translateY(-1px);
            }

            .btn-secondary {
                background: #e2e8f0;
                color: #475569;
            }

            .btn-secondary:hover {
                background: #cbd5e1;
            }

            .preview-area {
                border: 2px dashed #cbd5e1;
                border-radius: 8px;
                min-height: 400px;
                padding: 2rem;
                text-align: center;
                background: #f8fafc;
                margin-top: 1rem;
            }

            .preview-area svg {
                max-width: 100%;
                height: auto;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
            }

            .status {
                padding: 1rem;
                border-radius: 8px;
                margin-bottom: 1rem;
                font-weight: 500;
            }

            .status.success {
                background: #dcfce7;
                color: #166534;
                border: 1px solid #bbf7d0;
            }

            .status.error {
                background: #fef2f2;
                color: #dc2626;
                border: 1px solid #fecaca;
            }

            .order-list {
                display: grid;
                gap: 1rem;
                margin-top: 1rem;
            }

            .order-item {
                display: grid;
                grid-template-columns: 80px 1fr auto;
                gap: 1rem;
                padding: 1rem;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                align-items: center;
            }

            .order-item img {
                width: 80px;
                height: 80px;
                object-fit: cover;
                border-radius: 6px;
                background: #f1f5f9;
            }

            .order-details h3 {
                margin-bottom: 0.25rem;
                color: #1e293b;
            }

            .order-specs {
                color: #64748b;
                font-size: 0.9rem;
            }

            .hidden {
                display: none;
            }

            .files-generated {
                background: #f0f9ff;
                border: 1px solid #bae6fd;
                padding: 1rem;
                border-radius: 8px;
                margin-top: 1rem;
            }

            .file-links a {
                display: inline-block;
                margin-right: 1rem;
                color: #0ea5e9;
                text-decoration: none;
                font-weight: 500;
            }

            .file-links a:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎵 Plaqueify SVG Generator</h1>
            <p class="subtitle">Local tool to generate production-ready SVG files from customer orders</p>

            <div class="section">
                <h2>📧 Paste Order Email</h2>
                <p style="margin-bottom: 1rem; color: #64748b;">Copy and paste the order email you received from the website:</p>
                <textarea id="orderEmail" placeholder="Paste the complete order email here..."></textarea>
                <button onclick="parseOrder()" class="btn btn-primary">Parse Order</button>
                <div id="parseStatus"></div>
            </div>

            <div class="section">
                <h2>🎨 Manual Entry</h2>
                <p style="margin-bottom: 1rem; color: #64748b;">Or enter the details manually:</p>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="songTitle">Song Title</label>
                        <input type="text" id="songTitle" placeholder="e.g., Bohemian Rhapsody">
                    </div>
                    <div class="form-group">
                        <label for="artist">Artist</label>
                        <input type="text" id="artist" placeholder="e.g., Queen">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="duration">Duration</label>
                        <input type="text" id="duration" placeholder="e.g., 5:55" pattern="[0-9]+:[0-9]{2}">
                    </div>
                    <div class="form-group">
                        <label for="progress">Progress Time</label>
                        <input type="text" id="progress" placeholder="e.g., 2:30" pattern="[0-9]+:[0-9]{2}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="size">Plaque Size</label>
                        <select id="size">
                            <option value="small">Small (5 inches)</option>
                            <option value="large">Large (12 inches)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="imageUrl">Album Cover URL</label>
                        <input type="url" id="imageUrl" placeholder="https://...">
                    </div>
                </div>

                <button onclick="generatePreview()" class="btn btn-primary">Generate Preview</button>
                <button onclick="generateFiles()" class="btn btn-secondary">Generate Production Files</button>
            </div>

            <div class="section">
                <h2>👀 Preview</h2>
                <div id="previewArea" class="preview-area">
                    <p style="color: #64748b;">Preview will appear here after generating...</p>
                </div>
            </div>

            <div class="section">
                <h2>📁 Generated Files</h2>
                <div id="fileStatus"></div>
                <div id="generatedFiles" class="hidden">
                    <div class="files-generated">
                        <h3>Files ready for production:</h3>
                        <div class="file-links" id="fileLinks"></div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let currentOrder = null;

            function parseOrder() {
                const email = document.getElementById('orderEmail').value.trim();
                const statusEl = document.getElementById('parseStatus');
                
                if (!email) {
                    statusEl.innerHTML = '<div class="status error">Please paste an order email</div>';
                    return;
                }

                try {
                    // Parse order email format
                    const orderMatch = email.match(/Order #(\\w+)/);
                    const customerMatch = email.match(/Customer: (.+)/);
                    const totalMatch = email.match(/Total: \\$([0-9.]+)/);
                    
                    // Parse items (simplified - adjust regex based on actual email format)
                    const itemMatches = [...email.matchAll(/\\d+\\. "([^"]+)" by ([^\\n]+)\\n.*Size: (\\w+).*Progress: ([0-9:]+)/g)];
                    
                    if (itemMatches.length === 0) {
                        // Fallback parsing
                        const lines = email.split('\\n');
                        const items = [];
                        
                        for (let line of lines) {
                            if (line.includes('"') && line.includes('by ')) {
                                const titleMatch = line.match(/"([^"]+)"/);
                                const artistMatch = line.match(/by (.+?)(?:\\s|$)/);
                                if (titleMatch && artistMatch) {
                                    items.push({
                                        title: titleMatch[1],
                                        artist: artistMatch[1],
                                        size: 'small', // default
                                        progress: '2:00' // default
                                    });
                                }
                            }
                        }
                        
                        if (items.length > 0) {
                            fillFormFromOrder(items[0]);
                            statusEl.innerHTML = '<div class="status success">Order parsed successfully (simplified)</div>';
                        } else {
                            statusEl.innerHTML = '<div class="status error">Could not parse order format. Try manual entry.</div>';
                        }
                    } else {
                        const firstItem = itemMatches[0];
                        fillFormFromOrder({
                            title: firstItem[1],
                            artist: firstItem[2],
                            size: firstItem[3].toLowerCase(),
                            progress: firstItem[4]
                        });
                        statusEl.innerHTML = '<div class="status success">Order parsed successfully!</div>';
                    }
                } catch (error) {
                    statusEl.innerHTML = '<div class="status error">Error parsing order: ' + error.message + '</div>';
                }
            }

            function fillFormFromOrder(item) {
                document.getElementById('songTitle').value = item.title || '';
                document.getElementById('artist').value = item.artist || '';
                document.getElementById('size').value = item.size || 'small';
                document.getElementById('progress').value = item.progress || '2:00';
                document.getElementById('duration').value = '3:30'; // default
            }

            async function generatePreview() {
                const data = getFormData();
                if (!data) return;

                try {
                    const response = await fetch('/generate-svg', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...data, isPreview: true })
                    });

                    const result = await response.text();
                    document.getElementById('previewArea').innerHTML = result;
                } catch (error) {
                    document.getElementById('previewArea').innerHTML = 
                        '<div class="status error">Error generating preview: ' + error.message + '</div>';
                }
            }

            async function generateFiles() {
                const data = getFormData();
                if (!data) return;

                const statusEl = document.getElementById('fileStatus');
                statusEl.innerHTML = '<div class="status">Generating production files...</div>';

                try {
                    const response = await fetch('/generate-files', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    const result = await response.json();
                    
                    if (result.success) {
                        statusEl.innerHTML = '<div class="status success">Files generated successfully!</div>';
                        
                        const linksHtml = result.files.map(file => 
                            '<a href="/download/' + file + '" download>' + file + '</a>'
                        ).join('');
                        
                        document.getElementById('fileLinks').innerHTML = linksHtml;
                        document.getElementById('generatedFiles').classList.remove('hidden');
                    } else {
                        statusEl.innerHTML = '<div class="status error">Error: ' + result.error + '</div>';
                    }
                } catch (error) {
                    statusEl.innerHTML = '<div class="status error">Error generating files: ' + error.message + '</div>';
                }
            }

            function getFormData() {
                const title = document.getElementById('songTitle').value.trim();
                const artist = document.getElementById('artist').value.trim();
                const duration = document.getElementById('duration').value.trim();
                const progress = document.getElementById('progress').value.trim();
                const size = document.getElementById('size').value;
                const imageUrl = document.getElementById('imageUrl').value.trim();

                if (!title || !artist) {
                    alert('Please fill in at least the song title and artist');
                    return null;
                }

                return {
                    title,
                    artist,
                    duration: duration || '3:30',
                    progress: progress || '2:00',
                    size,
                    imageUrl
                };
            }
        </script>
    </body>
    </html>
    `);
});

// Generate SVG endpoint
app.post('/generate-svg', async (req, res) => {
    try {
        const { title, artist, duration, progress, size, imageUrl, isPreview = false } = req.body;

        // Parse progress time to get position
        const [progMin, progSec] = progress.split(':').map(Number);
        const [durMin, durSec] = duration.split(':').map(Number);
        const totalSeconds = durMin * 60 + durSec;
        const progressSeconds = progMin * 60 + progSec;
        const progressPosition = Math.min(1, progressSeconds / totalSeconds);

        const metadata = {
            title,
            artist,
            duration,
            image: imageUrl || null
        };

        const options = {
            progressPosition,
            embedImage: isPreview && imageUrl,
            isPreview,
            plaqueHeightInch: size === 'large' ? 12 : 5,
            omitAlbum: !isPreview
        };

        const svg = generateSpotifyPlaqueSVG(metadata, options);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svg);

    } catch (error) {
        console.error('SVG generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate production files endpoint
app.post('/generate-files', async (req, res) => {
    try {
        const { title, artist, duration, progress, size, imageUrl } = req.body;

        // Parse progress time to get position
        const [progMin, progSec] = progress.split(':').map(Number);
        const [durMin, durSec] = duration.split(':').map(Number);
        const totalSeconds = durMin * 60 + durSec;
        const progressSeconds = progMin * 60 + progSec;
        const progressPosition = Math.min(1, progressSeconds / totalSeconds);

        const metadata = {
            title,
            artist,
            duration,
            image: imageUrl || null
        };

        // Generate production SVG (no image embedded, score marks for alignment)
        const productionOptions = {
            progressPosition,
            embedImage: false,
            isPreview: false,
            plaqueHeightInch: size === 'large' ? 12 : 5,
            omitAlbum: true // Use score marks instead of embedded image
        };

        const svgContent = generateSpotifyPlaqueSVG(metadata, productionOptions);
        
        // Create safe filename
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const safeArtist = artist.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `${safeArtist}_${safeTitle}_${size}_${timestamp}`;

        // Ensure output directory exists
        const outputDir = path.join(__dirname, 'output');
        await fs.mkdir(outputDir, { recursive: true });

        // Save SVG file
        const svgPath = path.join(outputDir, `${filename}.svg`);
        await fs.writeFile(svgPath, svgContent);

        const files = [`${filename}.svg`];

        // If image URL provided, also generate 300 DPI cover image
        if (imageUrl) {
            try {
                const response = await fetch(imageUrl);
                if (response.ok) {
                    const imageBuffer = await response.buffer();
                    
                    // Convert to 300 DPI JPG (assuming 4x4 inch print size)
                    const dpi = 300;
                    const sizeInches = 4;
                    const pixelSize = Math.round(dpi * sizeInches);

                    const processedImage = await sharp(imageBuffer)
                        .resize(pixelSize, pixelSize, { fit: 'cover', position: 'center' })
                        .jpeg({ quality: 95 })
                        .withMetadata({ density: dpi })
                        .toBuffer();

                    const imagePath = path.join(outputDir, `${filename}_cover.jpg`);
                    await fs.writeFile(imagePath, processedImage);
                    files.push(`${filename}_cover.jpg`);
                }
            } catch (imageError) {
                console.warn('Could not process cover image:', imageError);
            }
        }

        res.json({ success: true, files });

    } catch (error) {
        console.error('File generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download files endpoint
app.get('/download/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'output', filename);
        
        // Check if file exists
        await fs.access(filePath);
        
        res.download(filePath);
    } catch (error) {
        res.status(404).json({ error: 'File not found' });
    }
});

// List generated files
app.get('/api/files', async (req, res) => {
    try {
        const outputDir = path.join(__dirname, 'output');
        const files = await fs.readdir(outputDir).catch(() => []);
        
        const fileList = await Promise.all(files.map(async (filename) => {
            const filePath = path.join(outputDir, filename);
            const stats = await fs.stat(filePath);
            return {
                name: filename,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };
        }));

        res.json(fileList.sort((a, b) => b.modified - a.modified));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🎵 Plaqueify SVG Generator running at http://localhost:${PORT}`);
    console.log('📁 Files will be saved to:', path.join(__dirname, 'output'));
    console.log('');
    console.log('Opening in browser...');
    open(`http://localhost:${PORT}`);
});

module.exports = app;