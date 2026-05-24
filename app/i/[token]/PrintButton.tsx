"use client";

/** Lightweight client island — the public invoice page is a Server
 *  Component but needs an onClick to fire window.print() for the
 *  recipient's "Print" affordance in the top action bar. */
export default function PrintButton() {
  return (
    <button
      type="button"
      className="pi-topbtn"
      onClick={() => window.print()}
    >
      Print
    </button>
  );
}
