const textDisplay = document.getElementById('textDisplay');
const welcomeHint = document.getElementById('welcomeHint');
const charCount = document.getElementById('charCount');
const timestamp = document.getElementById('timestamp');
const alwaysOnTop = document.getElementById('alwaysOnTop');
const copyBtn = document.getElementById('copyBtn');
const snapBtn = document.getElementById('snapBtn');
const clearBtn = document.getElementById('clearBtn');
const styleBtn = document.getElementById('styleBtn');
const themeBtn = document.getElementById('themeBtn');
const helpBtn = document.getElementById('helpBtn');
const helpPanel = document.getElementById('helpPanel');
const titleToggle = document.getElementById('titleToggle');
const statusDot = document.getElementById('statusDot');
const sourceBadge = document.getElementById('sourceBadge');
const selectMonitoringBtn = document.getElementById('selectMonitoringBtn');

let currentText = '';
let styleMode = localStorage.getItem('styleMode') !== 'false';
let theme = localStorage.getItem('theme') || 'dark';

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Math spans are extracted before any markdown parsing and stashed behind
// placeholder tokens built from Unicode private-use chars (U+E000/U+E001).
// escapeHtml leaves them untouched, the inline regexes never match them, and
// they can't be mistaken for a list/header/table — so the rendered KaTeX HTML
// survives the markdown pass intact and is swapped back in at the very end.
const MATH_OPEN = '\uE000';
const MATH_CLOSE = '\uE001';

function renderMath(tex, displayMode, raw) {
  if (typeof katex === 'undefined') return escapeHtml(raw);
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return escapeHtml(raw);
  }
}

function extractMath(text, store) {
  const stash = (html) => {
    const token = `${MATH_OPEN}${store.length}${MATH_CLOSE}`;
    store.push(html);
    return token;
  };

  return (
    text
      // Display math: $$ ... $$ and \[ ... \] (may span multiple lines).
      .replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => stash(renderMath(tex, true, m)))
      .replace(/\\\[([\s\S]+?)\\\]/g, (m, tex) => stash(renderMath(tex, true, m)))
      // Inline math: \( ... \).
      .replace(/\\\(([\s\S]+?)\\\)/g, (m, tex) => stash(renderMath(tex, false, m)))
      // Inline math: $ ... $ on one line. Guards skip escaped \$ and most
      // currency (no space just inside the delimiters; not a digit run like $5 and $10).
      .replace(
        /(?<!\\)\$(?!\s)([^\n$]*?[^\s\\])\$(?!\d)/g,
        (m, tex) => stash(renderMath(tex, false, m))
      )
  );
}

function restoreMath(html, store) {
  return html.replace(
    new RegExp(`${MATH_OPEN}(\\d+)${MATH_CLOSE}`, 'g'),
    (_, i) => store[Number(i)] ?? ''
  );
}

function parseInline(line) {
  // Split out inline code spans so their contents are never reinterpreted as
  // markdown (e.g. underscores in `MAX_BUF_SIZE` must not become italics).
  return escapeHtml(line)
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
        return `<code>${part.slice(1, -1)}</code>`;
      }
      return part
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
        .replace(/(^|[^\w])_(\S(?:.*?\S)?)_(?=[^\w]|$)/g, '$1<em>$2</em>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>');
    })
    .join('');
}

function parseTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.includes('|') && parseTableCells(line).some((cell) => cell.length > 0);
}

function isTableSeparator(line) {
  if (!isTableRow(line)) return false;
  return parseTableCells(line).every((cell) => /^:?-+:?$/.test(cell));
}

function renderTable(headerRow, bodyRows) {
  const headers = parseTableCells(headerRow);
  let html = '<div class="table-wrap"><table><thead><tr>';
  for (const header of headers) {
    html += `<th>${parseInline(header)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of bodyRows) {
    const cells = parseTableCells(row);
    html += '<tr>';
    for (const cell of cells) {
      html += `<td>${parseInline(cell)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function normalizeLine(line) {
  return line.trim().replace(/\r$/, '');
}

function parseHeader(line) {
  const trimmed = normalizeLine(line);
  const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (!match) return null;
  return { level: match[1].length, content: match[2] };
}

function parseMarkdown(rawText) {
  const mathStore = [];
  const text = extractMath(rawText, mathStore);
  const lines = text.split(/\r?\n/);
  const parts = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = normalizeLine(line);

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeList();
      const headerRow = line;
      i += 1;
      const bodyRows = [];
      while (i + 1 < lines.length && isTableRow(lines[i + 1]) && !isTableSeparator(lines[i + 1])) {
        i += 1;
        bodyRows.push(lines[i]);
      }
      parts.push(renderTable(headerRow, bodyRows));
      continue;
    }

    const header = parseHeader(line);
    if (header) {
      closeList();
      const tag = `h${header.level}`;
      parts.push(`<${tag}>${parseInline(header.content)}</${tag}>`);
    } else if (/^[-*] (.+)$/.test(trimmed)) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${parseInline(trimmed.replace(/^[-*] /, ''))}</li>`);
    } else if (trimmed === '') {
      closeList();
    } else {
      closeList();
      parts.push(`<p>${parseInline(trimmed)}</p>`);
    }
  }

  closeList();
  return restoreMath(parts.join(''), mathStore);
}

function renderText() {
  if (!currentText) {
    textDisplay.textContent = '';
    return;
  }

  if (styleMode) {
    textDisplay.classList.add('styled');
    textDisplay.innerHTML = parseMarkdown(currentText);
  } else {
    textDisplay.classList.remove('styled');
    textDisplay.textContent = currentText;
  }
}

function setSourceBadge(appName, windowTitle) {
  if (!appName) {
    sourceBadge.classList.add('hidden');
    return;
  }

  sourceBadge.classList.remove('hidden', 'matched', 'other');
  sourceBadge.textContent = appName;
  sourceBadge.classList.add('matched');
  sourceBadge.title = windowTitle ? `Copied from: ${windowTitle}` : `Copied from ${appName}`;
}

function displayText(text, appName, windowTitle) {
  currentText = text;
  welcomeHint.classList.add('hidden');
  renderText();
  charCount.textContent = `${text.length} תווים`;
  timestamp.textContent = new Date().toLocaleTimeString();
  setSourceBadge(appName, windowTitle);
}

function clearDisplay() {
  currentText = '';
  textDisplay.classList.remove('styled');
  textDisplay.textContent = '';
  charCount.textContent = '0 תווים';
  timestamp.textContent = '';
  setSourceBadge(null);
}

function setMonitoringUI(active) {
  titleToggle.classList.toggle('paused', !active);
  titleToggle.title = active ? 'Click to pause monitoring' : 'Click to resume monitoring';
  statusDot.classList.toggle('paused', !active);
  statusDot.title = active ? 'Monitoring active' : 'Monitoring paused';
}

function applyTheme(nextTheme) {
  theme = nextTheme;
  document.documentElement.setAttribute('data-theme', theme);
  themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  themeBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  localStorage.setItem('theme', theme);
}

function toggleHelp() {
  helpPanel.hidden = !helpPanel.hidden;
}

applyTheme(theme);
styleBtn.classList.toggle('active', styleMode);

window.rtlApp.onClipboardUpdate(({ text, appName, windowTitle }) => {
  displayText(text, appName, windowTitle);
});

window.rtlApp.onMonitoringChanged(setMonitoringUI);

window.rtlApp.getMonitoring().then(setMonitoringUI);

titleToggle.addEventListener('click', async () => {
  const active = await window.rtlApp.getMonitoring();
  await window.rtlApp.setMonitoring(!active);
});

selectMonitoringBtn.addEventListener('click', () => {
  window.rtlApp.openMonitoringSettings();
});

alwaysOnTop.addEventListener('change', () => {
  window.rtlApp.setAlwaysOnTop(alwaysOnTop.checked);
});

window.rtlApp.setAlwaysOnTop(alwaysOnTop.checked);

copyBtn.addEventListener('click', () => {
  if (currentText) {
    window.rtlApp.copyToClipboard(currentText);
    copyBtn.textContent = '✓';
    setTimeout(() => { copyBtn.textContent = '📋'; }, 1200);
  }
});

snapBtn.addEventListener('click', async () => {
  snapBtn.disabled = true;
  try {
    const result = await window.rtlApp.snapLayout();
    // Brief feedback: ✓ on success, ⚠ if no target window was found.
    snapBtn.textContent = result && result.movedTarget ? '✓' : '⚠';
  } catch {
    snapBtn.textContent = '⚠';
  } finally {
    setTimeout(() => {
      snapBtn.textContent = '⊞';
      snapBtn.disabled = false;
    }, 1200);
  }
});

styleBtn.addEventListener('click', () => {
  styleMode = !styleMode;
  styleBtn.classList.toggle('active', styleMode);
  localStorage.setItem('styleMode', String(styleMode));
  renderText();
});

themeBtn.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
});

helpBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleHelp();
});

document.addEventListener('click', (e) => {
  if (!helpPanel.hidden && !e.target.closest('.help-wrap')) {
    helpPanel.hidden = true;
  }
});

clearBtn.addEventListener('click', clearDisplay);

