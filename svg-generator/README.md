# Plaqueify SVG Generator

Local desktop application for generating production-ready SVG files from Plaqueify customer orders.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the generator:**
   ```bash
   npm start
   ```
   The app will automatically open in your browser at `http://localhost:3002`

## Features

### 📧 Order Email Parsing
- Paste customer order emails directly
- Automatically extracts song details
- Supports both formatted and simple email structures

### 🎨 Manual Entry
- Fill in song details manually
- Choose plaque size (5" or 12")
- Set custom progress time
- Add album cover URL

### 👀 Preview Generation
- Live SVG preview with album art
- Shows exactly how the plaque will look
- Real-time updates as you adjust settings

### 📁 Production File Generation
- High-quality SVG files ready for laser cutting
- Score marks for precise album art alignment
- Optional 300 DPI cover images (4"x4" at 300 DPI)
- Files saved with descriptive names

## File Output

Generated files are saved to the `output/` directory:

- **SVG Files:** `ArtistName_SongTitle_size_2025-09-16.svg`
- **Cover Images:** `ArtistName_SongTitle_size_2025-09-16_cover.jpg`

## SVG Features

- **Laser-ready:** Black lines for engraving, red for cutting
- **Precise dimensions:** Physical sizes embedded (5" or 12" height)
- **Album alignment:** Corner score marks for manual photo placement
- **Professional layout:** Spotify-style design with progress indicator

## Usage Workflow

1. **Receive Order Email** → Copy/paste into the tool
2. **Parse or Manual Entry** → Extract song details
3. **Generate Preview** → Verify the design looks correct
4. **Generate Production Files** → Create laser-cutting files
5. **Download Files** → Save to your computer
6. **Laser Cut** → Use SVG files for production

## File Management

- All files are timestamped
- Easy download links
- Organized by artist/song name
- Covers processed to optimal print resolution

## Technical Details

- Built with Node.js and Express
- Uses Sharp for image processing
- Generates W3C-compliant SVG files
- Supports both preview and production modes
- Automatic browser opening for convenience

---

*This tool is designed to work alongside the client-side Plaqueify website. While customers use the web interface to design and order, you use this local tool to generate the final production files.*