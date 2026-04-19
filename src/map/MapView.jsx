import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../lib/supabase";

const MONMOUTH_CENTER = [-74.2, 40.28];
const EMPTY_FC = { type: "FeatureCollection", features: [] };

const CONDITION_OPTIONS = [
  ["1", "1 rough"],
  ["2", "2 needs care"],
  ["3", "3 okay"],
  ["4", "4 healthy"],
  ["5", "5 thriving"],
];

const WATER_CLARITY_OPTIONS = [
  ["clear", "Clear"],
  ["slightly-cloudy", "Slightly cloudy"],
  ["murky", "Murky"],
  ["opaque", "Very hard to see through"],
];

const FLOW_OPTIONS = [
  ["still", "Very still"],
  ["low", "Low flow"],
  ["steady", "Steady / normal"],
  ["fast", "Fast"],
  ["flashy", "Unusually high / flashy"],
];

const BANK_OPTIONS = [
  ["stable", "Mostly stable"],
  ["mixed", "A mix of stable and worn"],
  ["eroding", "Noticeable erosion"],
  ["severely-eroding", "Severely worn or collapsing"],
];

const COVER_OPTIONS = [
  ["none", "Little to none"],
  ["some", "Some cover"],
  ["good", "Good cover"],
  ["dense", "Dense cover"],
];

const LITTER_OPTIONS = [
  ["none", "None seen"],
  ["light", "A little"],
  ["moderate", "Moderate"],
  ["heavy", "A lot"],
];

const HABITAT_OPTIONS = [
  ["low", "Very little habitat cover"],
  ["some", "Some habitat cover"],
  ["good", "Good habitat cover"],
  ["high", "Excellent habitat cover"],
];

const SKILL_LEVEL_OPTIONS = [
  ["first-time", "First time"],
  ["learning", "Learning"],
  ["regular", "Regular observer"],
  ["experienced", "Experienced"],
  ["expert", "Expert / professional"],
];

const POLLUTION_SIGN_OPTIONS = [
  ["sheen", "Oily sheen"],
  ["foam", "Foam"],
  ["odor", "Strong odor"],
  ["discoloration", "Unusual color"],
  ["trash", "Trash build-up"],
  ["algae", "Excess algae"],
  ["sediment", "Heavy sediment"],
  ["outfall", "Suspicious outfall"],
];

function createInitialObservationForm() {
  return {
    overallCondition: "3",
    waterClarity: "",
    flowCondition: "",
    bankCondition: "",
    riparianCover: "",
    litterLevel: "",
    pollutionSigns: [],
    habitatCover: "",
    observerSkillLevel: "",
    note: "",
  };
}

export default function MapView() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const locationMarkerRef = useRef(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedStreamClickLngLat, setSelectedStreamClickLngLat] = useState(null);
  const [streams, setStreams] = useState([]);
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [streamsError, setStreamsError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeStreamId, setActiveStreamId] = useState(null);

  const [observationWizardOpen, setObservationWizardOpen] = useState(false);
  const [observationSubmitError, setObservationSubmitError] = useState("");
  const [observationSubmitting, setObservationSubmitting] = useState(false);
  const [observationForm, setObservationForm] = useState(createInitialObservationForm);

  useEffect(() => {
    let ignore = false;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.warn("supabase.auth.getUser error:", error);
        return;
      }
      if (!ignore) {
        setCurrentUser(data?.user ?? null);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadStreams() {
      setStreamsLoading(true);
      setStreamsError("");

      const list = await fetchStreamList();
      if (!isMounted) return;

      if (!list) {
        setStreams([]);
        setStreamsError("Unable to load streams.");
        setStreamsLoading(false);
        return;
      }

      setStreams(list);
      setStreamsLoading(false);
    }

    loadStreams();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: MONMOUTH_CENTER,
      zoom: 11,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new ZoomToLocationControl(mapRef, locationMarkerRef), "top-right");

    map.on("load", () => {
      mapRef.current = map;

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
              9,
              1,
              12,
              2,
              15,
              3,
            ],
            "line-opacity": 0.65,
          },
        });
      })();

      map.addSource("selected-stream", { type: "geojson", data: EMPTY_FC });
      map.addSource("selected-stream-parcels", { type: "geojson", data: EMPTY_FC });
      map.addSource("selected-parcel", { type: "geojson", data: EMPTY_FC });
      map.addSource("stream-observations", { type: "geojson", data: EMPTY_FC });

      map.addLayer({
        id: "selected-stream-parcels-outline",
        type: "line",
        source: "selected-stream-parcels",
        paint: {
          "line-color": "#6ecff6",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.8,
            13,
            1.2,
            16,
            1.8,
          ],
          "line-opacity": 0.42,
        },
      });

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
            10,
            8,
            14,
            14,
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
            10,
            4,
            14,
            7,
          ],
          "line-opacity": 0.95,
        },
      });

      map.addLayer({
        id: "stream-observations-circle",
        type: "circle",
        source: "stream-observations",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            4,
            13,
            5.5,
            16,
            7,
          ],
          "circle-color": "#dffbff",
          "circle-stroke-color": "#3ea9d8",
          "circle-stroke-width": 2,
          "circle-opacity": 0.9,
        },
      });

      map.on("click", "stream-observations-circle", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const coordinates = feature.geometry?.coordinates;
        if (!isLngLat(coordinates)) return;

        showPopup(
          popupRef,
          map,
          coordinates,
          formatObservationPopup(feature.properties ?? {})
        );
      });

      map.on("mouseenter", "stream-observations-circle", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "stream-observations-circle", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", async (e) => {
        const { lng, lat } = e.lngLat;

        try {
          const markerHit = map.queryRenderedFeatures(e.point, {
            layers: ["stream-observations-circle"],
          });
          if (markerHit.length > 0) {
            return;
          }

          const stream = await fetchStreamSummaryAtPoint(lat, lng, map.getZoom());

          if (stream?.is_within) {
            await selectStreamBySourceId(stream.source_id, {
              streamData: stream,
              popupLngLat: [lng, lat],
              popupHtml: formatStreamPopup(stream),
              observationLngLat: [lng, lat],
            });
            return;
          }

          await clearStreamSelection(map);

          const parcel = await fetchParcelAtPoint(lat, lng);

          if (parcel) {
            setSelected({ type: "parcel", ...parcel });

            const parcelGeom = await fetchParcelGeom(parcel.parcel_id);
            setSourceData(map, "selected-parcel", normalizeToFC(parcelGeom));

            showPopup(popupRef, map, [lng, lat], formatParcelPopup(parcel));
            return;
          }

          setSelected(null);
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

      try {
        locationMarkerRef.current?.remove();
      } catch {}

      map.remove();
      mapRef.current = null;
    };
  }, []);

  async function clearStreamSelection(map) {
    setActiveStreamId(null);
    setSelectedStreamClickLngLat(null);
    setObservationWizardOpen(false);
    setObservationSubmitError("");
    setSourceData(map, "selected-stream", EMPTY_FC);
    setSourceData(map, "selected-stream-parcels", EMPTY_FC);
    setSourceData(map, "stream-observations", EMPTY_FC);
  }

  async function selectStreamBySourceId(sourceId, options = {}) {
    const map = mapRef.current;
    if (!map || !sourceId) return;

    const {
      streamData,
      popupLngLat,
      popupHtml,
      fitToGeometry = false,
      observationLngLat = null,
    } = options;

    try {
      const [streamGeom, intersectingParcels, observations] = await Promise.all([
        fetchStreamGeom(sourceId),
        fetchStreamIntersectingParcels(sourceId, 25),
        fetchStreamObservations(sourceId),
      ]);

      const featureCollection = normalizeToFC(streamGeom);
      const intersectingParcelCollection = normalizeToFC(intersectingParcels);
      const observationCollection = normalizeToFC(observations);
      const selectedStream = {
        type: "stream",
        ...(streamData ?? {}),
        source_id: sourceId,
      };

      setSelected(selectedStream);
      setActiveStreamId(sourceId);
      setSelectedStreamClickLngLat(observationLngLat);
      setObservationSubmitError("");

      setSourceData(map, "selected-stream", featureCollection);
      setSourceData(map, "selected-stream-parcels", intersectingParcelCollection);
      setSourceData(map, "selected-parcel", EMPTY_FC);
      setSourceData(map, "stream-observations", observationCollection);

      if (fitToGeometry) {
        fitMapToGeoJson(map, featureCollection);
      }

      const resolvedPopupLngLat =
        popupLngLat ?? getFeatureCollectionCenter(featureCollection);

      if (resolvedPopupLngLat && popupHtml) {
        showPopup(popupRef, map, resolvedPopupLngLat, popupHtml);
      }
    } catch (error) {
      console.error("Stream selection error:", error);
    }
  }

  async function refreshSelectedStreamObservations(sourceId) {
    const map = mapRef.current;
    if (!map || !sourceId) return;

    const observations = await fetchStreamObservations(sourceId);
    setSourceData(map, "stream-observations", normalizeToFC(observations));
  }

  async function handleStreamSelect(stream) {
    const sourceId = getStreamSourceId(stream);
    if (!sourceId) return;

    await selectStreamBySourceId(sourceId, {
      streamData: stream,
      popupHtml: formatStreamListPopup({ ...stream, source_id: sourceId }),
      fitToGeometry: true,
    });
  }

  function openObservationWizard() {
    setObservationSubmitError("");
    setObservationForm(createInitialObservationForm());
    setObservationWizardOpen(true);
  }

  function closeObservationWizard() {
    setObservationWizardOpen(false);
    setObservationSubmitError("");
  }

  function updateObservationField(field, value) {
    setObservationForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function togglePollutionSign(value) {
    setObservationForm((current) => {
      const alreadySelected = current.pollutionSigns.includes(value);
      return {
        ...current,
        pollutionSigns: alreadySelected
          ? current.pollutionSigns.filter((item) => item !== value)
          : [...current.pollutionSigns, value],
      };
    });
  }

  function getObservationLngLat() {
    if (isLngLat(selectedStreamClickLngLat)) return selectedStreamClickLngLat;
    const center = mapRef.current?.getCenter();
    return center ? [center.lng, center.lat] : MONMOUTH_CENTER;
  }

  async function handleObservationSubmit(event) {
    event.preventDefault();

    if (!selected || selected.type !== "stream") return;

    if (!currentUser) {
      setObservationSubmitError("Sign in to save an observation.");
      return;
    }

    const sourceId = selected.source_id ?? getStreamSourceId(selected);
    if (!sourceId) {
      setObservationSubmitError("Select a stream before adding an observation.");
      return;
    }

    const lngLat = getObservationLngLat();
    setObservationSubmitting(true);
    setObservationSubmitError("");

    try {
      const result = await submitStreamObservation({
        stream_id: selected.id ?? selected.stream_id ?? null,
        stream_source_id: sourceId,
        stream_name: getStreamName(selected),
        longitude: lngLat[0],
        latitude: lngLat[1],
        overall_condition: Number(observationForm.overallCondition),
        water_clarity: observationForm.waterClarity || null,
        flow_condition: observationForm.flowCondition || null,
        bank_condition: observationForm.bankCondition || null,
        riparian_cover: observationForm.riparianCover || null,
        litter_level: observationForm.litterLevel || null,
        pollution_signs: observationForm.pollutionSigns,
        habitat_cover: observationForm.habitatCover || null,
        observer_skill_level: observationForm.observerSkillLevel || null,
        note: observationForm.note.trim() || null,
      });

      if (!result) {
        throw new Error("Observation submission returned no result.");
      }

      await refreshSelectedStreamObservations(sourceId);
      closeObservationWizard();
      showPopup(
        popupRef,
        mapRef.current,
        lngLat,
        formatObservationSavedPopup(getStreamName(selected))
      );
    } catch (error) {
      console.error("Observation submission error:", error);
      setObservationSubmitError("We couldn't save that observation. Please try again.");
    } finally {
      setObservationSubmitting(false);
    }
  }

  const canAddObservation =
    selected?.type === "stream" && (selected.source_id ?? getStreamSourceId(selected));
  const canSubmitObservation = Boolean(currentUser);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />

      <div className="map-left-cluster">
        <button
          className="map-floating-button map-floating-button--toggle stream-drawer-toggle"
          type="button"
          onClick={() => setDrawerOpen((open) => !open)}
          aria-expanded={drawerOpen}
          aria-controls="streamwise-stream-drawer"
        >
          {drawerOpen ? "<<" : ">>"}
        </button>

        <aside
          className="stream-drawer terminal-pane"
          id="streamwise-stream-drawer"
          aria-hidden={!drawerOpen}
          style={{
            maxHeight: "min(68vh, 620px)",
            overflow: "hidden",
            transform: drawerOpen ? "translateX(0)" : "translateX(calc(-100% - 20px))",
            opacity: drawerOpen ? 1 : 0,
            pointerEvents: drawerOpen ? "auto" : "none",
            transition: "transform 220ms ease, opacity 220ms ease",
          }}
        >
          <div className="stream-drawer__header">
            <div>
              <div className="stream-drawer__kicker">Stream list</div>
              <div className="stream-drawer__title">Streams</div>
            </div>

            <div className="stream-drawer__count">
              {streamsLoading ? "Loading..." : `${streams.length} total`}
            </div>
          </div>

          <div className="stream-drawer__rule" aria-hidden="true">
            <span>----</span>
          </div>

          <div className="stream-drawer__list">
            {streamsLoading ? (
              <div className="stream-list__message">Loading stream list...</div>
            ) : streamsError ? (
              <div className="stream-list__message">{streamsError}</div>
            ) : streams.length === 0 ? (
              <div className="stream-list__message">No streams returned.</div>
            ) : (
              streams.map((stream) => {
                const sourceId = getStreamSourceId(stream);
                const active = sourceId != null && sourceId === activeStreamId;

                return (
                  <button
                    className={`stream-list__item${active ? " is-active" : ""}`}
                    key={sourceId ?? `${getStreamName(stream)}-${getStreamType(stream)}`}
                    type="button"
                    onClick={() => handleStreamSelect(stream)}
                  >
                    <div className="stream-list__name">{getStreamName(stream)}</div>
                    <div className="stream-list__type">[ {getStreamType(stream)} ]</div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {canAddObservation ? (
        <button
          className="map-floating-button map-floating-button--action map-floating-button--observation"
          type="button"
          onClick={openObservationWizard}
        >
          Add Observation
        </button>
      ) : null}

      {observationWizardOpen ? (
        <section
          className="observation-wizard terminal-pane"
          aria-label="Add stream observation"
        >
          <div className="observation-wizard__header">
            <div>
              <div className="observation-wizard__kicker">Guided observation</div>
              <h2 className="observation-wizard__title">Add Observation</h2>
            </div>
            <button
              type="button"
              className="observation-wizard__close"
              onClick={closeObservationWizard}
            >
              Close
            </button>
          </div>

          <div className="observation-wizard__meta">
            <div>
              <span className="observation-wizard__meta-label">Stream</span>
              <span>{getStreamName(selected)}</span>
            </div>
            <div>
              <span className="observation-wizard__meta-label">Source</span>
              <span>{selected?.source_id ?? getStreamSourceId(selected)}</span>
            </div>
          </div>

          <div className="observation-wizard__rule" aria-hidden="true">
            ----
          </div>

          <form className="observation-form" onSubmit={handleObservationSubmit}>
            {!canSubmitObservation ? (
              <div className="observation-form__notice">Sign in to save an observation.</div>
            ) : null}

            <WizardField
              label="How would you rate the stream overall?"
              help="Choose the option that feels closest. A quick honest estimate is useful."
            >
              <select
                value={observationForm.overallCondition}
                onChange={(event) => updateObservationField("overallCondition", event.target.value)}
              >
                {CONDITION_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </WizardField>

            <WizardField
              label="How clear is the water?"
              help="You do not need perfect visibility. Just choose the closest match."
            >
              <select
                value={observationForm.waterClarity}
                onChange={(event) => updateObservationField("waterClarity", event.target.value)}
              >
                <option value="">Select one</option>
                {WATER_CLARITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </WizardField>

            <WizardField
              label="What is the flow like today?"
              help="Think about whether the stream feels still, steady, or unusually strong."
            >
              <select
                value={observationForm.flowCondition}
                onChange={(event) => updateObservationField("flowCondition", event.target.value)}
              >
                <option value="">Select one</option>
                {FLOW_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </WizardField>

            <WizardField
              label="How stable do the banks look?"
              help="Notice whether the edges seem protected, worn, or actively falling away."
            >
              <select
                value={observationForm.bankCondition}
                onChange={(event) => updateObservationField("bankCondition", event.target.value)}
              >
                <option value="">Select one</option>
                {BANK_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </WizardField>

            <WizardField
              label="How much shade or streamside plant cover is there?"
              help="Trees, shrubs, grasses, and roots all help protect a stream."
            >
              <select
                value={observationForm.riparianCover}
                onChange={(event) => updateObservationField("riparianCover", event.target.value)}
              >
                <option value="">Select one</option>
                {COVER_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </WizardField>

            <WizardField
              label="How much litter do you notice?"
              help="Include trash on the banks, in the water, or caught in vegetation."
            >
              <select
                value={observationForm.litterLevel}
                onChange={(event) => updateObservationField("litterLevel", event.target.value)}
              >
                <option value="">Select one</option>
                {LITTER_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </WizardField>

            <WizardField
              label="Do you notice any pollution signs?"
              help="Select as many as fit. If you are not sure, leave it blank."
            >
              <div className="observation-form__chips">
                {POLLUTION_SIGN_OPTIONS.map(([value, label]) => {
                  const active = observationForm.pollutionSigns.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`observation-chip${active ? " is-active" : ""}`}
                      onClick={() => togglePollutionSign(value)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </WizardField>

            <WizardField
              label="How much habitat cover do you see?"
              help="Think about logs, roots, undercut banks, rocks, plants, and safe spaces for wildlife."
            >
              <select
                value={observationForm.habitatCover}
                onChange={(event) => updateObservationField("habitatCover", event.target.value)}
              >
                <option value="">Select one</option>
                {HABITAT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </WizardField>

            <WizardField
              label="What best describes your experience level?"
              help="New eyes matter too. Pick the option that feels honest."
            >
              <select
                value={observationForm.observerSkillLevel}
                onChange={(event) =>
                  updateObservationField("observerSkillLevel", event.target.value)
                }
              >
                <option value="">Select one</option>
                {SKILL_LEVEL_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </WizardField>

            <WizardField
              label="Anything else you noticed?"
              help="Optional. Add a quick note about wildlife, recent rain, smells, sounds, or changes."
            >
              <textarea
                rows={4}
                maxLength={1200}
                value={observationForm.note}
                onChange={(event) => updateObservationField("note", event.target.value)}
                placeholder="Optional note..."
              />
            </WizardField>

            {observationSubmitError ? (
              <div className="observation-form__error">{observationSubmitError}</div>
            ) : null}

            <div className="observation-form__actions">
              <div className="observation-form__location">
                location {formatLngLatLabel(getObservationLngLat())}
              </div>
              <button
                type="submit"
                className="map-floating-button map-floating-button--action"
                disabled={observationSubmitting || !canSubmitObservation}
              >
                {observationSubmitting
                  ? "Saving..."
                  : canSubmitObservation
                    ? "Save Observation"
                    : "Sign in to save"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function WizardField({ label, help, children }) {
  return (
    <label className="observation-field">
      <span className="observation-field__label">{label}</span>
      <span className="observation-field__help">{help}</span>
      {children}
    </label>
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
  if (!map) return;
  if (popupRef.current) popupRef.current.remove();
  popupRef.current = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    className: "streamwise-popup",
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
}

function getStreamSelectionRadius(zoom) {
  if (zoom <= 10) return 120;
  if (zoom <= 12) return 80;
  if (zoom <= 14) return 40;
  return 20;
}

function fitMapToGeoJson(map, featureCollection) {
  const bounds = getFeatureCollectionBounds(featureCollection);
  if (!bounds) return;

  map.fitBounds(bounds, {
    padding: { top: 120, right: 60, bottom: 60, left: 360 },
    duration: 900,
    maxZoom: 15,
  });
}

function getFeatureCollectionBounds(featureCollection) {
  const bounds = new maplibregl.LngLatBounds();
  let hasCoordinates = false;

  for (const feature of featureCollection?.features ?? []) {
    extendBoundsWithGeometry(bounds, feature?.geometry, () => {
      hasCoordinates = true;
    });
  }

  return hasCoordinates ? bounds : null;
}

function extendBoundsWithGeometry(bounds, geometry, onCoordinate) {
  if (!geometry) return;

  if (geometry.type === "Point") {
    if (isLngLat(geometry.coordinates)) {
      bounds.extend(geometry.coordinates);
      onCoordinate();
    }
    return;
  }

  if (geometry.type === "LineString") {
    for (const coord of geometry.coordinates ?? []) {
      if (isLngLat(coord)) {
        bounds.extend(coord);
        onCoordinate();
      }
    }
    return;
  }

  if (geometry.type === "MultiLineString") {
    for (const line of geometry.coordinates ?? []) {
      for (const coord of line ?? []) {
        if (isLngLat(coord)) {
          bounds.extend(coord);
          onCoordinate();
        }
      }
    }
    return;
  }

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates ?? []) {
      for (const coord of ring ?? []) {
        if (isLngLat(coord)) {
          bounds.extend(coord);
          onCoordinate();
        }
      }
    }
    return;
  }

  if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates ?? []) {
      for (const ring of polygon ?? []) {
        for (const coord of ring ?? []) {
          if (isLngLat(coord)) {
            bounds.extend(coord);
            onCoordinate();
          }
        }
      }
    }
    return;
  }

  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries ?? []) {
      extendBoundsWithGeometry(bounds, child, onCoordinate);
    }
  }
}

function getFeatureCollectionCenter(featureCollection) {
  const bounds = getFeatureCollectionBounds(featureCollection);
  return bounds ? bounds.getCenter().toArray() : null;
}

function isLngLat(coord) {
  return Array.isArray(coord) && coord.length >= 2;
}

function getStreamSourceId(stream) {
  return stream?.source_id ?? stream?.stream_source_id ?? stream?.id ?? null;
}

function getStreamName(stream) {
  const raw = stream?.name ?? stream?.stream_name ?? stream?.label ?? "";
  const trimmed = String(raw).trim();
  return trimmed || "Unnamed stream";
}

function getStreamType(stream) {
  const raw =
    stream?.type ??
    stream?.stream_type ??
    stream?.kind ??
    stream?.classification ??
    "";
  const trimmed = String(raw).trim().toLowerCase();
  return trimmed || "unnamed";
}

function formatLngLatLabel(lngLat) {
  return `${Number(lngLat?.[1] ?? 0).toFixed(5)}, ${Number(lngLat?.[0] ?? 0).toFixed(5)}`;
}

function formatObservationValue(value) {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

function ZoomToLocationControl(mapRef, locationMarkerRef) {
  let container = null;
  let button = null;

  return {
    onAdd() {
      container = document.createElement("div");
      container.className = "maplibregl-ctrl maplibregl-ctrl-group streamwise-map-control";
      container.style.marginTop = "8px";

      button = document.createElement("button");
      button.type = "button";
      button.className = "streamwise-map-control__button";
      button.setAttribute("aria-label", "Zoom to my location");
      button.title = "Zoom to my location";
      button.textContent = "o";
      button.onclick = () => {
        const map = mapRef.current;
        if (!map || !navigator.geolocation) {
          console.warn("Geolocation is unavailable in this browser.");
          return;
        }

        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const center = [coords.longitude, coords.latitude];

            map.flyTo({
              center,
              zoom: Math.max(map.getZoom(), 15),
              essential: true,
            });

            if (locationMarkerRef.current) {
              locationMarkerRef.current.remove();
            }

            const markerEl = document.createElement("div");
            markerEl.className = "streamwise-location-marker";
            markerEl.style.width = "18px";
            markerEl.style.height = "18px";
            markerEl.style.borderRadius = "999px";
            markerEl.style.border = "2px solid rgba(186, 243, 255, 0.95)";
            markerEl.style.background = "rgba(125, 223, 255, 0.22)";
            markerEl.style.boxShadow = "0 0 0 6px rgba(125, 223, 255, 0.12)";

            locationMarkerRef.current = new maplibregl.Marker({
              element: markerEl,
            })
              .setLngLat(center)
              .addTo(map);
          },
          (error) => {
            console.warn("Geolocation error:", error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
          }
        );
      };

      container.appendChild(button);
      return container;
    },

    onRemove() {
      if (button) {
        button.onclick = null;
      }

      container?.parentNode?.removeChild(container);
      container = null;
      button = null;
    },
  };
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
        <div><b>Parcels (buffer)</b>: ${stream.total_parcels ?? "-"}</div>
        <div>Public: ${stream.public_parcels ?? "-"}</div>
        <div>Private: ${stream.private_parcels ?? "-"}</div>
      </div>
    </div>
  `;
}

function formatStreamListPopup(stream) {
  return `
    <div style="
      min-width:220px;
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
        ${escapeHtml(getStreamName(stream))}
      </div>

      <div style="
        margin-top:8px;
        font-size:11px;
        letter-spacing:0.14em;
        text-transform:uppercase;
        opacity:0.76;
      ">
        ${escapeHtml(getStreamType(stream))}
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
        <div><b>PAMSPIN</b>: ${escapeHtml(parcel.pamspin || "-")}</div>
        <div style="margin-top:4px;">
          <b>Ownership</b>: ${escapeHtml(parcel.ownership_type || "-")}
        </div>
      </div>
    </div>
  `;
}

function formatObservationPopup(properties) {
  const pollutionSigns = properties.pollution_signs
    ? safeJsonArray(properties.pollution_signs)
    : [];

  return `
    <div style="
      min-width:240px;
      color:#dff6ff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    ">
      <div style="
        font-weight:800;
        font-size:13px;
        letter-spacing:0.08em;
        text-transform:uppercase;
        color:#baf3ff;
      ">
        Observation
      </div>

      <div style="margin-top:8px;font-size:12px;line-height:1.55;">
        <div><b>Overall</b>: ${escapeHtml(formatObservationValue(properties.overall_condition))}</div>
        <div><b>Water clarity</b>: ${escapeHtml(formatObservationValue(properties.water_clarity))}</div>
        <div><b>Flow</b>: ${escapeHtml(formatObservationValue(properties.flow_condition))}</div>
        <div><b>Banks</b>: ${escapeHtml(formatObservationValue(properties.bank_condition))}</div>
        <div><b>Riparian cover</b>: ${escapeHtml(formatObservationValue(properties.riparian_cover))}</div>
        <div><b>Litter</b>: ${escapeHtml(formatObservationValue(properties.litter_level))}</div>
        <div><b>Habitat</b>: ${escapeHtml(formatObservationValue(properties.habitat_cover))}</div>
        <div><b>Observer level</b>: ${escapeHtml(formatObservationValue(properties.observer_skill_level))}</div>
        <div><b>Pollution signs</b>: ${escapeHtml(formatObservationValue(pollutionSigns))}</div>
        ${
          properties.note
            ? `<div style="margin-top:6px;"><b>Note</b>: ${escapeHtml(properties.note)}</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function formatObservationSavedPopup(streamName) {
  return `
    <div style="
      min-width:220px;
      color:#dff6ff;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    ">
      <div style="
        font-weight:800;
        font-size:13px;
        letter-spacing:0.08em;
        text-transform:uppercase;
        color:#baf3ff;
      ">
        Observation Saved
      </div>
      <div style="margin-top:8px;font-size:12px;line-height:1.55;">
        Added to ${escapeHtml(streamName)}.
      </div>
    </div>
  `;
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value ? [value] : [];
  }
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

async function fetchStreamList() {
  const { data, error } = await supabase.rpc("stream_list");

  if (error) {
    console.warn("stream_list error:", error);
    return null;
  }

  return Array.isArray(data) ? data : [];
}

async function fetchStreamSummaryAtPoint(lat, lon, zoom) {
  const { data, error } = await supabase.rpc("stream_summary_at_point", {
    lat,
    lon,
    radius_m: getStreamSelectionRadius(zoom),
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

async function fetchStreamIntersectingParcels(source_id, buffer_m = 25) {
  if (!source_id) return EMPTY_FC;

  const { data, error } = await supabase.rpc("stream_intersecting_parcels", {
    stream_source_id: source_id,
    buffer_m,
  });

  if (error) {
    console.warn("stream_intersecting_parcels error:", error);
    return EMPTY_FC;
  }

  return data ?? EMPTY_FC;
}

async function fetchStreamObservations(source_id) {
  if (!source_id) return EMPTY_FC;

  const { data, error } = await supabase.rpc("stream_observations_geojson", {
    stream_source_id: source_id,
  });

  if (error) {
    console.warn("stream_observations_geojson error:", error);
    return EMPTY_FC;
  }

  return data ?? EMPTY_FC;
}

async function submitStreamObservation(payload) {
  const { data, error } = await supabase.rpc("add_stream_observation", payload);

  if (error) {
    console.warn("add_stream_observation error:", error);
    throw error;
  }

  return data ?? true;
}

async function fetchParcelGeom(parcel_id) {
  if (parcel_id == null) return null;

  const { data, error } = await supabase.rpc("parcel_geom", {
    parcel_id,
  });

  if (error) {
    console.warn("parcel_geom error:", error);
    return null;
  }
  return data ?? null;
}
