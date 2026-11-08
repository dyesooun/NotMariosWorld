// Select the optional lossless compressed sibling for exported runtime assets.
// This module is browser-safe so the editor and CLI use the same rule.
export function compressedSiblingPath(src, availablePaths) {
  if (typeof src !== 'string' || !src.startsWith('/assets/sprites/')) return src;
  if (/\.compressed\.webp$/i.test(src)) return src;
  const slash = src.lastIndexOf('/');
  const dot = src.lastIndexOf('.');
  if (dot <= slash || !/\.png$/i.test(src)) return src;
  const candidate = `${src.slice(0, dot)}.compressed.webp`;
  return availablePaths?.has(candidate) ? candidate : src;
}
