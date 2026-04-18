// nav.jsx
function Nav({ lang, setLang, theme, setTheme, t }) {
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <a href="#" className="nav-logo">
          <div className="nav-logo-mark">a</div>
          agkan
          <span style={{ color: "var(--fg-4)", fontWeight: 400, fontSize: 12, marginLeft: 4 }}>{t.heroTag}</span>
        </a>
        <div className="nav-links" style={{ display: "flex" }}>
          <a href="#features">{t.nav.features}</a>
          <a href="#demo">{t.nav.demo}</a>
          <a href="#board">{t.nav.board}</a>
          <a href="#workflow">{t.nav.workflow}</a>
          <a href="#install">{t.nav.install}</a>
        </div>
        <div className="nav-right">
          <button className="nav-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme">
            <span className={theme === "dark" ? "on" : ""}>DARK</span>
            <span className={theme === "light" ? "on" : ""}>LIGHT</span>
          </button>
          <button className="nav-toggle" onClick={() => setLang(lang === "en" ? "ja" : "en")} title="Language">
            <span className={lang === "en" ? "on" : ""}>EN</span>
            <span className={lang === "ja" ? "on" : ""}>JA</span>
          </button>
          <a className="nav-cta ghost" href="https://github.com/gendosu/agkan" target="_blank" rel="noreferrer">
            <Icon name="github" size={14} /> GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
Object.assign(window, { Nav });
