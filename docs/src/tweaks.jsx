// tweaks.jsx — floating panel
function Tweaks({ active, variant, setVariant, accent, setAccent, density, setDensity }) {
  if (!active) return null;
  return (
    <div className="tweaks-panel">
      <h5>TWEAKS</h5>

      <div className="tweak-row">
        <div className="tweak-label">Design direction</div>
        <div className="tweak-options">
          <button className={"tweak-opt" + (variant === "default" ? " on" : "")} onClick={() => setVariant("default")}>Terminal</button>
          <button className={"tweak-opt" + (variant === "editorial" ? " on" : "")} onClick={() => setVariant("editorial")}>Editorial</button>
          <button className={"tweak-opt" + (variant === "maxhacker" ? " on" : "")} onClick={() => setVariant("maxhacker")}>Maxhacker</button>
        </div>
      </div>

      <div className="tweak-row">
        <div className="tweak-label">Accent</div>
        <div className="tweak-options">
          <button className={"tweak-opt" + (accent === "green" ? " on" : "")} onClick={() => setAccent("green")}>Green</button>
          <button className={"tweak-opt" + (accent === "amber" ? " on" : "")} onClick={() => setAccent("amber")}>Amber</button>
          <button className={"tweak-opt" + (accent === "cyan" ? " on" : "")} onClick={() => setAccent("cyan")}>Cyan</button>
        </div>
      </div>

      <div className="tweak-row">
        <div className="tweak-label">Density</div>
        <div className="tweak-options">
          <button className={"tweak-opt" + (density === "comfy" ? " on" : "")} onClick={() => setDensity("comfy")}>Comfy</button>
          <button className={"tweak-opt" + (density === "compact" ? " on" : "")} onClick={() => setDensity("compact")}>Compact</button>
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { Tweaks });
