// 플러그인 구성 파일 정합성 검사. 이 검사는 `claude plugin validate`를 대체하지 않고 보완한다.
import assert from 'node:assert/strict';
import { builtinModules } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const pluginRoot = fileURLToPath(new URL('..', import.meta.url));
const marketRoot = fileURLToPath(new URL('../../..', import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, 'frontmatter 없음');
  return m[1];
}

test('marketplace.json: 플러그인 source가 실제 디렉터리를 가리킨다', () => {
  const market = readJson(`${marketRoot}.claude-plugin/marketplace.json`);
  assert.equal(market.name, 'commute-brief-marketplace');
  assert.ok(market.owner?.name);
  assert.equal(market.plugins.length, 1);
  const entry = market.plugins[0];
  const dir = `${marketRoot}${entry.source.replace(/^\.\//, '')}/`;
  assert.ok(existsSync(`${dir}.claude-plugin/plugin.json`), `${dir} 에 plugin.json 없음`);
  assert.equal(readJson(`${dir}.claude-plugin/plugin.json`).name, entry.name);
});

test('plugin.json: 필수 필드와 semver 버전', () => {
  const p = readJson(`${pluginRoot}.claude-plugin/plugin.json`);
  assert.equal(p.name, 'commute-brief');
  assert.match(p.version, /^\d+\.\d+\.\d+$/);
  assert.ok(p.description);
});

test('.mcp.json: 서버 진입점이 플러그인 안에 있고 커밋 대상(dist)이다', () => {
  const mcp = readJson(`${pluginRoot}.mcp.json`);
  const server = mcp.mcpServers['open-meteo'];
  assert.equal(server.command, 'node');
  const rel = server.args[0].replace('${CLAUDE_PLUGIN_ROOT}/', '');
  assert.ok(existsSync(`${pluginRoot}${rel}`), `${rel} 없음 (npm run build 필요)`);
});

test('dist 번들은 node_modules 없이도 실행되도록 Node 내장 모듈만 import한다', () => {
  const bundle = read('server/dist/index.js');
  const imports = [...bundle.matchAll(/^import\b[^\n]*?from\s+["']([^"']+)["'];?$/gm)].map((m) => m[1]);
  const external = imports.filter((name) => !name.startsWith('node:') && !builtinModules.includes(name));
  assert.ok(external.length === 0, `외부 패키지를 import함: ${external.join(', ')}`);
  assert.ok(imports.length > 0, 'import 문을 하나도 찾지 못함(검사가 무의미해짐)');
});

test('hooks.json: SessionStart 훅이 존재하는 스크립트를 실행한다', () => {
  const hooks = readJson(`${pluginRoot}hooks/hooks.json`).hooks;
  const [group] = hooks.SessionStart;
  assert.equal(group.matcher, 'startup');
  const [hook] = group.hooks;
  assert.equal(hook.type, 'command');
  assert.ok(hook.timeout > 0);
  const script = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/)?.[1];
  assert.ok(script && existsSync(`${pluginRoot}${script}`), `훅 스크립트 ${script} 없음`);
});

test('skill: frontmatter의 name이 폴더명과 같고 description이 있다', () => {
  const fm = frontmatter(read('skills/commute-brief/SKILL.md'));
  assert.match(fm, /^name: commute-brief$/m);
  assert.match(fm, /^description:/m);
});

test('agent: frontmatter의 name·description·tools, 그리고 MCP 도구 이름이 플러그인/서버명과 맞는다', () => {
  const fm = frontmatter(read('agents/outfit-advisor.md'));
  assert.match(fm, /^name: outfit-advisor$/m);
  assert.match(fm, /^description:/m);
  const tools = fm.match(/^tools: (.+)$/m)[1].split(',').map((t) => t.trim());
  assert.deepEqual(
    tools.sort(),
    ['geocode', 'get_air_quality', 'get_forecast'].map((t) => `mcp__plugin_commute-brief_open-meteo__${t}`).sort(),
  );
});

test('.gitignore: node_modules는 제외하고 dist는 포함한다', () => {
  const ignore = readFileSync(`${marketRoot}.gitignore`, 'utf8');
  assert.match(ignore, /^node_modules\/?$/m);
  assert.doesNotMatch(ignore, /^\/?(server\/)?dist\/?$/m);
});
