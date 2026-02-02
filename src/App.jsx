import MapView from "./map/MapView";
import AsciiStreamOverlay from "./ui/AsciiStreamOverlay";

export default function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        position: "relative",
        overflow: "hidden",
        background: "radial-gradient(1200px 700px at 30% 10%, #0b4ea2 0%, #041a33 55%, #021022 100%)",
      }}
    >
      {/* ASCII interactive background (desktop only) */}
      <AsciiStreamOverlay />

      {/* Subtle scanline / terminal haze (optional but nice) */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0.0) 30%), repeating-linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.04) 1px, rgba(0,0,0,0) 3px, rgba(0,0,0,0) 7px)",
          opacity: 0.22,
          mixBlendMode: "overlay",
        }}
      />

      {/* Header / title (BeechLens-like) */}
      <div
        style={{
          position: "absolute",
          top: 18,
          left: 18,
          zIndex: 5,
          color: "rgba(210,245,255,0.95)",
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800 }}>StreamWise</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
          Monmouth County • tap streams / parcels
        </div>
      </div>

      {/* Centered inset map frame */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: "100vh",
          width: "100vw",
          display: "grid",
          placeItems: "center",
          padding: 18,
        }}
      >
        <div
          style={{
            width: "min(1100px, calc(100vw - 24px))",
            height: "min(740px, calc(100vh - 120px))",
            borderRadius: 22,
            overflow: "hidden",
            boxShadow: "0 22px 60px rgba(0,0,0,0.55)",
            border: "1px solid rgba(180,240,255,0.22)",
            background: "rgba(0, 10, 20, 0.35)",
            backdropFilter: "blur(10px)",
          }}
        >
          <MapView />
        </div>
      </div>

      {/* Mobile: keep map full-bleed-ish if you want */}
      <style>{`
        @media (max-width: 900px) {
          /* On mobile, make it feel more native */
          .streamwise-frame {
            width: calc(100vw - 18px) !important;
            height: calc(100vh - 18px) !important;
            border-radius: 18px !important;
          }
        }
      `}</style>
    </div>
  );
}
