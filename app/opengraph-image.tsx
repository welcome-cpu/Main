import { ImageResponse } from "next/og";

export const alt = "Gamrie Chalets — Luxury Dog-Friendly Self-Catering, Aberdeenshire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #374238 0%, #4f5a4d 100%)",
          color: "#f5f2ec",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 6,
            textTransform: "uppercase",
            opacity: 0.75,
            display: "flex",
          }}
        >
          Gamrie Chalets
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 60,
            fontWeight: 600,
            lineHeight: 1.15,
            maxWidth: 900,
            display: "flex",
          }}
        >
          Luxury Dog-Friendly Self-Catering, Aberdeenshire
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 26,
            letterSpacing: 3,
            textTransform: "uppercase",
            opacity: 0.75,
            display: "flex",
          }}
        >
          Escape. Unwind. Recharge.
        </div>
      </div>
    ),
    { ...size }
  );
}
