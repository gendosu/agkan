/**
 * @vitest-environment jsdom
 *
 * Tests for markdownEditor module covering markdown parsing, HTML sanitization,
 * toolbar actions, mode switching, and lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderMarkdown,
  applyMarkdownFormat,
  renderMarkdownEditorHtml,
  createMarkdownEditor,
} from '../../../src/board/client/markdownEditor';

describe('renderMarkdown', () => {
  it('renders headings correctly', () => {
    const html = renderMarkdown('# Heading 1\n## Heading 2\n### Heading 3');
    expect(html).toContain('<h1>Heading 1</h1>');
    expect(html).toContain('<h2>Heading 2</h2>');
    expect(html).toContain('<h3>Heading 3</h3>');
  });

  it('renders nested lists correctly', () => {
    const html = renderMarkdown('- Parent item\n  - Child item');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Parent item');
    expect(html).toContain('<li>Child item</li>');
  });

  it('renders fenced code blocks correctly', () => {
    const html = renderMarkdown('```typescript\nconst a = 1;\n```');
    expect(html).toContain('<pre><code');
    expect(html).toContain('const a = 1;');
  });

  it('renders links with target="_blank" and rel="noopener noreferrer"', () => {
    const html = renderMarkdown('[Test Link](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Test Link');
  });

  it('handles Japanese text properly', () => {
    const html = renderMarkdown('### 日本語のタイトル\n- 箇条書き1\n- 箇条書き2');
    expect(html).toContain('<h3>日本語のタイトル</h3>');
    expect(html).toContain('<li>箇条書き1</li>');
    expect(html).toContain('<li>箇条書き2</li>');
  });

  it('returns empty placeholder when markdown is empty or whitespace', () => {
    expect(renderMarkdown('')).toContain('markdown-preview-empty');
    expect(renderMarkdown('   \n  \t  ')).toContain('markdown-preview-empty');
  });

  it('strips script tags to prevent XSS', () => {
    const html = renderMarkdown('<script>alert("xss")</script>Hello');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert');
    expect(html).toContain('Hello');
  });

  it('strips onerror and javascript event handlers', () => {
    const html = renderMarkdown('<img src="invalid" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('sanitizes javascript: links', () => {
    const html = renderMarkdown('[malicious link](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });
});

describe('applyMarkdownFormat', () => {
  let textarea: HTMLTextAreaElement;

  beforeEach(() => {
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
  });

  it('applies heading format to selected text and fires input event', () => {
    textarea.value = 'My Title';
    textarea.setSelectionRange(0, 8);
    const inputSpy = vi.fn();
    textarea.addEventListener('input', inputSpy);

    applyMarkdownFormat(textarea, 'heading');

    expect(textarea.value).toBe('### My Title');
    expect(inputSpy).toHaveBeenCalled();
  });

  it('inserts heading prefix when no selection', () => {
    textarea.value = '';
    textarea.setSelectionRange(0, 0);

    applyMarkdownFormat(textarea, 'heading');

    expect(textarea.value).toBe('### ');
  });

  it('applies list format to multiple selected lines', () => {
    textarea.value = 'first\nsecond';
    textarea.setSelectionRange(0, 12);

    applyMarkdownFormat(textarea, 'list');

    expect(textarea.value).toBe('- first\n- second');
  });

  it('inserts list prefix when no selection', () => {
    textarea.value = '';
    textarea.setSelectionRange(0, 0);

    applyMarkdownFormat(textarea, 'list');

    expect(textarea.value).toBe('- ');
  });

  it('applies code format around selected text', () => {
    textarea.value = 'const x = 42;';
    textarea.setSelectionRange(0, 13);

    applyMarkdownFormat(textarea, 'code');

    expect(textarea.value).toBe('```\nconst x = 42;\n```');
  });

  it('inserts code placeholder when no selection', () => {
    textarea.value = '';
    textarea.setSelectionRange(0, 0);

    applyMarkdownFormat(textarea, 'code');

    expect(textarea.value).toBe('```\ncode\n```');
  });

  it('applies link format with selected text', () => {
    textarea.value = 'GitHub';
    textarea.setSelectionRange(0, 6);

    applyMarkdownFormat(textarea, 'link');

    expect(textarea.value).toBe('[GitHub](url)');
  });

  it('inserts link placeholder when no selection', () => {
    textarea.value = '';
    textarea.setSelectionRange(0, 0);

    applyMarkdownFormat(textarea, 'link');

    expect(textarea.value).toBe('[link text](url)');
  });
});

describe('renderMarkdownEditorHtml', () => {
  it('renders editor markup with toolbar, buttons, textarea, and preview container', () => {
    const html = renderMarkdownEditorHtml({
      textareaId: 'test-body',
      textareaClass: 'custom-textarea-class',
      value: 'Initial value',
      placeholder: 'Type here...',
    });

    const div = document.createElement('div');
    div.innerHTML = html;

    const editor = div.querySelector('.markdown-editor');
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute('data-editor-for')).toBe('test-body');

    const textarea = div.querySelector('#test-body') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.className).toBe('custom-textarea-class');
    expect(textarea.value).toBe('Initial value');
    expect(textarea.placeholder).toBe('Type here...');

    expect(div.querySelector('.markdown-toolbar-btn[data-format="heading"]')).not.toBeNull();
    expect(div.querySelector('.markdown-toolbar-btn[data-format="list"]')).not.toBeNull();
    expect(div.querySelector('.markdown-toolbar-btn[data-format="code"]')).not.toBeNull();
    expect(div.querySelector('.markdown-toolbar-btn[data-format="link"]')).not.toBeNull();

    expect(div.querySelector('.markdown-mode-btn[data-mode="write"]')).not.toBeNull();
    expect(div.querySelector('.markdown-mode-btn[data-mode="preview"]')).not.toBeNull();

    const preview = div.querySelector('.markdown-preview') as HTMLElement;
    expect(preview).not.toBeNull();
    expect(preview.style.display).toBe('none');
  });
});

describe('createMarkdownEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('attaches to an already rendered markdown editor structure', () => {
    document.body.innerHTML = renderMarkdownEditorHtml({
      textareaId: 'detail-body',
      textareaClass: 'textarea-cls',
      value: '## Hello World',
    });

    const textarea = document.getElementById('detail-body') as HTMLTextAreaElement;
    const editor = createMarkdownEditor(textarea);

    expect(editor.getMode()).toBe('write');

    // Switch to preview
    editor.setMode('preview');
    expect(editor.getMode()).toBe('preview');
    expect(textarea.style.display).toBe('none');
    expect(editor.previewEl.style.display).toBe('block');
    expect(editor.previewEl.innerHTML).toContain('<h2>Hello World</h2>');

    // Switch back to write
    editor.setMode('write');
    expect(editor.getMode()).toBe('write');
    expect(textarea.style.display).toBe('');
    expect(editor.previewEl.style.display).toBe('none');

    editor.destroy();
  });

  it('wraps a bare textarea when not already wrapped in .markdown-editor', () => {
    const textarea = document.createElement('textarea');
    textarea.id = 'bare-body';
    textarea.value = '- Item A\n- Item B';
    document.body.appendChild(textarea);

    const onModeChange = vi.fn();
    const editor = createMarkdownEditor(textarea, { onModeChange });

    expect(textarea.closest('.markdown-editor')).not.toBeNull();
    expect(editor.getMode()).toBe('write');

    editor.setMode('preview');
    expect(onModeChange).toHaveBeenCalledWith('preview');
    expect(editor.previewEl.innerHTML).toContain('<li>Item A</li>');

    editor.reset();
    expect(editor.getMode()).toBe('write');
    expect(textarea.style.display).toBe('');

    editor.destroy();
  });

  it('disables formatting buttons when in preview mode and enables them in write mode', () => {
    document.body.innerHTML = renderMarkdownEditorHtml({
      textareaId: 'btn-test',
      textareaClass: 'textarea-cls',
      value: 'Sample text',
    });

    const textarea = document.getElementById('btn-test') as HTMLTextAreaElement;
    const editor = createMarkdownEditor(textarea);
    const headingBtn = document.querySelector('.markdown-toolbar-btn[data-format="heading"]') as HTMLButtonElement;

    expect(headingBtn.disabled).toBe(false);

    editor.setMode('preview');
    expect(headingBtn.disabled).toBe(true);

    editor.setMode('write');
    expect(headingBtn.disabled).toBe(false);

    editor.destroy();
  });

  it('clicking a format button applies format and triggers onInput', () => {
    document.body.innerHTML = renderMarkdownEditorHtml({
      textareaId: 'format-click-test',
      textareaClass: 'textarea-cls',
      value: 'Hello',
    });

    const textarea = document.getElementById('format-click-test') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5);

    const onInput = vi.fn();
    const editor = createMarkdownEditor(textarea, { onInput });

    const codeBtn = document.querySelector('.markdown-toolbar-btn[data-format="code"]') as HTMLButtonElement;
    codeBtn.click();

    expect(textarea.value).toBe('```\nHello\n```');
    expect(onInput).toHaveBeenCalled();

    editor.destroy();
  });
});
