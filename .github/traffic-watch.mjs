/**
 * 방문 급증 감시 — 공개 미러(yebuapp/yebuapp.github.io)의 GitHub Actions 가 매시간 돌린다
 * (.github/workflows/traffic-watch.yml, 원본은 이 저장소 ops/traffic-watch.yml — deploy-pages.sh 가 복사).
 * 기준을 넘거나 함수를 못 부르면 종료 코드 1 → 작업 실패 → GitHub 가 운영자에게 실패 메일을 보낸다.
 * 비밀 키를 쓰지 않는다: 공개 키(앱에 들어 있는 sb_publishable_)로 rpc/traffic_status(0022)만 부른다.
 *
 * 기준값 근거 (2026-11-13 실측, events 547행 = 2026-10-14 00:28 ~ 2026-11-12 23:55 UTC, 30일 보존 전체):
 *   아무 1시간 구간 최대 67행(arrive 27), 아무 24시간 구간 최대 107행(arrive 43). reports 는 전체 0행.
 *   - 24시간: 정상 최대의 5배 → rows_24h ≥ 535(=107×5), arrive_24h ≥ 215(=43×5).
 *     참고 사고(하루 25 → 977 방문, 약 39배)는 이 기준에 첫 몇 시간 안에 걸린다.
 *   - 1시간: 5배(335행)는 닿을 수 없다 — events_rate_cap(0011)이 시간당 120행을 넘으면 조용히 버린다.
 *     그래서 상한에 닿은 것 자체(rows_1h ≥ 120, 정상 최대의 약 1.8배이고 이때부터 기록이 버려진다)를 신호로 쓴다.
 *   - reports: 시간당 상한이 12행(0017)이고 지금까지 0행 → reports_24h ≥ 12.
 * 기준을 바꿀 때는 같은 방식으로 다시 재고(정상 최대 × 5) 이 주석과 docs/security-2026-11-13.md 를 함께 고친다.
 * User-Agent 는 판단에 쓰지 않는다(수집기는 평범한 크롬으로 보인다).
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const THRESHOLDS = Object.freeze({
  rows_1h: 120,
  rows_24h: 535,
  arrive_24h: 215,
  reports_24h: 12,
});

/** 순수 판정 — 넘은 항목 목록(빈 배열 = 정상). 숫자가 아닌 칸이 있으면 그것도 이상으로 본다. */
export function judge(s, t = THRESHOLDS) {
  const over = [];
  for (const [k, lim] of Object.entries(t)) {
    const v = s?.[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) over.push(`${k}=읽을 수 없음`);
    else if (v >= lim) over.push(`${k}=${v} (기준 ${lim})`);
  }
  return over;
}

const SUPA_URL = 'https://adagxaeirzkujskqjnnm.supabase.co';

/** 공개 키를 앱 파일에서 읽는다(미러에서는 index.html, 이 저장소에서는 app/template.html). */
export function findPublishableKey(paths) {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/sb_publishable_[A-Za-z0-9_-]{20,}/);
    if (m) return m[0];
  }
  return null;
}

async function main() {
  const key = findPublishableKey(['index.html', 'app/index.html', 'app/template.html']);
  if (!key) { console.error('감시 실패: 공개 키를 찾지 못했다(index.html)'); process.exit(1); }
  let s;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/traffic_status`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'yebu-traffic-watch' },
      body: '{}',
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) { console.error(`감시 실패: traffic_status 응답 ${r.status}`); process.exit(1); }
    s = await r.json();
  } catch (e) {
    console.error(`감시 실패: traffic_status 호출 오류 ${e.name}`); process.exit(1);
  }
  const over = judge(s);
  console.log(`방문 기록 — 1시간 ${s.rows_1h}행(첫 방문 ${s.arrive_1h}) · 24시간 ${s.rows_24h}행(첫 방문 ${s.arrive_24h}) · 오류 알리기 24시간 ${s.reports_24h}건 · ${s.at}`);
  if (over.length) {
    console.error('급증 경보: ' + over.join(', '));
    console.error('할 일: docs/security-2026-11-13.md "급증 경보가 오면" 절 — Supabase 로그(edge_logs)에서 AS·나라·경로를 먼저 본다.');
    process.exit(1);
  }
  console.log('정상 — 기준 이하');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
