// nav.jsx
function Nav({ lang, setLang, theme, setTheme, t }) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const toggleMenu = () => setMenuOpen((prev) => !prev);

  const handleLinkClick = () => setMenuOpen(false);

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <a href="#" className="nav-logo">
          <div className="nav-logo-mark">a</div>
          agkan
          <span style={{ color: "var(--fg-4)", fontWeight: 400, fontSize: 12, marginLeft: 4 }}>{t.heroTag}</span>
        </a>
        <div className={`nav-links${menuOpen ? " nav-links--open" : ""}`}>
          <a href="#features" onClick={handleLinkClick}>{t.nav.features}</a>
          <a href="#demo" onClick={handleLinkClick}>{t.nav.demo}</a>
          <a href="#board" onClick={handleLinkClick}>{t.nav.board}</a>
          <a href="#workflow" onClick={handleLinkClick}>{t.nav.workflow}</a>
          <a href="#install" onClick={handleLinkClick}>{t.nav.install}</a>
          <a href="#reference" onClick={handleLinkClick}>{t.nav.docs}</a>
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
          <button className="nav-burger" onClick={toggleMenu} aria-label="Toggle navigation" aria-expanded={menuOpen}>
            <span className={`nav-burger-bar${menuOpen ? " nav-burger-bar--open" : ""}`}></span>
            <span className={`nav-burger-bar${menuOpen ? " nav-burger-bar--open" : ""}`}></span>
            <span className={`nav-burger-bar${menuOpen ? " nav-burger-bar--open" : ""}`}></span>
          </button>
        </div>
      </div>
    </nav>
  );
}
Object.assign(window, { Nav });
