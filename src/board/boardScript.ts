export const BOARD_SCRIPT = `
    let draggedCard = null;
    let sourceBody = null;

    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('dragstart', e => {
        draggedCard = card;
        sourceBody = card.parentElement;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedCard = null;
        sourceBody = null;
      });
    });

    document.querySelectorAll('.column').forEach(col => {
      col.addEventListener('dragover', e => {
        e.preventDefault();
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => handleDrop(e, col.dataset.status, col));
    });

    // Auto-scroll during drag within column bodies
    let autoScrollRAF = null;
    let autoScrollBody = null;
    let autoScrollDir = 0;
    const AUTO_SCROLL_ZONE = 60;
    const AUTO_SCROLL_SPEED = 8;

    function stopAutoScroll() {
      if (autoScrollRAF !== null) {
        cancelAnimationFrame(autoScrollRAF);
        autoScrollRAF = null;
      }
      autoScrollBody = null;
      autoScrollDir = 0;
    }

    function startAutoScroll() {
      if (autoScrollRAF !== null) return;
      function step() {
        if (autoScrollBody && autoScrollDir !== 0) {
          autoScrollBody.scrollTop += autoScrollDir * AUTO_SCROLL_SPEED;
          autoScrollRAF = requestAnimationFrame(step);
        } else {
          autoScrollRAF = null;
        }
      }
      autoScrollRAF = requestAnimationFrame(step);
    }

    function attachAutoScrollToBody(body) {
      body.addEventListener('dragover', e => {
        const rect = body.getBoundingClientRect();
        const y = e.clientY - rect.top;
        if (y < AUTO_SCROLL_ZONE) {
          autoScrollBody = body;
          autoScrollDir = -1;
          startAutoScroll();
        } else if (y > rect.height - AUTO_SCROLL_ZONE) {
          autoScrollBody = body;
          autoScrollDir = 1;
          startAutoScroll();
        } else {
          stopAutoScroll();
        }
      });
      body.addEventListener('dragleave', stopAutoScroll);
      body.addEventListener('drop', stopAutoScroll);
    }

    document.querySelectorAll('.column-body').forEach(attachAutoScrollToBody);

    document.addEventListener('dragend', stopAutoScroll);

    async function handleDrop(e, newStatus, colEl) {
      e.preventDefault();
      colEl.classList.remove('drag-over');
      if (!draggedCard) return;
      const taskId = draggedCard.dataset.id;
      const oldStatus = draggedCard.dataset.status;
      if (oldStatus === newStatus) return;

      const targetBody = document.getElementById('col-' + newStatus);
      const prevBody = sourceBody;
      targetBody.appendChild(draggedCard);
      draggedCard.dataset.status = newStatus;
      updateCount(oldStatus);
      updateCount(newStatus);

      try {
        const res = await fetch('/api/tasks/' + taskId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) throw new Error('Server error');
      } catch {
        prevBody.appendChild(draggedCard);
        draggedCard.dataset.status = oldStatus;
        updateCount(oldStatus);
        updateCount(newStatus);
        showToast();
      }
    }

    function updateCount(status) {
      const col = document.querySelector('.column[data-status="' + status + '"]');
      if (!col) return;
      col.querySelector('.column-count').textContent = col.querySelector('.column-body').children.length;
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      if (msg) toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Add task modal
    const addModal = document.getElementById('add-modal');
    const addTitle = document.getElementById('add-title');
    const addBody = document.getElementById('add-body');
    const addPriority = document.getElementById('add-priority');
    const addStatus = document.getElementById('add-status');

    document.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        addStatus.value = btn.dataset.status;
        addTitle.value = '';
        addBody.value = '';
        addPriority.value = '';
        addModal.classList.add('show');
        addTitle.focus();
      });
    });

    document.getElementById('add-cancel').addEventListener('click', () => {
      addModal.classList.remove('show');
    });

    addModal.addEventListener('click', e => {
      if (e.target === addModal) addModal.classList.remove('show');
    });

    addTitle.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); document.getElementById('add-submit').click(); }
    });

    document.getElementById('add-submit').addEventListener('click', async () => {
      const title = addTitle.value.trim();
      if (!title) { addTitle.focus(); return; }
      const status = addStatus.value;
      addModal.classList.remove('show');

      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body: addBody.value.trim() || null, status, priority: addPriority.value || null })
        });
        if (!res.ok) throw new Error('Server error');
        location.reload();
      } catch {
        showToast('Failed to add task');
      }
    });

    // Context menu
    const ctxMenu = document.getElementById('context-menu');
    let ctxTargetCard = null;

    document.addEventListener('contextmenu', e => {
      const card = e.target.closest('.card');
      if (!card) { ctxMenu.style.display = 'none'; return; }
      e.preventDefault();
      ctxTargetCard = card;
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.style.display = 'block';
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#context-menu')) {
        ctxMenu.style.display = 'none';
        ctxTargetCard = null;
      }
    });

    document.getElementById('ctx-delete').addEventListener('click', async e => {
      e.stopPropagation();
      ctxMenu.style.display = 'none';
      if (!ctxTargetCard) return;
      const card = ctxTargetCard;
      ctxTargetCard = null;
      const taskId = card.dataset.id;
      const status = card.dataset.status;
      if (!confirm('Delete task #' + taskId + '?')) return;

      card.remove();
      updateCount(status);

      try {
        const res = await fetch('/api/tasks/' + taskId, { method: 'DELETE' });
        if (!res.ok) throw new Error('Server error');
      } catch {
        location.reload();
        showToast('Failed to delete task');
      }
    });

    // Detail panel - create and insert into board-container
    const boardContainer = document.querySelector('.board-container');
    const detailPanelHtml = '<div class="detail-panel" id="detail-panel"><div class="detail-panel-resize-handle" id="detail-panel-resize-handle"></div><div class="detail-panel-header"><h2 id="detail-panel-title">Task Detail</h2><button class="detail-panel-close" id="detail-panel-close" title="Close">&times;</button></div><div class="detail-tabs" id="detail-tabs"><button class="detail-tab active" data-tab="details">Details</button><button class="detail-tab" data-tab="comments" id="detail-tab-comments">Comments</button></div><div class="detail-panel-body" id="detail-panel-body"><div class="detail-tab-content active" id="detail-tab-content-details"></div><div class="detail-tab-content" id="detail-tab-content-comments"></div></div><div class="detail-panel-footer" id="detail-panel-footer"><button id="detail-save-btn">Save</button></div></div>';
    boardContainer.insertAdjacentHTML('beforeend', detailPanelHtml);

    const detailPanel = document.getElementById('detail-panel');
    const detailPanelTitle = document.getElementById('detail-panel-title');
    const detailPanelBody = document.getElementById('detail-panel-body');
    let detailTaskId = null;
    let lastTab = 'details';

    function closeDetailPanel() {
      detailPanel.classList.remove('open');
      detailPanel.style.width = '';
      detailTaskId = null;
    }

    document.getElementById('detail-panel-close').addEventListener('click', closeDetailPanel);

    // Tab switching
    function switchTab(tabName) {
      lastTab = tabName;
      document.querySelectorAll('.detail-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
      });
      document.querySelectorAll('.detail-tab-content').forEach(el => {
        el.classList.toggle('active', el.id === 'detail-tab-content-' + tabName);
      });
      const footer = document.getElementById('detail-panel-footer');
      if (footer) footer.style.display = tabName === 'details' ? '' : 'none';
    }

    document.getElementById('detail-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.detail-tab');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    // Detail panel resize
    const resizeHandle = document.getElementById('detail-panel-resize-handle');
    const PANEL_MIN_WIDTH = 280;
    const PANEL_MAX_WIDTH = 800;
    const PANEL_DEFAULT_WIDTH = 400;

    // Initialize panel width from server config (async)
    (async function initPanelWidth() {
      let targetWidth = PANEL_DEFAULT_WIDTH;
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          const savedWidth = data && data.board && data.board.detailPaneWidth;
          if (typeof savedWidth === 'number' && savedWidth >= PANEL_MIN_WIDTH && savedWidth <= PANEL_MAX_WIDTH) {
            targetWidth = savedWidth;
          }
        }
      } catch {
        // Ignore errors, use default width
      }
      // Store the width for when panel opens (width is 0 when closed)
      detailPanel.dataset.preferredWidth = String(targetWidth);
    })();

    resizeHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      if (!detailPanel.classList.contains('open')) return;
      const startX = e.clientX;
      const startWidth = detailPanel.offsetWidth;
      resizeHandle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      detailPanel.style.transition = 'none';

      function onMouseMove(e) {
        const delta = startX - e.clientX;
        const newWidth = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + delta));
        detailPanel.style.width = newWidth + 'px';
      }

      function onMouseUp() {
        resizeHandle.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        detailPanel.style.transition = '';
        const currentWidth = detailPanel.offsetWidth;
        detailPanel.dataset.preferredWidth = String(currentWidth);
        fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ board: { detailPaneWidth: currentWidth } })
        }).catch(function() {
          // Ignore errors when saving panel width
        });
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    let allAvailableTags = [];

    async function loadAllTags() {
      try {
        const res = await fetch('/api/tags');
        if (!res.ok) return;
        const data = await res.json();
        allAvailableTags = data.tags || [];
      } catch {
        // Ignore errors loading tags
      }
    }

    function renderTagsSection(currentTags) {
      const container = document.getElementById('detail-tags-container');
      if (!container) return;

      container.innerHTML = '<div class="tag-select-wrapper"><div class="tag-select-control" id="tag-select-control"></div><div class="tag-select-dropdown" id="tag-select-dropdown"></div></div>';

      const control = document.getElementById('tag-select-control');
      const dropdown = document.getElementById('tag-select-dropdown');
      let focusedOptionIndex = -1;
      let inputValue = '';

      function getFilteredTags() {
        const currentTagIds = new Set(currentTags.map(t => t.id));
        const available = allAvailableTags.filter(t => !currentTagIds.has(t.id));
        if (!inputValue.trim()) return available;
        const q = inputValue.toLowerCase();
        return available.filter(t => t.name.toLowerCase().includes(q));
      }

      const input = document.createElement('input');
      input.className = 'tag-select-input';
      input.type = 'text';
      input.autocomplete = 'off';
      control.appendChild(input);

      function renderPills() {
        control.querySelectorAll('.tag-pill').forEach(p => p.remove());
        currentTags.forEach(t => {
          const pill = document.createElement('span');
          pill.className = 'tag-pill';
          pill.dataset.tagId = t.id;
          const label = document.createTextNode(t.name);
          const removeBtn = document.createElement('button');
          removeBtn.className = 'tag-pill-remove';
          removeBtn.title = 'Remove tag';
          removeBtn.setAttribute('data-tag-id', t.id);
          removeBtn.innerHTML = '&times;';
          removeBtn.addEventListener('click', async e => {
            e.stopPropagation();
            try {
              const res = await fetch('/api/tasks/' + detailTaskId + '/tags/' + t.id, { method: 'DELETE' });
              if (!res.ok) throw new Error('Server error');
              const idx = currentTags.findIndex(x => String(x.id) === String(t.id));
              if (idx !== -1) currentTags.splice(idx, 1);
              renderPills();
              renderDropdown();
            } catch {
              showToast('Failed to remove tag');
            }
          });
          pill.appendChild(label);
          pill.appendChild(removeBtn);
          control.insertBefore(pill, input);
        });
        input.placeholder = currentTags.length === 0 ? 'Add tags...' : '';
      }

      function renderDropdown() {
        const filtered = getFilteredTags();
        dropdown.innerHTML = '';
        focusedOptionIndex = -1;
        if (filtered.length === 0) {
          const noOpt = document.createElement('div');
          noOpt.className = 'tag-select-no-options';
          noOpt.textContent = inputValue ? 'No matching tags' : 'No tags available';
          dropdown.appendChild(noOpt);
        } else {
          filtered.forEach((t, i) => {
            const opt = document.createElement('div');
            opt.className = 'tag-select-option';
            opt.dataset.tagId = t.id;
            opt.textContent = t.name;
            opt.addEventListener('mouseover', () => setFocusedOption(i));
            opt.addEventListener('mousedown', async e => {
              e.preventDefault();
              await addTag(t.id);
            });
            dropdown.appendChild(opt);
          });
        }
      }

      function setFocusedOption(index) {
        const opts = dropdown.querySelectorAll('.tag-select-option');
        opts.forEach((o, i) => o.classList.toggle('focused', i === index));
        focusedOptionIndex = index;
      }

      function openDropdown() {
        renderDropdown();
        dropdown.classList.add('open');
      }

      function closeDropdown() {
        dropdown.classList.remove('open');
        focusedOptionIndex = -1;
      }

      async function addTag(tagId) {
        try {
          const res = await fetch('/api/tasks/' + detailTaskId + '/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagId: Number(tagId) })
          });
          if (!res.ok) throw new Error('Server error');
          const tag = allAvailableTags.find(t => String(t.id) === String(tagId));
          if (tag) currentTags.push(tag);
          input.value = '';
          inputValue = '';
          renderPills();
          renderDropdown();
        } catch {
          showToast('Failed to add tag');
        }
      }

      control.addEventListener('click', () => input.focus());

      input.addEventListener('focus', () => openDropdown());

      input.addEventListener('blur', () => setTimeout(() => closeDropdown(), 150));

      input.addEventListener('input', () => {
        inputValue = input.value;
        renderDropdown();
        if (!dropdown.classList.contains('open')) openDropdown();
      });

      input.addEventListener('keydown', async e => {
        const filtered = getFilteredTags();
        const opts = dropdown.querySelectorAll('.tag-select-option');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedOption(Math.min(focusedOptionIndex + 1, opts.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedOption(Math.max(focusedOptionIndex - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (focusedOptionIndex >= 0 && filtered[focusedOptionIndex]) {
            await addTag(filtered[focusedOptionIndex].id);
          }
        } else if (e.key === 'Escape') {
          closeDropdown();
          input.blur();
        } else if (e.key === 'Backspace' && input.value === '' && currentTags.length > 0) {
          e.preventDefault();
          const last = currentTags[currentTags.length - 1];
          try {
            const res = await fetch('/api/tasks/' + detailTaskId + '/tags/' + last.id, { method: 'DELETE' });
            if (!res.ok) throw new Error('Server error');
            currentTags.splice(currentTags.length - 1, 1);
            renderPills();
            renderDropdown();
          } catch {
            showToast('Failed to remove tag');
          }
        }
      });

      renderPills();
    }

    function relativeTime(isoStr) {
      if (!isoStr) return '';
      const diff = Date.now() - new Date(isoStr).getTime();
      const sec = Math.floor(diff / 1000);
      if (sec < 60) return 'just now';
      const min = Math.floor(sec / 60);
      if (min < 60) return min + 'm ago';
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + 'h ago';
      const day = Math.floor(hr / 24);
      if (day < 30) return day + 'd ago';
      const mo = Math.floor(day / 30);
      if (mo < 12) return mo + 'mo ago';
      return Math.floor(mo / 12) + 'y ago';
    }

    function renderDetailPanel(data) {
      const task = data.task;
      const tags = data.tags || [];
      const metadata = data.metadata || [];
      const blockedBy = data.blockedBy || [];
      const blocking = data.blocking || [];
      const parent = data.parent || null;

      detailTaskId = task.id;
      detailPanelTitle.textContent = '#' + task.id;

      let html = '';

      // Status (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Status</div>';
      html += '<select id="detail-edit-status" class="detail-edit-select">';
      allStatuses.forEach(s => {
        const selected = s === task.status ? ' selected' : '';
        html += '<option value="' + s + '"' + selected + '>' + statusLabels[s] + '</option>';
      });
      html += '</select>';
      html += '</div>';

      // Priority (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Priority</div>';
      html += '<select id="detail-edit-priority" class="detail-edit-select">';
      html += '<option value="">None</option>';
      allPriorities.forEach(p => {
        const selected = task.priority === p ? ' selected' : '';
        html += '<option value="' + p + '"' + selected + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
      });
      html += '</select>';
      html += '</div>';

      // Tags (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Tags</div>';
      html += '<div id="detail-tags-container"></div>';
      html += '</div>';

      // Relations: parent, blockedBy, blocking
      const hasRelations = parent || blockedBy.length > 0 || blocking.length > 0;
      if (hasRelations) {
        html += '<div class="detail-relations">';
        if (parent) {
          html += '<div class="detail-relation-row">';
          html += '<span class="detail-relation-label">Parent</span>';
          html += '<div class="detail-relation-ids"><span class="detail-relation-id">#' + parent.id + ' ' + escapeHtmlClient(parent.title) + '</span></div>';
          html += '</div>';
        }
        if (blockedBy.length > 0) {
          html += '<div class="detail-relation-row">';
          html += '<span class="detail-relation-label">Blocked by</span>';
          html += '<div class="detail-relation-ids">';
          blockedBy.forEach(t => { html += '<span class="detail-relation-id">#' + t.id + '</span>'; });
          html += '</div></div>';
        }
        if (blocking.length > 0) {
          html += '<div class="detail-relation-row">';
          html += '<span class="detail-relation-label">Blocking</span>';
          html += '<div class="detail-relation-ids">';
          blocking.forEach(t => { html += '<span class="detail-relation-id">#' + t.id + '</span>'; });
          html += '</div></div>';
        }
        html += '</div>';
      }

      // Title (editable)
      html += '<div class="detail-field">';
      html += '<div class="detail-field-label">Title</div>';
      html += '<input id="detail-edit-title" class="detail-edit-input" type="text" value="' + escapeHtmlClient(task.title) + '">';
      html += '</div>';

      // Body (editable)
      html += '<div class="detail-field description-field-wrapper">';
      html += '<div class="detail-field-label">Description</div>';
      html += '<textarea id="detail-edit-body" class="detail-edit-textarea">' + escapeHtmlClient(task.body || '') + '</textarea>';
      html += '</div>';

      // Metadata table (read-only, non-priority)
      const otherMeta = metadata.filter(m => m.key !== 'priority');
      if (otherMeta.length > 0) {
        html += '<div class="detail-field">';
        html += '<div class="detail-field-label">Metadata</div>';
        html += '<table class="detail-meta-table">';
        otherMeta.forEach(m => {
          html += '<tr><td>' + escapeHtmlClient(m.key) + '</td><td>' + escapeHtmlClient(m.value) + '</td></tr>';
        });
        html += '</table></div>';
      }

      // Timestamps compressed to one line
      html += '<div class="detail-timestamp">created ' + relativeTime(task.created_at) + ' &middot; updated ' + relativeTime(task.updated_at) + '</div>';

      const detailsPane = document.getElementById('detail-tab-content-details');
      if (detailsPane) {
        detailsPane.innerHTML = html;
        detailsPane.style.padding = '20px';
      }

      // Render tags section after DOM update
      loadAllTags().then(() => renderTagsSection([...tags]));

      // Load comments into the comments tab
      loadComments(task.id);

      // Restore last tab
      switchTab(lastTab);
    }

    function escapeHtmlClient(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    async function loadComments(taskId) {
      const tabBtn = document.getElementById('detail-tab-comments');
      const pane = document.getElementById('detail-tab-content-comments');
      if (!pane) return;
      try {
        const res = await fetch('/api/tasks/' + taskId + '/comments');
        if (!res.ok) throw new Error('Server error');
        const data = await res.json();
        const comments = data.comments || [];
        if (tabBtn) tabBtn.textContent = 'Comments (' + comments.length + ')';
        renderComments(taskId, comments);
      } catch {
        if (pane) pane.innerHTML = '<div style="padding:20px;font-size:12px;color:#94a3b8;">Failed to load comments</div>';
      }
    }

    function renderComments(taskId, comments) {
      const pane = document.getElementById('detail-tab-content-comments');
      if (!pane) return;
      pane.style.padding = '16px 20px';

      let html = '';

      comments.forEach(function(comment) {
        const authorText = comment.author ? escapeHtmlClient(comment.author) : 'Anonymous';
        const dateRel = relativeTime(comment.created_at);
        const dateAbs = escapeHtmlClient(comment.created_at);
        const contentText = escapeHtmlClient(comment.content);
        html += '<div class="comment-item" data-comment-id="' + comment.id + '">';
        html += '<div class="comment-meta">';
        html += '<span class="comment-author">' + authorText + '</span>';
        html += '<span class="comment-date" title="' + dateAbs + '">' + dateRel + '</span>';
        html += '<span class="comment-actions">';
        html += '<button class="comment-action-btn" title="Edit" onclick="startCommentEdit(' + comment.id + ')">&#9998;</button>';
        html += '<button class="comment-action-btn danger" title="Delete" onclick="deleteComment(' + comment.id + ',' + taskId + ')">&#128465;</button>';
        html += '</span>';
        html += '</div>';
        html += '<div class="comment-content" id="comment-content-' + comment.id + '">' + contentText + '</div>';
        html += '<div id="comment-edit-' + comment.id + '" style="display:none;">';
        html += '<textarea class="comment-edit-area" id="comment-edit-area-' + comment.id + '">' + contentText + '</textarea>';
        html += '<div class="comment-edit-actions">';
        html += '<button class="comment-btn" onclick="saveCommentEdit(' + comment.id + ',' + taskId + ')">Save</button>';
        html += '<button class="comment-btn" onclick="cancelCommentEdit(' + comment.id + ')">Cancel</button>';
        html += '</div></div>';
        html += '</div>';
      });

      html += '<button class="add-comment-trigger" id="add-comment-trigger" onclick="openAddCommentForm()">+ Add comment...</button>';
      html += '<div class="add-comment-form" id="add-comment-form">';
      html += '<textarea class="add-comment-textarea" id="add-comment-text" placeholder="Write a comment..."></textarea>';
      html += '<div>';
      html += '<button class="add-comment-submit" onclick="submitComment(' + taskId + ')">Add Comment</button>';
      html += '<button class="add-comment-cancel" onclick="closeAddCommentForm()">Cancel</button>';
      html += '</div></div>';

      pane.innerHTML = html;
    }

    function openAddCommentForm() {
      const trigger = document.getElementById('add-comment-trigger');
      const form = document.getElementById('add-comment-form');
      if (trigger) trigger.style.display = 'none';
      if (form) { form.classList.add('open'); form.querySelector('textarea').focus(); }
    }

    function closeAddCommentForm() {
      const trigger = document.getElementById('add-comment-trigger');
      const form = document.getElementById('add-comment-form');
      if (trigger) trigger.style.display = '';
      if (form) { form.classList.remove('open'); form.querySelector('textarea').value = ''; }
    }

    function startCommentEdit(commentId) {
      const contentEl = document.getElementById('comment-content-' + commentId);
      const editWrapper = document.getElementById('comment-edit-' + commentId);
      if (contentEl) contentEl.style.display = 'none';
      if (editWrapper) editWrapper.style.display = 'block';
      const area = document.getElementById('comment-edit-area-' + commentId);
      if (area) area.focus();
    }

    function cancelCommentEdit(commentId) {
      const contentEl = document.getElementById('comment-content-' + commentId);
      const editWrapper = document.getElementById('comment-edit-' + commentId);
      if (contentEl) contentEl.style.display = '';
      if (editWrapper) editWrapper.style.display = 'none';
    }

    async function saveCommentEdit(commentId, taskId) {
      const area = document.getElementById('comment-edit-area-' + commentId);
      if (!area) return;
      const content = area.value.trim();
      if (!content) { area.focus(); return; }
      try {
        const res = await fetch('/api/comments/' + commentId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to update comment');
      }
    }

    async function deleteComment(commentId, taskId) {
      if (!confirm('Delete this comment?')) return;
      try {
        const res = await fetch('/api/comments/' + commentId, { method: 'DELETE' });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to delete comment');
      }
    }

    async function submitComment(taskId) {
      const textarea = document.getElementById('add-comment-text');
      if (!textarea) return;
      const content = textarea.value.trim();
      if (!content) { textarea.focus(); return; }
      try {
        const res = await fetch('/api/tasks/' + taskId + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error('Server error');
        await loadComments(taskId);
      } catch {
        showToast('Failed to add comment');
      }
    }

    document.getElementById('detail-save-btn').addEventListener('click', async () => {
      if (detailTaskId === null) return;
      const titleInput = document.getElementById('detail-edit-title');
      const title = titleInput ? titleInput.value.trim() : '';
      if (!title) { if (titleInput) titleInput.focus(); return; }
      const bodyEl = document.getElementById('detail-edit-body');
      const statusEl = document.getElementById('detail-edit-status');
      const priorityEl = document.getElementById('detail-edit-priority');

      try {
        const res = await fetch('/api/tasks/' + detailTaskId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body: bodyEl ? (bodyEl.value.trim() || null) : null,
            status: statusEl ? statusEl.value : undefined,
            priority: priorityEl ? (priorityEl.value || null) : null
          })
        });
        if (!res.ok) throw new Error('Server error');
        // Fetch updated task data and refresh detail panel instead of reloading
        const getRes = await fetch('/api/tasks/' + detailTaskId);
        if (!getRes.ok) throw new Error('Failed to fetch updated task');
        const data = await getRes.json();
        renderDetailPanel(data);
        showToast('Task saved successfully');
        // Update lastUpdatedAt so polling doesn't treat our own save as an external update
        try {
          const tsRes = await fetch('/api/board/updated-at');
          if (tsRes.ok) {
            const tsData = await tsRes.json();
            lastUpdatedAt = tsData.updatedAt;
          }
        } catch {
          // Ignore errors when syncing timestamp
        }
        // Refresh board cards in the background
        refreshBoardCards();
      } catch {
        showToast('Failed to update task');
      }
    });

    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', async e => {
        if (e.defaultPrevented) return;
        const taskId = card.dataset.id;
        try {
          const res = await fetch('/api/tasks/' + taskId);
          if (!res.ok) throw new Error('Server error');
          const data = await res.json();
          renderDetailPanel(data);
          if (!detailPanel.classList.contains('open')) {
            const preferredWidth = detailPanel.dataset.preferredWidth || PANEL_DEFAULT_WIDTH;
            detailPanel.style.width = preferredWidth + 'px';
            detailPanel.classList.add('open');
          }
        } catch {
          showToast('Failed to load task details');
        }
      });
    });

    // Filter state (defined before refreshBoardCards so it can use them)
    let activeFilters = { tagIds: [], priorities: [], assignee: '' };

    function buildFilterParams() {
      const params = new URLSearchParams();
      if (activeFilters.priorities.length > 0) {
        params.set('priority', activeFilters.priorities.join(','));
      }
      if (activeFilters.tagIds.length > 0) {
        params.set('tags', activeFilters.tagIds.join(','));
      }
      if (activeFilters.assignee) {
        params.set('assignee', activeFilters.assignee);
      }
      return params;
    }

    // Board polling: reload when updated_at changes (skip during drag)
    let lastUpdatedAt = null;
    async function refreshBoardCards() {
      const filterParams = buildFilterParams();
      const url = '/api/board/cards' + (filterParams.toString() ? '?' + filterParams.toString() : '');
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const columns = data.columns;
        columns.forEach(col => {
          const body = document.getElementById('col-' + col.status);
          if (!body) return;
          body.innerHTML = col.html;
          const colEl = body.closest('.column');
          if (colEl) colEl.querySelector('.column-count').textContent = col.count;
          // Re-attach drag event listeners to new cards
          body.querySelectorAll('.card').forEach(card => {
            card.addEventListener('dragstart', e => {
              draggedCard = card;
              sourceBody = card.parentElement;
              card.classList.add('dragging');
              e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', () => {
              card.classList.remove('dragging');
              draggedCard = null;
              sourceBody = null;
            });
            card.addEventListener('click', async e => {
              if (e.defaultPrevented) return;
              const taskId = card.dataset.id;
              try {
                const res = await fetch('/api/tasks/' + taskId);
                if (!res.ok) throw new Error('Server error');
                const data = await res.json();
                renderDetailPanel(data);
                if (!detailPanel.classList.contains('open')) {
                  const preferredWidth = detailPanel.dataset.preferredWidth || PANEL_DEFAULT_WIDTH;
                  detailPanel.style.width = preferredWidth + 'px';
                  detailPanel.classList.add('open');
                }
              } catch {
                showToast('Failed to load task details');
              }
            });
          });
        });
        // If detail panel is open, refresh its content if the task was updated
        if (detailTaskId !== null) {
          const editableFields = ['detail-edit-title', 'detail-edit-body', 'detail-edit-status', 'detail-edit-priority'];
          const isEditing = editableFields.some(id => document.activeElement && document.activeElement.id === id);
          if (isEditing) {
            const warning = document.getElementById('detail-panel-update-warning');
            if (!warning) {
              const warningEl = document.createElement('div');
              warningEl.id = 'detail-panel-update-warning';
              warningEl.style.cssText = 'display: flex; align-items: center; gap: 8px; color: red; font-size: 0.85em; padding: 4px 8px; background: #fff0f0; border: 1px solid #ffcccc; border-radius: 4px; margin-bottom: 8px;';
              const msgSpan = document.createElement('span');
              msgSpan.style.cssText = 'flex: 1;';
              msgSpan.textContent = 'This task has been updated in the database. Save or discard your changes to see the latest version.';
              const reloadBtn = document.createElement('button');
              reloadBtn.title = 'Reload latest data';
              reloadBtn.textContent = '↺';
              reloadBtn.style.cssText = 'background: none; border: none; cursor: pointer; font-size: 1.1em; color: red; padding: 0 2px; line-height: 1; flex-shrink: 0;';
              reloadBtn.addEventListener('click', async () => {
                try {
                  const taskRes = await fetch('/api/tasks/' + detailTaskId);
                  if (taskRes.ok) {
                    const taskData = await taskRes.json();
                    renderDetailPanel(taskData);
                  }
                } catch {
                  // Ignore network errors
                }
              });
              warningEl.appendChild(msgSpan);
              warningEl.appendChild(reloadBtn);
              detailPanelBody.insertBefore(warningEl, detailPanelBody.firstChild);
            }
          } else {
            try {
              const taskRes = await fetch('/api/tasks/' + detailTaskId);
              if (taskRes.ok) {
                const taskData = await taskRes.json();
                renderDetailPanel(taskData);
              }
            } catch {
              // Ignore network errors during detail panel refresh
            }
          }
        }
      } catch {
        // Ignore network errors during card refresh
      }
    }
    async function pollBoardUpdates() {
      if (draggedCard !== null) return;
      try {
        const res = await fetch('/api/board/updated-at');
        if (!res.ok) return;
        const data = await res.json();
        const ts = data.updatedAt;
        if (lastUpdatedAt === null) {
          lastUpdatedAt = ts;
        } else if (ts !== lastUpdatedAt) {
          lastUpdatedAt = ts;
          if (detailPanel.classList.contains('open')) {
            await refreshBoardCards();
          } else {
            location.reload();
          }
        }
      } catch {
        // Ignore network errors during polling
      }
    }
    setInterval(pollBoardUpdates, 5000);
    pollBoardUpdates();

    function isFiltersActive() {
      return activeFilters.priorities.length > 0 || activeFilters.tagIds.length > 0 || activeFilters.assignee !== '';
    }

    function applyFilters() {
      const clearBtn = document.getElementById('filter-clear');
      if (clearBtn) {
        if (isFiltersActive()) {
          clearBtn.classList.add('visible');
        } else {
          clearBtn.classList.remove('visible');
        }
      }
      refreshBoardCards();
    }

    function renderFilterTagPills() {
      const container = document.getElementById('filter-tags-control');
      if (!container) return;
      // Remove existing pills
      container.querySelectorAll('.filter-tag-pill').forEach(p => p.remove());
      // Add pills for active tag filters
      activeFilters.tagIds.forEach(tagId => {
        const tag = allAvailableTags.find(t => t.id === tagId);
        if (!tag) return;
        const pill = document.createElement('span');
        pill.className = 'filter-tag-pill';
        const label = document.createTextNode(tag.name);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'filter-tag-pill-remove';
        removeBtn.title = 'Remove tag filter';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => {
          const idx = activeFilters.tagIds.indexOf(tagId);
          if (idx !== -1) activeFilters.tagIds.splice(idx, 1);
          renderFilterTagPills();
          applyFilters();
        });
        pill.appendChild(label);
        pill.appendChild(removeBtn);
        container.insertBefore(pill, container.querySelector('.filter-tag-dropdown-wrapper'));
      });
    }

    function initFilterBar() {
      // Priority toggle buttons
      document.querySelectorAll('.filter-priority-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const priority = btn.dataset.priority;
          const idx = activeFilters.priorities.indexOf(priority);
          if (idx === -1) {
            activeFilters.priorities.push(priority);
            btn.classList.add('active');
          } else {
            activeFilters.priorities.splice(idx, 1);
            btn.classList.remove('active');
          }
          applyFilters();
        });
      });

      // Assignee input with debounce
      const assigneeInput = document.getElementById('filter-assignee');
      let assigneeTimer = null;
      if (assigneeInput) {
        assigneeInput.addEventListener('input', () => {
          clearTimeout(assigneeTimer);
          assigneeTimer = setTimeout(() => {
            activeFilters.assignee = assigneeInput.value.trim();
            applyFilters();
          }, 300);
        });
      }

      // Clear button
      const clearBtn = document.getElementById('filter-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          activeFilters.tagIds = [];
          activeFilters.priorities = [];
          activeFilters.assignee = '';
          document.querySelectorAll('.filter-priority-btn').forEach(btn => btn.classList.remove('active'));
          if (assigneeInput) assigneeInput.value = '';
          renderFilterTagPills();
          applyFilters();
        });
      }

      // Tag filter dropdown
      const tagsControl = document.getElementById('filter-tags-control');
      if (tagsControl) {
        const dropdownWrapper = document.createElement('div');
        dropdownWrapper.className = 'filter-tag-dropdown-wrapper';

        const addBtn = document.createElement('button');
        addBtn.className = 'filter-tag-add-btn';
        addBtn.textContent = '+ Tag';

        const dropdown = document.createElement('div');
        dropdown.className = 'filter-tag-dropdown';

        dropdownWrapper.appendChild(addBtn);
        dropdownWrapper.appendChild(dropdown);
        tagsControl.appendChild(dropdownWrapper);

        function renderTagDropdown() {
          dropdown.innerHTML = '';
          const available = allAvailableTags.filter(t => !activeFilters.tagIds.includes(t.id));
          if (available.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'filter-tag-dropdown-empty';
            empty.textContent = 'No tags available';
            dropdown.appendChild(empty);
          } else {
            available.forEach(tag => {
              const opt = document.createElement('div');
              opt.className = 'filter-tag-dropdown-option';
              opt.textContent = tag.name;
              opt.addEventListener('mousedown', (e) => {
                e.preventDefault();
                activeFilters.tagIds.push(tag.id);
                dropdown.classList.remove('open');
                renderFilterTagPills();
                applyFilters();
              });
              dropdown.appendChild(opt);
            });
          }
        }

        addBtn.addEventListener('click', () => {
          if (dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
          } else {
            renderTagDropdown();
            const rect = addBtn.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 2) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.classList.add('open');
          }
        });

        document.addEventListener('click', (e) => {
          if (!dropdownWrapper.contains(e.target)) {
            dropdown.classList.remove('open');
          }
        });
      }
    }

    // Initialize filter bar after tags are loaded
    loadAllTags().then(() => {
      initFilterBar();
    });

    // Burger menu
    const burgerBtn = document.getElementById('burger-menu-btn');
    const burgerDropdown = document.getElementById('burger-menu-dropdown');

    burgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      burgerDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!burgerDropdown.contains(e.target) && e.target !== burgerBtn) {
        burgerDropdown.classList.remove('open');
      }
    });

    // Purge tasks
    const purgeModal = document.getElementById('purge-confirm-modal');
    const purgeConfirmBtn = document.getElementById('purge-confirm-btn');
    const purgeCancelBtn = document.getElementById('purge-cancel-btn');
    const purgeResultEl = document.getElementById('purge-result');

    document.getElementById('burger-purge-tasks').addEventListener('click', () => {
      burgerDropdown.classList.remove('open');
      purgeResultEl.textContent = '';
      purgeModal.classList.add('show');
    });

    purgeCancelBtn.addEventListener('click', () => {
      purgeModal.classList.remove('show');
    });

    purgeConfirmBtn.addEventListener('click', async () => {
      purgeConfirmBtn.disabled = true;
      purgeConfirmBtn.textContent = 'Purging...';
      try {
        const res = await fetch('/api/tasks/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (res.ok) {
          purgeResultEl.textContent = 'Purged ' + data.count + ' task(s).';
          setTimeout(() => { purgeModal.classList.remove('show'); }, 1500);
          location.reload();
        } else {
          purgeResultEl.textContent = 'Error: ' + (data.error || 'Unknown error');
        }
      } catch {
        purgeResultEl.textContent = 'Failed to purge tasks.';
      } finally {
        purgeConfirmBtn.disabled = false;
        purgeConfirmBtn.textContent = 'Purge';
      }
    });

    // Version info
    const versionModal = document.getElementById('version-info-modal');
    const versionCloseBtn = document.getElementById('version-info-close');
    const versionTextEl = document.getElementById('version-info-text');

    document.getElementById('burger-version-info').addEventListener('click', async () => {
      burgerDropdown.classList.remove('open');
      versionTextEl.textContent = 'Loading...';
      versionModal.classList.add('show');
      try {
        const res = await fetch('/api/version');
        const data = await res.json();
        versionTextEl.textContent = 'agkan v' + data.version;
      } catch {
        versionTextEl.textContent = 'Failed to load version.';
      }
    });

    versionCloseBtn.addEventListener('click', () => {
      versionModal.classList.remove('show');
    });`;
