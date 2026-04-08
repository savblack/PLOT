export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export const toDateKey = (iso) => iso?.slice(0, 10);

export const moodLabel = m => ({
  happy: 'Happy', sad: 'Sad', emotional: 'Emotional', excited: 'Excited',
  fun: 'Fun', tense: 'Tense', scared: 'Scared', unsettled: 'Unsettled',
  weird: 'Weird', cosy: 'Cosy', thoughtful: 'Thoughtful', inspired: 'Inspired',
  intense: 'Intense', stressed: 'Stressed', epic: 'Epic', haunted: 'Haunted',
  nostalgic: 'Nostalgic', melancholy: 'Melancholy', gripped: 'Gripped',
  shocked: 'Shocked', uncomfortable: 'Uncomfortable', meh: 'Meh',
  amazing: 'Amazing', mindblown: 'Mind Blown',
})[m] || m || '';

export const tlScribble = (height, seed) => {
  const r = n => { const v = Math.sin(seed * 9.301 + n * 46.218) * 43758.5453; return v - Math.floor(v); };
  const cx = 40; // centre of 80px-wide SVG
  const k = 0.5523; // cubic bezier circle approximation constant
  const numLoops = r(99) > 0.55 ? 0 : height > 100 ? (r(1) > 0.35 ? 2 : 1) : 1;
  const loops = Array.from({ length: numLoops }, (_, i) => ({
    y: ((i + 1) / (numLoops + 1) + (r(i + 5) - 0.5) * 0.12) * height,
    x: cx + (r(i + 20) - 0.5) * 18,
    lr: 9 + r(i + 30) * 6,
    dir: r(i + 40) > 0.5 ? 1 : -1,
  }));
  let px = cx, py = 0;
  let d = `M ${px} ${py}`;
  const seg = (tx, ty, slack, si) => {
    const dy = ty - py;
    d += ` C ${(px + (r(si) - 0.5) * slack).toFixed(1)} ${(py + dy * 0.35).toFixed(1)} ${(tx + (r(si + 1) - 0.5) * slack * 0.6).toFixed(1)} ${(ty - dy * 0.2).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
    px = tx; py = ty;
  };
  loops.forEach(({ x: lx, y: ly, lr, dir }, i) => {
    const ex = lx + dir * lr;
    seg(ex, ly, 65, i * 7 + 10);
    if (dir === 1) {
      d += ` C ${lx+lr} ${ly-k*lr} ${lx+k*lr} ${ly-lr} ${lx} ${ly-lr}`;
      d += ` C ${lx-k*lr} ${ly-lr} ${lx-lr} ${ly-k*lr} ${lx-lr} ${ly}`;
      d += ` C ${lx-lr} ${ly+k*lr} ${lx-k*lr} ${ly+lr} ${lx} ${ly+lr}`;
      d += ` C ${lx+k*lr} ${ly+lr} ${lx+lr} ${ly+k*lr} ${lx+lr} ${ly}`;
    } else {
      d += ` C ${lx-lr} ${ly-k*lr} ${lx-k*lr} ${ly-lr} ${lx} ${ly-lr}`;
      d += ` C ${lx+k*lr} ${ly-lr} ${lx+lr} ${ly-k*lr} ${lx+lr} ${ly}`;
      d += ` C ${lx+lr} ${ly+k*lr} ${lx+k*lr} ${ly+lr} ${lx} ${ly+lr}`;
      d += ` C ${lx-k*lr} ${ly+lr} ${lx-lr} ${ly+k*lr} ${lx-lr} ${ly}`;
    }
    px = ex; py = ly;
  });
  seg(cx, height, 65, 90);
  return d;
};
