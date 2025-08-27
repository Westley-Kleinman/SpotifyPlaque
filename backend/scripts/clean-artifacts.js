#!/usr/bin/env node
/**
 * Cleanup script to remove generated SVG plaque/test artifacts and helper scratch files.
 */
const fs = require('fs');
const path = require('path');

const patterns = [
  'plaque*.svg',
  '*-layout.svg',
  'test-*.svg',
  'visible-progress-test.svg',
  'working-plaque.svg',
  'shape-of-you-plaque.svg',
  'spotify-player-*-test.svg',
  '*.tmp.svg',
  'test-pos-*.svg',
  'enhanced-controls-test.svg',
  'final-spotify-layout.svg',
  'new-layout.svg',
  'new-spotify-style.svg',
  'corrected-spotify-layout.svg'
];

const extraFiles = [
  'test-positions.js',
  'test-simple.js',
  'test-api.rest',
  'server-run.log'
];

function matchPattern(filename, pattern) {
  // Convert simple glob (* wildcard only) to regex
  const regex = new RegExp('^' + pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, r => '\\' + r)).join('.*') + '$');
  return regex.test(filename);
}

function removeIfExists(filePath) {
  try {
    if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
      console.log('Removed', path.basename(filePath));
      return true;
    }
  } catch (e) {
    console.warn('Could not remove', filePath, e.message);
  }
  return false;
}

function main() {
  const baseDir = path.resolve(__dirname, '..');
  const entries = fs.readdirSync(baseDir);
  let removed = 0;

  for (const file of entries) {
    for (const pattern of patterns) {
      if (matchPattern(file, pattern)) {
        if (removeIfExists(path.join(baseDir, file))) removed++;
        break;
      }
    }
  }

  for (const f of extraFiles) {
    if (removeIfExists(path.join(baseDir, f))) removed++;
  }

  // Frontend stray test file
  const frontendTest = path.resolve(baseDir, '../frontend/test-encoding.html');
  if (removeIfExists(frontendTest)) {
    removed++;
  }

  console.log(`Cleanup complete. Removed ${removed} files.`);
}

main();
