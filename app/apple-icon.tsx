import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
          background: "#374238",
          color: "#f5f2ec",
          fontSize: 72,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        GC
      </div>
    ),
    { ...size }
  );
}
