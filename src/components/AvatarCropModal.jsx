import { useState, useRef, useEffect } from 'react';

const DISPLAY = 200;
const OUTPUT  = 400;

export default function AvatarCropModal({ file, onConfirm, onCancel }) {
  const [src, setSrc]       = useState(null);
  const [dims, setDims]     = useState(null);
  const [pos, setPos]       = useState({ x: 0, y: 0 });
  const [scale, setScale]   = useState(1);
  const [active, setActive] = useState(false);
  const dragRef = useRef(null);
  const imgRef  = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      setPos({ x: cx - dragRef.current.x, y: cy - dragRef.current.y });
    };
    const onUp = () => { dragRef.current = null; setActive(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const startDrag = (cx, cy) => {
    dragRef.current = { x: cx - pos.x, y: cy - pos.y };
    setActive(true);
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img || !dims) return;

    const canvas = document.createElement('canvas');
    canvas.width  = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.clip();

    const base  = Math.max(DISPLAY / dims.w, DISPLAY / dims.h);
    const total = base * scale;
    const ratio = OUTPUT / DISPLAY;
    const dw = dims.w * total * ratio;
    const dh = dims.h * total * ratio;
    const dx = OUTPUT / 2 + pos.x * ratio - dw / 2;
    const dy = OUTPUT / 2 + pos.y * ratio - dh / 2;

    ctx.drawImage(img, dx, dy, dw, dh);
    canvas.toBlob(blob => onConfirm(blob), 'image/jpeg', 0.92);
  };

  const base = dims ? Math.max(DISPLAY / dims.w, DISPLAY / dims.h) : 1;
  const imgW = dims ? dims.w * base * scale : 0;
  const imgH = dims ? dims.h * base * scale : 0;

  return (
    <div className="modal-overlay" style={{ zIndex: 10001 }}>
      <div className="avatar-crop-modal">
        <h3>Adjust photo</h3>

        <div
          className="avatar-crop-circle"
          style={{ cursor: active ? 'grabbing' : 'grab' }}
          onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onTouchStart={e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={e => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              style={{
                position: 'absolute',
                width: imgW,
                height: imgH,
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          )}
        </div>

        <div className="avatar-crop-zoom">
          <span>−</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.01"
            value={scale}
            onChange={e => setScale(+e.target.value)}
          />
          <span>+</span>
        </div>

        <div className="avatar-crop-actions">
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="save-btn" onClick={handleConfirm}>Save</button>
        </div>
      </div>
    </div>
  );
}
