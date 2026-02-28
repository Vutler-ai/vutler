#!/usr/bin/env node
/**
 * Generate unique 32x32 pixel art sprites for each agent
 * Uses sharp to create PNG from raw pixel data
 */

const fs = require('fs');
const path = require('path');

// Each agent: name, hair color, shirt color, skin tone, accessory
const AGENTS = [
  { id: 'jarvis',   hair: [60,60,80],    shirt: [100,100,220], skin: [230,190,150], acc: 'glasses' },
  { id: 'andrea',   hair: [150,80,50],   shirt: [244,114,182], skin: [235,200,170], acc: 'earring' },
  { id: 'mike',     hair: [40,40,50],    shirt: [34,211,238],  skin: [210,170,130], acc: 'headphones' },
  { id: 'philip',   hair: [130,60,180],  shirt: [167,139,250], skin: [235,200,170], acc: 'beret' },
  { id: 'luna',     hair: [250,200,50],  shirt: [251,191,36],  skin: [230,190,150], acc: 'none' },
  { id: 'max',      hair: [60,140,60],   shirt: [52,211,153],  skin: [180,140,100], acc: 'none' },
  { id: 'victor',   hair: [50,50,60],    shirt: [251,191,36],  skin: [140,100,70],  acc: 'tie' },
  { id: 'oscar',    hair: [200,120,50],  shirt: [251,146,60],  skin: [235,200,170], acc: 'none' },
  { id: 'nora',     hair: [220,60,60],   shirt: [248,113,113], skin: [230,190,150], acc: 'bow' },
  { id: 'stephen',  hair: [160,130,200], shirt: [192,132,252], skin: [235,200,170], acc: 'book' },
  { id: 'sentinel', hair: [50,60,80],    shirt: [56,189,248],  skin: [200,170,140], acc: 'visor' },
  { id: 'marcus',   hair: [40,40,40],    shirt: [74,222,128],  skin: [160,120,80],  acc: 'chart' },
  { id: 'rex',      hair: [180,50,50],   shirt: [244,63,94],   skin: [210,170,130], acc: 'shield' },
];

// Simple 32x32 pixel art character template
function generateSprite(agent) {
  const W = 32, H = 32;
  const pixels = new Uint8Array(W * H * 4); // RGBA

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
  }

  function fillRect(x1, y1, w, h, r, g, b, a = 255) {
    for (let y = y1; y < y1 + h; y++)
      for (let x = x1; x < x1 + w; x++)
        setPixel(x, y, r, g, b, a);
  }

  const [hr, hg, hb] = agent.hair;
  const [sr, sg, sb] = agent.shirt;
  const [skr, skg, skb] = agent.skin;

  // Hair (top of head) — rows 6-10
  fillRect(12, 6, 8, 2, hr, hg, hb);  // top hair
  fillRect(11, 8, 10, 3, hr, hg, hb); // hair sides

  // Face — rows 10-16
  fillRect(12, 10, 8, 7, skr, skg, skb); // face

  // Eyes — row 12-13
  setPixel(14, 12, 40, 40, 60);
  setPixel(15, 12, 40, 40, 60);
  setPixel(18, 12, 40, 40, 60);
  setPixel(19, 12, 40, 40, 60);
  // Eye whites
  setPixel(14, 12, 255, 255, 255);
  setPixel(18, 12, 255, 255, 255);
  // Pupils
  setPixel(15, 12, 30, 30, 50);
  setPixel(19, 12, 30, 30, 50);

  // Mouth — row 15
  setPixel(15, 15, 180, 80, 80);
  setPixel(16, 15, 180, 80, 80);
  setPixel(17, 15, 180, 80, 80);

  // Body / Shirt — rows 17-24
  fillRect(10, 17, 12, 8, sr, sg, sb);

  // Arms
  fillRect(8, 18, 2, 6, sr, sg, sb);
  fillRect(22, 18, 2, 6, sr, sg, sb);
  // Hands
  fillRect(8, 24, 2, 2, skr, skg, skb);
  fillRect(22, 24, 2, 2, skr, skg, skb);

  // Legs / Pants — rows 25-29
  fillRect(12, 25, 4, 5, 60, 60, 80);
  fillRect(18, 25, 4, 5, 60, 60, 80);

  // Shoes — row 29-30
  fillRect(11, 29, 5, 2, 40, 40, 50);
  fillRect(17, 29, 5, 2, 40, 40, 50);

  // Accessories
  if (agent.acc === 'glasses') {
    // Glasses frame
    fillRect(13, 11, 3, 3, 80, 80, 100);
    fillRect(17, 11, 3, 3, 80, 80, 100);
    setPixel(16, 12, 80, 80, 100); // bridge
    setPixel(14, 12, 180, 220, 255); // lens
    setPixel(18, 12, 180, 220, 255); // lens
  } else if (agent.acc === 'headphones') {
    fillRect(10, 8, 2, 5, 60, 60, 70);
    fillRect(20, 8, 2, 5, 60, 60, 70);
    fillRect(10, 7, 12, 1, 60, 60, 70);
  } else if (agent.acc === 'beret') {
    fillRect(11, 5, 11, 2, hr, hg, hb);
    fillRect(13, 4, 7, 1, hr, hg, hb);
  } else if (agent.acc === 'tie') {
    fillRect(15, 17, 2, 5, 200, 40, 40);
    setPixel(15, 22, 200, 40, 40);
    setPixel(16, 22, 200, 40, 40);
  } else if (agent.acc === 'bow') {
    fillRect(19, 7, 3, 2, 255, 100, 150);
    setPixel(20, 6, 255, 100, 150);
  } else if (agent.acc === 'visor') {
    fillRect(12, 11, 9, 2, 40, 200, 255);
  } else if (agent.acc === 'shield') {
    fillRect(24, 19, 3, 4, 200, 50, 50);
    setPixel(25, 18, 200, 50, 50);
    setPixel(25, 23, 200, 50, 50);
  } else if (agent.acc === 'earring') {
    setPixel(11, 13, 255, 215, 0);
  } else if (agent.acc === 'book') {
    fillRect(6, 20, 2, 3, 180, 130, 80);
  } else if (agent.acc === 'chart') {
    fillRect(24, 19, 3, 3, 50, 200, 100);
    setPixel(25, 19, 255, 255, 100);
  }

  return { width: W, height: H, pixels };
}

// Write raw RGBA as PNG using minimal PNG encoder
function writePNG(filepath, width, height, pixels) {
  const { createCanvas } = require('canvas');
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(pixels);
  ctx.putImageData(imageData, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filepath, buffer);
}

// Alternative: write BMP and convert, or use sharp
// Let's use sharp if available, otherwise raw PNG
async function main() {
  const outDir = path.join(__dirname, '..', 'frontend', 'vutler-frontend', 'public', 'sprites');
  
  let useSharp = false;
  let sharp;
  try {
    sharp = require('sharp');
    useSharp = true;
  } catch(e) {}

  let useCanvas = false;
  let createCanvas;
  try {
    const canvasLib = require('canvas');
    createCanvas = canvasLib.createCanvas;
    useCanvas = true;
  } catch(e) {}

  for (const agent of AGENTS) {
    const sprite = generateSprite(agent);
    const filepath = path.join(outDir, `agent-${agent.id}.png`);
    
    if (useSharp) {
      await sharp(Buffer.from(sprite.pixels), {
        raw: { width: sprite.width, height: sprite.height, channels: 4 }
      }).png().toFile(filepath);
      console.log(`✅ ${agent.id} (sharp)`);
    } else if (useCanvas) {
      writePNG(filepath, sprite.width, sprite.height, sprite.pixels);
      console.log(`✅ ${agent.id} (canvas)`);
    } else {
      // Fallback: write raw RGBA and note it
      // Actually let's just write a minimal PNG manually
      const pngBuffer = createMinimalPNG(sprite.width, sprite.height, sprite.pixels);
      fs.writeFileSync(filepath, pngBuffer);
      console.log(`✅ ${agent.id} (raw png)`);
    }
  }
  console.log('Done! Generated', AGENTS.length, 'sprites');
}

// Minimal PNG encoder (no dependencies)
function createMinimalPNG(width, height, pixels) {
  const zlib = require('zlib');
  
  // Build raw image data with filter byte
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // No filter
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (width * 4 + 1) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }
  
  const compressed = zlib.deflateSync(rawData);
  
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData) >>> 0, 0);
    return Buffer.concat([len, typeB, data, crc]);
  }
  
  // CRC32
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return crc ^ 0xFFFFFFFF;
  }
  
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

main().catch(console.error);
