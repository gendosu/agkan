export const BOARD_STYLES = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; color: #1e293b; }
    header { background: #1e293b; color: white; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 18px; font-weight: 700; }
    .board-title { font-size: 14px; font-weight: 400; opacity: 0.75; }
    .board-container { display: flex; width: 100%; height: calc(100vh - 92px); gap: 0; }
    .board { display: flex; gap: 12px; padding: 16px; overflow-x: auto; flex: 1; align-items: stretch; min-width: 0; }
    .board.with-panel { padding-right: 0; }
    .column { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; width: 240px; flex-shrink: 0; display: flex; flex-direction: column; border-top: 3px solid transparent; }
    .column-header { padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
    .column-title { font-size: 13px; font-weight: 700; }
    .column-header-right { display: flex; align-items: center; gap: 6px; }
    .column-count { background: #e2e8f0; color: #64748b; border-radius: 10px; font-size: 11px; font-weight: 600; padding: 2px 7px; }
    .add-btn { background: none; border: 1px solid #cbd5e1; color: #64748b; border-radius: 4px; width: 22px; height: 22px; font-size: 14px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .add-btn:hover { background: #e2e8f0; color: #1e293b; }
    .column-body { padding: 8px; min-height: 60px; flex: 1; overflow-y: auto; min-height: 0; }
    .column.drag-over .column-body { background: #eff6ff; border-radius: 6px; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 6px; cursor: grab; transition: box-shadow 0.15s; }
    .card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .card.dragging { opacity: 0.5; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
    .card-id { font-size: 11px; color: #94a3b8; font-weight: 600; }
    .card-title { font-size: 13px; font-weight: 500; line-height: 1.4; }
    .card-tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
    .tag { background: #e0f2fe; color: #0369a1; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 10px; }
    .priority { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; }
    .priority-critical { background: #fee2e2; color: #dc2626; }
    .priority-high { background: #fee2e2; color: #dc2626; }
    .priority-medium { background: #fef9c3; color: #ca8a04; }
    .priority-low { background: #dcfce7; color: #16a34a; }
    .context-menu { position: fixed; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0; z-index: 1000; display: none; min-width: 140px; }
    .context-menu-item { padding: 8px 14px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    .context-menu-item:hover { background: #f1f5f9; }
    .context-menu-item.danger { color: #dc2626; }
    .context-menu-item.danger:hover { background: #fef2f2; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 2000; display: none; align-items: center; justify-content: center; }
    .modal-overlay.show { display: flex; }
    .modal { background: white; border-radius: 8px; padding: 24px; width: 520px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
    .modal h2 { font-size: 16px; margin-bottom: 14px; }
    .modal label { display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 4px; }
    .modal input, .modal textarea, .modal select { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: inherit; margin-bottom: 12px; background: white; }
    .modal textarea { resize: vertical; min-height: 60px; }
    .modal input:focus, .modal textarea:focus, .modal select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .modal-actions button { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #e2e8f0; background: white; color: #64748b; }
    .modal-actions button:hover { background: #f1f5f9; }
    .modal-actions button.primary { background: #3b82f6; color: white; border-color: #3b82f6; }
    .modal-actions button.primary:hover { background: #2563eb; }
    .toast { position: fixed; bottom: 20px; right: 20px; background: #ef4444; color: white; padding: 10px 16px; border-radius: 6px; font-size: 13px; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; }
    .detail-panel { position: relative; width: 0; height: calc(100vh - 92px); background: white; box-shadow: none; border-left: 0 solid #e2e8f0; display: flex; flex-direction: column; max-width: 800px; overflow: hidden; transition: width 0.25s ease; }
    .detail-panel-resize-handle { position: absolute; top: 0; left: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 10; background: transparent; }
    .detail-panel-resize-handle:hover, .detail-panel-resize-handle.dragging { background: rgba(59,130,246,0.3); }
    .detail-panel.open { width: 400px; min-width: 280px; border-left-width: 1px; }
    .detail-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
    .detail-panel-header h2 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .detail-panel-close { background: none; border: none; font-size: 20px; color: #64748b; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0; }
    .detail-panel-close:hover { background: #f1f5f9; color: #1e293b; }
    .detail-panel-body { flex: 1; overflow: hidden; min-width: 0; display: flex; flex-direction: column; }
    .detail-field { margin-bottom: 16px; word-wrap: break-word; }
    .description-field-wrapper { flex: 1; display: flex; flex-direction: column; min-height: 0; margin-bottom: 0; }
    .detail-field-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; letter-spacing: 0.05em; }
    .detail-field-value { font-size: 13px; color: #1e293b; line-height: 1.5; }
    .detail-field-value.empty { color: #94a3b8; font-style: italic; }
    .detail-status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; }
    .detail-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .detail-meta-table { width: 100%; border-collapse: collapse; }
    .detail-meta-table td { padding: 4px 0; font-size: 12px; }
    .detail-meta-table td:first-child { color: #64748b; width: 100px; }
    .detail-meta-table td:last-child { color: #1e293b; }
    .detail-panel-footer { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; flex-shrink: 0; }
    .detail-panel-footer button { padding: 7px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #3b82f6; background: #3b82f6; color: white; }
    .detail-panel-footer button:hover { background: #2563eb; border-color: #2563eb; }
    .detail-edit-input { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: white; color: #1e293b; }
    .detail-edit-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .detail-edit-textarea { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 240px; background: white; color: #1e293b; }
    .detail-edit-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .description-field-wrapper .detail-edit-textarea { flex: 1; resize: none; min-height: 0; }
    .detail-edit-select { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: white; color: #1e293b; }
    .detail-edit-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .tag-select-wrapper { position: relative; }
    .tag-select-control { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 8px; min-height: 36px; cursor: text; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; background: white; }
    .tag-select-control:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .tag-pill { background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 600; padding: 2px 4px 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 3px; }
    .tag-pill-remove { background: none; border: none; color: #0369a1; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; display: inline-flex; align-items: center; border-radius: 50%; }
    .tag-pill-remove:hover { color: #dc2626; background: rgba(220,38,38,0.1); }
    .tag-select-input { border: none; outline: none; font-size: 12px; font-family: inherit; min-width: 80px; flex: 1; background: transparent; padding: 2px 0; color: #1e293b; }
    .tag-select-input::placeholder { color: #94a3b8; }
    .tag-select-dropdown { position: absolute; top: calc(100% + 2px); left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; max-height: 180px; overflow-y: auto; display: none; }
    .tag-select-dropdown.open { display: block; }
    .tag-select-option { padding: 6px 10px; font-size: 12px; cursor: pointer; color: #1e293b; }
    .tag-select-option:hover, .tag-select-option.focused { background: #eff6ff; color: #0369a1; }
    .tag-select-no-options { padding: 6px 10px; font-size: 12px; color: #94a3b8; font-style: italic; }
    .filter-bar { display: flex; align-items: center; gap: 16px; height: 44px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0 16px; flex-shrink: 0; overflow-x: auto; }
    .filter-group { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .filter-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; white-space: nowrap; }
    .filter-priority-btn { border: 1px solid #e2e8f0; background: white; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; cursor: pointer; text-transform: uppercase; color: #64748b; }
    .filter-priority-btn:hover { background: #f1f5f9; }
    .filter-priority-btn.active[data-priority="critical"] { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    .filter-priority-btn.active[data-priority="high"] { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    .filter-priority-btn.active[data-priority="medium"] { background: #fef9c3; color: #ca8a04; border-color: #fde047; }
    .filter-priority-btn.active[data-priority="low"] { background: #dcfce7; color: #16a34a; border-color: #86efac; }
    .filter-assignee-input { border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px 8px; font-size: 12px; font-family: inherit; background: white; color: #1e293b; width: 120px; }
    .filter-assignee-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .filter-tag-pill { background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 600; padding: 2px 4px 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .filter-tag-pill-remove { background: none; border: none; color: #0369a1; cursor: pointer; font-size: 13px; line-height: 1; padding: 0 2px; display: inline-flex; align-items: center; border-radius: 50%; }
    .filter-tag-pill-remove:hover { color: #dc2626; background: rgba(220,38,38,0.1); }
    .filter-tag-dropdown-wrapper { flex-shrink: 0; }
    .filter-tag-add-btn { border: 1px dashed #cbd5e1; background: white; border-radius: 4px; padding: 2px 8px; font-size: 11px; color: #64748b; cursor: pointer; white-space: nowrap; }
    .filter-tag-add-btn:hover { background: #f1f5f9; border-color: #94a3b8; }
    .filter-tag-dropdown { position: fixed; background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 200; max-height: 180px; overflow-y: auto; display: none; min-width: 140px; }
    .filter-tag-dropdown.open { display: block; }
    .filter-tag-dropdown-option { padding: 6px 10px; font-size: 12px; cursor: pointer; color: #1e293b; white-space: nowrap; }
    .filter-tag-dropdown-option:hover { background: #eff6ff; color: #0369a1; }
    .filter-tag-dropdown-empty { padding: 6px 10px; font-size: 12px; color: #94a3b8; font-style: italic; }
    .filter-clear-btn { border: 1px solid #e2e8f0; background: white; border-radius: 4px; padding: 2px 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: #64748b; display: none; flex-shrink: 0; margin-left: auto; }
    .filter-clear-btn:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }
    .filter-clear-btn.visible { display: block; }
    .detail-tabs { display: flex; gap: 0; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; padding: 0 20px; background: white; }
    .detail-tab { padding: 8px 14px; font-size: 12px; font-weight: 600; color: #94a3b8; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; border-top: none; border-left: none; border-right: none; }
    .detail-tab:hover { color: #64748b; }
    .detail-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }
    .detail-tab-content { display: none; flex: 1; overflow-y: auto; min-height: 0; }
    .detail-tab-content.active { display: flex; flex-direction: column; }
    .detail-relations { font-size: 12px; color: #64748b; padding: 6px 0; border-bottom: 1px solid #f1f5f9; margin-bottom: 12px; }
    .detail-relation-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .detail-relation-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; width: 80px; flex-shrink: 0; letter-spacing: 0.05em; }
    .detail-relation-ids { display: flex; flex-wrap: wrap; gap: 4px; }
    .detail-relation-id { font-size: 11px; color: #3b82f6; background: #eff6ff; border-radius: 10px; padding: 1px 7px; font-weight: 600; }
    .detail-timestamp { font-size: 11px; color: #94a3b8; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
    .comment-item { position: relative; padding: 6px 0 6px 10px; border-left: 2px solid #e2e8f0; margin-bottom: 10px; }
    .comment-item:hover { border-left-color: #3b82f6; }
    .comment-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
    .comment-author { font-size: 11px; font-weight: 600; color: #64748b; }
    .comment-date { font-size: 11px; color: #94a3b8; }
    .comment-actions { display: none; margin-left: auto; gap: 4px; }
    .comment-item:hover .comment-actions { display: flex; }
    .comment-action-btn { background: none; border: none; padding: 1px 4px; cursor: pointer; color: #94a3b8; font-size: 12px; border-radius: 3px; }
    .comment-action-btn:hover { color: #1e293b; background: #f1f5f9; }
    .comment-action-btn.danger:hover { color: #dc2626; background: #fef2f2; }
    .comment-content { font-size: 13px; color: #1e293b; line-height: 1.5; white-space: pre-wrap; }
    .comment-edit-area { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 60px; background: white; color: #1e293b; margin-top: 4px; }
    .comment-edit-area:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .comment-edit-actions { display: flex; gap: 6px; margin-top: 4px; }
    .comment-btn { background: none; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; cursor: pointer; color: #64748b; }
    .comment-btn:hover { background: #f1f5f9; }
    .add-comment-trigger { background: none; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #94a3b8; cursor: pointer; width: 100%; text-align: left; margin-top: 4px; }
    .add-comment-trigger:hover { border-color: #94a3b8; color: #64748b; background: #f8fafc; }
    .add-comment-form { margin-top: 4px; display: none; }
    .add-comment-form.open { display: block; }
    .add-comment-textarea { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 72px; background: white; color: #1e293b; }
    .add-comment-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
    .add-comment-submit { margin-top: 6px; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #3b82f6; background: #3b82f6; color: white; }
    .add-comment-submit:hover { background: #2563eb; border-color: #2563eb; }
    .add-comment-cancel { margin-top: 6px; margin-left: 6px; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #e2e8f0; background: white; color: #64748b; }
    .add-comment-cancel:hover { background: #f1f5f9; }
    .burger-menu-wrapper { position: relative; }
    .burger-menu-btn { background: none; border: none; color: white; cursor: pointer; padding: 4px 6px; border-radius: 4px; display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center; opacity: 0.8; }
    .burger-menu-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
    .burger-menu-btn span { display: block; width: 18px; height: 2px; background: white; border-radius: 1px; }
    .burger-menu-dropdown { position: absolute; right: 0; top: calc(100% + 6px); background: white; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0; z-index: 1000; display: none; min-width: 180px; }
    .burger-menu-dropdown.open { display: block; }
    .burger-menu-item { padding: 8px 14px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; color: #1e293b; white-space: nowrap; }
    .burger-menu-item:hover { background: #f1f5f9; }
    .burger-menu-item.danger { color: #dc2626; }
    .burger-menu-item.danger:hover { background: #fef2f2; }`;
