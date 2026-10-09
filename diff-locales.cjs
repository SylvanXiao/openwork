// 语言覆盖校验：对比 en.ts 与 zh.ts，报告缺失 / 多余 / 空值。
// 配合 zh-overrides.cjs + apply-zh.cjs 使用：新增 en 键后先跑本脚本定位待译，
// 补进 zh-overrides.cjs 后重跑 apply-zh.cjs 重建 zh.ts。
// 退出码：0 = 完全对齐；2 = 有缺失 / 多余 / 空值。
const fs = require('fs');
const path = require('path');

const localesDir = path.resolve(__dirname, 'apps/app/src/i18n/locales');

function loadLocale(file) {
  const full = path.join(localesDir, file);
  const raw = fs.readFileSync(full, 'utf8');
  const replaced = raw.replace(/export\s+default/, 'module.exports =');
  const match = replaced.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*as\s+const\s*;?\s*$/);
  if (!match) throw new Error('parse fail ' + file);
  return new Function('return ' + match[1])();
}

const en = loadLocale('en.ts');
const zh = loadLocale('zh.ts');

const enKeys = Object.keys(en);
const zhKeys = Object.keys(zh);

const missing = enKeys.filter((k) => !(k in zh));
const extra = zhKeys.filter((k) => !(k in en));
const emptyEn = enKeys.filter((k) => !String(en[k]).trim());
const emptyZh = zhKeys.filter((k) => !String(zh[k]).trim());
// 与英文完全相同的中文值：多半是漏翻（专有名词除外，人工确认）。
const untranslated = zhKeys.filter(
  (k) => k in en && String(zh[k]).trim() === String(en[k]).trim(),
);

console.log('en keys:', enKeys.length);
console.log('zh keys:', zhKeys.length);
console.log('missing (en 有 / zh 无):', missing.length);
console.log('extra   (zh 有 / en 无):', extra.length);
console.log('empty en:', emptyEn.length, '| empty zh:', emptyZh.length);
console.log('zh 值与 en 相同（疑似漏翻）:', untranslated.length);

if (missing.length) console.log('\n--- 待译 ---\n' + missing.join('\n'));
if (extra.length) console.log('\n--- en 已删除的残留 ---\n' + extra.join('\n'));
if (emptyZh.length) console.log('\n--- zh 空值 ---\n' + emptyZh.join('\n'));
if (untranslated.length) console.log('\n--- 与英文相同，需人工确认 ---\n' + untranslated.join('\n'));

if (missing.length || extra.length || emptyEn.length || emptyZh.length) {
  console.log('\nFAIL: 语言文件未对齐');
  process.exit(2);
}
console.log('\nOK: zh.ts 与 en.ts 完全对齐');