# commute-brief-marketplace

한국 도시의 날씨·미세먼지를 조회해 출근길 브리핑과 옷차림·우산 조언을 해 주는 Claude Code 플러그인 `commute-brief`의 마켓플레이스입니다.

| 구성 | 이름 | 역할 |
|---|---|---|
| MCP 서버 | `open-meteo` | 도구 3개: `geocode`(도시명→좌표), `get_forecast`(예보), `get_air_quality`(미세먼지) |
| Skill | `commute-brief` | 도시를 정해 조회하고 5줄 브리핑을 출력. 요청하면 카카오톡 나챗방 전송 |
| Agent | `outfit-advisor` | 조회 결과를 보고 옷차림·우산·마스크를 조언 |
| Hook | `SessionStart` | 하루 첫 세션에 한 줄 브리핑 |

API 키는 필요 없습니다. [Open-Meteo](https://open-meteo.com) 무료 API(비상업적 사용)를 씁니다.

## 설치

아래 GitHub 명령은 저장소를 올린 뒤부터 동작합니다. 그 전에는 로컬 폴더 방식을 쓰세요. `/plugin install` 흐름은 아직 직접 실행해 보지 않았습니다(확인 필요). `--plugin-dir` 방식은 검증했습니다.

```
/plugin marketplace add MincheolKang34/commute-brief-marketplace
/plugin install commute-brief@commute-brief-marketplace
```

로컬 폴더에서 설치하거나 시험해 볼 때:

```
/plugin marketplace add C:\경로\commute-brief-marketplace
claude --plugin-dir ./plugins/commute-brief
```

요구 사항: Node.js. MCP SDK의 `engines`는 `>=18`이지만 이 플러그인은 Node 24에서만 검증했습니다(다른 버전은 확인 필요). `node_modules` 설치는 필요 없습니다. 서버가 단일 파일(`server/dist/index.js`)로 번들되어 저장소에 포함되어 있습니다.

## 사용

| 하고 싶은 것 | 이렇게 말하기 |
|---|---|
| 날씨·미세먼지 브리핑 | "서울 날씨 브리핑 해줘", "출근길 우산 필요해?" (`commute-brief` 스킬) |
| 옷차림·우산·마스크 조언 | "오늘 뭐 입고 갈까?", "outfit-advisor로 부산 옷차림 알려줘" |
| 좌표 찾기 | "geocode로 판교 좌표 찾아줘" (MCP 도구를 직접 호출) |
| 카카오톡으로 받기 | "브리핑 카톡으로 보내줘" |

- 스킬은 도시를 말하지 않으면 `서울`로 조회하고, 5줄 이내로 출력합니다.
- 카카오톡 전송은 사용자가 요청했고 `KakaotalkChat-MemoChat` 도구(claude.ai에 연결한 PlayMCP 커넥터)가 있을 때만 합니다. 보내기 전에 내용을 보여 주고 확인받으며, 도구가 없으면 보내지 않고 알려 줍니다.
- 도구가 안 보이면 `/mcp`에서 `open-meteo` 서버 상태를 확인하세요.

### 기본 도시 바꾸기

환경 변수 `COMMUTE_BRIEF_CITY`로 정합니다. 스킬의 기본 도시와 세션 시작 브리핑에 모두 적용됩니다. Windows PowerShell에서 한 번 설정하고 새 터미널을 열면 됩니다(이 설정 방법은 직접 시험하지 않았습니다).

```
setx COMMUTE_BRIEF_CITY 부산
```

### 세션 시작 브리핑

- 새 세션을 열 때(`startup`) 하루 첫 번째에만 한 줄 브리핑이 나옵니다. 같은 날 다시 열면 나오지 않습니다.
- 조회에 실패하면 아무것도 출력하지 않고, 다음 세션에 다시 시도합니다.
- 오늘 이미 나왔는데 다시 보고 싶으면 플러그인 데이터 폴더의 `last-brief.json`을 지웁니다. `--plugin-dir`로 실행했을 때 위치는 `%USERPROFILE%\.claude\plugins\data\commute-brief-inline\`였습니다. 설치해서 쓸 때의 폴더 이름은 확인 필요입니다.

### 도시 이름 입력 요령

- 서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 수원, 성남, 고양, 용인, 창원, 청주, 전주, 포항, 춘천, 제주는 한글로 써도 되고 "서울시", "부산광역시"처럼 접미사를 붙여도 됩니다.
- 그 밖의 지명은 한글 검색이 부정확합니다. 동명 지역이 나올 수 있어 후보를 보여 주며, 영문 이름이나 위도·경도를 직접 주면 더 정확합니다.

## 한계

- 한글 지오코딩이 불안정해서(예: "서울"은 빈 결과, "부산"은 시골 마을만 반환) 주요 도시 18곳은 영문 별칭으로 바꿔 조회합니다(`server/lib.js`의 `KOREAN_CITY_ALIASES`). 그 밖의 지명은 그대로 조회하므로 엉뚱한 곳이 나올 수 있고, 이때 스킬이 후보를 보여 줍니다.
- 미세먼지는 CAMS **모델 추정값**이라 에어코리아 측정소 실측과 다를 수 있습니다.
- 미세먼지 등급은 환경부 **일평균** 기준(PM10 30/80/150, PM2.5 15/35/75 ㎍/㎥)을 현재 시각 값에 적용한 참고용입니다.
- 옷차림·우산·마스크 판단 기준(`agents/outfit-advisor.md`)은 일반적인 가이드로 직접 정한 값이며 공식 기준이 아닙니다.
- Windows에서 개발·검증했습니다. 다른 OS는 확인 필요.

## 개발

```
cd plugins/commute-brief/server
npm install
npm run build   # server/dist/index.js 재생성 (소스를 고치면 반드시 실행하고 dist를 함께 커밋)
npm test        # 네트워크 없이 실행. 실제 API까지 보려면 LIVE=1 npm test
```

플러그인 구성 파일 검증: `claude plugin validate .` (마켓플레이스), `claude plugin validate ./plugins/commute-brief` (플러그인).

## 출처와 라이선스 표기

- 날씨·대기질 데이터: [Open-Meteo.com](https://open-meteo.com). 지오코딩 위치 데이터는 [GeoNames](https://www.geonames.org) 기반입니다. 이용 약관(https://open-meteo.com/en/terms)에 따르면 무료 API는 비상업적 사용 전용이며 CC BY 4.0 조건을 따릅니다. 한도는 IP·애플리케이션당 분 600회, 시간 5,000회, 일 10,000회, 월 300,000회입니다. 광고나 구독이 있는 웹사이트·앱은 상업적 사용에 해당합니다. 이 플러그인은 세션 시작 브리핑에 하루 최대 3회 호출하므로 한도에 한참 못 미칩니다. 약관에 출처 표기 문구가 따로 정해져 있지는 않아서 응답에 `Weather data by Open-Meteo.com`을 넣고 있습니다.
- `plugins/commute-brief/server/openapi/*.yml`는 [open-meteo/open-meteo](https://github.com/open-meteo/open-meteo/tree/main/openapi)의 OpenAPI 명세를 수정 없이 복사한 것이며, 각 파일의 `info.license`에 CC BY 4.0이 적혀 있습니다. 다만 그 저장소의 소스 코드는 [AGPL v3](https://github.com/open-meteo/open-meteo/blob/main/LICENSE)입니다. 명세 파일에 어느 쪽이 적용되는지는 확인 필요입니다. 기준 커밋과 내려받은 날짜는 `SOURCE.md`에 있습니다.
- MCP 서버는 공식 [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)(`@modelcontextprotocol/sdk`)로 만들었고, Claude Code 플러그인 규격은 [공식 문서](https://code.claude.com/docs/en/plugins-reference)를 따랐습니다.
- 이 저장소 자체의 라이선스는 아직 정하지 않았습니다.
