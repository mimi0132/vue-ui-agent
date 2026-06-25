import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

function getFreePort(startPort = 3456) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(getFreePort(startPort + 1)));
  });
}

/**
 * 解析 AI 输出，提取组件源码和 demo 示例
 */
function parseFiles(rawText) {
  const filePattern = /<!--\s*FILE_START:\s*(.+?)\s*-->([\s\S]*?)<!--\s*FILE_END:\s*\1\s*-->/g;
  const demoPattern = /<!--\s*DEMO_START:\s*(.+?)\s*-->([\s\S]*?)<!--\s*DEMO_END:\s*\1\s*-->/g;
  const files = [];
  const demos = new Map();

  let match;
  while ((match = filePattern.exec(rawText)) !== null) {
    const fileName = match[1].trim();
    const content = match[2].trim();
    if (content) files.push({ fileName, content });
  }
  while ((match = demoPattern.exec(rawText)) !== null) {
    const fileName = match[1].trim();
    const content = match[2].trim();
    if (content) demos.set(fileName, content);
  }
  return { files, demos };
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 提取组件的样式（CSS）
 */
function extractComponentStyle(source) {
  const styleMatches = source.match(/<style[^>]*>([\s\S]*?)<\/style>/g);
  if (!styleMatches) return '';
  return styleMatches
    .map(s => s.replace(/<\/?style[^>]*>/g, ''))
    .join('\n');
}

/**
 * 从 colors.css 中解析所有颜色变量，按色系分组
 */
function parseColorPalette(colorsCSS) {
  if (!colorsCSS) return [];

  // 匹配所有 --ui-color-*: #...; 或 rgb()/rgba()
  const varPattern = /--ui-color-([\w-]+):\s*([^;]+);/g;
  const colors = [];

  let match;
  while ((match = varPattern.exec(colorsCSS)) !== null) {
    const name = match[1];           // 例如 primary-500
    const value = match[2].trim();
    colors.push({ name, value });
  }

  // 按前缀分组（gray / primary / success / warning / danger / info / bg / surface / border / divider / text / overlay）
  const groups = new Map();
  const groupOrder = ['gray', 'primary', 'secondary', 'success', 'warning', 'danger', 'info', 'bg', 'surface', 'overlay', 'border', 'divider', 'text'];
  const groupLabels = {
    gray: '中性色 Gray',
    primary: '主色 Primary',
    secondary: '辅助色 Secondary',
    success: '成功 Success',
    warning: '警告 Warning',
    danger: '危险 Danger',
    info: '信息 Info',
    bg: '背景 Background',
    surface: '表面 Surface',
    overlay: '遮罩 Overlay',
    border: '边框 Border',
    divider: '分割线 Divider',
    text: '文字 Text',
  };

  for (const c of colors) {
    const prefix = c.name.split('-')[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(c);
  }

  // 按预定义顺序返回分组
  return groupOrder
    .filter(prefix => groups.has(prefix))
    .map(prefix => ({
      prefix,
      label: groupLabels[prefix] || prefix,
      colors: groups.get(prefix).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    }));
}

/**
 * 计算文字颜色（黑或白）以保证色卡上的对比度
 */
function isLightColor(hex) {
  // 处理 rgba
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    const m = hex.match(/[\d.]+/g);
    if (!m) return true;
    const [r, g, b] = m.map(Number);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  }
  // 处理 hex
  const h = hex.replace('#', '').trim();
  if (h.length !== 3 && h.length !== 6) return true;
  const v = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

/**
 * 生成颜色库的 HTML
 */
function generateColorPaletteHTML(colorGroups) {
  if (!colorGroups || colorGroups.length === 0) {
    return '';
  }

  const groupsHTML = colorGroups.map(group => {
    const swatches = group.colors.map(c => {
      const textColor = isLightColor(c.value) ? '#111827' : '#ffffff';
      return `
        <div class="color-swatch">
          <div class="color-block" style="background: ${c.value}; color: ${textColor};">
            <span class="color-name">--ui-color-${c.name}</span>
          </div>
          <div class="color-meta">
            <code class="color-value">${c.value}</code>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="color-group">
        <h3 class="color-group-title">${group.label}</h3>
        <div class="color-grid">${swatches}</div>
      </div>`;
  }).join('');

  return groupsHTML;
}

/**
 * 生成预览 HTML：颜色库 + 每个组件独立一张大卡片 + 所有变体 demo
 */
function generatePreviewHTML(componentInfos, framework, themeCSS, colorsCSS) {
  const isVue = framework === 'vue';
  const frameworkLabel = isVue ? 'Vue 3' : 'React';

  const colorGroups = parseColorPalette(colorsCSS);
  const colorPaletteHTML = generateColorPaletteHTML(colorGroups);

  const componentCards = componentInfos.map((info) => {
    const { name, source, style, demoHTML, isMissing } = info;
    return `
    <section class="component-card ${isMissing ? 'is-missing' : ''}">
      <header class="component-header">
        <div class="component-meta">
          <h2 class="component-title">${name}</h2>
          <span class="component-file">${name}.${isVue ? 'vue' : 'tsx'}</span>
        </div>
        <span class="component-tag">${isMissing ? '缺少 Demo' : '组件预览'}</span>
      </header>

      <div class="component-demo">
        ${demoHTML || '<p class="empty-demo">该组件未提供 demo 示例</p>'}
      </div>

      <details class="component-code">
        <summary>查看源码</summary>
        <pre><code>${escapeHtml(source)}</code></pre>
      </details>
    </section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UI Agent 组件预览</title>
  <style>
    /* ============== theme.css（AI 生成的设计 Token） ============== */
    ${themeCSS}

    /* ============== colors.css（完整颜色库） ============== */
    ${colorsCSS}

    /* ============== 预览页面布局 ============== */
    :root {
      --preview-bg: #f6f7f9;
      --preview-card-bg: #ffffff;
      --preview-border: #e4e7ed;
      --preview-text: #1f2329;
      --preview-text-muted: #646a73;
      --preview-code-bg: #1e1e1e;
      --preview-code-text: #d4d4d4;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: var(--preview-bg);
      color: var(--preview-text);
      padding: 2rem 1.5rem;
      min-height: 100vh;
    }
    .page-header {
      max-width: 1200px;
      margin: 0 auto 2rem;
      text-align: center;
    }
    .page-header h1 {
      font-size: 1.875rem;
      font-weight: 700;
      color: var(--preview-text);
      margin-bottom: 0.5rem;
    }
    .page-header p {
      color: var(--preview-text-muted);
      font-size: 0.875rem;
    }
    .page-header .framework-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-left: 0.5rem;
      vertical-align: middle;
    }
    .badge-vue { background: #42b88320; color: #2e8d63; }
    .badge-react { background: #61dafb20; color: #087ea4; }

    .components-list {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* ============== 颜色库 ============== */
    .color-library {
      max-width: 1200px;
      margin: 0 auto 2rem;
      background: var(--preview-card-bg);
      border: 1px solid var(--preview-border);
      border-radius: 0.75rem;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .color-library-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--preview-border);
      background: #fafbfc;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .color-library-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--preview-text);
    }
    .color-library-subtitle {
      font-size: 0.75rem;
      color: var(--preview-text-muted);
      margin-top: 0.25rem;
    }
    .color-library-body {
      padding: 1.5rem;
    }
    .color-group {
      margin-bottom: 1.75rem;
    }
    .color-group:last-child {
      margin-bottom: 0;
    }
    .color-group-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--preview-text);
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px dashed var(--preview-border);
    }
    .color-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.75rem;
    }
    .color-swatch {
      border-radius: 0.5rem;
      overflow: hidden;
      border: 1px solid var(--preview-border);
      background: white;
    }
    .color-block {
      height: 64px;
      padding: 0.5rem;
      display: flex;
      align-items: flex-end;
      font-size: 0.65rem;
      font-weight: 500;
      font-family: 'SF Mono', 'Menlo', monospace;
      word-break: break-all;
    }
    .color-name {
      opacity: 0.85;
    }
    .color-meta {
      padding: 0.4rem 0.6rem;
      background: white;
    }
    .color-value {
      font-size: 0.7rem;
      color: var(--preview-text);
      font-family: 'SF Mono', 'Menlo', monospace;
      word-break: break-all;
    }

    /* ============== 组件卡片 ============== */
    .component-card {
      background: var(--preview-card-bg);
      border: 1px solid var(--preview-border);
      border-radius: 0.75rem;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .component-card.is-missing {
      border-color: #fbbf24;
      background: #fffbeb;
    }

    .component-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--preview-border);
      background: #fafbfc;
    }
    .component-meta {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }
    .component-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--preview-text);
    }
    .component-file {
      font-size: 0.75rem;
      color: var(--preview-text-muted);
      font-family: 'SF Mono', 'Menlo', monospace;
    }
    .component-tag {
      font-size: 0.75rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      background: #eef2ff;
      color: #4f46e5;
      font-weight: 500;
    }
    .component-card.is-missing .component-tag {
      background: #fef3c7;
      color: #b45309;
    }

    .component-demo {
      padding: 2rem 1.5rem;
      min-height: 80px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: 1rem;
      background: white;
    }
    .empty-demo {
      color: var(--preview-text-muted);
      font-size: 0.875rem;
      font-style: italic;
    }

    .component-code {
      border-top: 1px solid var(--preview-border);
    }
    .component-code summary {
      padding: 0.75rem 1.5rem;
      cursor: pointer;
      font-size: 0.8rem;
      color: var(--preview-text-muted);
      background: #fafbfc;
      user-select: none;
      font-weight: 500;
    }
    .component-code summary:hover {
      color: var(--preview-text);
    }
    .component-code pre {
      padding: 1rem 1.5rem;
      overflow-x: auto;
      font-size: 0.8rem;
      line-height: 1.6;
      background: var(--preview-code-bg);
      max-height: 500px;
      overflow-y: auto;
    }
    .component-code code {
      font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
      color: var(--preview-code-text);
    }
  </style>

  <!-- 把每个组件的 <style> 注入到全局，确保 demo 渲染时样式生效 -->
  <style id="__component_styles__">
    ${componentInfos.map(i => i.style || '').join('\n')}
  </style>
</head>
<body>
  <div class="page-header">
    <h1>UI Agent 组件预览</h1>
    <p>共 ${componentInfos.length} 个组件 · ${frameworkLabel}<span class="framework-badge badge-${isVue ? 'vue' : 'react'}">${frameworkLabel}</span></p>
  </div>

  ${colorPaletteHTML ? `
  <section class="color-library">
    <header class="color-library-header">
      <div>
        <h2 class="color-library-title">颜色库</h2>
        <p class="color-library-subtitle">共 ${colorGroups.reduce((sum, g) => sum + g.colors.length, 0)} 个颜色变量 · 来源 colors.css</p>
      </div>
    </header>
    <div class="color-library-body">
      ${colorPaletteHTML}
    </div>
  </section>` : ''}

  <div class="components-list">
    ${componentCards}
  </div>
</body>
</html>`;
}

/**
 * 加载组件文件并生成预览页
 */
export async function createPreview(outputDir, framework, fileNames, rawText) {
  const previewDir = path.join(outputDir, '.preview');

  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }

  // 读取 theme.css
  const themeFilePath = path.join(outputDir, 'theme.css');
  let themeCSS = '';
  if (fs.existsSync(themeFilePath)) {
    themeCSS = fs.readFileSync(themeFilePath, 'utf-8');
  }

  // 读取 colors.css
  const colorsFilePath = path.join(outputDir, 'colors.css');
  let colorsCSS = '';
  if (fs.existsSync(colorsFilePath)) {
    colorsCSS = fs.readFileSync(colorsFilePath, 'utf-8');
  }

  // 解析 AI 输出，提取 demo
  const { demos } = parseFiles(rawText || '');

  // 加载每个组件
  const isVue = framework === 'vue';
  const componentInfos = fileNames
    .filter(f => f.endsWith('.vue') || f.endsWith('.tsx'))
    .map((fileName) => {
      const filePath = path.join(outputDir, fileName);
      const source = fs.readFileSync(filePath, 'utf-8');
      const name = fileName.replace(path.extname(fileName), '');
      const style = extractComponentStyle(source);
      const demoHTML = demos.get(fileName) || '';
      return {
        name,
        source,
        style,
        demoHTML,
        isMissing: !demoHTML,
      };
    });

  const html = generatePreviewHTML(componentInfos, framework, themeCSS, colorsCSS);
  const htmlPath = path.join(previewDir, 'index.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  const port = await getFreePort();

  const server = http.createServer((req, res) => {
    const urlPath = req.url === '/' ? '/index.html' : req.url;
    const fullPath = path.join(previewDir, urlPath);

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(fullPath));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', async () => {
      const url = `http://127.0.0.1:${port}`;

      try {
        if (process.platform === 'darwin') {
          await execAsync(`open "${url}"`);
        } else if (process.platform === 'win32') {
          await execAsync(`start "" "${url}"`);
        } else {
          await execAsync(`xdg-open "${url}"`);
        }
      } catch {
        //
      }

      resolve(url);
    });
  });
}
