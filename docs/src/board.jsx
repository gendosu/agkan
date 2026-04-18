// board.jsx — draggable kanban
function Board({ t }) {
  const [tasks, setTasks] = useState(() => t.boardTasks.map(x => ({ ...x })));
  const [draggingId, setDraggingId] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Reset tasks when language changes
  useEffect(() => {
    setTasks(t.boardTasks.map(x => ({ ...x })));
  }, [t]);

  const cols = [
    { key: "backlog",     label: t.boardCols.backlog,     dot: "#6b7280" },
    { key: "ready",       label: t.boardCols.ready,       dot: "#6ea8fe" },
    { key: "in_progress", label: t.boardCols.in_progress, dot: "#ffb454" },
    { key: "review",      label: t.boardCols.review,      dot: "#b78dff" },
  ];

  const onDragStart = (e, id) => {
    setDraggingId(id);
    try { e.dataTransfer.setData("text/plain", String(id)); } catch {}
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragEnd = () => { setDraggingId(null); setDragOver(null); };
  const onDragOver = (e, key) => { e.preventDefault(); setDragOver(key); };
  const onDrop = (e, key) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain")) || draggingId;
    if (id == null) return;
    setTasks(list => list.map(x => x.id === id ? { ...x, status: key } : x));
    setDraggingId(null); setDragOver(null);
  };

  const toggleClaude = (id) => {
    setTasks(list => list.map(x => x.id === id ? { ...x, claude: !x.claude } : x));
  };

  return (
    <section className="section" id="board">
      <div className="container">
        <div className="section-hd">
          <div className="section-kicker">{t.boardKicker}</div>
          <h2>{t.boardTitle}</h2>
          <p className="section-sub">{t.boardSub}</p>
        </div>

        <div className="board-frame">
          <div className="board-topbar">
            <div className="dots"><span/><span/><span/></div>
            <div className="board-url">http://localhost:8080 — agkan board</div>
            <div className="crumb">~/my-saas · <span style={{ color: "var(--accent)" }}>●</span> connected</div>
          </div>
          <div className="board-body">
            {cols.map(col => {
              const colTasks = tasks.filter(x => x.status === col.key);
              return (
                <div
                  key={col.key}
                  className={"board-col" + (dragOver === col.key ? " drag-over" : "")}
                  onDragOver={e => onDragOver(e, col.key)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => onDrop(e, col.key)}
                >
                  <div className="board-col-hd">
                    <div className="board-col-name">
                      <span className="dot" style={{ background: col.dot }} />
                      {col.label}
                    </div>
                    <span className="board-col-count">{colTasks.length}</span>
                  </div>
                  {colTasks.map(task => (
                    <div
                      key={task.id}
                      className={"board-card" + (draggingId === task.id ? " dragging" : "")}
                      draggable
                      onDragStart={e => onDragStart(e, task.id)}
                      onDragEnd={onDragEnd}
                    >
                      <div className="board-card-id">#{task.id}</div>
                      <div className="board-card-title">{task.title}</div>
                      <div className="board-card-meta">
                        <span className={"board-tag prio-" + task.prio}>{task.prio}</span>
                        <span className="board-tag">{task.tag}</span>
                      </div>
                      <div className="board-card-claude">
                        <span>claude-code</span>
                        <button
                          className={task.claude ? "active" : ""}
                          onClick={() => toggleClaude(task.id)}
                        >
                          {task.claude ? "● RUNNING" : "▸ RUN"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="board-hint">
          <Icon name="arrow-right" size={14} />
          {t.boardHint}
          <span style={{ marginLeft: "auto" }}>
            <span className="kbd">drag</span> or <span className="kbd">j</span>/<span className="kbd">k</span>
          </span>
        </div>
      </div>
    </section>
  );
}
Object.assign(window, { Board });
