"use client";

// Crop editor shown over an image object while it's being cropped (double-click
// an image to enter). Renders the FULL image (object-fit: contain) behind a
// dimming mask with a draggable/resizable crop frame. Geometry is in the
// object's world units; screen pointer deltas are divided by `scale` like the
// resize/rotate chrome in CanvasObjectView. On apply, the object shrinks to the
// frame and the crop rect (fractions of the natural image) is stored — so the
// object's box aspect matches the crop and it renders undistorted.

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import type { CanvasObject, ImageContent } from "./types";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
const MIN = 24; // minimum crop frame, world units

interface Props {
  object: CanvasObject;
  scale: number;
  onApply: (
    crop: Rect,
    geom: { x: number; y: number; width: number; height: number },
  ) => void;
  onCancel: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function ImageCropOverlay({ object, scale, onApply, onCancel }: Props) {
  const content = object.content as ImageContent;
  const inv = 1 / scale;
  const W = object.width;
  const H = object.height;
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);

  // Displayed image rect (object-fit: contain within the box), world units.
  const imgRect: Rect = (() => {
    if (!nat) return { x: 0, y: 0, w: W, h: H };
    const natA = nat.w / nat.h;
    const boxA = W / H;
    if (natA > boxA) {
      const h = W / natA;
      return { x: 0, y: (H - h) / 2, w: W, h };
    }
    const w = H * natA;
    return { x: (W - w) / 2, y: 0, w, h: H };
  })();

  const [frame, setFrame] = useState<Rect>({ x: 0, y: 0, w: W, h: H });
  const frameRef = useRef(frame);
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  // Seed the frame from the existing crop (or the whole image) once natural
  // dimensions are known.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !nat) return;
    seeded.current = true;
    const c = content.crop;
    setFrame(
      c
        ? {
            x: imgRect.x + c.x * imgRect.w,
            y: imgRect.y + c.y * imgRect.h,
            w: c.w * imgRect.w,
            h: c.h * imgRect.h,
          }
        : { ...imgRect },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nat]);

  function onFrameDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const px = e.clientX;
    const py = e.clientY;
    const s = frameRef.current;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - px) * inv;
      const dy = (ev.clientY - py) * inv;
      setFrame({
        w: s.w,
        h: s.h,
        x: clamp(s.x + dx, imgRect.x, imgRect.x + imgRect.w - s.w),
        y: clamp(s.y + dy, imgRect.y, imgRect.y + imgRect.h - s.h),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onHandleDown(e: React.PointerEvent, corner: Corner) {
    e.stopPropagation();
    e.preventDefault();
    const px = e.clientX;
    const py = e.clientY;
    const s = frameRef.current;
    const edges = { l: s.x, t: s.y, r: s.x + s.w, b: s.y + s.h };
    const bounds = { l: imgRect.x, t: imgRect.y, r: imgRect.x + imgRect.w, b: imgRect.y + imgRect.h };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - px) * inv;
      const dy = (ev.clientY - py) * inv;
      let { l, t, r, b } = edges;
      if (corner.includes("e")) r = clamp(edges.r + dx, l + MIN, bounds.r);
      if (corner.includes("w")) l = clamp(edges.l + dx, bounds.l, r - MIN);
      if (corner.includes("s")) b = clamp(edges.b + dy, t + MIN, bounds.b);
      if (corner.includes("n")) t = clamp(edges.t + dy, bounds.t, b - MIN);
      setFrame({ x: l, y: t, w: r - l, h: b - t });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function apply() {
    const r = imgRect;
    if (!nat || r.w <= 0 || r.h <= 0) return onCancel();
    onApply(
      {
        x: (frame.x - r.x) / r.w,
        y: (frame.y - r.y) / r.h,
        w: frame.w / r.w,
        h: frame.h / r.h,
      },
      {
        x: Math.round(object.x + frame.x),
        y: Math.round(object.y + frame.y),
        width: Math.round(frame.w),
        height: Math.round(frame.h),
      },
    );
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        apply();
      }
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, nat]);

  const handleSize = 12 * inv;
  const border = 1.5 * inv;
  const btn = 30 * inv;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 5 }} onPointerDown={(e) => e.stopPropagation()}>
      {/* clip layer: full image + dimming mask + frame */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          borderRadius: "var(--radius-lg)",
          background: "var(--color-surface-sunken)",
          cursor: "default",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={content.url}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth && el.naturalHeight) setNat({ w: el.naturalWidth, h: el.naturalHeight });
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
        />
        {/* dimming mask (everything outside the frame) */}
        <div
          onPointerDown={onFrameDown}
          style={{
            position: "absolute",
            left: frame.x,
            top: frame.y,
            width: frame.w,
            height: frame.h,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
            cursor: "move",
          }}
        />
        {/* frame border */}
        <div
          onPointerDown={onFrameDown}
          style={{
            position: "absolute",
            left: frame.x,
            top: frame.y,
            width: frame.w,
            height: frame.h,
            border: `${border}px solid var(--color-surface-raised)`,
            cursor: "move",
          }}
        />
        {/* corner handles */}
        {CORNERS.map((corner) => (
          <div
            key={corner}
            onPointerDown={(e) => onHandleDown(e, corner)}
            style={{
              position: "absolute",
              left: (corner.includes("w") ? frame.x : frame.x + frame.w) - handleSize / 2,
              top: (corner.includes("n") ? frame.y : frame.y + frame.h) - handleSize / 2,
              width: handleSize,
              height: handleSize,
              background: "var(--color-surface-raised)",
              border: `${border}px solid var(--color-sage)`,
              borderRadius: 2 * inv,
              cursor: `${corner}-resize`,
            }}
          />
        ))}
      </div>

      {/* apply / cancel — outside the clip layer, above the box, counter-scaled
          so it stays a constant screen size regardless of zoom */}
      <div
        style={{
          position: "absolute",
          left: W / 2,
          top: -(btn + 10 * inv),
          transform: "translateX(-50%)",
          display: "flex",
          gap: 6 * inv,
          padding: 5 * inv,
          borderRadius: "var(--radius-full)",
          background: "var(--color-surface-raised)",
          border: `${0.5 * inv}px solid var(--color-border)`,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <button
          aria-label="Cancel crop"
          onClick={onCancel}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: btn,
            height: btn,
            border: "none",
            borderRadius: "var(--radius-full)",
            background: "transparent",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
          }}
        >
          <X size={16 * inv} strokeWidth={2} />
        </button>
        <button
          aria-label="Apply crop"
          onClick={apply}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: btn,
            height: btn,
            border: "none",
            borderRadius: "var(--radius-full)",
            background: "var(--color-sage)",
            color: "white",
            cursor: "pointer",
          }}
        >
          <Check size={16 * inv} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
