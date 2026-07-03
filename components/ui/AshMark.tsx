// Inline Ash mark — the logomark at small size for use inside chips,
// suggestion strips, and any element where Ash is speaking or prompting.
//
// Variants:
//   "on-dark"  — white mark, for use on sage/dark backgrounds
//   "on-light" — sage-colored mark, for use on white/cream backgrounds

interface AshMarkProps {
  size?:    number;
  variant?: "on-dark" | "on-light";
  animate?: boolean;
}

// Inlined logomark (self-contained — no /public dependency, portable to any host).
const ASH_MARK_SVG = "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgZGF0YS1uYW1lPSJMYXllciAxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNDIuOTQgMzQyLjk0Ij4KICA8cGF0aCBkPSJNMjQyLjg5LDI4Mi41Yy00My42NywzNi44Mi0xMTQuMDQsMzMuNTctMTM2LjM5LDE2LjkyLTIuMTItMS41Ny0yLjY4LTQuNDMtLjc4LTYuMjUsNS45NS01LjcxLDE4LjY4LTE4LjA1LDMzLjItMzIuOTMsNy43NiwyLjIsMjUuNzUsMi4wNSw0MC43Mi0uODMsOC41Ny0xLjY1LDI0Ljg5LTkuMjksMzIuNTQtMTQuNC44Ny0uNTguMy0xLjkzLS43Mi0xLjctNy45MywxLjc5LTIzLjc4LDYuOTItMzQuMjUsNy43MXMtMjEuNzcuMDUtMjcuMzQtMS4zNWMxNi4yNi0xNy4yNCwzNS44My0zOS44Nyw0Ni41MS01NC45NCw2LjA5Ljc5LDE0LjUzLDEuMDgsMjMuMTQtLjA1LDEzLjQ1LTEuNzYsMjEuNTctOC4yNiwyNi40OS0xMy41LjYxLS42NS4wOC0xLjgxLS42OS0xLjM5LTUuODYsMy4yNS0xNC4yMiw2LjQ4LTIyLDcuODEtNi4yMywxLjA2LTE2LjMzLDEuNTMtMjEuOTIuNDUuOTEtMS42NSw0LjA0LTguMDksNC42OC05LjU2LDExLjM2LTI2LjIyLDE4LjItNDcuMTMsMjEuODMtNTguNzEuMy0uOTYtLjk4LTEuNi0xLjU3LS43OC05LjMzLDEzLjAxLTM1LjA2LDQzLjg0LTU5LjM2LDcxLjA5LTEuOC01LjExLTYuODEtMTMuOS04LjQtMjEuMzUtMy4zNS0xNS42Ny0yLjE5LTI3Ljk1LTEuMjYtMzcuMjEuMS0uOTktMS4yOS0xLjMxLTEuNjQtLjM4LTIuMzgsNi40Ny01LjU1LDE3LjE5LTQuNjQsMjYuNTgsMS4zLDEzLjMyLDYuODEsMjkuNjgsMTAuMTYsMzguNy0xLjA0LDEuMTItMi4wNywyLjItMy4wOSwzLjI2LTEyLjg3LDEzLjM1LTMwLjcsMjYuNjMtNDcuMTEsMzcuNTktMS45NS03LjQ2LTQuMjQtMTcuNDgtNi40Mi0zMC4wMS00LjAxLTIzLjExLTItNTEuODUtLjc1LTY0LjcuMTEtMS4xMi0xLjQ1LTEuNS0xLjg2LS40NS0zLjM3LDguODItOC45OSwyNS44OC0xMC40OCw0NC44OS0xLjQzLDE4LjM5LDMuOTUsNDUuMDYsNy4wMiw1OC4zNi0xMi4yLDcuNjgtMjIuNCwxMy40Ny0yNy4zMiwxNi4yLTEuODUsMS4wMy00LjE4LjU3LTUuNDktMS4wOS04Ljk1LTExLjM1LTM5LjQtNTUuMzUtMTYuMzQtMTAzLjU2LDI2LjgtNTYuMDMsMTIxLjktNjguMjEsMTYxLjI0LTgyLjgzLDI4LjQ4LTEwLjU4LDQyLjMtMTkuODksNDcuNzUtMjQuMjIsMS4zOS0xLjEsMy40Ni0uMzQsMy44MywxLjM5LDUuODYsMjcuMjIsMzcuNTEsMTgzLjM3LTE5LjI5LDIzMS4yNVoiIHN0eWxlPSJmaWxsOiAjOWJhMzdhOyIvPgogIDxsaW5lIHgxPSIxMTEiIHkxPSIyMzcuMjgiIHgyPSIxMTEiIHkyPSIyMzcuMjciIHN0eWxlPSJmaWxsOiBub25lOyBzdHJva2U6ICMwMDA7IHN0cm9rZS1taXRlcmxpbWl0OiAxMDsiLz4KPC9zdmc+";

export default function AshMark({ size = 14, variant = "on-light", animate = false }: AshMarkProps) {
  return (
    <img
      src={"data:image/svg+xml;base64,"+ASH_MARK_SVG}
      alt=""
      aria-hidden
      style={{
        width:     size,
        height:    size,
        flexShrink: 0,
        filter:    variant === "on-dark" ? "brightness(0) invert(1)" : undefined,
        opacity:   variant === "on-dark" ? 0.92 : 1,
        animation: animate ? "ash-shimmer 4.5s ease-in-out infinite" : undefined,
      }}
    />
  );
}
