// lib.js가 실제로 보내는 요청이 복사해 둔 OpenAPI 명세와 어긋나지 않는지 확인한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ENDPOINTS, getAirQuality, getForecast } from '../server/lib.js';
import { AIR_BODY, FORECAST_BODY, mockFetch } from './helpers.js';

const spec = (name) => readFileSync(new URL(`../server/openapi/${name}`, import.meta.url), 'utf8');
const hasEnumValue = (text, value) => new RegExp(`^\\s*- ${value}\\s*$`, 'm').test(text);

function requestParams(fetchImpl) {
  return new URL(fetchImpl.calls[0]).searchParams;
}

test('forecast: 요청 경로·호스트·변수가 forecast.yml에 있다', async () => {
  const text = spec('forecast.yml');
  const url = new URL(ENDPOINTS.forecast);
  assert.ok(text.includes(`  ${url.pathname}:`), `경로 ${url.pathname} 없음`);
  assert.ok(text.includes(`- url: ${url.origin}`), `서버 ${url.origin} 없음`);

  const fetchImpl = mockFetch({ 'api.open-meteo.com': { body: FORECAST_BODY } });
  await getForecast(37.5, 127, { fetchImpl });
  const params = requestParams(fetchImpl);
  for (const key of ['latitude', 'longitude', 'current', 'daily', 'timezone', 'forecast_days']) {
    assert.ok(params.has(key), `요청에 ${key} 없음`);
    assert.ok(text.includes(`- name: ${key}`), `명세에 파라미터 ${key} 없음`);
  }
  for (const v of [...params.get('current').split(','), ...params.get('daily').split(',')]) {
    assert.ok(hasEnumValue(text, v), `forecast.yml에 변수 ${v} 없음`);
  }
});

test('air-quality: 요청 경로·호스트·변수가 air-quality.yml에 있다', async () => {
  const text = spec('air-quality.yml');
  const url = new URL(ENDPOINTS.airQuality);
  assert.ok(text.includes(`  ${url.pathname}:`), `경로 ${url.pathname} 없음`);
  assert.ok(text.includes(`- url: ${url.origin}`), `서버 ${url.origin} 없음`);

  const fetchImpl = mockFetch({ 'air-quality-api.open-meteo.com': { body: AIR_BODY } });
  await getAirQuality(37.5, 127, { fetchImpl });
  const params = requestParams(fetchImpl);
  for (const key of ['latitude', 'longitude', 'current', 'timezone']) {
    assert.ok(text.includes(`- name: ${key}`), `명세에 파라미터 ${key} 없음`);
  }
  for (const v of params.get('current').split(',')) {
    assert.ok(hasEnumValue(text, v), `air-quality.yml에 변수 ${v} 없음`);
  }
});

test('명세 사본에 CC BY 4.0 라이선스와 출처 문서가 함께 있다', () => {
  for (const name of ['forecast.yml', 'air-quality.yml']) {
    assert.match(spec(name), /Attribution 4\.0 International \(CC BY 4\.0\)/, name);
  }
  assert.match(spec('SOURCE.md'), /930063f12047363861f775c685c16a98b52dbfe4/);
});
