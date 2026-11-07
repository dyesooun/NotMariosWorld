// Lightweight boot artwork; do not import the game renderer before the catalog is ready.
const ROWS = [0, .292, .545, .765, 1];
const COLS = [0, .25, .5, .75, 1];

export function initLoadingScreen() {
  const screen = document.querySelector('#loading-screen');
  if (!screen) return;
  const canvases = [...screen.querySelectorAll('canvas')];
  const atlas = new Image();
  atlas.onload = () => {
    if (!screen.isConnected) return;
    const source = document.createElement('canvas');
    source.width = atlas.naturalWidth; source.height = atlas.naturalHeight;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) return;
    sourceContext.drawImage(atlas, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
    canvases.forEach((canvas, index) => {
      const x0 = Math.floor(COLS[index] * source.width), x1 = Math.floor(COLS[index + 1] * source.width);
      const y0 = 0, y1 = Math.floor(ROWS[1] * source.height);
      let left = x1, top = y1, right = x0, bottom = y0;
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
        if (pixels[(y * source.width + x) * 4 + 3] > 70) {
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      if (right < left || bottom < top) return;
      const context = canvas.getContext('2d'); if (!context) return;
      context.imageSmoothingEnabled = false; context.clearRect(0, 0, canvas.width, canvas.height);
      const width = right - left + 1, height = bottom - top + 1;
      const scale = Math.min((canvas.width - 8) / width, (canvas.height - 5) / height);
      const drawWidth = Math.max(1, Math.round(width * scale)), drawHeight = Math.max(1, Math.round(height * scale));
      context.drawImage(atlas, left, top, width, height, Math.round((canvas.width - drawWidth) / 2), canvas.height - drawHeight, drawWidth, drawHeight);
    });
  };
  atlas.onerror = () => {};
  atlas.src = '/assets/sprites.png';
}
