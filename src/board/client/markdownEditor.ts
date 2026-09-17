import { marked } from 'marked';
import DOMPurify from 'dompurify';

export type MarkdownFormatType = 'heading' | 'list' | 'code' | 'link';

export interface RenderMarkdownEditorHtmlOptions {
  textareaId: string;
  textareaClass: string;
  value?: string;
  placeholder?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let purifyInstance: typeof DOMPurify | null = null;

function getPurifier(): typeof DOMPurify {
  if (!purifyInstance) {
    if (typeof (DOMPurify as unknown as { sanitize?: unknown }).sanitize === 'function') {
      purifyInstance = DOMPurify;
    } else if (typeof window !== 'undefined') {
      purifyInstance = (DOMPurify as unknown as (win: Window) => typeof DOMPurify)(window);
    } else {
      purifyInstance = DOMPurify;
    }

    if (purifyInstance && typeof purifyInstance.addHook === 'function') {
      purifyInstance.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
    }
  }
  return purifyInstance;
}

export function renderMarkdown(markdown: string): string {
  if (!markdown || !markdown.trim()) {
    return '<p class="markdown-preview-empty"><em>No description provided.</em></p>';
  }
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  const purifier = getPurifier();
  return purifier ? purifier.sanitize(rawHtml) : rawHtml;
}

export function applyMarkdownFormat(textarea: HTMLTextAreaElement, format: MarkdownFormatType): void {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value;
  const selectedText = value.slice(start, end);

  let replacement = '';
  let newCursorStart = start;
  let newCursorEnd = end;

  switch (format) {
    case 'heading': {
      if (selectedText.length > 0) {
        replacement = `### ${selectedText}`;
        newCursorStart = start + 4;
        newCursorEnd = newCursorStart + selectedText.length;
      } else {
        replacement = '### ';
        newCursorStart = start + 4;
        newCursorEnd = newCursorStart;
      }
      break;
    }
    case 'list': {
      if (selectedText.length > 0) {
        const lines = selectedText.split('\n');
        const prefixed = lines.map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n');
        replacement = prefixed;
        newCursorStart = start;
        newCursorEnd = start + prefixed.length;
      } else {
        replacement = '- ';
        newCursorStart = start + 2;
        newCursorEnd = newCursorStart;
      }
      break;
    }
    case 'code': {
      if (selectedText.length > 0) {
        replacement = `\`\`\`\n${selectedText}\n\`\`\``;
        newCursorStart = start + 4;
        newCursorEnd = newCursorStart + selectedText.length;
      } else {
        replacement = '```\ncode\n```';
        newCursorStart = start + 4;
        newCursorEnd = start + 8;
      }
      break;
    }
    case 'link': {
      if (selectedText.length > 0) {
        replacement = `[${selectedText}](url)`;
        newCursorStart = start + selectedText.length + 3;
        newCursorEnd = newCursorStart + 3;
      } else {
        replacement = '[link text](url)';
        newCursorStart = start + 1;
        newCursorEnd = start + 10;
      }
      break;
    }
  }

  const before = value.slice(0, start);
  const after = value.slice(end);
  textarea.value = before + replacement + after;
  textarea.setSelectionRange(newCursorStart, newCursorEnd);
  textarea.focus();

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function renderMarkdownEditorHtml(options: RenderMarkdownEditorHtmlOptions): string {
  const { textareaId, textareaClass, value = '', placeholder = '' } = options;
  const placeholderAttr = placeholder ? ` placeholder="${escapeHtml(placeholder)}"` : '';

  return (
    `<div class="markdown-editor" data-editor-for="${escapeHtml(textareaId)}">` +
    '<div class="markdown-editor-toolbar">' +
    '<div class="markdown-editor-actions" role="toolbar" aria-label="Formatting options">' +
    '<button type="button" class="markdown-toolbar-btn" data-format="heading" title="Heading" aria-label="Heading">H</button>' +
    '<button type="button" class="markdown-toolbar-btn" data-format="list" title="Bullet List" aria-label="Bullet List">•</button>' +
    '<button type="button" class="markdown-toolbar-btn" data-format="code" title="Code Block" aria-label="Code Block">&lt;/&gt;</button>' +
    '<button type="button" class="markdown-toolbar-btn" data-format="link" title="Link" aria-label="Link">🔗</button>' +
    '</div>' +
    '<div class="markdown-editor-modes" role="tablist" aria-label="Editor modes">' +
    '<button type="button" class="markdown-mode-btn active" data-mode="write" role="tab" aria-selected="true" aria-label="Edit Description">Write</button>' +
    '<button type="button" class="markdown-mode-btn" data-mode="preview" role="tab" aria-selected="false" aria-label="Preview Description">Preview</button>' +
    '</div>' +
    '</div>' +
    '<div class="markdown-editor-body">' +
    `<textarea id="${escapeHtml(textareaId)}" class="${escapeHtml(textareaClass)}"${placeholderAttr}>${escapeHtml(value)}</textarea>` +
    '<div class="markdown-preview" style="display: none;" role="tabpanel" aria-label="Description preview"></div>' +
    '</div>' +
    '</div>'
  );
}

export interface MarkdownEditorOptions {
  onInput?: () => void;
  onModeChange?: (mode: 'write' | 'preview') => void;
}

export interface MarkdownEditorInstance {
  textarea: HTMLTextAreaElement;
  container: HTMLElement;
  previewEl: HTMLElement;
  setMode: (mode: 'write' | 'preview') => void;
  getMode: () => 'write' | 'preview';
  updatePreview: () => void;
  reset: () => void;
  destroy: () => void;
}

export function createMarkdownEditor(
  textarea: HTMLTextAreaElement,
  options?: MarkdownEditorOptions
): MarkdownEditorInstance {
  let container = textarea.closest<HTMLElement>('.markdown-editor');
  let previewEl: HTMLElement | null = null;
  let toolbarActions: HTMLElement | null = null;
  let writeBtn: HTMLButtonElement | null = null;
  let previewBtn: HTMLButtonElement | null = null;

  if (container) {
    previewEl = container.querySelector<HTMLElement>('.markdown-preview');
    toolbarActions = container.querySelector<HTMLElement>('.markdown-editor-actions');
    writeBtn = container.querySelector<HTMLButtonElement>('.markdown-mode-btn[data-mode="write"]');
    previewBtn = container.querySelector<HTMLButtonElement>('.markdown-mode-btn[data-mode="preview"]');
  } else {
    container = document.createElement('div');
    container.className = 'markdown-editor';
    container.dataset.editorFor = textarea.id;

    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-editor-toolbar';

    toolbarActions = document.createElement('div');
    toolbarActions.className = 'markdown-editor-actions';
    toolbarActions.setAttribute('role', 'toolbar');
    toolbarActions.setAttribute('aria-label', 'Formatting options');
    toolbarActions.innerHTML =
      '<button type="button" class="markdown-toolbar-btn" data-format="heading" title="Heading" aria-label="Heading">H</button>' +
      '<button type="button" class="markdown-toolbar-btn" data-format="list" title="Bullet List" aria-label="Bullet List">•</button>' +
      '<button type="button" class="markdown-toolbar-btn" data-format="code" title="Code Block" aria-label="Code Block">&lt;/&gt;</button>' +
      '<button type="button" class="markdown-toolbar-btn" data-format="link" title="Link" aria-label="Link">🔗</button>';

    const modes = document.createElement('div');
    modes.className = 'markdown-editor-modes';
    modes.setAttribute('role', 'tablist');
    modes.setAttribute('aria-label', 'Editor modes');
    modes.innerHTML =
      '<button type="button" class="markdown-mode-btn active" data-mode="write" role="tab" aria-selected="true" aria-label="Edit Description">Write</button>' +
      '<button type="button" class="markdown-mode-btn" data-mode="preview" role="tab" aria-selected="false" aria-label="Preview Description">Preview</button>';

    toolbar.appendChild(toolbarActions);
    toolbar.appendChild(modes);

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'markdown-editor-body';

    previewEl = document.createElement('div');
    previewEl.className = 'markdown-preview';
    previewEl.style.display = 'none';
    previewEl.setAttribute('role', 'tabpanel');
    previewEl.setAttribute('aria-label', 'Description preview');

    const parent = textarea.parentElement;
    if (parent) {
      parent.insertBefore(container, textarea);
    }
    container.appendChild(toolbar);
    container.appendChild(bodyContainer);
    bodyContainer.appendChild(textarea);
    bodyContainer.appendChild(previewEl);

    writeBtn = modes.querySelector<HTMLButtonElement>('.markdown-mode-btn[data-mode="write"]');
    previewBtn = modes.querySelector<HTMLButtonElement>('.markdown-mode-btn[data-mode="preview"]');
  }

  if (!previewEl) {
    previewEl = document.createElement('div');
    previewEl.className = 'markdown-preview';
    previewEl.style.display = 'none';
    textarea.parentElement?.appendChild(previewEl);
  }

  let currentMode: 'write' | 'preview' = 'write';

  const updatePreview = (): void => {
    if (previewEl) {
      previewEl.innerHTML = renderMarkdown(textarea.value);
    }
  };

  const setMode = (mode: 'write' | 'preview'): void => {
    if (currentMode === mode) return;
    currentMode = mode;

    if (mode === 'preview') {
      updatePreview();
      textarea.style.display = 'none';
      previewEl!.style.display = 'block';

      writeBtn?.classList.remove('active');
      writeBtn?.setAttribute('aria-selected', 'false');
      previewBtn?.classList.add('active');
      previewBtn?.setAttribute('aria-selected', 'true');

      if (toolbarActions) {
        toolbarActions.querySelectorAll<HTMLButtonElement>('.markdown-toolbar-btn').forEach((btn) => {
          btn.disabled = true;
          btn.setAttribute('aria-disabled', 'true');
        });
      }
    } else {
      textarea.style.display = '';
      previewEl!.style.display = 'none';

      writeBtn?.classList.add('active');
      writeBtn?.setAttribute('aria-selected', 'true');
      previewBtn?.classList.remove('active');
      previewBtn?.setAttribute('aria-selected', 'false');

      if (toolbarActions) {
        toolbarActions.querySelectorAll<HTMLButtonElement>('.markdown-toolbar-btn').forEach((btn) => {
          btn.disabled = false;
          btn.removeAttribute('aria-disabled');
        });
      }
      textarea.focus();
    }

    options?.onModeChange?.(mode);
  };

  const onToolbarClick = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.markdown-toolbar-btn');
    if (!target || target.disabled) return;
    e.preventDefault();
    const format = target.dataset.format as MarkdownFormatType | undefined;
    if (format) {
      applyMarkdownFormat(textarea, format);
      options?.onInput?.();
    }
  };

  const onWriteClick = (e: MouseEvent): void => {
    e.preventDefault();
    setMode('write');
  };

  const onPreviewClick = (e: MouseEvent): void => {
    e.preventDefault();
    setMode('preview');
  };

  toolbarActions?.addEventListener('click', onToolbarClick);
  writeBtn?.addEventListener('click', onWriteClick);
  previewBtn?.addEventListener('click', onPreviewClick);

  const reset = (): void => {
    setMode('write');
    if (previewEl) previewEl.innerHTML = '';
  };

  const destroy = (): void => {
    toolbarActions?.removeEventListener('click', onToolbarClick);
    writeBtn?.removeEventListener('click', onWriteClick);
    previewBtn?.removeEventListener('click', onPreviewClick);
  };

  return {
    textarea,
    container,
    previewEl,
    setMode,
    getMode: () => currentMode,
    updatePreview,
    reset,
    destroy,
  };
}
