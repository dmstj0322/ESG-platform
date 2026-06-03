/**
 * k6 부하 테스트 - 시나리오 2
 * 실제 ESG PDF 업로드 → RAG/LLM 분석 → 완료 폴링
 *
 * 실행 방법:
 *   # PDF 경로를 환경변수로 전달 (Windows 절대경로 또는 스크립트 기준 상대경로)
 *   k6 run --env BASE_URL=http://211.184.227.203:9000 --env VUS=5  --env PDF_PATH="C:/Users/SH/Downloads/그린넥스트 지속경영보고서.pdf" scenario2_pdf_analysis.js
 *   k6 run --env BASE_URL=http://211.184.227.203:9000 --env VUS=10 --env PDF_PATH="C:/Users/SH/Downloads/그린넥스트 지속경영보고서.pdf" scenario2_pdf_analysis.js
 *   k6 run --env BASE_URL=http://211.184.227.203:9000 --env VUS=20 --env PDF_PATH="C:/Users/SH/Downloads/그린넥스트 지속경영보고서.pdf" scenario2_pdf_analysis.js
 *
 *   # PDF를 k6/ 폴더에 복사해두면 상대경로 사용 가능
 *   k6 run --env BASE_URL=http://211.184.227.203:9000 --env VUS=5 scenario2_pdf_analysis.js
 *
 * 사전 준비:
 *   - 각 VU가 쓸 테스트 계정 (companyId 서로 다른 계정)
 *   - 동일 companyId 동시 분석 불가 (진행중 1건 제한, 500 에러)
 *   - 하루 쿼터: companyId당 5회 (in-memory Bucket4j, 서버 재시작 시 초기화)
 *   - VU=20 → 20개 계정 모두 사용 (1:1 배정)
 *
 * 동작 흐름:
 *   1. 로그인               → accessToken 획득
 *   2. POST /analysis/report → 202 Accepted, body = raw Long (analysisId)
 *   3. GET /api/v1/analysis/{id}/result 폴링
 *      → 200 OK = COMPLETED, 404 = PENDING/PROCESSING 중
 *   4. 완료 시 점수/등급 검증 및 요약 출력
 *
 * open() 사용 주의:
 *   open()은 반드시 init stage(최상단, export default 밖)에서 호출해야 합니다.
 *   k6는 init stage에서 파일을 1회 읽어 모든 VU가 동일 바이너리를 공유합니다.
 *   SharedArray는 JSON 직렬화 가능한 데이터 전용이므로 PDF 바이너리에는 사용하지 않습니다.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ── 환경 변수 (init stage) ────────────────────────────────────────────────────
const BASE_URL   = __ENV.BASE_URL  || 'http://localhost:9000';
const TARGET_VUS = parseInt(__ENV.VUS || '5');
const PDF_PATH   = __ENV.PDF_PATH  || '그린넥스트 지속경영보고서.pdf';

// ── PDF 파일 로드 (init stage) ────────────────────────────────────────────────
// open()은 init stage에서만 호출 가능합니다.
// 모든 VU가 동일 ArrayBuffer를 공유하므로 메모리를 VU 수만큼 복제하지 않습니다.
const pdfBytes = open(PDF_PATH, 'b');

// 업로드 시 사용할 파일명 — 경로에서 파일명만 추출
const PDF_FILENAME = PDF_PATH.replace(/\\/g, '/').split('/').pop();

// ── 폴링 설정 ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_SEC = 5;   // 5초마다 폴링
const POLL_TIMEOUT_SEC  = 600; // 최대 5분 대기

// ── 커스텀 메트릭 ─────────────────────────────────────────────────────────────
const uploadDuration       = new Trend('upload_duration_ms',   true);
const pollDuration         = new Trend('poll_duration_ms',     true);
const totalAnalysisDur     = new Trend('total_analysis_ms',    true);
const uploadSuccessRate    = new Rate('upload_success_rate');
const analysisCompleteRate = new Rate('analysis_complete_rate');
const pollCount            = new Counter('poll_count');
const errorRate            = new Rate('error_rate');

// ── 테스트 계정 풀 ────────────────────────────────────────────────────────────
// companyId가 모두 다른 계정 20개 — VU별 1:1 배정
// VU 1 → k6test01@k6corp01.com (index 0)
// VU 2 → k6test02@k6corp02.com (index 1)  ...  VU 20 → index 19
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

// ── 테스트 설정 ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    pdf_analysis: {
      // per-vu-iterations: 각 VU가 정확히 1회 실행 후 종료
      // → VU=5/10/20 모두 각 계정당 분석 1회만 수행 (쿼터 1회 소진)
      executor:    'per-vu-iterations',
      vus:         TARGET_VUS,
      iterations:  1,
      maxDuration: '10m',  // 분석 대기(최대 5분) + 여유 5분
    },
  },
  thresholds: {
    upload_duration_ms:     ['p(95)<10000'], // 업로드 202 수신까지 10초 이내
    analysis_complete_rate: ['rate>0.70'],   // 5분 내 완료율 70% 이상
    upload_success_rate:    ['rate>0.90'],   // 업로드 성공율 90% 이상
    poll_duration_ms:       ['p(95)<2000'],  // 폴링 응답 2초 이내
    error_rate:             ['rate<0.10'],   // 전체 오류율 10% 미만
  },
};

// ── 로그인 헬퍼 ───────────────────────────────────────────────────────────────
function login(account) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: account.email, password: account.password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { name: 'POST /auth/login' },
    }
  );

  if (res.status !== 200) {
    console.error(`[VU ${__VU}] 로그인 실패 email=${account.email} status=${res.status} body=${res.body}`);
    return null;
  }

  try {
    return JSON.parse(res.body).accessToken;
  } catch {
    console.error(`[VU ${__VU}] 로그인 응답 파싱 실패 body=${res.body}`);
    return null;
  }
}

// ── PDF 업로드 헬퍼 ───────────────────────────────────────────────────────────
// POST /analysis/report
// Gateway: /analysis/report → SetPath=/api/v1/analysis/report (JwtAuthFilter 적용)
// 응답: 202 Accepted, body = 순수 숫자(Long) — JSON 객체 아님
//       예) 42  (→ parseInt(res.body) 로 파싱)
function uploadPdf(token, bytes) {
  const formData = {
    file: http.file(bytes, PDF_FILENAME, 'application/pdf'),
  };

  const res = http.post(
    `${BASE_URL}/analysis/report`,
    formData,
    {
      headers: { 'Authorization': `Bearer ${token}` },
      tags:    { name: 'POST /analysis/report' },
      timeout: '60s',  // 실제 PDF는 수십MB 가능, 업로드 시간 여유 확보
    }
  );

  uploadDuration.add(res.timings.duration);

  const ok = check(res, {
    '업로드 202 Accepted': (r) => r.status === 202,
    'body가 숫자(analysisId)': (r) => !isNaN(parseInt(r.body)) && parseInt(r.body) > 0,
  });

  uploadSuccessRate.add(ok ? 1 : 0);

  if (!ok) {
    if (res.status === 429 || res.body?.includes('횟수를 초과')) {
      console.warn(`[VU ${__VU}] 쿼터 초과 (하루 5회 제한) email=${TEST_ACCOUNTS[(__VU-1)%TEST_ACCOUNTS.length].email}`);
    } else if (res.status === 500 && res.body?.includes('진행 중')) {
      console.warn(`[VU ${__VU}] companyId 중복 충돌 — 이미 분석 진행 중`);
    } else if (res.status === 500 && res.body?.includes('1분')) {
      console.warn(`[VU ${__VU}] 쿨다운 중 (1분 대기 필요)`);
    } else {
      console.error(`[VU ${__VU}] 업로드 실패 status=${res.status} body=${res.body}`);
    }
    errorRate.add(1);
    return null;
  }

  errorRate.add(0);
  const analysisId = parseInt(res.body);
  console.log(`[VU ${__VU}] 업로드 성공 analysisId=${analysisId} file=${PDF_FILENAME}`);
  return analysisId;
}

// ── 폴링 헬퍼 ────────────────────────────────────────────────────────────────
// GET /api/v1/analysis/{analysisId}/result
// 전용 status API 없음 — HTTP 상태코드로 완료 판단
//   200 = COMPLETED (결과 포함)
//   404 = PENDING 또는 PROCESSING 중
function pollUntilComplete(token, analysisId, startTime) {
  const maxAttempts = Math.ceil(POLL_TIMEOUT_SEC / POLL_INTERVAL_SEC);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    pollCount.add(1);

    const res = http.get(
      `${BASE_URL}/api/v1/analysis/${analysisId}/result`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
        tags:    { name: 'GET /api/v1/analysis/{id}/result' },
        timeout: '10s',
      }
    );

    pollDuration.add(res.timings.duration);

    if (res.status === 200) {
      const elapsed = Date.now() - startTime;
      totalAnalysisDur.add(elapsed);
      analysisCompleteRate.add(1);

      let result = null;
      try { result = JSON.parse(res.body); } catch { /* 무시 */ }

      check(res, {
        '결과 200 OK':    (r) => r.status === 200,
        'totalScore 존재': () => result?.totalScore !== undefined,
        'finalGrade 존재': () => !!result?.finalGrade,
        'analysisId 일치': () => result?.analysisId === analysisId,
      });

      console.log(
        `[VU ${__VU}] 완료 analysisId=${analysisId}` +
        ` grade=${result?.finalGrade} score=${result?.totalScore}` +
        ` eScore=${result?.eScore} sScore=${result?.sScore} gScore=${result?.gScore}` +
        ` 소요=${(elapsed / 1000).toFixed(1)}s (${attempt}회 폴링)`
      );
      return true;

    } else if (res.status === 404) {
      console.log(`[VU ${__VU}] 대기 analysisId=${analysisId} (${attempt}/${maxAttempts})`);
      sleep(POLL_INTERVAL_SEC);

    } else {
      console.error(`[VU ${__VU}] 폴링 오류 status=${res.status} body=${res.body}`);
      errorRate.add(1);
      sleep(POLL_INTERVAL_SEC);
    }
  }

  console.error(`[VU ${__VU}] 타임아웃 analysisId=${analysisId} (${POLL_TIMEOUT_SEC}s 초과)`);
  analysisCompleteRate.add(0);
  return false;
}

// ── 메인 시나리오 ─────────────────────────────────────────────────────────────
export default function () {
  // VU별 1:1 계정 배정 — companyId 충돌 방지
  // VU 1 → index 0, VU 2 → index 1, ..., VU 20 → index 19
  const account = TEST_ACCOUNTS[(__VU - 1) % TEST_ACCOUNTS.length];

  // ── STEP 1: 로그인 ──────────────────────────────────────────────────────────
  let accessToken = null;

  group('1. 로그인', () => {
    accessToken = login(account);
    check(null, { '로그인 성공': () => accessToken !== null });
    if (!accessToken) errorRate.add(1);
  });

  if (!accessToken) {
    sleep(2);
    return;
  }

  sleep(1);

  // ── STEP 2: 실제 PDF 업로드 (캐시 우회) ──────────────────────────────────
  // [캐시 우회 목적]
  // 서버는 PDF 전체 바이트의 SHA-256을 Redis 키로 사용한다.
  // 동일 PDF를 업로드하면 VU/iteration과 무관하게 동일한 해시가 생성되고
  // 첫 분석 완료 후 저장된 캐시가 이후 모든 요청에서 히트하여
  // OCR → Chroma → RAG → LLM 파이프라인이 완전히 우회된다.
  //
  // [우회 방법]
  // PDF 표준(ISO 32000)상 %%EOF 마커 이후의 데이터는 파서가 무시한다.
  // VU 번호·iteration·타임스탬프를 suffix로 추가하면 바이트가 달라져
  // SHA-256이 VU/iteration마다 고유하게 생성되므로 항상 캐시 미스가 발생한다.
  //
  // 원본 pdfBytes(ArrayBuffer)는 변경하지 않는다.
  let analysisId = null;
  const analysisStartTime = Date.now();

  group('2. PDF 업로드', () => {
    // suffix: VU·iteration·타임스탬프 조합 → SHA-256이 요청마다 달라짐
    // TextEncoder는 k6 엔진(Goja) 버전에 따라 미지원 → charCodeAt() 루프로 대체
    // suffix는 순수 ASCII(\n, %, 숫자, -, =)만 포함하므로 charCodeAt()으로 동일하게 변환됨
    const suffix = `\n%% k6-vu=${__VU} iter=${__ITER} ts=${Date.now()}`;
    const suffixArr = new Uint8Array(suffix.length);
    for (let i = 0; i < suffix.length; i++) {
      suffixArr[i] = suffix.charCodeAt(i) & 0xff;
    }

    const original = new Uint8Array(pdfBytes);

    // 원본 PDF + suffix를 하나의 Uint8Array로 합성
    const modified = new Uint8Array(original.length + suffixArr.length);
    modified.set(original);                    // 원본 바이트 복사
    modified.set(suffixArr, original.length);  // suffix를 끝에 추가

    // modified.buffer(ArrayBuffer)를 전달 — http.file() 허용 타입과 동일
    analysisId = uploadPdf(accessToken, modified.buffer);
  });

  if (!analysisId) {
    sleep(5);
    return;
  }

  // ── STEP 3: 분석 완료 폴링 ────────────────────────────────────────────────
  // Upstage OCR → Kafka → ChromaDB RAG → OpenAI LLM → DB 저장 순서로 처리됨
  // 실제 PDF 기준 소요 시간: 1~3분 예상
  group('3. 분석 완료 폴링', () => {
    pollUntilComplete(accessToken, analysisId, analysisStartTime);
  });

  sleep(2);
}

// ── 테스트 종료 요약 ──────────────────────────────────────────────────────────
export function handleSummary(data) {
  const m = data.metrics;

  const pct  = (key) => ((m[key]?.values?.rate ?? 0) * 100).toFixed(1) + '%';
  const ms   = (key) => m[key]?.values?.['p(95)'] != null
    ? m[key].values['p(95)'].toFixed(0) + 'ms' : 'N/A';
  const sec  = (key) => m[key]?.values?.avg != null
    ? (m[key].values.avg / 1000).toFixed(1) + 's' : 'N/A';
  const secP = (key) => m[key]?.values?.['p(95)'] != null
    ? (m[key].values['p(95)'] / 1000).toFixed(1) + 's' : 'N/A';
  const cnt  = (key) => m[key]?.values?.count ?? 'N/A';

  const pass =
    (m.upload_success_rate?.values?.rate    ?? 0) >= 0.9  &&
    (m.analysis_complete_rate?.values?.rate ?? 0) >= 0.7  &&
    (m.error_rate?.values?.rate             ?? 1) <  0.1;

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`    시나리오 2: 실제 ESG PDF 분석 부하 테스트 (VU=${TARGET_VUS})  `);
  console.log(`    PDF: ${PDF_FILENAME}`);
  console.log('════════════════════════════════════════════════════════');
  console.log(`업로드 성공률:              ${pct('upload_success_rate')}`);
  console.log(`분석 완료율(5분내):         ${pct('analysis_complete_rate')}`);
  console.log(`전체 오류율:               ${pct('error_rate')}`);
  console.log('────────────────────────────────────────────────────────');
  console.log(`업로드 응답시간 p(95):      ${ms('upload_duration_ms')}`);
  console.log(`폴링 응답시간 p(95):        ${ms('poll_duration_ms')}`);
  console.log(`전체 분석시간 평균:         ${sec('total_analysis_ms')}`);
  console.log(`전체 분석시간 p(95):        ${secP('total_analysis_ms')}`);
  console.log(`총 폴링 횟수:               ${cnt('poll_count')}`);
  console.log('────────────────────────────────────────────────────────');
  console.log(`임계값 통과 여부:           ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('════════════════════════════════════════════════════════\n');

  return {};
}
