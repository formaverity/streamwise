import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";

const MONMOUTH_CENTER = [-74.2, 40.28];
const EMPTY_FC = { type: "FeatureCollection", features: [] };

export default function MapView() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);

  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: MONMOUTH_CENTER,
      zoom: 11,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      mapRef.current = map;
// Load visible streams once
(async () => {
  const { data, error } = await supabase.rpc("streams_geojson");
  if (error) {
    console.warn("streams_geojson error:", error);
    return;
  }

  map.addSource("streams", { type: "geojson", data });

  map.addLayer({
    id: "streams-line",
    type: "line",
    source: "streams",
     paint: {
    "line-color": "#7ddfff",
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      9, 1,
      12, 2,
      15, 3
    ],
    "line-opacity": 0.65,
  },
});
})();

      // --- Sources ---
      map.addSource("selected-stream", { type: "geojson", data: EMPTY_FC });
      map.addSource("selected-parcel", { type: "geojson", data: EMPTY_FC });

      // --- Layers (explicit colors so we KNOW they should render) ---
      map.addLayer({
        id: "selected-parcel-fill",
        type: "fill",
        source: "selected-parcel",
        paint: {
          "fill-color": "#4fb3ff",
"fill-opacity": 0.12,
        },
      });

      map.addLayer({
        id: "selected-parcel-outline",
        type: "line",
        source: "selected-parcel",
        paint: {
          "line-color": "#7ddfff",
"line-width": 2,
"line-opacity": 0.6,
        },
      });
map.addLayer({
  id: "selected-stream-glow",
  type: "line",
  source: "selected-stream",
  paint: {
    "line-color": "#7ddfff",
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10, 8,
      14, 14
    ],
    "line-opacity": 0.35,
  },
});

     map.addLayer({
  id: "selected-stream-line",
  type: "line",
  source: "selected-stream",
  paint: {
    "line-color": "#baf3ff",
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10, 4,
      14, 7
    ],
    "line-opacity": 0.95,
  },
});


      map.on("click", async (e) => {
        const { lng, lat } = e.lngLat;

        try {
          // 1) Stream summary first
          const stream = await fetchStreamSummaryAtPoint(lat, lng);

          if (stream?.is_within) {
            setSelected({ type: "stream", ...stream });

            // Clear parcel highlight
            setSourceData(map, "selected-parcel", EMPTY_FC);

            // Fetch & draw stream geometry
            const streamGeom = await fetchStreamGeom(stream.source_id);
            console.log("stream_geom RPC returned:", streamGeom);

            setSourceData(map, "selected-stream", normalizeToFC(streamGeom));

            showPopup(
              popupRef,
              map,
              [lng, lat],
              formatStreamPopup(stream)
            );
            return;
          }

          // Not within a stream — clear stream highlight
          setSourceData(map, "selected-stream", EMPTY_FC);

          // 2) Parcel fallback
          const parcel = await fetchParcelAtPoint(lat, lng);

          if (parcel) {
            setSelected({ type: "parcel", ...parcel });

            const parcelId = parcel.parcel_id; // from your debug panel
            const parcelGeom = await fetchParcelGeom(parcelId);
            console.log("parcel_geom RPC returned:", parcelGeom);

            setSourceData(map, "selected-parcel", normalizeToFC(parcelGeom));

            showPopup(
              popupRef,
              map,
              [lng, lat],
              formatParcelPopup(parcel)
            );
            return;
          }

          // 3) Nothing
          setSelected(null);
          setSourceData(map, "selected-stream", EMPTY_FC);
          setSourceData(map, "selected-parcel", EMPTY_FC);

          showPopup(
            popupRef,
            map,
            [lng, lat],
            `<div><b>No result</b><div style="margin-top:6px;">No stream within radius and no containing parcel.</div></div>`
          );
        } catch (err) {
          console.error("Click handler error:", err);
        }
      });
    });

    return () => {
      try {
        popupRef.current?.remove();
      } catch {}
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
    <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />

      {selected && (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            padding: 12,
            borderRadius: 12,
            background: "rgba(0,0,0,0.75)",
            color: "white",
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Selected: {selected.type}
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ---------- map helpers ---------- */

function setSourceData(map, sourceId, data) {
  const src = map.getSource(sourceId);
  if (!src) return;
  src.setData(data);
}

function normalizeToFC(geojson) {
  if (!geojson) return { type: "FeatureCollection", features: [] };

  if (geojson.type === "FeatureCollection") return geojson;

  if (geojson.type === "Feature") {
    return { type: "FeatureCollection", features: [geojson] };
  }

  // If it’s geometry-only
  if (geojson.type && geojson.coordinates) {
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: geojson }],
    };
  }

  console.warn("Unrecognized GeoJSON:", geojson);
  return { type: "FeatureCollection", features: [] };
}

function showPopup(popupRef, map, lngLat, html) {
  if (popupRef.current) popupRef.current.remove();
  popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
}

/* ---------- popup formatting ---------- */

function formatStreamPopup(stream) {
  return `
    <div style="
      min-width:240px;
      color:#dff6ff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    ">
      <div style="
        font-weight:800;
        font-size:14px;
        letter-spacing:0.06em;
        text-transform:uppercase;
        color:#baf3ff;
      ">
        ${escapeHtml(stream.name || "Unnamed stream")}
      </div>

      <div style="
        margin-top:6px;
        font-size:12px;
        opacity:0.85;
      ">
        Distance: ${Math.round(stream.distance_m ?? 0)} m
      </div>

      <hr style="
        border:0;
        border-top:1px solid rgba(125,223,255,0.35);
        margin:8px 0;
      ">

      <div style="font-size:12px;">
        <div><b>Parcels (buffer)</b>: ${stream.total_parcels ?? "—"}</div>
        <div>Public: ${stream.public_parcels ?? "—"}</div>
        <div>Private: ${stream.private_parcels ?? "—"}</div>
      </div>
    </div>
  `;
}


function formatParcelPopup(parcel) {
  return `
    <div style="
      min-width:240px;
      color:#dff6ff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    ">
      <div style="
        font-weight:800;
        font-size:13px;
        letter-spacing:0.06em;
        text-transform:uppercase;
        color:#7ddfff;
      ">
        Parcel
      </div>

      <hr style="
        border:0;
        border-top:1px solid rgba(125,223,255,0.35);
        margin:8px 0;
      ">

      <div style="font-size:12px;">
        <div><b>PAMSPIN</b>: ${escapeHtml(parcel.pamspin || "—")}</div>
        <div style="margin-top:4px;">
          <b>Ownership</b>: ${escapeHtml(parcel.ownership_type || "—")}
        </div>
      </div>
    </div>
  `;
}


function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Supabase RPC calls ---------- */

async function fetchStreamSummaryAtPoint(lat, lon) {
  const { data, error } = await supabase.rpc("stream_summary_at_point", {
    lat,
    lon,
    radius_m: 200,
    buffer_m: 25,
  });

  if (error) {
    console.warn("stream_summary_at_point error:", error);
    return null;
  }
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

async function fetchParcelAtPoint(lat, lon) {
  const { data, error } = await supabase.rpc("parcel_at_point", { lat, lon });

  if (error) {
    console.warn("parcel_at_point error:", error);
    return null;
  }
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

async function fetchStreamGeom(source_id) {
  if (!source_id) return null;

  const { data, error } = await supabase.rpc("stream_geom", {
    stream_source_id: source_id,
  });

  if (error) {
    console.warn("stream_geom error:", error);
    return null;
  }
  return data ?? null;
}

async function fetchParcelGeom(parcel_id) {
  if (parcel_id == null) return null;

  const { data, error } = await supabase.rpc("parcel_geom", {
    parcel_id: parcel_id,
  });

  if (error) {
    console.warn("parcel_geom error:", error);
    return null;
  }
  return data ?? null;
}
