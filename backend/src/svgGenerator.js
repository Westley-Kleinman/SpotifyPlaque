/**
 * SVG Plaque Generator Module
 * 
 * Generates laser-cut ready SVG files for Spotify track plaques.
 * Creates clean, minimal designs suitable for engraving and cutting.
 */

/**
 * Escapes XML/SVG special characters in text
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeXML(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    // Replace any non-ASCII characters with XML entities
    .replace(/[\u0080-\uFFFF]/g, function(match) {
      return '&#' + match.charCodeAt(0) + ';';
    });
}

/**
 * Generates a cd C:\cd C:\SpotifyPlaque\backend
node -e "console.log(process.env.SPOTIFY_CLIENT_ID ? 'CLIENT_ID set' : 'CLIENT_ID missing')" player-style SVG plaque using EXACT template structure
 * @param {Object} metadata - Track metadata {title, artist, image, duration}
 * @param {Object} options - Design options {progressPosition}
 * @returns {string} - SVG content ready for laser cutting
 */
function generateSpotifyPlaqueSVG(metadata, options = {}) {
  const { progressPosition = 0.4, embedImage = false, omitAlbum = false, isPreview = false } = options;
  const title = escapeXML(metadata.title || 'Unknown Track');
  const artist = escapeXML(metadata.artist || 'Unknown Artist');
  const duration = metadata.duration || '0:00';

  // --- Color Palette ---
  // When isPreview true, we simulate the look of a clear plaque.
  // Engraved parts become light, and the plaque itself is transparent.
  const engraveFill = isPreview ? '#334155' : '#000000'; // Darker gray for preview, black for final cut file
  const lightFill = isPreview ? '#64748B' : '#f1f2f2';   // A mid-gray for contrast elements in preview
  const plaqueFill = 'transparent';                       // Plaque is always transparent
  const plaqueStroke = isPreview ? 'rgba(255,255,255,0.2)' : '#000000'; // Faint outline in preview, black for final
  const cutOutlineColor = isPreview ? engraveFill : '#ff0000'; // Use engrave color for preview outline, red for final cut

  // Time calculation based on progress
  const [m, s] = duration.split(':').map(Number);
  const total = (m || 0) * 60 + (s || 0);
  const current = Math.floor(total * progressPosition);
  const curM = Math.floor(current / 60);
  const curS = (current % 60).toString().padStart(2, '0');
  const currentTime = `${curM}:${curS}`;

  // ORIGINAL TEMPLATE DIMENSIONS / ELEMENTS
  // We'll compute album first (square), then derive title & bar positions so spacing rules hold.

  // Calculate dimensions with 0.5-inch border (36 points = 0.5 inch in SVG)
  const borderWidth = 36;
  const originalWidth = 535.19;
  const originalHeight = 781.99;
  const totalWidth = originalWidth + (borderWidth * 2);
  const totalHeight = originalHeight + (borderWidth * 2);
  const cornerRadius = 30; // More rounded edges

  // User wants title & artist BELOW album cover on LEFT side.
  // Album cover square Option A:
  // - Square spans full originalWidth (matches progress bar width)
  // - Top/left/right equidistant to outer border (just borderWidth)
  // - 20px gap from album bottom to song title
  // - Preserve prior vertical relationships: title 80px above bar, artist 25px above bar - 55 offset
  const albumX = 0;
  const albumY = 0;
  const albumW = originalWidth;      // 535.19
  const albumH = albumW;             // square
  const albumBottom = albumY + albumH; // 535.19
  // Adjusted per request: 7px gap between album bottom and TOP of song title
  const titleY = albumBottom + 10;   // adjusted from +7 to +10 per request
  // Keep bar and artist in their original absolute positions (do not move anything else)
  // Previously: barY = albumBottom + 20 (title gap) + 80 = albumBottom + 100
  const barY = albumBottom + 100;    // fixed to preserve existing layout for other elements
  // Artist should sit 5px below the bottom of the title text. Title uses font-size 34px and dominant-baseline="hanging" so titleY is its top.
  const TITLE_FONT_SIZE = 34; // keep in sync with .dyn-title font-size in <style>
  const artistTopGap = 5;     // requested gap between title bottom and artist top
  const artistY = titleY + TITLE_FONT_SIZE + artistTopGap; // decoupled from barY now
  const barX = 0;
  const barWidth = originalWidth;    // unchanged
  const barHeight = 8;
  const rawFill = barWidth * progressPosition;
  const fillWidth = Math.max(0, Math.min(barWidth, rawFill));
  const knobRadius = 10;
  const knobX = Math.max(barX + knobRadius, Math.min(barX + barWidth - knobRadius, barX + fillWidth));
  // Truncate to avoid collision with right side controls (simple truncation)
  const MAX_TITLE = 55;
  const MAX_ARTIST = 60;
  const safeTitle = title.length > MAX_TITLE ? title.substring(0, MAX_TITLE - 1) + '…' : title;
  const safeArtist = artist.length > MAX_ARTIST ? artist.substring(0, MAX_ARTIST - 1) + '…' : artist;

  // Times left-aligned at bar start (combined current / total)
  // Revert to separate left/right times with visual edge alignment.
  // Because of font side bearings, we nudge positions slightly so the glyph ink (not the advance box) appears flush with bar edges.
  // Simple direct positioning: place timestamps exactly at bar edges
  // Left time: anchor at bar start (x=0) with text-anchor="start" 
  // Right time: anchor at bar end (x=barWidth) with text-anchor="end"
  // Title and artist: left-aligned with progress bar for clean, professional look
  const leftTimeX = barX;              // Left timestamp at bar start
  const rightTimeX = barX + barWidth;  // Right timestamp at bar end
  const textLeftX = barX;              // Title and artist aligned with progress bar left edge
  const timesY = barY + barHeight + 25; // Y position for timestamps, below the bar

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <defs>
    <style>
      /* White (non-engrave) areas / placeholders */
      .cls-1 { fill: ${plaqueFill}; stroke-width: .4px; stroke: ${plaqueStroke}; stroke-miterlimit:10; }
      /* Light (non-engrave) interior fill (e.g., play triangle contrast) */
      .light-fill { fill:${lightFill}; stroke:none; }
      /* Engrave: every solid dark element to be raster engraved */
      .engrave { fill:${engraveFill}; stroke:none; }
      /* Red cutting outline for perimeter */
      .cut-outline { fill:none; stroke:${cutOutlineColor}; stroke-width:0.1mm; }
      /* Text (engrave) */
      .dyn-text { fill:${engraveFill}; stroke:none; font-family: Arial, sans-serif; }
      .dyn-title { font-size:34px; font-weight:900; font-family:'Arial Black','Helvetica Neue',Arial,sans-serif; letter-spacing:-1px; font-stretch:condensed; }
      .dyn-artist { font-size:20px; font-weight:600; font-family:Arial,'Helvetica Neue',Arial,sans-serif; letter-spacing:0; }
      .dyn-time { fill:${engraveFill}; font-size:24px; font-weight:500; font-family:Arial,'Helvetica Neue',Arial,sans-serif; text-anchor:start; letter-spacing:0; }
      .dyn-time-end { text-anchor:end; }
    </style>
  </defs>

  <!-- RED CUTTING OUTLINE - 0.5 inch border with slightly curved edges -->
  <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" 
        rx="${cornerRadius}" ry="${cornerRadius}" class="cut-outline"/>

  <!-- Content group with 0.5-inch offset -->
  <g transform="translate(${borderWidth}, ${borderWidth})">
  <g>
    <g>
      <circle class="engrave" cx="262.59" cy="721.49" r="60"/>
      <path class="light-fill" d="M287.71,718.9l-39.46-22.78c-2-1.15-4.5.29-4.5,2.6v45.57c0,2.31,2.5,3.75,4.5,2.6l39.46-22.78c2-1.15,2-4.04,0-5.2Z"/>
    </g>
    <path class="engrave" d="M416.92,698.86v19.16l-32.57-18.81c-1.75-1.01-3.95.25-3.95,2.28v39.99c0,2.03,2.19,3.29,3.95,2.28l32.57-18.81v19.16h6v-45.26h-6Z"/>
    <path class="engrave" d="M108.25,698.86v19.16s32.57-18.81,32.57-18.81c1.75-1.01,3.95.25,3.95,2.28v39.99c0,2.03-2.19,3.29-3.95,2.28l-32.57-18.81v19.16h-6v-45.26h6Z"/>
    <path class="engrave" d="M34.86,697.63c.56,0,1.04.2,1.45.6l8.13,8.13c.39.39.59.87.59,1.43s-.2,1.05-.59,1.45l-8.13,8.13c-.39.39-.87.59-1.45.59s-1.04-.2-1.44-.6-.6-.88-.6-1.44.2-1.02.59-1.43l4.67-4.67h-3.22c-1.91,0-3.7.42-5.37,1.25s-3.08,1.97-4.21,3.41c-1.75,2.22-2.62,4.74-2.62,7.54s-.68,5.45-2.03,7.88c-.72,1.3-1.59,2.47-2.62,3.51-1.5,1.54-3.26,2.73-5.26,3.59-2,.86-4.12,1.29-6.35,1.29H2.33c-.56,0-1.04-.2-1.44-.6-.4-.4-.6-.88-.6-1.44,0-.56.2-1.04.6-1.44.4-.4.88-.6,1.44-.6h4.07c1.92,0,3.71-.41,5.38-1.24s3.07-1.96,4.2-3.4c1.75-2.22,2.62-4.74,2.62-7.56s.68-5.45,2.03-7.88c.73-1.31,1.6-2.48,2.62-3.49,1.5-1.54,3.26-2.73,5.26-3.6s4.12-1.29,6.35-1.29h3.22l-4.67-4.65c-.39-.41-.59-.89-.59-1.45s.2-1.04.6-1.44c.4-.4.88-.6,1.44-.6h0ZM34.86,726.09c.56,0,1.04.2,1.45.6l8.13,8.13c.39.39.59.87.59,1.45s-.2,1.04-.59,1.43l-8.13,8.13c-.39.39-.87.59-1.45.59s-1.04-.2-1.44-.59c-.4-.39-.6-.87-.6-1.43s.2-1.03.59-1.45l4.67-4.67h-3.22c-2.23,0-4.35-.43-6.35-1.29s-3.75-2.05-5.26-3.59c.82-1.2,1.49-2.47,2.03-3.83,1.13,1.44,2.53,2.57,4.2,3.4,1.67.83,3.46,1.24,5.38,1.24h3.22l-4.67-4.65c-.39-.41-.59-.89-.59-1.45,0-.56.2-1.04.6-1.44s.88-.6,1.44-.6h0ZM2.33,705.76h4.07c2.23,0,4.35.43,6.35,1.29,2,.86,3.75,2.06,5.26,3.6-.83,1.22-1.5,2.49-2.03,3.83-1.13-1.44-2.54-2.58-4.21-3.41-1.67-.83-3.46-1.25-5.37-1.25H2.33c-.56,0-1.04-.2-1.44-.6-.4-.4-.6-.88-.6-1.44,0-.56.2-1.04.6-1.44.4-.4.88-.6,1.44-.6h0Z"/>
    <path class="engrave" d="M532.33,713.03c-1.4,0-2.55,1.15-2.55,2.55v5.92c0,5.6-4.54,10.16-10.16,10.16h-20.94l1.58-1.58c.46-.46.73-1.1.73-1.79,0-1.4-1.15-2.55-2.55-2.55-.71,0-1.33.28-1.79.76l-5.92,5.92c-.46.46-.73,1.1-.73,1.79s.28,1.33.73,1.79l5.96,5.92c.46.46,1.1.73,1.79.73,1.4,0,2.55-1.15,2.55-2.55,0-.71-.28-1.33-.73-1.79l-1.58-1.58h20.94c8.42,0,15.23-6.81,15.23-15.23v-5.92c-.02-1.4-1.17-2.55-2.57-2.55ZM512.88,711.36h4.01l-1.58,1.58c-.46.46-.76,1.1-.76,1.79,0,1.4,1.15,2.55,2.55,2.55.71,0,1.33-.28,1.79-.76l5.92-5.92c.46-.46.76-1.1.76-1.79s-.28-1.33-.73-1.79l-5.92-5.94c-.46-.46-1.1-.73-1.79-.73-1.4,0-2.55,1.15-2.55,2.55,0,.71.28,1.33.76,1.79l1.58,1.58h-20.94c-8.42,0-15.23,6.81-15.23,15.23v5.92c0,1.4,1.15,2.55,2.55,2.55s2.55-1.15,2.55-2.55v-5.92c0-5.6,4.54-10.16,10.16-10.16l16.88.02h0Z"/>
  </g>

  <!-- ORIGINAL BAR (full) remains; add only knob to indicate progress -->
  <rect class="engrave" x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="1" ry="1" />
  <!-- Solid progress knob engraved -->
  <circle class="engrave" cx="${knobX}" cy="${barY + barHeight/2}" r="${knobRadius}" />

  <!-- Album art: if omitAlbum true show only outline rectangle (no embedded raster) -->
  ${omitAlbum
    ? `<rect class=\"cls-1\" x=\"${albumX}\" y=\"${albumY}\" width=\"${albumW}\" height=\"${albumH}\"/>`
    : (embedImage && metadata.image
        ? `<image x=\"${albumX}\" y=\"${albumY}\" width=\"${albumW}\" height=\"${albumH}\" href=\"${metadata.image}\" preserveAspectRatio=\"xMidYMid slice\" />`
        : `<rect class=\"cls-1\" x=\"${albumX}\" y=\"${albumY}\" width=\"${albumW}\" height=\"${albumH}\"/>`)}

  <!-- Dynamic title & artist -->
  <text x="${textLeftX}" y="${titleY}" dominant-baseline="hanging" class="dyn-text dyn-title" text-anchor="start">${safeTitle}</text>
  <text x="${textLeftX}" y="${artistY}" dominant-baseline="hanging" class="dyn-text dyn-artist" text-anchor="start">${safeArtist}</text>

  <!-- Times (direct edge alignment) -->
  <text x="${leftTimeX}" y="${timesY}" class="dyn-time" text-anchor="start">${currentTime}</text>
  <text x="${rightTimeX}" y="${timesY}" class="dyn-time dyn-time-end">${duration}</text>
  
  </g> <!-- End content group -->
</svg>`;

  return svgContent;
}

/**
 * Generates a more detailed SVG with album art placeholder
 * @param {Object} metadata - Track metadata
 * @param {Object} options - Design options
 * @returns {string} - Detailed SVG content
 */
function generateDetailedPlaqueSVG(metadata, options = {}) {
  const opts = { 
    width: 200, 
    height: 120, 
    margin: 10,
    ...options 
  };
  
  const { width, height, margin } = opts;
  const title = escapeXML(metadata.title || 'Unknown Track').substring(0, 20);
  const artist = escapeXML(metadata.artist || 'Unknown Artist').substring(0, 25);
  const duration = metadata.duration || '--:--';
  
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" 
     xmlns="http://www.w3.org/2000/svg">
  
  <defs>
    <style>
      .cut-line { fill: none; stroke: #ff0000; stroke-width: 0.1; }
      .engrave-text { fill: #000000; stroke: none; font-family: Arial, sans-serif; }
      .engrave-line { fill: none; stroke: #000000; stroke-width: 0.2; }
      .title { font-size: 8px; font-weight: bold; }
      .artist { font-size: 6px; }
      .info { font-size: 4px; }
    </style>
  </defs>
  
  <!-- Outer cut line -->
  <rect x="0" y="0" width="${width}" height="${height}" 
        rx="8" ry="8" class="cut-line"/>
  
  <!-- Album art placeholder -->
  <rect x="${margin}" y="${margin}" width="40" height="40" class="engrave-line"/>
  <text x="${margin + 20}" y="${margin + 22}" text-anchor="middle" class="engrave-text info">ALBUM</text>
  <text x="${margin + 20}" y="${margin + 28}" text-anchor="middle" class="engrave-text info">ART</text>
  
  <!-- Text content area -->
  <text x="${margin + 50}" y="${margin + 12}" class="engrave-text title">${title}</text>
  <text x="${margin + 50}" y="${margin + 24}" class="engrave-text artist">${artist}</text>
  
  <!-- Spotify logo -->
  <circle cx="${margin + 50}" cy="${margin + 35}" r="4" class="engrave-line"/>
  <text x="${margin + 50}" y="${margin + 37}" text-anchor="middle" class="engrave-text info">♪</text>
  
  <!-- Duration and info -->
  <text x="${width - margin}" y="${height - margin - 8}" text-anchor="end" class="engrave-text info">Duration: ${duration}</text>
  <text x="${width - margin}" y="${height - margin - 2}" text-anchor="end" class="engrave-text info">Spotify Plaque</text>
  
</svg>`;

  return svgContent;
}

module.exports = {
  generateSpotifyPlaqueSVG,
  generateDetailedPlaqueSVG
};
