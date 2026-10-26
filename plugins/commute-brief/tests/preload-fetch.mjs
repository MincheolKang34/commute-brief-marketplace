// CLI 테스트용: `node --import <이 파일>`로 전역 fetch를 교체한다. FETCH_MODE=fail 이면 네트워크 오류, 그 외에는 고정 응답.
import { AIR_BODY, FORECAST_BODY, GEO_BODY } from './helpers.js';

const bodies = {
  'geocoding-api.open-meteo.com': GEO_BODY,
  'api.open-meteo.com': FORECAST_BODY,
  'air-quality-api.open-meteo.com': AIR_BODY,
};

globalThis.fetch = async (url) => {
  if (process.env.FETCH_MODE === 'fail') throw new TypeError('fetch failed');
  const body = bodies[new URL(url).host];
  return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body ?? {} };
};
