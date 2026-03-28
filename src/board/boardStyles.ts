export const BOARD_STYLES = `
    :root {
      --bg-page: #f1f5f9;
      --bg-surface: #ffffff;
      --bg-surface-subtle: #f8fafc;
      --bg-surface-hover: #f1f5f9;
      --border-color: #e2e8f0;
      --border-color-subtle: #f1f5f9;
      --text-primary: #1e293b;
      --text-secondary: #64748b;
      --text-muted: #94a3b8;
      --header-bg: #1e293b;
      --tag-bg: #e0f2fe;
      --tag-color: #0369a1;
      --column-count-bg: #e2e8f0;
      --column-count-color: #64748b;
      --input-bg: #ffffff;
      --burger-dropdown-bg: #ffffff;
      --drag-over-bg: #eff6ff;
    }
    [data-theme="dark"] {
      --bg-page: #0f172a;
      --bg-surface: #1e293b;
      --bg-surface-subtle: #1e293b;
      --bg-surface-hover: #334155;
      --border-color: #334155;
      --border-color-subtle: #1e293b;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --header-bg: #0f172a;
      --tag-bg: #0c4a6e;
      --tag-color: #7dd3fc;
      --column-count-bg: #334155;
      --column-count-color: #94a3b8;
      --input-bg: #1e293b;
      --burger-dropdown-bg: #1e293b;
      --drag-over-bg: #1e3a5f;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg-page); color: var(--text-primary); }
    header { background: var(--header-bg); color: white; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 18px; font-weight: 700; }
    .board-title { font-size: 14px; font-weight: 400; opacity: 0.75; }
    .board-container { display: flex; width: 100%; height: calc(100vh - 92px); gap: 0; }
    .board { display: flex; gap: 12px; padding: 16px; overflow-x: auto; flex: 1; align-items: stretch; min-width: 0; }
    .board.with-panel { padding-right: 0; }
    .column { background: var(--bg-surface-subtle); border: 1px solid var(--border-color); border-radius: 8px; width: 240px; flex-shrink: 0; display: flex; flex-direction: column; border-top: 3px solid transparent; }
    .column-header { padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
    .column-title { font-size: 13px; font-weight: 700; }
    .column-header-right { display: flex; align-items: center; gap: 6px; }
    .column-count { background: var(--column-count-bg); color: var(--column-count-color); border-radius: 10px; font-size: 11px; font-weight: 600; padding: 2px 7px; }
    .add-btn { background: none; border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 4px; width: 22px; height: 22px; font-size: 14px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .add-btn:hover { background: var(--border-color); color: var(--text-primary); }
    .column-body { padding: 8px; min-height: 60px; flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; }
    .column.drag-over .column-body { background: var(--drag-over-bg); border-radius: 6px; }
    .card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 6px; cursor: grab; transition: box-shadow 0.15s; }
    .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .card.active { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.25); background: #eff6ff; }
    [data-theme="dark"] .card.active { border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(96,165,250,0.25); background: #1e3a5f; }
    .card.dragging { opacity: 0.5; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; gap: 4px; }
    .card-id { font-size: 11px; color: var(--text-muted); font-weight: 600; }
    .card-actions { margin-left: auto; flex-shrink: 0; }
    .claude-run-split { position: relative; display: inline-flex; }
    .claude-run-btn { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px 0 0 10px; border: 1px solid #16a34a; border-right: none; background: #dcfce7; color: #16a34a; cursor: pointer; line-height: 1.4; transition: background 0.15s; }
    .claude-run-btn:hover { background: #bbf7d0; }
    .claude-run-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .claude-run-toggle { font-size: 9px; font-weight: 600; padding: 2px 5px; border-radius: 0 10px 10px 0; border: 1px solid #16a34a; background: #dcfce7; color: #16a34a; cursor: pointer; line-height: 1.4; transition: background 0.15s; }
    .claude-run-toggle:hover { background: #bbf7d0; }
    .claude-run-toggle:disabled { opacity: 0.45; cursor: not-allowed; }
    .claude-run-menu { display: none; position: absolute; top: 100%; right: 0; margin-top: 2px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; min-width: 160px; padding: 2px 0; }
    .claude-run-split.open .claude-run-menu { display: block; }
    .claude-run-menu-item { display: block; width: 100%; text-align: left; font-size: 11px; font-weight: 500; padding: 6px 12px; border: none; background: none; color: var(--text-primary); cursor: pointer; white-space: nowrap; }
    .claude-run-menu-item:hover { background: var(--bg-surface-hover); }
    .claude-run-menu-item:disabled { opacity: 0.45; cursor: not-allowed; }
    .claude-plan-btn { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; border: 1px solid #2563eb; background: #dbeafe; color: #2563eb; cursor: pointer; line-height: 1.4; transition: background 0.15s; }
    .claude-plan-btn:hover { background: #bfdbfe; }
    .claude-detail-btn { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; border: 1px solid #d97706; background: #fef3c7; color: #d97706; cursor: pointer; line-height: 1.4; transition: background 0.15s; }
    .claude-detail-btn:hover { background: #fde68a; }
    .card-title { font-size: 13px; font-weight: 500; line-height: 1.4; word-break: break-word; }
    .card-tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
    .tag { background: var(--tag-bg); color: var(--tag-color); font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 10px; }
    .priority { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; }
    .priority-critical { background: #fee2e2; color: #dc2626; }
    .priority-high { background: #fee2e2; color: #dc2626; }
    .priority-medium { background: #fef9c3; color: #ca8a04; }
    .priority-low { background: #dcfce7; color: #16a34a; }
    .context-menu { position: fixed; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0; z-index: 1000; display: none; min-width: 140px; }
    .context-menu-item { padding: 8px 14px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
    .context-menu-item:hover { background: var(--bg-surface-hover); }
    .context-menu-item.danger { color: #dc2626; }
    .context-menu-item.danger:hover { background: #fef2f2; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 2000; display: none; align-items: center; justify-content: center; }
    .modal-overlay.show { display: flex; }
    .modal { background: var(--bg-surface); border-radius: 8px; padding: 24px; width: 520px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); color: var(--text-primary); }
    .modal h2 { font-size: 16px; margin-bottom: 14px; }
    .modal label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
    .modal input, .modal textarea, .modal select { width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: inherit; margin-bottom: 12px; background: var(--input-bg); color: var(--text-primary); }
    .modal textarea { resize: vertical; min-height: 60px; }
    .modal input:focus, .modal textarea:focus, .modal select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .modal-actions button { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-secondary); }
    .modal-actions button:hover { background: var(--bg-surface-hover); }
    .modal-actions button.primary { background: #3b82f6; color: white; border-color: #3b82f6; }
    .modal-actions button.primary:hover { background: #2563eb; }
    .toast { position: fixed; bottom: 20px; right: 20px; background: #ef4444; color: white; padding: 10px 16px; border-radius: 6px; font-size: 13px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; }
    .detail-panel { position: relative; width: 0; height: calc(100vh - 92px); background: var(--bg-surface); box-shadow: none; border-left: 0 solid var(--border-color); display: flex; flex-direction: column; max-width: 800px; overflow: hidden; transition: width 0.25s ease; }
    .detail-panel-resize-handle { position: absolute; top: 0; left: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 10; background: transparent; }
    .detail-panel-resize-handle:hover, .detail-panel-resize-handle.dragging { background: rgba(59,130,246,0.3); }
    .detail-panel.open { width: 400px; min-width: 280px; border-left-width: 1px; }
    .detail-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
    .detail-panel-header h2 { font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .detail-panel-close { background: none; border: none; font-size: 20px; color: var(--text-secondary); cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; }
    .detail-panel-close:hover { background: var(--bg-surface-hover); color: var(--text-primary); }
    .detail-panel-body { flex: 1; overflow: hidden; min-width: 0; display: flex; flex-direction: column; }
    .detail-field { margin-bottom: 16px; word-wrap: break-word; }
    .description-field-wrapper { display: flex; flex-direction: column; margin-bottom: 16px; }
    .detail-field-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; letter-spacing: 0.05em; }
    .detail-field-value { font-size: 13px; color: var(--text-primary); line-height: 1.5; }
    .detail-field-value.empty { color: var(--text-muted); font-style: italic; }
    .detail-status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; }
    .detail-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .detail-meta-table { width: 100%; border-collapse: collapse; }
    .detail-meta-table td { padding: 4px 0; font-size: 12px; }
    .detail-meta-table td:first-child { color: var(--text-secondary); width: 100px; }
    .detail-meta-table td:last-child { color: var(--text-primary); }
    .detail-panel-footer { padding: 12px 20px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .detail-panel-footer button { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #3b82f6; background: #3b82f6; color: white; }
    .detail-panel-footer button:hover { background: #2563eb; border-color: #2563eb; }
    .detail-edit-input { width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: var(--input-bg); color: var(--text-primary); }
    .detail-edit-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .detail-edit-textarea { width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: none; min-height: 80px; background: var(--input-bg); color: var(--text-primary); overflow: hidden; }
    .detail-edit-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .detail-edit-select { width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: var(--input-bg); color: var(--text-primary); }
    .detail-edit-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .tag-select-wrapper { position: relative; }
    .tag-select-control { border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; min-height: 36px; cursor: text; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; background: var(--input-bg); }
    .tag-select-control:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .tag-pill { background: var(--tag-bg); color: var(--tag-color); font-size: 11px; font-weight: 600; padding: 2px 4px 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 3px; }
    .tag-pill-remove { background: none; border: none; color: var(--tag-color); cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; display: inline-flex; align-items: center; border-radius: 50%; }
    .tag-pill-remove:hover { color: #dc2626; background: rgba(220,38,38,0.1); }
    .tag-select-input { border: none; outline: none; font-size: 12px; font-family: inherit; min-width: 80px; flex: 1; background: transparent; padding: 2px 0; color: var(--text-primary); }
    .tag-select-input::placeholder { color: var(--text-muted); }
    .tag-select-dropdown { position: absolute; top: calc(100% + 2px); left: 0; right: 0; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; max-height: 180px; overflow-y: auto; display: none; }
    .tag-select-dropdown.open { display: block; }
    .tag-select-option { padding: 6px 10px; font-size: 12px; cursor: pointer; color: var(--text-primary); }
    .tag-select-option:hover, .tag-select-option.focused { background: #eff6ff; color: #0369a1; }
    .tag-select-no-options { padding: 6px 10px; font-size: 12px; color: var(--text-muted); font-style: italic; }
    .filter-bar { display: flex; align-items: center; gap: 16px; height: 44px; background: var(--bg-surface-subtle); border-bottom: 1px solid var(--border-color); padding: 0 16px; flex-shrink: 0; overflow-x: auto; }
    .filter-group { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .filter-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; white-space: nowrap; }
    .filter-priority-btn { border: 1px solid var(--border-color); background: var(--bg-surface); border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; text-transform: uppercase; color: var(--text-secondary); }
    .filter-priority-btn:hover { background: var(--bg-surface-hover); }
    .filter-priority-btn.active[data-priority="critical"] { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    .filter-priority-btn.active[data-priority="high"] { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    .filter-priority-btn.active[data-priority="medium"] { background: #fef9c3; color: #ca8a04; border-color: #fde047; }
    .filter-priority-btn.active[data-priority="low"] { background: #dcfce7; color: #16a34a; border-color: #86efac; }
    .filter-search-input { border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 8px; font-size: 12px; font-family: inherit; background: var(--input-bg); color: var(--text-primary); width: 160px; }
    .filter-search-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .filter-assignee-input { border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 8px; font-size: 12px; font-family: inherit; background: var(--input-bg); color: var(--text-primary); width: 120px; }
    .filter-assignee-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .filter-tag-pill { background: var(--tag-bg); color: var(--tag-color); font-size: 11px; font-weight: 600; padding: 2px 4px 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .filter-tag-pill-remove { background: none; border: none; color: var(--tag-color); cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; display: inline-flex; align-items: center; border-radius: 50%; }
    .filter-tag-pill-remove:hover { color: #dc2626; background: rgba(220,38,38,0.1); }
    .filter-tag-dropdown-wrapper { flex-shrink: 0; }
    .filter-tag-add-btn { border: 1px dashed var(--border-color); background: var(--bg-surface); border-radius: 4px; padding: 2px 8px; font-size: 11px; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
    .filter-tag-add-btn:hover { background: var(--bg-surface-hover); border-color: var(--text-muted); }
    .filter-tag-dropdown { position: fixed; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 200; max-height: 180px; overflow-y: auto; display: none; min-width: 140px; }
    .filter-tag-dropdown.open { display: block; }
    .filter-tag-dropdown-option { padding: 6px 10px; font-size: 12px; cursor: pointer; color: var(--text-primary); white-space: nowrap; }
    .filter-tag-dropdown-option:hover { background: #eff6ff; color: #0369a1; }
    .filter-tag-dropdown-empty { padding: 6px 10px; font-size: 12px; color: var(--text-muted); font-style: italic; }
    .filter-clear-btn { border: 1px solid var(--border-color); background: var(--bg-surface); border-radius: 4px; padding: 2px 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: var(--text-secondary); display: none; flex-shrink: 0; margin-left: auto; }
    .filter-clear-btn:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }
    .filter-clear-btn.visible { display: block; }
    .detail-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border-color); flex-shrink: 0; padding: 0 20px; background: var(--bg-surface); }
    .detail-tab { padding: 8px 14px; font-size: 12px; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; border-top: none; border-left: none; border-right: none; }
    .detail-tab:hover { color: var(--text-secondary); }
    .detail-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }
    .detail-tab-content { display: none; flex: 1; overflow-y: auto; min-height: 0; }
    .detail-tab-content.active { display: block; overflow-y: auto; }
    .detail-relations { font-size: 12px; color: var(--text-secondary); padding: 6px 0; border-bottom: 1px solid var(--border-color-subtle); margin-bottom: 12px; }
    .detail-relation-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .detail-relation-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); width: 80px; flex-shrink: 0; letter-spacing: 0.05em; }
    .detail-relation-ids { display: flex; flex-wrap: wrap; gap: 4px; }
    .detail-relation-id { font-size: 11px; color: #3b82f6; background: #eff6ff; border-radius: 10px; padding: 1px 7px; font-weight: 600; }
    .detail-timestamp { font-size: 11px; color: var(--text-muted); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color-subtle); }
    .detail-footer-timestamp { font-size: 11px; color: var(--text-muted); }
    .comment-item { position: relative; padding: 6px 0 6px 10px; border-left: 2px solid var(--border-color); margin-bottom: 10px; }
    .comment-item:hover { border-left-color: #3b82f6; }
    .comment-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
    .comment-author { font-size: 11px; font-weight: 600; color: var(--text-secondary); }
    .comment-date { font-size: 11px; color: var(--text-muted); }
    .comment-actions { display: none; margin-left: auto; gap: 4px; }
    .comment-item:hover .comment-actions { display: flex; }
    .comment-action-btn { background: none; border: none; padding: 1px 4px; cursor: pointer; color: var(--text-muted); font-size: 12px; border-radius: 3px; }
    .comment-action-btn:hover { color: var(--text-primary); background: var(--bg-surface-hover); }
    .comment-action-btn.danger:hover { color: #dc2626; background: #fef2f2; }
    .comment-content { font-size: 13px; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; }
    .comment-edit-area { width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 60px; background: var(--input-bg); color: var(--text-primary); margin-top: 4px; }
    .comment-edit-area:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .comment-edit-actions { display: flex; gap: 6px; margin-top: 4px; }
    .comment-btn { background: none; border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; cursor: pointer; color: var(--text-secondary); }
    .comment-btn:hover { background: var(--bg-surface-hover); }
    .add-comment-trigger { background: none; border: 1px dashed var(--border-color); border-radius: 6px; padding: 8px 12px; font-size: 12px; color: var(--text-muted); cursor: pointer; width: 100%; text-align: left; margin-top: 4px; }
    .add-comment-trigger:hover { border-color: var(--text-muted); color: var(--text-secondary); background: var(--bg-surface-subtle); }
    .add-comment-form { margin-top: 4px; display: none; }
    .add-comment-form.open { display: block; }
    .add-comment-textarea { width: 100%; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 72px; background: var(--input-bg); color: var(--text-primary); }
    .add-comment-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .add-comment-submit { margin-top: 6px; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #3b82f6; background: #3b82f6; color: white; }
    .add-comment-submit:hover { background: #2563eb; border-color: #2563eb; }
    .add-comment-cancel { margin-top: 6px; margin-left: 6px; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-secondary); }
    .add-comment-cancel:hover { background: var(--bg-surface-hover); }
    .burger-menu-wrapper { position: relative; }
    .burger-menu-btn { background: none; border: none; color: white; cursor: pointer; padding: 4px 6px; border-radius: 4px; display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center; opacity: 0.8; }
    .burger-menu-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
    .burger-menu-btn span { display: block; width: 18px; height: 2px; background: white; border-radius: 1px; }
    .burger-menu-dropdown { position: absolute; right: 0; top: calc(100% + 6px); background: var(--burger-dropdown-bg); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0; z-index: 1000; display: none; min-width: 180px; }
    .burger-menu-dropdown.open { display: block; }
    .burger-menu-item { padding: 8px 14px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--text-primary); white-space: nowrap; }
    .burger-menu-item:hover { background: var(--bg-surface-hover); }
    .burger-menu-item.danger { color: #dc2626; }
    .burger-menu-item.danger:hover { background: #fef2f2; }
    .burger-menu-separator { height: 1px; background: var(--border-color); margin: 4px 0; }
    .add-metadata-row-btn { background: none; border: 1px dashed var(--border-color); border-radius: 6px; padding: 5px 10px; font-size: 12px; color: var(--text-secondary); cursor: pointer; width: 100%; text-align: left; margin-bottom: 12px; }
    .add-metadata-row-btn:hover { border-color: var(--text-muted); background: var(--bg-surface-subtle); }
    .metadata-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
    .metadata-row-key { flex: 1; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: inherit; background: var(--input-bg); color: var(--text-primary); }
    .metadata-row-key:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .metadata-row-value { flex: 2; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: inherit; background: var(--input-bg); color: var(--text-primary); }
    .metadata-row-value:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .metadata-row-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px; flex-shrink: 0; }
    .metadata-row-remove:hover { color: #dc2626; background: #fef2f2; }
    .dependency-toggle-btn { border: 1px solid var(--border-color); background: var(--bg-surface); border-radius: 4px; padding: 2px 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: var(--text-secondary); flex-shrink: 0; transition: all 0.2s ease; }
    .dependency-toggle-btn:hover { background: var(--bg-surface-hover); border-color: var(--text-muted); color: var(--text-primary); }
    .dependency-toggle-btn.active { background: #3b82f6; border-color: #3b82f6; color: white; }
    .dependency-toggle-btn.active:hover { background: #2563eb; border-color: #2563eb; }
    svg#dependency-svg { pointer-events: none; }
    .dependency-line { transition: stroke-width 0.1s ease; }
    .claude-stream-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .claude-stream-modal-header h2 { font-size: 16px; font-weight: 700; margin: 0; }
    .claude-stream-modal-header button { background: none; border: none; font-size: 18px; color: var(--text-secondary); cursor: pointer; padding: 2px 6px; border-radius: 4px; line-height: 1; }
    .claude-stream-modal-header button:hover { background: var(--bg-surface-hover); color: var(--text-primary); }
    .claude-stream-log { font-family: 'Courier New', Courier, monospace; background: #0d0d0d; color: #22c55e; overflow-y: auto; max-height: 400px; white-space: pre-wrap; padding: 10px 12px; border-radius: 6px; font-size: 12px; line-height: 1.5; margin-bottom: 12px; }
    .claude-stream-tool-use { background: var(--bg-header, #1e293b); color: #94a3b8; padding: 1px 4px; border-radius: 3px; }
    .claude-stream-modal-footer { display: flex; align-items: center; gap: 8px; }
    .claude-stream-status { color: var(--text-secondary); font-size: 11px; flex: 1; }
    .claude-stream-stop-btn { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #dc2626; background: #dc2626; color: white; }
    .claude-stream-stop-btn:hover:not(:disabled) { background: #b91c1c; border-color: #b91c1c; }
    .claude-stream-stop-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #claude-stream-close-btn { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-secondary); }
    #claude-stream-close-btn:hover { background: var(--bg-surface-hover); color: var(--text-primary); }
    .run-log-list { padding: 12px 16px; }
    .run-log-item { border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 8px; overflow: hidden; }
    .run-log-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; background: var(--bg-surface-subtle, #f8fafc); user-select: none; }
    .run-log-header:hover { background: var(--bg-surface-hover); }
    .run-log-toggle { font-size: 10px; color: var(--text-muted); flex-shrink: 0; transition: transform 0.15s ease; }
    .run-log-item.open .run-log-toggle { transform: rotate(90deg); }
    .run-log-date { font-size: 12px; color: var(--text-secondary); font-family: 'Courier New', Courier, monospace; }
    .run-log-exit { font-size: 11px; font-weight: 600; border-radius: 10px; padding: 1px 7px; flex-shrink: 0; }
    .run-log-exit.success { background: #dcfce7; color: #15803d; }
    .run-log-exit.failure { background: #fee2e2; color: #dc2626; }
    .run-log-body { display: none; font-family: 'Courier New', Courier, monospace; background: #0d0d0d; color: #22c55e; font-size: 11px; line-height: 1.5; padding: 8px 12px; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
    .run-log-item.open .run-log-body { display: block; }
    .run-log-tool-use { color: #94a3b8; }
    .run-log-empty { padding: 24px 16px; font-size: 12px; color: var(--text-muted); text-align: center; }`;
