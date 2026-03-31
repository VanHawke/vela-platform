const { createCanvas } = require('canvas');
const fs = require('fs');

[192, 512].forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  // Black background
  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, size, size);
  // Purple gradient orb
  const grd = ctx.createRadialGradient(size*0.5, size*0.5, size*0.1, size*0.5, size*0.5, size*0.4);
  grd.addColorStop(0, '#8B6CF6');
  grd.addColorStop(0.5, '#7C5CFC');
  grd.addColorStop(1, 'rgba(0,212,170,0.3)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(size*0.5, size*0.5, size*0.35, 0, Math.PI*2);
  ctx.fill();
  // K letter
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `bold ${size*0.4}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('K', size*0.5, size*0.52);
  fs.writeFileSync(`kiko-icon-${size}.png`, canvas.toBuffer('image/png'));
  console.log(`Created kiko-icon-${size}.png`);
});
