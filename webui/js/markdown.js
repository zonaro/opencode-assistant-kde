/* ============================================================
   markdown.js — Lightweight markdown renderer
   Supports: headings, bold, italic, inline code, fenced code
   blocks, unordered lists, ordered lists, links, paragraphs.
   ============================================================ */
const Markdown = (() => {
  'use strict';

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderInline(text) {
    let s = escapeHtml(text);
    // inline code (must come before other inline to avoid conflicts)
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // bold + italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    // links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  function render(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // fenced code block
      if (line.match(/^```/)) {
        const lang = line.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].match(/^```/)) {
          codeLines.push(escapeHtml(lines[i]));
          i++;
        }
        i++; // skip closing ```
        const code = codeLines.join('\n');
        const id = 'code-' + Math.random().toString(36).slice(2, 8);
        html += `<pre><code class="${lang ? 'language-' + lang : ''}">${code}</code><button class="code-copy-btn" onclick="Markdown.copyCode('${id}')">Copiar</button></pre>`;
        // We use data attribute for the copy button to find the code
        html = html.replace(
          `<button class="code-copy-btn" onclick="Markdown.copyCode('${id}')">Copiar</button>`,
          `<button class="code-copy-btn" data-code-id="${id}">Copiar</button>`
        );
        continue;
      }

      // heading
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        html += `<h${level}>${renderInline(headingMatch[2])}</h${level}>`;
        i++;
        continue;
      }

      // unordered list
      if (line.match(/^[\s]*[-*+]\s+/)) {
        html += '<ul>';
        while (i < lines.length && lines[i].match(/^[\s]*[-*+]\s+/)) {
          const content = lines[i].replace(/^[\s]*[-*+]\s+/, '');
          html += `<li>${renderInline(content)}</li>`;
          i++;
        }
        html += '</ul>';
        continue;
      }

      // ordered list
      if (line.match(/^[\s]*\d+\.\s+/)) {
        html += '<ol>';
        while (i < lines.length && lines[i].match(/^[\s]*\d+\.\s+/)) {
          const content = lines[i].replace(/^[\s]*\d+\.\s+/, '');
          html += `<li>${renderInline(content)}</li>`;
          i++;
        }
        html += '</ol>';
        continue;
      }

      // horizontal rule
      if (line.match(/^([-*_])\s*\1\s*\1[\s\1]*$/)) {
        html += '<hr>';
        i++;
        continue;
      }

      // blank line = paragraph break
      if (line.trim() === '') {
        i++;
        continue;
      }

      // paragraph: collect consecutive non-empty lines
      const pLines = [];
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/^```/) && !lines[i].match(/^#{1,6}\s/) && !lines[i].match(/^[\s]*[-*+]\s+/) && !lines[i].match(/^[\s]*\d+\.\s+/)) {
        pLines.push(lines[i]);
        i++;
      }
      if (pLines.length) {
        html += `<p>${renderInline(pLines.join('<br>'))}</p>`;
      }
    }

    return html;
  }

  function copyCode(id) {
    const el = document.querySelector(`[data-code-id="${id}"]`);
    if (!el) return;
    const pre = el.closest('pre');
    const code = pre.querySelector('code');
    if (code) {
      navigator.clipboard.writeText(code.textContent).then(() => {
        el.textContent = 'Copiado!';
        setTimeout(() => { el.textContent = 'Copiar'; }, 1500);
      });
    }
  }

  // event delegation for copy buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.code-copy-btn');
    if (!btn) return;
    const id = btn.getAttribute('data-code-id');
    if (id) copyCode(id);
  });

  return { render, copyCode };
})();
