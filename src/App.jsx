import { useState } from "react";
import MapView from "./map/MapView";
import AsciiStreamOverlay from "./ui/AsciiStreamOverlay";

export default function App() {
  const [entered, setEntered] = useState(false);

  return (
    <div className={`app-shell${entered ? " is-entered" : ""}`}>
      <div className="app-shell__backdrop" aria-hidden="true" />

      <div className="app-shell__map-stage" aria-hidden={!entered}>
        <MapView />

        <header className="map-hud terminal-pane terminal-pane--compact">
          <div className="map-hud__row">
            <div className="map-hud__eyebrow">Monmouth County field guide</div>
            <div className="map-hud__status">live</div>
          </div>
          <div className="map-hud__title">StreamWise</div>
          <div className="map-hud__rule" aria-hidden="true">
            <span>----</span>
          </div>
          <div className="map-hud__subtitle">stream + parcel query</div>
          <div className="map-hud__meta">
            <span>hydrology</span>
            <span>parcel overlay</span>
          </div>
        </header>
      </div>

      <div
        className="app-shell__splash-stage"
        aria-hidden={entered}
      >
        <AsciiStreamOverlay />
        <div className="app-shell__haze" aria-hidden="true" />

        <section className="splash-panel">
          <div className="splash-panel__kicker">Monmouth County</div>
          <h1 className="splash-panel__title">StreamWise</h1>
          <p className="splash-panel__subtitle">
            Monmouth County stream + parcel viewer
          </p>

          <button
            type="button"
            className="splash-panel__button"
            onClick={() => setEntered(true)}
          >
            Enter StreamWise
          </button>
        </section>
      </div>
    </div>
  );
}
