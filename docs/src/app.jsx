// app.jsx — main composition
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "variant": "default",
  "accent": "green",
  "density": "comfy",
  "lang": "en",
  "theme": "dark"
}/*EDITMODE-END*/;

function App() {
  const [lang, setLang] = useState(TWEAK_DEFAULTS.lang || "en");
  const [theme, setTheme] = useState(TWEAK_DEFAULTS.theme || "dark");
  const [variant, setVariant] = useState(TWEAK_DEFAULTS.variant || "default");
  const [accent, setAccent] = useState(TWEAK_DEFAULTS.accent || "green");
  const [density, setDensity] = useState(TWEAK_DEFAULTS.density || "comfy");
  const [tweaksOn, setTweaksOn] = useState(false);

  const t = I18N[lang];

  // Apply theme/variant/accent to html
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-variant", variant);
    root.setAttribute("data-density", density);
    // accent overrides
    const accents = {
      green:  { c: "#00ff88", d: "#00c46a", g: "rgba(0, 255, 136, 0.18)" },
      amber:  { c: "#ffb454", d: "#e89a3c", g: "rgba(255, 180, 84, 0.2)" },
      cyan:   { c: "#66e3ff", d: "#33bde0", g: "rgba(102, 227, 255, 0.2)" },
    };
    const a = accents[accent] || accents.green;
    if (theme === "dark") {
      root.style.setProperty("--accent", a.c);
      root.style.setProperty("--accent-dim", a.d);
      root.style.setProperty("--accent-glow", a.g);
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-dim");
      root.style.removeProperty("--accent-glow");
    }
  }, [theme, variant, accent, density]);

  // Edit-mode protocol
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === "__activate_edit_mode") setTweaksOn(true);
      else if (d.type === "__deactivate_edit_mode") setTweaksOn(false);
      else if (d.type === "__edit_mode_set_keys" && d.edits) {
        const ed = d.edits;
        if (ed.variant) setVariant(ed.variant);
        if (ed.accent) setAccent(ed.accent);
        if (ed.density) setDensity(ed.density);
        if (ed.lang) setLang(ed.lang);
        if (ed.theme) setTheme(ed.theme);
      }
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const persist = (keys) => {
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: keys }, "*");
  };

  return (
    <>
      <Nav lang={lang} setLang={(l) => { setLang(l); persist({ lang: l }); }}
           theme={theme} setTheme={(th) => { setTheme(th); persist({ theme: th }); }}
           t={t} />
      <Hero t={t} />
      <Features t={t} />
      <BigTerminal t={t} />
      <Board t={t} />
      <Workflow t={t} />
      <Install t={t} />
      <Reference t={t} />
      <CTA t={t} />
      <Footer t={t} />

      <Tweaks
        active={tweaksOn}
        variant={variant} setVariant={(v) => { setVariant(v); persist({ variant: v }); }}
        accent={accent} setAccent={(a) => { setAccent(a); persist({ accent: a }); }}
        density={density} setDensity={(d) => { setDensity(d); persist({ density: d }); }}
      />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
