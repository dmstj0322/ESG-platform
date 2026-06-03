/**
 * k6 부하 테스트 - 시나리오 1
 * 로그인 → 최신 분석 결과 조회(대시보드) → 분석 결과 상세 → 분석 이력 조회
 * 동시 사용자: 100명
 *
 * 실행 방법:
 *   k6 run scenario1_dashboard.js
 *   k6 run --env BASE_URL=http://실서버IP:9000 scenario1_dashboard.js
 *
 * 사전 준비:
 *   아래 TEST_ACCOUNTS 목록에 있는 계정들이 DB에 존재해야 합니다.
 *   계정 생성:
 *     POST /auth/signup/company-admin
 *     { "email":"k6test01@esg.com", "password":"Test1234!",
 *       "nickname":"k6테스터01", "companyName":"K6테스트기업01",
 *       "regionCode":"11", "ksicCode":"26110", "employeeCount":100 }
 *
 * 동작 흐름:
 *   1. POST /auth/login          → accessToken 획득 (응답: {accessToken, refreshToken, ...})
 *   2. GET  /analysis/latest     → 최신 완료 리포트 (200 또는 204)
 *   3. GET  /api/v1/analysis/{id}/result  → 분석 결과 상세 (analysisId가 있을 때만)
 *   4. GET  /analysis/history    → 완료된 분석 이력 목록 (최신 20건)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ── 커스텀 메트릭 ──────────────────────────────────────────────────────────────
const loginDuration     = new Trend('login_duration_ms',     true);
const latestDuration    = new Trend('latest_duration_ms',    true);
const resultDuration    = new Trend('result_duration_ms',    true);
const historyDuration   = new Trend('history_duration_ms',   true);
const loginFailCount    = new Counter('login_fail_count');
const errorRate         = new Rate('error_rate');

// ── 환경 변수 ──────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:9000';

// ── 테스트 계정 풀 ─────────────────────────────────────────────────────────────
// 1차 테스트(GET 조회)는 동일 companyId 공유 가능 — 20개 계정을 100 VU가 순환합니다.
const TEST_ACCOUNTS = [
  { email: 'k6test01@k6corp01.com', password: 'Test1234!' },
  { email: 'k6test02@k6corp02.com', password: 'Test1234!' },
  { email: 'k6test03@k6corp03.com', password: 'Test1234!' },
  { email: 'k6test04@k6corp04.com', password: 'Test1234!' },
  { email: 'k6test05@k6corp05.com', password: 'Test1234!' },
  { email: 'k6test06@k6corp06.com', password: 'Test1234!' },
  { email: 'k6test07@k6corp07.com', password: 'Test1234!' },
  { email: 'k6test08@k6corp08.com', password: 'Test1234!' },
  { email: 'k6test09@k6corp09.com', password: 'Test1234!' },
  { email: 'k6test10@k6corp10.com', password: 'Test1234!' },
  { email: 'k6test11@k6corp11.com', password: 'Test1234!' },
  { email: 'k6test12@k6corp12.com', password: 'Test1234!' },
  { email: 'k6test13@k6corp13.com', password: 'Test1234!' },
  { email: 'k6test14@k6corp14.com', password: 'Test1234!' },
  { email: 'k6test15@k6corp15.com', password: 'Test1234!' },
  { email: 'k6test16@k6corp16.com', password: 'Test1234!' },
  { email: 'k6test17@k6corp17.com', password: 'Test1234!' },
  { email: 'k6test18@k6corp18.com', password: 'Test1234!' },
  { email: 'k6test19@k6corp19.com', password: 'Test1234!' },
  { email: 'k6test20@k6corp20.com', password: 'Test1234!' },
];

// ── 테스트 설정 ────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    dashboard_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 30  },  // 30초 동안 30명으로 증가
        { duration: '1m',  target: 100 },  // 1분 동안 100명으로 증가
        { duration: '2m',  target: 100 },  // 2분 동안 100명 유지
        { duration: '30s', target: 0   },  // 30초 동안 종료
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    // 전체 HTTP 요청 기준
    http_req_duration: ['p(95)<3000'],  // 95%ile 3초 이내
    http_req_failed:   ['rate<0.05'],   // 실패율 5% 미만

    // API별 응답시간
    login_duration_ms:   ['p(95)<2000'],
    latest_duration_ms:  ['p(95)<1500'],
    result_duration_ms:  ['p(95)<2000'],
    history_duration_ms: ['p(95)<1500'],

    // 전체 오류율
    error_rate: ['rate<0.05'],
  },
};

// ── 메인 시나리오 ──────────────────────────────────────────────────────────────
export default function () {
  // VU별로 계정을 순환 배정
  const account = TEST_ACCOUNTS[(__VU - 1) % TEST_ACCOUNTS.length];
  let accessToken = null;
  let analysisId  = null;

  // ── STEP 1: 로그인 ──────────────────────────────────────────────────────────
  // POST /auth/login
  // Gateway: /auth/** → RewritePath → auth-service: /login (JwtFilter 제외)
  // 응답: { accessToken, refreshToken, email, nickname, memberId }
  group('1. 로그인', () => {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: account.email, password: account.password }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags:    { name: 'POST /auth/login' },
      }
    );

    loginDuration.add(res.timings.duration);

    const ok = check(res, {
      '로그인 200 OK':  (r) => r.status === 200,
      'accessToken 존재': (r) => {
        try { return !!JSON.parse(r.body).accessToken; } catch { return false; }
      },
    });

    if (ok) {
      accessToken = JSON.parse(res.body).accessToken;
      errorRate.add(0);
    } else {
      loginFailCount.add(1);
      errorRate.add(1);
      console.error(
        `[VU ${__VU}] 로그인 실패 email=${account.email}` +
        ` status=${res.status} body=${res.body}`
      );
    }
  });

  if (!accessToken) {
    sleep(1);
    return;
  }

  const authHeaders = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type':  'application/json',
  };

  sleep(0.5);

  // ── STEP 2: 최신 분석 결과 조회 (대시보드 진입) ─────────────────────────────
  // GET /analysis/latest
  // Gateway: /analysis/** → RewritePath → analysis-service: /latest
  // 응답: { analysisId, finalGrade, analysisResult } 또는 204 No Content
  group('2. 최신 분석 결과 조회', () => {
    const res = http.get(
      `${BASE_URL}/analysis/latest`,
      {
        headers: authHeaders,
        tags:    { name: 'GET /analysis/latest' },
      }
    );

    latestDuration.add(res.timings.duration);

    const ok = check(res, {
      '200 또는 204': (r) => r.status === 200 || r.status === 204,
    });

    if (ok) {
      errorRate.add(0);
      if (res.status === 200) {
        try {
          const body = JSON.parse(res.body);
          // 컨트롤러: response.put("analysisId", report.getId())
          analysisId = body.analysisId;
        } catch { /* 무시 */ }
      }
    } else {
      errorRate.add(1);
      console.warn(`[VU ${__VU}] /analysis/latest 실패 status=${res.status}`);
    }
  });

  sleep(0.5);

  // ── STEP 3: 분석 결과 상세 조회 ────────────────────────────────────────────
  // GET /api/v1/analysis/{analysisId}/result
  // Gateway: /api/v1/analysis/** → analysis-service (경로 그대로)
  // 응답: AnalysisResultResponse (analysisId, finalGrade, eScore, sScore, gScore, ...)
  // 404 = 분석 미완료 또는 존재하지 않는 ID
  if (analysisId) {
    group('3. 분석 결과 상세 조회', () => {
      const res = http.get(
        `${BASE_URL}/api/v1/analysis/${analysisId}/result`,
        {
          headers: authHeaders,
          tags:    { name: 'GET /api/v1/analysis/{id}/result' },
        }
      );

      resultDuration.add(res.timings.duration);

      const ok = check(res, {
        '결과 200 OK':    (r) => r.status === 200,
        'totalScore 존재': (r) => {
          try { return JSON.parse(r.body).totalScore !== undefined; } catch { return false; }
        },
        'finalGrade 존재': (r) => {
          try { return !!JSON.parse(r.body).finalGrade; } catch { return false; }
        },
      });

      if (ok) errorRate.add(0);
      else {
        errorRate.add(1);
        console.warn(`[VU ${__VU}] 결과 조회 실패 analysisId=${analysisId} status=${res.status}`);
      }
    });

    sleep(0.5);
  }

  // ── STEP 4: 분석 이력 조회 ─────────────────────────────────────────────────
  // GET /analysis/history
  // Gateway: /analysis/** → RewritePath → analysis-service: /history
  // 응답: List of { analysisId, grade, createdAt, totalScore, eScore, sScore, gScore }
  //        최신 20건, 빈 목록이면 []
  group('4. 분석 이력 조회', () => {
    const res = http.get(
      `${BASE_URL}/analysis/history`,
      {
        headers: authHeaders,
        tags:    { name: 'GET /analysis/history' },
      }
    );

    historyDuration.add(res.timings.duration);

    const ok = check(res, {
      '이력 200 OK':      (r) => r.status === 200,
      '배열 응답 확인':   (r) => {
        try { return Array.isArray(JSON.parse(r.body)); } catch { return false; }
      },
    });

    if (ok) errorRate.add(0);
    else {
      errorRate.add(1);
      console.warn(`[VU ${__VU}] /analysis/history 실패 status=${res.status}`);
    }
  });

  sleep(1);
}

// ── 테스트 종료 요약 ──────────────────────────────────────────────────────────
export function handleSummary(data) {
  const m = data.metrics;

  const fmt = (metricName, key = 'p(95)') => {
    const val = m[metricName]?.values?.[key];
    return val !== undefined ? `${val.toFixed(0)}ms` : 'N/A';
  };
  const fmtRate = (metricName) => {
    const val = m[metricName]?.values?.rate;
    return val !== undefined ? `${(val * 100).toFixed(1)}%` : 'N/A';
  };
  const fmtCount = (metricName) => m[metricName]?.values?.count ?? 'N/A';

  const pass = (m.http_req_failed?.values?.rate ?? 1) < 0.05 &&
               (m.http_req_duration?.values?.['p(95)'] ?? 99999) < 3000;

  console.log('\n════════════════════════════════════════════════');
  console.log('    시나리오 1: 대시보드 부하 테스트 (VU=100)   ');
  console.log('════════════════════════════════════════════════');
  console.log(`전체 HTTP 요청 수:          ${fmtCount('http_reqs')}`);
  console.log(`초당 요청 수 (RPS):         ${(m.http_reqs?.values?.rate ?? 0).toFixed(2)}`);
  console.log(`전체 응답시간 p(95):        ${fmt('http_req_duration')}`);
  console.log('------------------------------------------------');
  console.log(`로그인       p(95):         ${fmt('login_duration_ms')}`);
  console.log(`최신결과조회 p(95):         ${fmt('latest_duration_ms')}`);
  console.log(`결과상세조회 p(95):         ${fmt('result_duration_ms')}`);
  console.log(`이력조회     p(95):         ${fmt('history_duration_ms')}`);
  console.log('------------------------------------------------');
  console.log(`HTTP 실패율:                ${fmtRate('http_req_failed')}`);
  console.log(`전체 오류율:                ${fmtRate('error_rate')}`);
  console.log(`로그인 실패 건수:           ${fmtCount('login_fail_count')}`);
  console.log(`임계값 통과 여부:           ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('════════════════════════════════════════════════\n');

  return {};
}
