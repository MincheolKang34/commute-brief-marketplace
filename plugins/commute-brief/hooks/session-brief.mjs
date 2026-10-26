// SessionStart 훅: 하루 첫 세션에 한 줄 날씨·미세먼지 브리핑을 보여 준다.
// 도시는 환경 변수 COMMUTE_BRIEF_CITY(기본 "서울"). 실패하면 아무것도 출력하지 않고 조용히 끝낸다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { geocode, getAirQuality, getForecast } from '../server/lib.js';

const DEFAULT_CITY = '서울';

export function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function buildBrief(city, forecast, air) {
  const { current } = forecast;
  const today = forecast.daily[0];
  const parts = [
    `${city} ${current.time.slice(11, 16)} 기준 ${current.temperature_c}°C(체감 ${current.apparent_temperature_c}°C) ${current.condition}`,
    `최고 ${today.temp_max_c}° / 최저 ${today.temp_min_c}°`,
    `강수확률 ${today.precipitation_probability_max_pct}%`,
    `PM2.5 ${air.current.pm2_5_ugm3}(${air.current.pm2_5_grade}) PM10 ${air.current.pm10_ugm3}(${air.current.pm10_grade})`,
  ];
  let line = parts.join(' · ');
  if (today.precipitation_probability_max_pct >= 60) line += ' · 우산 챙기세요';
  return line;
}

export async function run({ env = process.env, now = new Date(), fetchImpl = fetch, out = process.stdout } = {}) {
  const stateDir = env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'commute-brief');
  const stateFile = join(stateDir, 'last-brief.json');
  const today = localDate(now);

  try {
    if (JSON.parse(readFileSync(stateFile, 'utf8')).date === today) return null;
  } catch {
    // 상태 파일이 없거나 깨졌으면 오늘 첫 실행으로 취급한다.
  }

  const city = env.COMMUTE_BRIEF_CITY || DEFAULT_CITY;
  try {
    const found = (await geocode(city, { count: 1, fetchImpl })).results[0];
    if (!found) return null;
    const [forecast, air] = await Promise.all([
      getForecast(found.latitude, found.longitude, { fetchImpl }),
      getAirQuality(found.latitude, found.longitude, { fetchImpl }),
    ]);
    const line = buildBrief(city, forecast, air);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ date: today }));
    const payload = {
      systemMessage: `[commute-brief] ${line}`,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `오늘의 출근길 브리핑: ${line}` },
    };
    out.write(JSON.stringify(payload) + '\n');
    return payload;
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
