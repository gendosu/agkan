// reference.jsx
function Reference({ t }) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-hd">
          <div className="section-kicker">{t.refKicker}</div>
          <h2>{t.refTitle}</h2>
          <p className="section-sub">{t.refSub}</p>
        </div>
        <div className="refgrid">
          <div className="refcol">
            <h4>task</h4>
            {t.ref.task.map(([c, d], i) => (
              <div className="refrow" key={i}><code>{c}</code><span>{d}</span></div>
            ))}
          </div>
          <div className="refcol">
            <h4>tag</h4>
            {t.ref.tag.map(([c, d], i) => (
              <div className="refrow" key={i}><code>{c}</code><span>{d}</span></div>
            ))}
          </div>
          <div className="refcol">
            <h4>core</h4>
            {t.ref.other.map(([c, d], i) => (
              <div className="refrow" key={i}><code>{c}</code><span>{d}</span></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
Object.assign(window, { Reference });
