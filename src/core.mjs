export const SAVE_KEY = 'andy-nowhere-v1';
export const MAX_FLOOR = 101;
export const STAMP_COUNT = 100;
export function parseFloor(value) {
  const text = String(value).trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= MAX_FLOOR ? n : null;
}
export function readProgress(storage) {
  try {
    const value = JSON.parse(storage.getItem(SAVE_KEY));
    if (!value || typeof value !== 'object') throw new Error('No save');
    const valid = (values, max) => new Set(Array.isArray(values) ? values.filter(n => Number.isInteger(n) && n >= 1 && n <= max) : []);
    const collected = valid(value.collected, STAMP_COUNT);
    const visited = valid(value.visited, MAX_FLOOR);
    for (const n of collected) visited.add(n);
    return { collected, visited, muted: value.muted === true };
  } catch {
    return { collected: new Set(), visited: new Set(), muted: false };
  }
}
export function saveProgress(storage, progress) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ collected: [...progress.collected], visited: [...progress.visited], muted: progress.muted }));
    return true;
  } catch { return false; }
}
export function collect(progress, floor) {
  if (!Number.isInteger(floor) || floor < 1 || floor > STAMP_COUNT || progress.collected.has(floor)) return false;
  progress.visited.add(floor);
  progress.collected.add(floor);
  return true;
}
export function canStand(x, y, bounds, obstacles = []) {
  if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return false;
  return !obstacles.some(o => x + 5 > o.x - o.w / 2 && x - 5 < o.x + o.w / 2 && y > o.y - o.h && y - 5 < o.y);
}
