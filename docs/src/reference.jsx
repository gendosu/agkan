// reference.jsx
function Reference({ t }) {
  const [tab, setTab] = useState("task");
  const [open, setOpen] = useState(null);

  const groups = [
    { id: "task", cmds: t.refDetail.task },
    { id: "tag", cmds: t.refDetail.tag },
    { id: "other", cmds: t.refDetail.other },
  ];

  const group = groups.find(g => g.id === tab);

  const toggle = (i) => setOpen(open === i ? null : i);

  return (
    <section id="reference" className="section">
      <div className="container">
        <div className="section-hd">
          <div className="section-kicker">{t.refKicker}</div>
          <h2>{t.refTitle}</h2>
          <p className="section-sub">{t.refSub}</p>
        </div>

        {/* Quick overview */}
        <div className="refgrid" style={{ marginBottom: 40 }}>
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

        {/* Detailed reference */}
        <div className="ref-tabs">
          {groups.map(g => (
            <button
              key={g.id}
              className={"ref-tab" + (tab === g.id ? " on" : "")}
              onClick={() => { setTab(g.id); setOpen(null); }}
            >
              {g.id}
            </button>
          ))}
        </div>

        <div>
          {group.cmds.map((cmd, i) => (
            <div key={i} className={"ref-cmd" + (open === i ? " open" : "")}>
              <button className="ref-cmd-hd" onClick={() => toggle(i)}>
                <code>{cmd.name}</code>
                <span>{cmd.desc}</span>
                <svg className="ref-cmd-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {open === i && (
                <div className="ref-cmd-body">
                  <div className="ref-syntax">{cmd.syntax}</div>
                  {cmd.opts && cmd.opts.length > 0 && (
                    <div className="ref-opts">
                      <div className="ref-opts-label">{t.refOptions}</div>
                      {cmd.opts.map(([flag, desc], j) => (
                        <div key={j} className="ref-opt-row">
                          <code>{flag}</code>
                          <span>{desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {cmd.examples && cmd.examples.length > 0 && (
                    <div className="ref-examples">
                      <pre>{cmd.examples.join("\n")}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Status & Priority reference tables */}
        <div className="ref-tables">
          <div className="ref-table">
            <div className="ref-table-hd">{t.refDetail.statusLabel}</div>
            {t.refDetail.statuses.map(([n, d], i) => (
              <div key={i} className="ref-table-row"><code>{n}</code><span>{d}</span></div>
            ))}
          </div>
          <div className="ref-table">
            <div className="ref-table-hd">{t.refDetail.priorityLabel}</div>
            {t.refDetail.priorities.map(([n, d], i) => (
              <div key={i} className="ref-table-row"><code>{n}</code><span>{d}</span></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
Object.assign(window, { Reference });
