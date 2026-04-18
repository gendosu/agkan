// features.jsx
function Features({ t }) {
  const icons = ["ai", "kanban", "db", "tree", "link", "tag", "browser", "braces"];
  return (
    <section className="section" id="features">
      <div className="container">
        <div className="section-hd">
          <div className="section-kicker">{t.featuresKicker}</div>
          <h2>{t.featuresTitle}</h2>
          <p className="section-sub">{t.featuresSub}</p>
        </div>
        <div className="features-grid">
          {t.features.map((f, i) => (
            <div className="feature" key={i}>
              <div className="feature-glyph">
                <span className="feature-num">{f.n}</span>
                <span>─</span>
              </div>
              <div className="feature-icon">
                <Icon name={icons[i]} size={19} color="var(--fg-2)" />
              </div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
Object.assign(window, { Features });
