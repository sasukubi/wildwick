// Makes the app icon (build/icon.png, 256x256) from the Pixel Campfire logo flame.
// No image tools needed: it writes the PNG file by hand.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAP = [
  '.....O......', '....OO......', '....OMO.....', '...OMMO..O..', '...OMMMO.OO.', '..OMMYMMOMO.',
  '..OMMYYMMMO.', '.OMMYYYMMMMO', '.OMYYWYYMMMO', '.OMYWWWYYMMO', '.OMYWWWWYMMO', '.OMMYWWYYMMO',
  '..OMYYYYYMO.', '...OMMMMMO..', '..BBOOOOOBB.', '.bbBBBBBBbb.', '..bb....bb..',
];
const COL = { O: [216, 64, 31], M: [255, 138, 43], Y: [255, 201, 77], W: [255, 243, 196], B: [122, 74, 38], b: [74, 44, 22] };

const S = 256, px = 13; // 12x17 map * 13 = 156x221, centred
const ox = Math.floor((S - 12 * px) / 2), oy = Math.floor((S - 17 * px) / 2);
const rgba = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = (y * S + x) * 4;
  // rounded dark tile with a warm glow behind the flame
  const cx = x - S / 2 + 0.5, cy = y - S / 2 + 0.5, r = 34;
  const qx = Math.max(Math.abs(cx) - (S / 2 - r), 0), qy = Math.max(Math.abs(cy) - (S / 2 - r), 0);
  const inside = Math.hypot(qx, qy) <= r;
  if (!inside) continue;
  const glow = Math.max(0, 1 - Math.hypot(cx, cy - 10) / 120);
  rgba[i] = 12 + glow * 120; rgba[i + 1] = 20 + glow * 60; rgba[i + 2] = 16 + glow * 10; rgba[i + 3] = 255;
  const mx = Math.floor((x - ox) / px), my = Math.floor((y - oy) / px);
  const ch = MAP[my] && MAP[my][mx];
  if (ch && COL[ch]) { rgba[i] = COL[ch][0]; rgba[i + 1] = COL[ch][1]; rgba[i + 2] = COL[ch][2]; }
}

// --- minimal PNG writer
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
console.log('icon.png written');
