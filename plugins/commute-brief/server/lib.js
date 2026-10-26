// Open-Meteo 호출 로직. MCP 서버(index.js)와 훅(hooks/session-brief.js)이 공유하고, 테스트에서는 fetchImpl을 주입한다.

export const ENDPOINTS = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
};

export const ATTRIBUTION = {
  forecast: 'Weather data by Open-Meteo.com (https://open-meteo.com)',
  airQuality: 'Air quality data by Open-Meteo.com (CAMS), https://open-meteo.com',
  geocoding: 'Location data by Open-Meteo.com, based on GeoNames',
};

// 지오코딩 API는 한글 도시명 검색이 불안정하다(예: "서울"은 빈 결과, "부산"은 시골 마을만 반환). 주요 도시는 영문으로 바꿔 조회한다.
export const KOREAN_CITY_ALIASES = {
  서울: 'Seoul',
  부산: 'Busan',
  대구: 'Daegu',
  인천: 'Incheon',
  광주: 'Gwangju',
  대전: 'Daejeon',
  울산: 'Ulsan',
  세종: 'Sejong',
  수원: 'Suwon',
  성남: 'Seongnam',
  고양: 'Goyang',
  용인: 'Yongin',
  창원: 'Changwon',
  청주: 'Cheongju',
  전주: 'Jeonju',
  포항: 'Pohang',
  춘천: 'Chuncheon',
  제주: 'Jeju',
};

const ADMIN_SUFFIX = /(특별자치시|특별자치도|특별시|광역시|시)$/;

export function resolveQuery(name) {
  const trimmed = String(name ?? '').trim();
  const stripped = trimmed.replace(ADMIN_SUFFIX, '');
  const alias = KOREAN_CITY_ALIASES[trimmed] ?? KOREAN_CITY_ALIASES[stripped];
  return alias ? { query: alias, countryCode: 'KR', aliased: true } : { query: trimmed, aliased: false };
}

// WMO weather interpretation codes (Open-Meteo `weather_code`)
const WEATHER_CODE_KO = {
  0: '맑음',
  1: '대체로 맑음',
  2: '구름 조금',
  3: '흐림',
  45: '안개',
  48: '서리 안개',
  51: '약한 이슬비',
  53: '이슬비',
  55: '강한 이슬비',
  56: '약한 어는 이슬비',
  57: '강한 어는 이슬비',
  61: '약한 비',
  63: '비',
  65: '강한 비',
  66: '약한 어는 비',
  67: '강한 어는 비',
  71: '약한 눈',
  73: '눈',
  75: '강한 눈',
  77: '싸락눈',
  80: '약한 소나기',
  81: '소나기',
  82: '강한 소나기',
  85: '약한 소낙눈',
  86: '강한 소낙눈',
  95: '뇌우',
  96: '우박 동반 뇌우',
  99: '강한 우박 동반 뇌우',
};

export function describeWeatherCode(code) {
  return WEATHER_CODE_KO[code] ?? `알 수 없음(${code})`;
}

// 미세먼지 등급 경계값(상한, ㎍/㎥). 한국 환경부의 일평균 기준(README 출처 참고)을 현재 시각 값에 적용하는 것이므로 참고용 등급이다.
const GRADE_LIMITS = {
  pm10: [30, 80, 150],
  pm2_5: [15, 35, 75],
};
const GRADE_LABELS = ['좋음', '보통', '나쁨', '매우 나쁨'];

export function gradeParticulate(kind, value) {
  const limits = GRADE_LIMITS[kind];
  if (!limits || typeof value !== 'number' || Number.isNaN(value)) return null;
  const idx = limits.findIndex((limit) => value <= limit);
  return GRADE_LABELS[idx === -1 ? limits.length : idx];
}

function assertCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error(`latitude는 -90~90 사이여야 합니다: ${latitude}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error(`longitude는 -180~180 사이여야 합니다: ${longitude}`);
  }
}

export async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Open-Meteo 요청 실패(HTTP ${res.status}): ${body?.reason ?? '사유 없음'}`);
    }
    return body;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Open-Meteo 응답 시간 초과(${timeoutMs}ms)`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function geocode(name, { count = 5, countryCode, ...opts } = {}) {
  const resolved = resolveQuery(name);
  if (resolved.query.length < 2) throw new Error('name은 2자 이상이어야 합니다.');
  const params = new URLSearchParams({ name: resolved.query, count: String(count), language: 'ko' });
  const code = countryCode ?? resolved.countryCode;
  if (code) params.set('countryCode', code);
  const data = await fetchJson(`${ENDPOINTS.geocoding}?${params}`, opts);
  const results = (data?.results ?? [])
    .map((r) => ({
      name: r.name,
      admin1: r.admin1,
      admin2: r.admin2,
      country: r.country,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
      population: r.population ?? 0,
    }))
    .sort((a, b) => b.population - a.population);
  return { query: resolved.query, aliased: resolved.aliased, results, attribution: ATTRIBUTION.geocoding };
}

export async function getForecast(latitude, longitude, { days = 1, ...opts } = {}) {
  assertCoordinates(latitude, longitude);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: String(days),
  });
  const data = await fetchJson(`${ENDPOINTS.forecast}?${params}`, opts);
  return {
    timezone: data.timezone,
    current: {
      time: data.current.time,
      temperature_c: data.current.temperature_2m,
      apparent_temperature_c: data.current.apparent_temperature,
      precipitation_mm: data.current.precipitation,
      wind_speed_kmh: data.current.wind_speed_10m,
      condition: describeWeatherCode(data.current.weather_code),
    },
    daily: data.daily.time.map((date, i) => ({
      date,
      condition: describeWeatherCode(data.daily.weather_code[i]),
      temp_max_c: data.daily.temperature_2m_max[i],
      temp_min_c: data.daily.temperature_2m_min[i],
      precipitation_probability_max_pct: data.daily.precipitation_probability_max[i],
    })),
    attribution: ATTRIBUTION.forecast,
  };
}

export async function getAirQuality(latitude, longitude, opts = {}) {
  assertCoordinates(latitude, longitude);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'pm10,pm2_5,us_aqi',
    timezone: 'auto',
  });
  const data = await fetchJson(`${ENDPOINTS.airQuality}?${params}`, opts);
  const { pm10, pm2_5, us_aqi, time } = data.current;
  return {
    timezone: data.timezone,
    current: {
      time,
      pm10_ugm3: pm10,
      pm10_grade: gradeParticulate('pm10', pm10),
      pm2_5_ugm3: pm2_5,
      pm2_5_grade: gradeParticulate('pm2_5', pm2_5),
      us_aqi,
    },
    note: '모델(CAMS) 기반 추정값이라 한국 측정소 실측값과 다를 수 있습니다. 등급은 참고용입니다.',
    attribution: ATTRIBUTION.airQuality,
  };
}
