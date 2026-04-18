// hero.jsx
function Hero({ t }) {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-top">
          <span className="hero-top-pulse" />
          <span className="hero-top-tag">NEW</span>
          <span>{t.heroPill}</span>
        </div>

        <div className="hero-layout">
          <div>
            <h1>
              {t.heroTitle1}<br/>
              {t.heroTitle2}<br/>
              <span className="accent">{t.heroTitle3}</span><span className="caret" />
            </h1>
            <p className="lead">{t.heroLead}</p>
            <div className="hero-ctas">
              <a className="btn btn-primary" href="#install">
                <Icon name="terminal" size={15} /> {t.ctaInstall}
              </a>
              <a className="btn btn-ghost" href="https://github.com/gendosu/agkan" target="_blank" rel="noreferrer">
                <Icon name="github" size={15} /> {t.ctaGithub}
              </a>
              <span className="hero-install">
                <span className="mono">$</span>
                <code className="mono">npm i -g agkan</code>
                <CopyButton text="npm i -g agkan" t={t} />
              </span>
            </div>

            <div className="hero-stats">
              {t.stats.map((s, i) => (
                <div key={i}>
                  <div className="hero-stat-value">{s.v}</div>
                  <div className="hero-stat-label">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <HeroTerminal t={t} />
        </div>
      </div>
    </section>
  );
}

function HeroTerminal({ t }) {
  // Small looping preview terminal, mirrors the big one but shorter
  return (
    <div className="term-wrap">
      <div className="term">
        <div className="term-bar">
          <div className="term-dots">
            <span className="term-dot r" /><span className="term-dot y" /><span className="term-dot g" />
          </div>
          <div className="term-bar-title">~/my-saas — agkan</div>
        </div>
        <div className="term-body" style={{ minHeight: 300, whiteSpace: "pre-wrap" }}>
          <span className="term-line"><span className="term-prompt">➜</span> <span className="term-dim">~/my-saas</span> <span className="term-cmd">agkan task list</span> <span className="term-flag">--status</span> in_progress</span>
          <span className="term-line term-dim">──────────────────────────────────────────────</span>
          <span className="term-line"><span className="term-head"> ID   TITLE                              STATUS</span></span>
          <span className="term-line"> <span className="term-id">14</span>   Implement passkey login flow       <span className="term-status-ip">in_progress</span></span>
          <span className="term-line"> <span className="term-id">15</span>   Weekly digest email template       <span className="term-status-ip">in_progress</span></span>
          <span className="term-line term-dim">──────────────────────────────────────────────</span>
          <span className="term-line"><span className="term-prompt">➜</span> <span className="term-dim">~/my-saas</span> <span className="term-cmd">agkan run</span> <span className="term-id">14</span> <span className="term-flag">--agent</span> claude</span>
          <span className="term-line"><span className="term-ok">▸</span> <span className="term-dim">launching claude-code with task context...</span></span>
          <span className="term-line"><span className="term-ok">▸</span> <span className="term-dim">reading .agkan/tasks/14.md</span></span>
          <span className="term-line"><span className="term-ok">✓</span> agent attached <span className="term-dim">(pid 48201, session 1f3a)</span></span>
          <span className="term-line"><span className="term-prompt">➜</span> <span className="term-dim">~/my-saas</span> <span className="term-caret" /></span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Hero });
