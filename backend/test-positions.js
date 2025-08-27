const gen = require('./src/svgGenerator.js');

// Test different X positions to find the perfect centering
const positions = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60];

positions.forEach(pos => {
  // Temporarily modify the albumX value for testing
  const originalGenerate = gen.generateSpotifyPlaqueSVG;
  gen.generateSpotifyPlaqueSVG = function(metadata, options) {
    // Call original but replace albumX in the result
    let svg = originalGenerate.call(this, metadata, options);
    // Replace the current albumX with our test position
    svg = svg.replace(/x="50"/, `x="${pos}"`);
    return svg;
  };
  
  const svg = gen.generateSpotifyPlaqueSVG({
    title: 'Shape of You', 
    artist: 'Ed Sheeran', 
    duration: '3:54'
  }, {progressPosition: 0.65});
  
  require('fs').writeFileSync(`test-pos-${pos}.svg`, svg);
  console.log(`Generated test-pos-${pos}.svg with album at x="${pos}"`);
  
  // Restore original function
  gen.generateSpotifyPlaqueSVG = originalGenerate;
});

console.log('Generated test files with positions from 40 to 60');
