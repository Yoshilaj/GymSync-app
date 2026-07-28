// Key the white GymSync glyph out of the blue app-icon tile into a
// transparent, tintable mark. RGB is forced to pure white so Image tintColor
// recolours cleanly with no blue fringing.
//
// Keys on SATURATION, not brightness. The tile is saturated blue; the glyph is
// white with grey shading — desaturated at every brightness. Luma keying can't
// separate "shaded part of the glyph" from "background" and eats the bevels;
// saturation can, so the mark stays solid where the render darkens it.
const fs = require('fs');
const path = require('path');
const { PNG } = require(path.join(process.cwd(), 'node_modules/pngjs'));

const SRC = path.join(process.cwd(), 'assets/icon.png');
const OUT = path.join(process.cwd(), 'assets/logo-mark.png');

const src = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H, data } = src;

const sat = (r, g, b) => {
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};

const hist = new Array(10).fill(0);
for (let i = 0; i < W * H; i++) {
  const o = i * 4;
  hist[Math.min(9, Math.floor(sat(data[o], data[o + 1], data[o + 2]) * 10))]++;
}
console.log('saturation histogram:');
hist.forEach((n, i) => {
  if (n)
    console.log(
      `  ${(i / 10).toFixed(1)}  ${'#'.repeat(Math.round((n / (W * H)) * 120))} ${((n / (W * H)) * 100).toFixed(1)}%`,
    );
});

// Below LO → fully opaque glyph, above HI → fully transparent tile, ramped
// between so antialiased edges keep partial alpha.
const LO = 0.28;
const HI = 0.55;

let minX = W, minY = H, maxX = -1, maxY = -1;
const alpha = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    const s = sat(data[o], data[o + 1], data[o + 2]);
    const a = Math.max(0, Math.min(1, (HI - s) / (HI - LO)));
    const a8 = Math.round(a * 255);
    alpha[y * W + x] = a8;
    if (a8 > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const gw = maxX - minX + 1;
const gh = maxY - minY + 1;
console.log(`\nglyph bbox: ${gw}x${gh} at (${minX},${minY}) of ${W}x${H}`);

// Square canvas around the glyph with a small optical margin.
const side = Math.round(Math.max(gw, gh) * 1.06);
const ox = Math.round(minX + gw / 2 - side / 2);
const oy = Math.round(minY + gh / 2 - side / 2);

const out = new PNG({ width: side, height: side });
for (let y = 0; y < side; y++) {
  for (let x = 0; x < side; x++) {
    const sx = ox + x;
    const sy = oy + y;
    const d = (y * side + x) * 4;
    const a = sx >= 0 && sx < W && sy >= 0 && sy < H ? alpha[sy * W + sx] : 0;
    out.data[d] = 255;
    out.data[d + 1] = 255;
    out.data[d + 2] = 255;
    out.data[d + 3] = a;
  }
}
fs.writeFileSync(OUT, PNG.sync.write(out));

let solid = 0;
let partial = 0;
for (let i = 0; i < side * side; i++) {
  const a = out.data[i * 4 + 3];
  if (a > 240) solid++;
  else if (a > 15) partial++;
}
console.log(
  `wrote ${OUT}  ${side}x${side}  solid ${((solid / (side * side)) * 100).toFixed(1)}%  soft-edge ${((partial / (side * side)) * 100).toFixed(1)}%`,
);
