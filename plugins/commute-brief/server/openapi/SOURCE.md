# OpenAPI 명세 출처

이 폴더의 `forecast.yml`, `air-quality.yml`은 Open-Meteo 저장소의 파일을 **수정 없이** 복사한 것이다.

- 원본: https://github.com/open-meteo/open-meteo/tree/main/openapi
- 기준 커밋: `930063f12047363861f775c685c16a98b52dbfe4` (2026-09-09, 두 파일 모두)
- 내려받은 날: 2026-10-26
- 라이선스: Attribution 4.0 International (CC BY 4.0) — 각 파일의 `info.license`에 명시
- 참고: 원본 저장소의 소스 코드는 AGPL v3(https://github.com/open-meteo/open-meteo/blob/main/LICENSE)이다. 명세 파일에 어느 라이선스가 적용되는지는 확인 필요.
- API 이용 약관: https://open-meteo.com/en/terms (무료는 비상업적 사용 전용, 분 600 / 시간 5,000 / 일 10,000 / 월 300,000회)

지오코딩(`https://geocoding-api.open-meteo.com/v1/search`)은 저장소의 `openapi/`에 명세 파일이 없어서
[공식 문서](https://open-meteo.com/en/docs/geocoding-api)를 보고 `../lib.js`의 `geocode()`에 직접 구현했다.

`../lib.js`가 요청하는 변수(`current`, `daily`, `hourly` 값)가 이 명세에 존재하는지는 `../../tests/openapi.test.js`가 확인한다.
