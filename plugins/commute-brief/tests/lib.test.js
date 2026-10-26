import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeWeatherCode,
  fetchJson,
  geocode,
  getAirQuality,
  getForecast,
  gradeParticulate,
  resolveQuery,
} from '../server/lib.js';
import { AIR_BODY, FORECAST_BODY, mockFetch } from './helpers.js';

test('resolveQuery: 한글 도시명과 행정구역 접미사를 영문 별칭으로 바꾼다', () => {
  assert.deepEqual(resolveQuery('서울'), { query: 'Seoul', countryCode: 'KR', aliased: true });
  assert.equal(resolveQuery('서울시').query, 'Seoul');
  assert.equal(resolveQuery('부산광역시').query, 'Busan');
  assert.equal(resolveQuery('제주특별자치도').query, 'Jeju');
  assert.equal(resolveQuery('  대전  ').query, 'Daejeon');
});

test('resolveQuery: 별칭에 없으면 그대로 두고 countryCode를 붙이지 않는다', () => {
  assert.deepEqual(resolveQuery('Paris'), { query: 'Paris', aliased: false });
  assert.deepEqual(resolveQuery('판교'), { query: '판교', aliased: false });
  assert.equal(resolveQuery(undefined).query, '');
});

test('gradeParticulate: 경계값에서 등급이 바뀐다', () => {
  assert.equal(gradeParticulate('pm2_5', 15), '좋음');
  assert.equal(gradeParticulate('pm2_5', 15.1), '보통');
  assert.equal(gradeParticulate('pm2_5', 35), '보통');
  assert.equal(gradeParticulate('pm2_5', 36), '나쁨');
  assert.equal(gradeParticulate('pm2_5', 75), '나쁨');
  assert.equal(gradeParticulate('pm2_5', 76), '매우 나쁨');
  assert.equal(gradeParticulate('pm10', 30), '좋음');
  assert.equal(gradeParticulate('pm10', 80), '보통');
  assert.equal(gradeParticulate('pm10', 150), '나쁨');
  assert.equal(gradeParticulate('pm10', 151), '매우 나쁨');
});

test('gradeParticulate: 값이 없거나 종류가 틀리면 null', () => {
  assert.equal(gradeParticulate('pm2_5', null), null);
  assert.equal(gradeParticulate('pm2_5', undefined), null);
  assert.equal(gradeParticulate('pm2_5', NaN), null);
  assert.equal(gradeParticulate('o3', 10), null);
});

test('describeWeatherCode: 알려진 코드와 모르는 코드', () => {
  assert.equal(describeWeatherCode(0), '맑음');
  assert.equal(describeWeatherCode(61), '약한 비');
  assert.match(describeWeatherCode(1234), /알 수 없음/);
});

test('geocode: 한글 별칭으로 조회하고 인구순으로 정렬한다', async () => {
  const fetchImpl = mockFetch({
    'geocoding-api.open-meteo.com': {
      body: {
        results: [
          { name: '서울나드리', latitude: 36.6, longitude: 128.4, population: 0 },
          { name: '서울특별시', latitude: 37.566, longitude: 126.9784, population: 10349312, timezone: 'Asia/Seoul' },
        ],
      },
    },
  });
  const out = await geocode('서울', { fetchImpl });
  const url = new URL(fetchImpl.calls[0]);
  assert.equal(url.searchParams.get('name'), 'Seoul');
  assert.equal(url.searchParams.get('countryCode'), 'KR');
  assert.equal(out.results[0].name, '서울특별시');
  assert.equal(out.aliased, true);
});

test('geocode: 결과가 없으면 빈 배열', async () => {
  const fetchImpl = mockFetch({ 'geocoding-api.open-meteo.com': { body: { generationtime_ms: 0.1 } } });
  assert.deepEqual((await geocode('없는도시명', { fetchImpl })).results, []);
});

test('geocode: 한 글자 이름은 요청 없이 거부한다', async () => {
  const fetchImpl = mockFetch({});
  await assert.rejects(geocode('서', { fetchImpl }), /2자 이상/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('getForecast: 응답을 변환하고 출처를 포함한다', async () => {
  const fetchImpl = mockFetch({ 'api.open-meteo.com': { body: FORECAST_BODY } });
  const out = await getForecast(37.566, 126.9784, { fetchImpl });
  assert.equal(out.current.condition, '흐림');
  assert.equal(out.daily[0].condition, '약한 비');
  assert.equal(out.daily[0].precipitation_probability_max_pct, 80);
  assert.match(out.attribution, /Open-Meteo/);
});

test('getAirQuality: 등급을 계산한다', async () => {
  const fetchImpl = mockFetch({ 'air-quality-api.open-meteo.com': { body: AIR_BODY } });
  const out = await getAirQuality(37.566, 126.9784, { fetchImpl });
  assert.equal(out.current.pm2_5_grade, '나쁨');
  assert.equal(out.current.pm10_grade, '보통');
});

test('좌표 범위를 벗어나면 요청 없이 거부한다', async () => {
  const fetchImpl = mockFetch({});
  await assert.rejects(getForecast(91, 0, { fetchImpl }), /latitude/);
  await assert.rejects(getForecast(0, -181, { fetchImpl }), /longitude/);
  await assert.rejects(getAirQuality(NaN, 0, { fetchImpl }), /latitude/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('fetchJson: HTTP 오류는 reason을 담아 던진다', async () => {
  const fetchImpl = mockFetch({ 'api.open-meteo.com': { status: 400, body: { error: true, reason: 'Latitude must be in range' } } });
  await assert.rejects(fetchJson('https://api.open-meteo.com/v1/forecast', { fetchImpl }), /HTTP 400.*Latitude must be in range/);
});

test('fetchJson: 본문이 JSON이 아닌 오류 응답도 던진다', async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('bad json'); } });
  await assert.rejects(fetchJson('https://api.open-meteo.com/x', { fetchImpl }), /HTTP 502.*사유 없음/);
});

test('fetchJson: 시간 초과', async () => {
  const fetchImpl = (url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(fetchJson('https://api.open-meteo.com/x', { fetchImpl, timeoutMs: 20 }), /시간 초과/);
});
