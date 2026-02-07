import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

const LOGO_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <rect x="5" y="6" width="14" height="14" rx="3"/>
  <path d="M9 6V5a3 3 0 0 1 6 0v1"/>
  <line x1="8" y1="11" x2="10" y2="11"/>
  <line x1="14" y1="11" x2="16" y2="11"/>
  <line x1="8" y1="15" x2="10" y2="15"/>
  <line x1="14" y1="15" x2="16" y2="15"/>
</svg>
`);

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
        }}
      >
        <img
          src={`data:image/svg+xml,${LOGO_SVG}`}
          alt="PackSketcher logo"
          width={126}
          height={126}
          style={{ display: "block" }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
