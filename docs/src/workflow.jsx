// workflow.jsx
function Workflow({ t }) {
  const n = t.flowNodes;
  return (
    <section className="section" id="workflow">
      <div className="container">
        <div className="section-hd">
          <div className="section-kicker">{t.flowKicker}</div>
          <h2>{t.flowTitle}</h2>
          <p className="section-sub">{t.flowSub}</p>
        </div>

        <div className="flow">
          <div className="flow-node you">
            <div className="flow-node-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M4 20c1.5-3.5 5-5 8-5s6.5 1.5 8 5"/></svg>
            </div>
            <div className="flow-node-tag">{n.you.tag}</div>
            <h4>{n.you.t}</h4>
            <p>{n.you.d}</p>
          </div>

          <div className="flow-arrow">
            <span className="flow-arrow-label">task</span>
            <Icon name="arrow-right" size={18} />
            <span className="flow-arrow-label bottom">add</span>
          </div>

          <div className="flow-node agkan">
            <div className="flow-node-icon">
              <div style={{ width: 20, height: 20, borderRadius: 5, background: "linear-gradient(135deg, var(--accent), var(--accent-dim))", display: "grid", placeItems: "center", color: "#041a0f", fontWeight: 800, fontSize: 12, fontFamily: "var(--mono)" }}>a</div>
            </div>
            <div className="flow-node-tag">{n.agkan.tag}</div>
            <h4>{n.agkan.t}</h4>
            <p>{n.agkan.d}</p>
          </div>

          <div className="flow-arrow">
            <span className="flow-arrow-label">dispatch</span>
            <Icon name="arrow-right" size={18} />
            <span className="flow-arrow-label bottom">report</span>
          </div>

          <div className="flow-node claude">
            <div className="flow-node-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            </div>
            <div className="flow-node-tag">{n.claude.tag}</div>
            <h4>{n.claude.t}</h4>
            <p>{n.claude.d}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
Object.assign(window, { Workflow });
