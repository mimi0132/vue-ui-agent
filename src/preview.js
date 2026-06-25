import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

function parseVueSFC(source) {
  const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/);
  const styleMatch = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return {
    template: templateMatch ? templateMatch[1].trim() : '',
    style: styleMatch ? styleMatch[2].trim() : '',
  };
}

function parseReactComponent(source) {
  const styleMatch = source.match(/(?:const styles|const \w+Styles)\s*=\s*\{([\s\S]*?)\};/);
  const returnMatch = source.match(/return\s*\(([\s\S]*?)\);?\s*\}\);?/);
  return {
    jsx: returnMatch ? returnMatch[1].trim() : '',
    style: styleMatch ? styleMatch[1].trim() : '',
  };
}

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

function generatePreviewHTML(components, framework) {
  const isVue = framework === 'vue';

  const componentCards = components.map((comp) => {
    const name = comp.fileName.replace(path.extname(comp.fileName), '');
    return `
    <div class="component-card">
      <div class="component-header">
        <h3 class="component-title">${name}</h3>
        <span class="component-file">${comp.fileName}</span>
      </div>
      <div class="component-preview" id="preview-${name}">
        ${comp.previewHTML || ''}
      </div>
      <details class="component-code">
        <summary>查看源码</summary>
        <pre><code>${escapeHtml(comp.source)}</code></pre>
      </details>
    </div>`;
  }).join('\n');

  const vueScript = isVue ? `
  <script type="module">
    import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

    const components = {};
    ${components.map((comp) => {
      const name = comp.fileName.replace(path.extname(comp.fileName), '');
      return `
    components['${name}'] = {
      template: \`${comp.template?.replace(/`/g, '\\`') || ''}\`,
      data() { return {}; }
    };`;
    }).join('\n')}

    ${components.map((comp) => {
      if (!comp.style) return '';
      return `
    (function() {
      const el = document.createElement('style');
      el.textContent = \`${comp.style?.replace(/`/g, '\\`') || ''}\`;
      document.head.appendChild(el);
    })();`;
    }).join('\n')}

    ${components.map((comp) => {
      const name = comp.fileName.replace(path.extname(comp.fileName), '');
      return `
    const app${name} = createApp({
      components: { '${name}': components['${name}'] },
      template: '<${name} />'
    });
    const mountEl${name} = document.getElementById('preview-${name}');
    if (mountEl${name}) app${name}.mount(mountEl${name});`;
    }).join('\n')}
  </script>` : '';

  const reactScript = !isVue ? `
  <script type="module">
    import React from 'https://esm.sh/react@18';
    import ReactDOM from 'https://esm.sh/react-dom@18/client';

    ${components.map((comp) => {
      const name = comp.fileName.replace(path.extname(comp.fileName), '');
      return `
    function ${name}() {
      return (${comp.jsx || ''});
    }`;
    }).join('\n')}

    ${components.map((comp) => {
      const name = comp.fileName.replace(path.extname(comp.fileName), '');
      return `
    const root${name} = ReactDOM.createRoot(document.getElementById('preview-${name}'));
    root${name}.render(React.createElement(${name}));`;
    }).join('\n')}
  </script>` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UI Agent 组件预览</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      padding: 2rem;
    }
    .page-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .page-header h1 {
      font-size: 1.875rem;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 0.5rem;
    }
    .page-header p {
      color: #64748b;
      font-size: 0.875rem;
    }
    .components-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 1.5rem;
      max-width: 1400px;
      margin: 0 auto;
    }
    .component-card {
      background: white;
      border-radius: 0.75rem;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .component-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #f1f5f9;
      background: #fafbfc;
    }
    .component-title {
      font-size: 1rem;
      font-weight: 600;
      color: #334155;
    }
    .component-file {
      font-size: 0.75rem;
      color: #94a3b8;
      font-family: 'SF Mono', monospace;
    }
    .component-preview {
      padding: 2rem 1.25rem;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .component-code {
      border-top: 1px solid #f1f5f9;
    }
    .component-code summary {
      padding: 0.75rem 1.25rem;
      cursor: pointer;
      font-size: 0.8rem;
      color: #64748b;
      background: #fafbfc;
      user-select: none;
    }
    .component-code summary:hover {
      color: #334155;
    }
    .component-code pre {
      padding: 1rem 1.25rem;
      overflow-x: auto;
      font-size: 0.8rem;
      line-height: 1.6;
      background: #f8fafc;
    }
    .component-code code {
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: #334155;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      margin-left: 0.5rem;
    }
    .badge-vue { background: #42b88320; color: #42b883; }
    .badge-react { background: #61dafb20; color: #087ea4; }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>🎨 UI Agent 组件预览</h1>
    <p>共 ${components.length} 个组件 · ${isVue ? 'Vue 3' : 'React'} <span class="badge badge-${isVue ? 'vue' : 'react'}">${isVue ? 'Vue' : 'React'}</span></p>
  </div>

  <div class="components-grid">
    ${componentCards}
  </div>

  ${isVue ? vueScript : reactScript}
</body>
</html>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function createPreview(outputDir, framework, fileNames) {
  const previewDir = path.join(outputDir, '.preview');

  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }

  const themeFilePath = path.join(outputDir, 'theme.css');
  let themeContent = '';
  if (fs.existsSync(themeFilePath)) {
    themeContent = fs.readFileSync(themeFilePath, 'utf-8');
  }

  const components = fileNames
    .filter(f => f.endsWith('.vue') || f.endsWith('.tsx'))
    .map((fileName) => {
      const filePath = path.join(outputDir, fileName);
      const source = fs.readFileSync(filePath, 'utf-8');
      const isVue = framework === 'vue';

      if (isVue) {
        const { template, style } = parseVueSFC(source);
        return { fileName, source, template, style, previewHTML: template };
      } else {
        const { jsx, style } = parseReactComponent(source);
        return { fileName, source, jsx, style, previewHTML: jsx };
      }
    });

  const html = generatePreviewHTML(components, framework);
  const htmlWithTheme = html.replace('</style>', `\n    ${themeContent}\n  </style>`);
  const htmlPath = path.join(previewDir, 'index.html');
  fs.writeFileSync(htmlPath, htmlWithTheme, 'utf-8');

  const port = await getFreePort();

  const server = http.createServer((req, res) => {
    const filePath = req.url === '/' ? '/index.html' : req.url;
    const fullPath = path.join(previewDir, filePath);

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
