import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildBrief, localDate, run } from '../hooks/session-brief.mjs';
import { getAirQuality, getForecast } from '../server/lib.js';
import { AIR_BODY, DEFAULT_ROUTES, FORECAST_BODY, mockFetch } from './helpers.js';

const routes = () => ({ ...DEFAULT_ROUTES });

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'commute-brief-test-'));
  const chunks = [];
  return { dir, chunks, out: { write: (s) => chunks.push(s) }, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('localDate: YYYY-MM-DD 형식(한 자리 월·일은 0으로 채운다)', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('buildBrief: 강수확률 60% 이상이면 우산 문구를 붙인다', async () => {
  const f = await getForecast(37.5, 127, { fetchImpl: mockFetch({ 'api.open-meteo.com': { body: FORECAST_BODY } }) });
  const a = await getAirQuality(37.5, 127, { fetchImpl: mockFetch({ 'air-quality-api.open-meteo.com': { body: AIR_BODY } }) });
  const line = buildBrief('서울', f, a);
  assert.match(line, /^서울 08:00 기준 12.3°C\(체감 10.1°C\) 흐림/);
  assert.match(line, /PM2\.5 36\(나쁨\)/);
  assert.match(line, /우산 챙기세요$/);

  f.daily[0].precipitation_probability_max_pct = 59;
  assert.doesNotMatch(buildBrief('서울', f, a), /우산/);
});

test('run: 첫 실행은 systemMessage와 additionalContext를 출력하고 상태 파일을 남긴다', async () => {
  const s = sandbox();
  try {
    const payload = await run({ env: { CLAUDE_PLUGIN_DATA: s.dir }, now: new Date(2026, 9, 26, 8), fetchImpl: mockFetch(routes()), out: s.out });
    assert.match(payload.systemMessage, /^\[commute-brief\] 서울 08:00 기준/);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(payload.hookSpecificOutput.additionalContext, /오늘의 출근길 브리핑/);
    assert.equal(s.chunks.length, 1);
    assert.deepEqual(JSON.parse(s.chunks[0]), payload);
    assert.equal(JSON.parse(readFileSync(join(s.dir, 'last-brief.json'), 'utf8')).date, '2026-10-26');
  } finally {
    s.cleanup();
  }
});

test('run: 같은 날 두 번째 실행은 조회도 출력도 하지 않는다', async () => {
  const s = sandbox();
  try {
    const env = { CLAUDE_PLUGIN_DATA: s.dir };
    await run({ env, now: new Date(2026, 9, 26, 8), fetchImpl: mockFetch(routes()), out: s.out });
    const second = mockFetch(routes());
    const result = await run({ env, now: new Date(2026, 9, 26, 18), fetchImpl: second, out: s.out });
    assert.equal(result, null);
    assert.equal(second.calls.length, 0);
    assert.equal(s.chunks.length, 1);
  } finally {
    s.cleanup();
  }
});

test('run: 다음 날이면 다시 브리핑한다', async () => {
  const s = sandbox();
  try {
    const env = { CLAUDE_PLUGIN_DATA: s.dir };
    await run({ env, now: new Date(2026, 9, 26, 8), fetchImpl: mockFetch(routes()), out: s.out });
    const next = await run({ env, now: new Date(2026, 9, 27, 8), fetchImpl: mockFetch(routes()), out: s.out });
    assert.ok(next);
    assert.equal(s.chunks.length, 2);
  } finally {
    s.cleanup();
  }
});

test('run: API 오류면 아무것도 출력하지 않고 상태도 남기지 않는다(다음 세션에 재시도)', async () => {
  const s = sandbox();
  try {
    const failing = mockFetch({ ...routes(), 'api.open-meteo.com': { status: 500, body: { reason: 'boom' } } });
    const result = await run({ env: { CLAUDE_PLUGIN_DATA: s.dir }, now: new Date(2026, 9, 26, 8), fetchImpl: failing, out: s.out });
    assert.equal(result, null);
    assert.equal(s.chunks.length, 0);
    assert.throws(() => readFileSync(join(s.dir, 'last-brief.json')));
  } finally {
    s.cleanup();
  }
});

test('run: 도시를 못 찾으면 조용히 끝낸다', async () => {
  const s = sandbox();
  try {
    const none = mockFetch({ ...routes(), 'geocoding-api.open-meteo.com': { body: {} } });
    const result = await run({ env: { CLAUDE_PLUGIN_DATA: s.dir, COMMUTE_BRIEF_CITY: '없는도시명' }, fetchImpl: none, out: s.out });
    assert.equal(result, null);
    assert.equal(s.chunks.length, 0);
  } finally {
    s.cleanup();
  }
});

test('run: 상태 파일이 깨져 있어도 오늘 첫 실행으로 처리한다', async () => {
  const s = sandbox();
  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(s.dir, 'last-brief.json'), '{깨진 json');
    const result = await run({ env: { CLAUDE_PLUGIN_DATA: s.dir }, fetchImpl: mockFetch(routes()), out: s.out });
    assert.ok(result);
  } finally {
    s.cleanup();
  }
});

// 실제 훅처럼 프로세스로 실행한다. preload-fetch.mjs가 전역 fetch를 교체해 네트워크를 쓰지 않는다.
function runCli(fetchMode, dir) {
  const script = fileURLToPath(new URL('../hooks/session-brief.mjs', import.meta.url));
  const preload = new URL('./preload-fetch.mjs', import.meta.url).href;
  return spawnSync(process.execPath, ['--import', preload, script], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }),
    env: { ...process.env, CLAUDE_PLUGIN_DATA: dir, FETCH_MODE: fetchMode, COMMUTE_BRIEF_CITY: '서울' },
    encoding: 'utf8',
    timeout: 20000,
  });
}

test('CLI: 정상 응답이면 stdout에 유효한 SessionStart JSON 한 줄을 내고 종료 코드 0', () => {
  const s = sandbox();
  try {
    const res = runCli('ok', s.dir);
    assert.equal(res.status, 0, res.stderr);
    const payload = JSON.parse(res.stdout);
    assert.match(payload.systemMessage, /^\[commute-brief\] 서울/);
    assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  } finally {
    s.cleanup();
  }
});

test('CLI: 네트워크 오류여도 종료 코드 0이고 stdout·stderr가 비어 있다', () => {
  const s = sandbox();
  try {
    const res = runCli('fail', s.dir);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '');
    assert.equal(res.stderr, '');
  } finally {
    s.cleanup();
  }
});
