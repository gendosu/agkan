// install.jsx
function Install({ t }) {
  return (
    <section className="section" id="install">
      <div className="container">
        <div className="section-hd">
          <div className="section-kicker">{t.installKicker}</div>
          <h2>{t.installTitle}</h2>
          <p className="section-sub">{t.installSub}</p>
        </div>

        <div className="install-grid">
          {t.installSteps.map((step, i) => (
            <div className="code-card" key={i}>
              <div className="code-card-hd">
                <div className="step">
                  <div className="num">{step.n}</div>
                  <span>{step.label}</span>
                </div>
                <CopyButton
                  text={step.code.map(([k, v]) => v).join("").replace(/^\s*\$/, "").trim()}
                  t={t}
                />
              </div>
              <pre><code>
                {step.code.map(([k, v], j) => {
                  const cls = k === "p" ? "p" : k === "c" ? "c" : k === "f" ? "f" : k === "s" ? "s" : "";
                  return cls ? <span key={j} className={cls}>{v}</span> : <span key={j}>{v}</span>;
                })}
              </code></pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
Object.assign(window, { Install });
