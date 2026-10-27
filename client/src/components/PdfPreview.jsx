import React, { useEffect, useRef, useState } from "react";
const shared = new WeakMap();
function acquire(file) {
  let entry = shared.get(file);
  if (!entry) {
    entry = {
      count: 0,
      promise: import("../lib/pdf.js").then((module) =>
        module.openRenderedPdf(file),
      ),
    };
    shared.set(file, entry);
  }
  entry.count++;
  return {
    promise: entry.promise,
    release: async () => {
      if (--entry.count === 0) {
        shared.delete(file);
        try {
          await (await entry.promise).destroy();
        } catch {}
      }
    },
  };
}

export default function PdfPreview({ file, index = 0, rotation = 0 }) {
  const canvas = useRef(null),
    root = useRef(null),
    [visible, setVisible] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    const resource = acquire(file);
    (async () => {
      try {
        const { renderPage } = await import("../lib/pdf.js");
        const pdf = await resource.promise;
        if (disposed) return;
        const page = await renderPage(pdf, index, 0.35);
        if (!disposed && canvas.current) {
          canvas.current.width = page.width;
          canvas.current.height = page.height;
          canvas.current.getContext("2d").drawImage(page, 0, 0);
        }
      } catch {
        if (!disposed) setError("Preview unavailable");
      } finally {
        await resource.release();
      }
    })();
    return () => {
      disposed = true;
    };
  }, [file, index, visible]);
  return (
    <div className="pdf-preview" ref={root}>
      {error || (
        <canvas
          ref={canvas}
          style={{ transform: `rotate(${rotation}deg)` }}
          aria-label={`Page ${index + 1} preview`}
        />
      )}
    </div>
  );
}
