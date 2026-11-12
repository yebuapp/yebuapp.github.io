# 벤더 점검표 — 데이터 레코드의 checkedAt 관행을 의존성에도 적용한다

| 라이브러리 | 버전 | sha256 | 확인일 | 다음 점검 |
|---|---|---|---|---|
| supabase-js (UMD) | 2.119.0 | a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce | 2026-11-12 | 2027-02-27 |
| supabase-js 직전 판(한 세대 보존) | 2.112.4 | 9a8142ffedb319a3ac0d4a8a123c9c2f7ffdb0e1e86cd9553889911b647175f6 | 2026-11-12 | 다음 갱신 때 삭제 |
| web-push (Edge Function npm: 핀) | 3.6.7 | — (Deno 가 레지스트리에서 조달) | 2026-11-12 | 2027-02-27 |

점검 = upstream 릴리스 노트에서 보안 수정 여부 확인 → 필요 시 벤더 교체(새 sha256 을
커밋 메시지와 이 표에 기록) 또는 npm: 핀 상향 후 Edge Function 재배포.
갱신 시 build-app.mjs 의 태그 문자열(파일명)과 src/build.test.mjs 의 파일명도 함께 바꾼다.

## 갱신 방법 (2026-11-12 부터)
- 파일은 npm 공식 묶음(`registry.npmjs.org/@supabase/supabase-js/-/supabase-js-<판>.tgz`)에서 꺼낸 `dist/umd/supabase.js` **원본 그대로** 쓴다. 묶음의 sha512 를 레지스트리 `dist.integrity` 와 대조한 뒤 꺼낸다.
  (2.112.4 사본은 jsdelivr 가 머리에 붙인 안내 주석 292바이트가 있을 뿐 본문은 npm 원본과 바이트까지 같다 — 2026-11-12 대조.)
- **직전 판 파일은 한 세대 남긴다.** 배포가 `vendor/` 를 통째로 바꾸므로, 지우면 CDN·서비스워커에 남은 옛 index 가 부르는 옛 파일이 404 가 된다(rd/ 직전 세대 보존과 같은 이유).
- 앱이 쓰는 기능(`auth.signInWithOAuth·setSession·onAuthStateChange·signOut`, `from`, `rpc`, `functions.invoke`)과 `_isImplicitGrantCallback` 판별 키가 새 판에서도 같은지 본다(`src/applogic.mjs` parseAuthHash 가 그 키에 맞춰져 있다).

## 2026-11-12 점검 기록
- supabase-js 2.112.4 → 2.119.0: 2.113~2.119 릴리스 노트에 라이브러리 보안 수정 없음(2.117.3 의 RCE 는 예제 앱의 next). 탭 사이 세션 갱신 경합 수정(2.117.1) 등 버그 수정을 받으려 올렸다.
- web-push 는 3.6.7 유지: 4.0.0(2026-11-06 npm, ESM·class 전환)은 갓 나온 큰 판이고 push 함수 재배포(2파일·2단계)가 따른다. 3.6.7 이 부르는 jws `^4.0.0` 의 공지(GHSA-869p-cjfg-cm3x, 4.0.0 만 해당)는 HMAC **검증** 결함인데 web-push 는 `jws.sign`(ES256)만 쓴다(`src/vapid-helper.js:226`). 함수를 다음에 다시 올릴 일이 생기면 그때 4.x 를 검토한다.
