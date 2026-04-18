// cta.jsx
function CTA({ t }) {
  return (
    <section className="section">
      <div className="container">
        <div className="finalcta">
          <h2>{t.ctaTitle}</h2>
          <p>{t.ctaSub}</p>
          <div className="hero-ctas">
            <a className="btn btn-primary" href="https://www.npmjs.com/package/agkan" target="_blank" rel="noreferrer">
              <Icon name="npm" size={15} /> {t.ctaPrimary}
            </a>
            <a className="btn btn-ghost" href="https://github.com/gendosu/agkan" target="_blank" rel="noreferrer">
              <Icon name="github" size={15} /> {t.ctaGhost}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ t }) {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>{t.footer}</div>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="https://github.com/gendosu/agkan">GitHub</a>
          <a href="https://www.npmjs.com/package/agkan">npm</a>
          <a href="https://gendosu.github.io/agkan/reference/commands/">Docs</a>
          <a href="https://gendosu.github.io/agkan/feed.xml">RSS</a>
        </div>
      </div>
    </footer>
  );
}
Object.assign(window, { CTA, Footer });
