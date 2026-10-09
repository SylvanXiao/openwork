// 按 en 顺序重建 zh.ts：补缺失翻译、覆盖已有、删除 en 中已不存在的残留 key、保留头部注释与 as const。
const fs = require('fs');
const path = require('path');

const localesDir = path.resolve(__dirname, 'apps/app/src/i18n/locales');
const enPath = path.join(localesDir, 'en.ts');
const zhPath = path.join(localesDir, 'zh.ts');
const overridePath = path.resolve(__dirname, 'zh-overrides.cjs');

function load(f) {
  let s = fs.readFileSync(f, 'utf8');
  let s2 = s.replace(/export\s+default/, 'module.exports =');
  const m = s2.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*as\s+const\s*;?\s*$/);
  if (!m) throw new Error('parse fail ' + f);
  return { raw: s, obj: new Function('return ' + m[1])() };
}

const en = load(enPath);
const zh = load(zhPath);
const override = require(overridePath);

const enKeys = Object.keys(en.obj);
const zhKeys = Object.keys(zh.obj);

// 校验：所有 override 都应是 en 中的 key
const overrideKeys = Object.keys(override);
const badOverride = overrideKeys.filter(k => !(k in en.obj));
if (badOverride.length) {
  console.error('override 中存在的非 en key（应清理）：', badOverride);
}

// en 中缺失的 key（未翻译）
const missing = enKeys.filter(k => !(k in zh.obj));
const uncovered = missing.filter(k => !(k in override));
if (uncovered.length) {
  console.error('!!! 以下缺失 key 在 override 中也没有覆盖：', uncovered);
  process.exit(2);
}

// en 中存在、zh 中多余（en 已删）的 key
const extra = zhKeys.filter(k => !(k in en.obj));

// 重建：按 en 顺序；override 优先，否则用现有 zh
const result = {};
for (const k of enKeys) {
  result[k] = (k in override) ? override[k] : zh.obj[k];
}

// 写回：保留 zh.ts 自己的头部注释 + as const
const header = zh.raw.slice(0, zh.raw.indexOf('export default'));
const out =
  header.replace(/\s+$/, '') +
  '\nexport default {\n' +
  enKeys.map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(result[k]) + ',').join('\n') +
  '\n} as const;\n';

fs.writeFileSync(zhPath, out, 'utf8');

console.log('en keys:', enKeys.length);
console.log('zh (before) keys:', zhKeys.length);
console.log('override keys:', overrideKeys.length);
console.log('missing (en not zh, before):', missing.length);
console.log('extra removed (zh not en):', extra);
console.log('result zh keys:', Object.keys(result).length);
console.log('OK: zh.ts rebuilt in en order');
