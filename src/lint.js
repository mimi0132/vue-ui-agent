import fs from 'node:fs';

const files = fs.readdirSync('src', { recursive: true })
  .filter(f => f.endsWith('.js'))
  .filter(f => f !== 'lint.js');
let hasError = false;

files.forEach(f => {
  const c = fs.readFileSync('src/' + f, 'utf-8');
  if (c.includes('var ')) {
    console.log('❌ ' + f + ': 使用了 var');
    hasError = true;
  }
  if (c.includes('require(')) {
    console.log('❌ ' + f + ': 使用了 require');
    hasError = true;
  }
  if (!c.includes('import ') && !f.endsWith('cli.js')) {
    console.log('⚠️ ' + f + ': 可能缺少 import');
  }
});

console.log('✅ lint 检查完成');
process.exit(hasError ? 1 : 0);
