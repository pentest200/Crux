import React, { useRef } from "react";
export default function Signature({ onChange, annotation = false }) {
  const ref = useRef(null),
    drawing = useRef(false);
  function point(e) {
    const box = ref.current.getBoundingClientRect();
    return [
      ((e.clientX - box.left) * 600) / box.width,
      ((e.clientY - box.top) * 160) / box.height,
    ];
  }
  function start(e) {
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const context = ref.current.getContext("2d");
    context.beginPath();
    context.moveTo(...point(e));
    context.strokeStyle = "#103f36";
    context.lineWidth = 3;
    context.lineCap = "round";
  }
  function move(e) {
    if (!drawing.current) return;
    const context = ref.current.getContext("2d");
    context.lineTo(...point(e));
    context.stroke();
  }
  function stop() {
    if (!drawing.current) return;
    drawing.current = false;
    ref.current.toBlob((blob) => onChange(blob), "image/png");
  }
  return (
    <div>
      <p>
        {annotation
          ? "Draw a freehand annotation below."
          : "Draw your signature below, or use typed text."}
      </p>
      <canvas
        aria-label={annotation ? "Draw annotation" : "Draw signature"}
        className="signature-pad"
        ref={ref}
        width="600"
        height="160"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      />
      <button
        type="button"
        className="button quiet"
        onClick={() => {
          ref.current.getContext("2d").clearRect(0, 0, 600, 160);
          onChange(null);
        }}
      >
        Clear drawing
      </button>
    </div>
  );
}
