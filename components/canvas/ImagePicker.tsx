"use client";

// Grid picker of the user's uploaded images ("image from files").

import { useEffect, useState } from "react";
import { listUserImages, type LibraryImage } from "@/lib/canvas/images";

interface Props {
  onPick: (url: string) => void;
  onClose: () => void;
}

export default function ImagePicker({ onPick, onClose }: Props) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await listUserImages();
        if (!cancelled) setImages(r);
      } catch (e) {
        console.error("image library load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      e.stopPropagation();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div
      onPointerDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0, 0, 0, 0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "calc(100vw - 48px)",
          maxHeight: "72vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface-raised)",
          border: "0.5px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "0.5px solid var(--color-border)",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          Images from files
        </div>
        <div style={{ overflowY: "auto", padding: 12 }}>
          {loading ? (
            <div style={{ padding: 12, color: "var(--color-text-tertiary)", fontSize: 13, fontFamily: "var(--font-sans)" }}>
              Loading…
            </div>
          ) : images.length === 0 ? (
            <div style={{ padding: 12, color: "var(--color-text-tertiary)", fontSize: 13, fontFamily: "var(--font-sans)" }}>
              No images yet. Upload one with the image tool, or drag it onto the canvas.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {images.map((img) => (
                <button
                  key={img.path}
                  onClick={() => onPick(img.url)}
                  title={img.name}
                  style={{
                    padding: 0,
                    border: "0.5px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    overflow: "hidden",
                    cursor: "pointer",
                    aspectRatio: "1 / 1",
                    background: "var(--color-surface-sunken)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
