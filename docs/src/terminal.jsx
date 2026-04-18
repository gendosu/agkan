// terminal.jsx — interactive typing CLI demo

const TERM_STEPS = [
  { type: "prompt" },
  { type: "typed", tokens: [["cmd", "agkan task add "], ["str", "\"Implement passkey login\""], [" ", " "], ["flag", "--status"], [" ", " ready "], ["flag", "--tag"], [" ", " auth"]], speed: 22 },
  { type: "out", lines: [
    ["ok", "✓ created task "], ["id", "#14"], ["dim", " · ready · auth"],
  ]},
  { type: "gap" },

  { type: "prompt" },
  { type: "typed", tokens: [["cmd", "agkan task list "], ["flag", "--status"], [" ", " ready"]], speed: 22 },
  { type: "out", lines: [
    ["head", " ID   TITLE                           STATUS    TAGS"],
    ["dim",  " ──   ─────────────────────────────   ──────    ────"],
    [],
    [" ",   " "], ["id", "14"], [" ", "   Implement passkey login flow   "], ["status-ip", "ready"], ["dim", "     auth"],
    [" ",   " "], ["id", "18"], [" ", "   Retry logic for email queue    "], ["status-ip", "ready"], ["dim", "     backend"],
    [" ",   " "], ["id", "19"], [" ", "   Migrate Postgres 14 → 16       "], ["status-ip", "ready"], ["dim", "     infra"],
  ]},
  { type: "gap" },

  { type: "prompt" },
  { type: "typed", tokens: [["cmd", "agkan task update "], ["id2", "14"], [" ", " "], ["flag", "--status"], [" ", " in_progress"]], speed: 22 },
  { type: "out", lines: [
    ["ok", "✓ "], ["id", "#14"], ["dim", " ready → "], ["status-ip", "in_progress"],
  ]},
  { type: "gap" },

  { type: "prompt" },
  { type: "typed", tokens: [["cmd", "agkan run "], ["id2", "14"], [" ", " "], ["flag", "--agent"], [" ", " claude"]], speed: 22 },
  { type: "out", lines: [
    ["dim", "▸ launching Claude Code in isolated shell..."],
    ["dim", "▸ mounting .agkan/tasks/14.md as context"],
    ["dim", "▸ session started — session-id 1f3a"],
    [],
    ["ok",  "✓ "], ["prompt", "Claude> "], ["", "Reading auth module at src/auth/*..."],
    ["ok",  "✓ "], ["prompt", "Claude> "], ["", "Plan: WebAuthn registration + passkey verify"],
    ["ok",  "✓ "], ["prompt", "Claude> "], ["", "Editing src/auth/passkey.ts (+187, −12)"],
    ["ok",  "✓ "], ["prompt", "Claude> "], ["", "Running tests… 42 passed"],
  ]},
  { type: "gap" },

  { type: "prompt" },
  { type: "typed", tokens: [["cmd", "agkan task update "], ["id2", "14"], [" ", " "], ["flag", "--status"], [" ", " review"]], speed: 22 },
  { type: "out", lines: [
    ["ok", "✓ "], ["id", "#14"], ["dim", " in_progress → "], ["status-rv", "review"],
    ["dim", "  4 files changed · +187 −12 · ready for your eyes"],
  ]},
];

function renderToken(kind, txt, i) {
  const cls = {
    cmd: "term-cmd", flag: "term-flag", str: "term-string", dim: "term-dim",
    ok: "term-ok", id: "term-id", id2: "term-id", head: "term-head",
    "status-ip": "term-status-ip", "status-rv": "term-status-rv", "status-dn": "term-status-dn",
    prompt: "term-prompt",
  }[kind] || "";
  return <span key={i} className={cls}>{txt}</span>;
}

function BigTerminal({ t }) {
  const [rendered, setRendered] = useState([]); // array of lines (each = array of tokens or 'typing')
  const [playing, setPlaying] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const timeoutRef = useRef(null);
  const bodyRef = useRef(null);

  const reset = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setRendered([]);
    setStepIdx(0);
    setTick(tk => tk + 1);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (stepIdx >= TERM_STEPS.length) {
      timeoutRef.current = setTimeout(() => {
        setRendered([]);
        setStepIdx(0);
      }, 2800);
      return () => clearTimeout(timeoutRef.current);
    }
    const step = TERM_STEPS[stepIdx];
    if (step.type === "prompt") {
      setRendered(r => [...r, { kind: "prompt", tokens: [["prompt", "➜"], [" ", " "], ["dim", "~/my-saas"], [" ", " "]], trailingCaret: false }]);
      timeoutRef.current = setTimeout(() => setStepIdx(s => s + 1), 160);
    } else if (step.type === "typed") {
      // type the tokens char by char into the last line
      const totalText = step.tokens.map(([k, v]) => v).join("");
      let i = 0;
      const typeNext = () => {
        i++;
        setRendered(r => {
          const copy = [...r];
          const last = { ...copy[copy.length - 1] };
          // rebuild up to i chars
          let remaining = i;
          const built = [["prompt", "➜"], [" ", " "], ["dim", "~/my-saas"], [" ", " "]];
          for (const [k, v] of step.tokens) {
            if (remaining <= 0) break;
            const take = Math.min(v.length, remaining);
            built.push([k, v.slice(0, take)]);
            remaining -= take;
          }
          last.tokens = built;
          last.trailingCaret = i < totalText.length;
          copy[copy.length - 1] = last;
          return copy;
        });
        if (i < totalText.length) {
          timeoutRef.current = setTimeout(typeNext, step.speed + Math.random() * 18);
        } else {
          timeoutRef.current = setTimeout(() => setStepIdx(s => s + 1), 280);
        }
      };
      typeNext();
    } else if (step.type === "out") {
      // Parse lines. A flat tokens array where empty arrays = newline
      const lines = [];
      let cur = [];
      for (const tok of step.lines) {
        if (!tok || tok.length === 0) {
          lines.push(cur); cur = [];
        } else {
          cur.push(tok);
        }
      }
      if (cur.length) lines.push(cur);
      // we need to emit lines one by one with a small delay
      let li = 0;
      const emitNext = () => {
        if (li < lines.length) {
          setRendered(r => [...r, { kind: "out", tokens: lines[li] }]);
          li++;
          timeoutRef.current = setTimeout(emitNext, 110);
        } else {
          timeoutRef.current = setTimeout(() => setStepIdx(s => s + 1), 500);
        }
      };
      emitNext();
    } else if (step.type === "gap") {
      timeoutRef.current = setTimeout(() => setStepIdx(s => s + 1), 600);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [stepIdx, playing, tick]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [rendered]);

  return (
    <section className="section" id="demo">
      <div className="container">
        <div className="section-hd">
          <div className="section-kicker">{t.termKicker}</div>
          <h2>{t.termTitle}</h2>
          <p className="section-sub">{t.termSub}</p>
        </div>

        <div className="term">
          <div className="term-bar">
            <div className="term-dots">
              <span className="term-dot r" /><span className="term-dot y" /><span className="term-dot g" />
            </div>
            <div className="term-bar-title">~/my-saas — agkan demo</div>
            <div className="term-tabs">
              <button className="term-tab active">zsh</button>
              <button className="term-tab">node</button>
              <button className="term-tab">+</button>
            </div>
          </div>
          <div className="term-body" ref={bodyRef} style={{ minHeight: 440, whiteSpace: "pre-wrap" }}>
            {rendered.map((ln, li) => (
              <span className="term-line" key={li}>
                {(ln.tokens || []).map(([k, v], ti) => renderToken(k, v, ti))}
                {ln.trailingCaret && <span className="term-caret" />}
              </span>
            ))}
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderTop: "1px solid #23262d",
            background: "#0d0f12", fontFamily: "var(--mono)", fontSize: 12, color: "#9aa0ab"
          }}>
            <button
              onClick={() => setPlaying(p => !p)}
              style={{ background: "transparent", border: "1px solid #2e3139", color: "#e8eaee", padding: "4px 10px", borderRadius: 5, fontFamily: "var(--mono)", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name={playing ? "pause" : "play"} size={11} />
              {playing ? t.termPause : t.termPlay}
            </button>
            <button
              onClick={reset}
              style={{ background: "transparent", border: "1px solid #2e3139", color: "#e8eaee", padding: "4px 10px", borderRadius: 5, fontFamily: "var(--mono)", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="replay" size={11} /> {t.termReplay}
            </button>
            <span style={{ marginLeft: "auto" }}>session · agkan v0.12.1 · node 20.11</span>
          </div>
        </div>
      </div>
    </section>
  );
}
Object.assign(window, { BigTerminal });
