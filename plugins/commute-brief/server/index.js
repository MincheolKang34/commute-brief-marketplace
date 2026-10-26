import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { geocode, getAirQuality, getForecast } from './lib.js';

const server = new McpServer({ name: 'open-meteo', version: '0.1.0' });

const readOnly = { readOnlyHint: true, openWorldHint: true };

async function respond(work) {
  try {
    const result = await work();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: err.message }], isError: true };
  }
}

server.registerTool(
  'geocode',
  {
    title: '도시명 → 좌표',
    description:
      '도시·지역 이름으로 위도/경도를 찾는다. 서울·부산 등 주요 한국 도시는 한글로 입력해도 된다. 결과는 인구순으로 정렬된다.',
    inputSchema: {
      name: z.string().min(2).describe('도시 또는 지역 이름 (예: 서울, Busan, 판교)'),
      count: z.number().int().min(1).max(10).default(5).describe('최대 결과 수'),
    },
    annotations: readOnly,
  },
  ({ name, count }) => respond(() => geocode(name, { count })),
);

server.registerTool(
  'get_forecast',
  {
    title: '날씨 예보',
    description: '좌표 기준 현재 날씨와 일별 예보(최고/최저 기온, 강수확률)를 조회한다. 시간대는 좌표에서 자동 결정된다.',
    inputSchema: {
      latitude: z.number().min(-90).max(90).describe('위도'),
      longitude: z.number().min(-180).max(180).describe('경도'),
      days: z.number().int().min(1).max(7).default(1).describe('예보 일수'),
    },
    annotations: readOnly,
  },
  ({ latitude, longitude, days }) => respond(() => getForecast(latitude, longitude, { days })),
);

server.registerTool(
  'get_air_quality',
  {
    title: '대기질(미세먼지)',
    description: '좌표 기준 현재 PM10, PM2.5, US AQI를 조회한다. 모델 추정값이며 한국 측정소 실측과 다를 수 있다.',
    inputSchema: {
      latitude: z.number().min(-90).max(90).describe('위도'),
      longitude: z.number().min(-180).max(180).describe('경도'),
    },
    annotations: readOnly,
  },
  ({ latitude, longitude }) => respond(() => getAirQuality(latitude, longitude)),
);

await server.connect(new StdioServerTransport());
