// 테스트 공용 도우미. *.test.js가 아니라서 node --test가 직접 실행하지 않는다.

export function mockFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    const host = new URL(url).host;
    const route = routes[host];
    if (!route) throw new Error(`예상하지 못한 호스트: ${host}`);
    return { ok: (route.status ?? 200) < 400, status: route.status ?? 200, json: async () => route.body };
  };
  impl.calls = calls;
  return impl;
}

export const GEO_BODY = {
  results: [{ name: '서울특별시', latitude: 37.566, longitude: 126.9784, population: 10349312, timezone: 'Asia/Seoul' }],
};

export const FORECAST_BODY = {
  timezone: 'Asia/Seoul',
  current: { time: '2026-10-26T08:00', temperature_2m: 12.3, apparent_temperature: 10.1, precipitation: 0, weather_code: 3, wind_speed_10m: 5.5 },
  daily: {
    time: ['2026-10-26'],
    weather_code: [61],
    temperature_2m_max: [19.2],
    temperature_2m_min: [9.8],
    precipitation_probability_max: [80],
  },
};

export const AIR_BODY = {
  timezone: 'Asia/Seoul',
  current: { time: '2026-10-26T08:00', pm10: 31, pm2_5: 36, us_aqi: 101 },
};

export const DEFAULT_ROUTES = {
  'geocoding-api.open-meteo.com': { body: GEO_BODY },
  'api.open-meteo.com': { body: FORECAST_BODY },
  'air-quality-api.open-meteo.com': { body: AIR_BODY },
};
