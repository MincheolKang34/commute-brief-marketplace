// 번들된 MCP 서버(dist/index.js)를 stdio로 띄워 프로토콜 수준에서 확인한다. 네트워크는 쓰지 않는다.
// 실제 API까지 호출하려면 LIVE=1 로 실행한다.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../server/dist/index.js', import.meta.url));
let proc;
let nextId = 0;
const pending = new Map();

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} 응답 없음`)), 15000);
    pending.set(id, (msg) => (clearTimeout(timer), resolve(msg)));
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

before(async () => {
  proc = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'open-meteo');
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
});

after(() => proc?.kill());

test('tools/list: 도구 3개와 읽기 전용 힌트', async () => {
  const { tools } = (await rpc('tools/list', {})).result;
  assert.deepEqual(tools.map((t) => t.name).sort(), ['geocode', 'get_air_quality', 'get_forecast']);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true, t.name);
  const forecast = tools.find((t) => t.name === 'get_forecast');
  assert.deepEqual(forecast.inputSchema.required.sort(), ['latitude', 'longitude']);
});

test('범위를 벗어난 위도는 네트워크 호출 전에 입력 검증 오류가 된다', async () => {
  const res = await rpc('tools/call', { name: 'get_forecast', arguments: { latitude: 999, longitude: 0 } });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /latitude/);
});

test('필수 인자 누락과 너무 짧은 이름도 거부한다', async () => {
  const missing = await rpc('tools/call', { name: 'get_air_quality', arguments: { latitude: 37.5 } });
  assert.equal(missing.result.isError, true);
  const short = await rpc('tools/call', { name: 'geocode', arguments: { name: '서' } });
  assert.equal(short.result.isError, true);
});

test('없는 도구 이름은 오류', async () => {
  const res = await rpc('tools/call', { name: 'no_such_tool', arguments: {} });
  assert.ok(res.error || res.result?.isError);
});

test('LIVE=1: 실제 Open-Meteo 호출 (서울)', { skip: process.env.LIVE !== '1' }, async () => {
  const geo = await rpc('tools/call', { name: 'geocode', arguments: { name: '서울', count: 1 } });
  const { results } = JSON.parse(geo.result.content[0].text);
  assert.equal(results[0].name, '서울특별시');
  const f = await rpc('tools/call', { name: 'get_forecast', arguments: { latitude: results[0].latitude, longitude: results[0].longitude } });
  assert.equal(JSON.parse(f.result.content[0].text).timezone, 'Asia/Seoul');
});
