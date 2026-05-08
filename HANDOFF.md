# Handoff — 2026-05-06

## 오늘 완료한 작업: 임직원 에코 포인트 탄소 저감량 환산 및 ESG 점수 반영 시스템

---

## 변경된 파일 목록

### point-service (3개)
| 파일 | 변경 내용 |
|---|---|
| `PointBalanceRepository.java` | `@Query` — companyId 기준 balance 합계 조회 메서드 추가 |
| `PointService.java` | `getCompanyTotalPoints(companyId)` 메서드 추가 |
| `PointController.java` | `GET /points/company/{companyId}/total` 엔드포인트 추가 |

### analysis-service (9개)
| 파일 | 변경 내용 |
|---|---|
| `PointServiceClient.java` | `getCompanyTotalPoints(companyId)` Feign 메서드 추가 |
| `AnalysisReport.java` | `ecoPoints`, `carbonReductionKg`, `equivalentTrees` 필드 추가 + `completeWithEco()` 메서드 |
| `AnalysisResultCache.java` | 위 3개 필드 추가 (Redis 직렬화 포함) |
| `EcoCommitKafkaConfig.java` | **[신규]** eco-commit 전용 String Kafka consumer factory |
| `EcoCommitRequestDto.java` | **[신규]** Kafka 메시지 DTO |
| `EcoCommitService.java` | **[신규]** 분산 락 → 포인트 조회 → 탄소 계산 → Kafka 발행 |
| `EcoCommitController.java` | **[신규]** `POST /eco/commit`, `GET /eco/preview/{companyId}` |
| `AnalysisConsumer.java` | `esg-eco-commit` 토픽 리스너 + `buildEcoCommitPrompt()` 추가 |

### analysis-service-ui (2개)
| 파일 | 변경 내용 |
|---|---|
| `Dashboard.jsx` | 에코 포인트 위젯 + [성과 확정] 버튼 + 소나무 결과 표시 |
| `exportESGReport.js` | 섹션 6 "임직원 에코 포인트 성과" PDF 추가 |

---

## 핵심 비즈니스 로직

### 환산 공식
```
carbonReductionKg = ecoPoints / 1000.0          (1,000 EP = 1 kg CO2eq)
equivalentTrees   = carbonReductionKg / 6.6      (6.6 kg = 소나무 1그루)
eBonus (E점수)    = min(carbonKg × 0.02, 10)     (최대 +10점)
sBonus (S점수)    = min(ecoPoints / 10,000, 5)   (최대 +5점)
```

### 성과 확정 흐름
```
[관리자: 성과 확정 및 반영 클릭]
  → POST /api/v1/analysis/eco/commit (X-UserId, X-CompanyId 헤더)
  → EcoCommitService
      ① Redisson 분산 락: eco:commit:lock:{companyId}
      ② point-service: GET /points/company/{companyId}/total
      ③ 탄소·소나무·점수 계산
      ④ 최신 COMPLETED 리포트 내용 DB 조회
      ⑤ AnalysisReport PENDING 저장 (eco 필드 선 기록)
      ⑥ Kafka "esg-eco-commit" 발행
  → AnalysisConsumer (ecoCommitListenerContainerFactory)
      ① WS: PREPROCESSING
      ② Groq 재분석 (eco 보너스 포함 프롬프트)
      ③ WS: AI_ANALYZING → MERGING_SCORE
      ④ AnalysisResultCache에 eco 필드 주입 후 직렬화
      ⑤ report.completeWithEco(json, grade, ecoPoints, carbonKg, trees)
      ⑥ WS: COMPLETE
  → Dashboard: fetchLatestData() 호출 → 차트·등급·소나무 UI 갱신
```

### 신규 API 엔드포인트
| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/analysis/eco/preview/{companyId}` | 성과 확정 전 예상 수치 조회 |
| POST | `/api/v1/analysis/eco/commit` | 성과 확정 및 AI 재분석 시작 |
| GET | `/points/company/{companyId}/total` | 기업 전체 에코 포인트 합계 (point-service) |

---

## Kafka 토픽 구조
| 토픽 | 그룹 | 역할 |
|---|---|---|
| `esg-analysis-requests` | `analysis-group` | 기존 PDF 분석 요청 (JsonDeserializer) |
| `esg-eco-commit` | `eco-commit-group` | 에코 성과 확정 재분석 (StringDeserializer) |

---

## 다음 세션 체크리스트

- [ ] `AnalysisResultCache.serialVersionUID` 버전 불일치 시 Redis flush 필요 (`FLUSHDB`)
- [ ] point-service에 companyId별 포인트 데이터가 실제로 쌓여 있어야 미리보기가 0EP 이상으로 표시됨
- [ ] 게이트웨이(`gateway-service`)에 `/api/v1/analysis/eco/**` 라우트 등록 확인
- [ ] `esg-eco-commit` Kafka 토픽 자동 생성 확인 (Kafka `auto.create.topics.enable=true` 기본 설정)
- [ ] Dashboard에서 기업 ID 입력 후 에코 포인트 위젯이 자동 갱신되는지 확인

---

## 알려진 제약사항

- 에코 포인트가 0인 기업은 [성과 확정] 버튼이 비활성화됨 (정상 동작)
- 성과 확정은 기업당 하루 횟수 제한 없음 — 필요 시 Bucket4j Rate Limit 추가 고려
- Groq 재분석 소요 시간 약 20~30초, 폴링 타임아웃 30초로 설정

---
---

## 오늘 완료한 작업 ②: 탄소 배출 지역 벤치마크 대시보드

> **목표**: 공공 API(한전·가스공사)에서 가져온 지역 평균 배출량과 우리 기업 실측/Mock 데이터를 비교하여  
> 전기·가스 분리 Stacked Bar 차트로 시각화

---

### 신규 생성 파일

#### analysis-service (Java)

| 파일 | 역할 |
|------|------|
| `service/domain/Company.java` | 기업 JPA 엔티티 — `regionCode`(시도코드), `ksicCode`(산업분류), `employeeCount` 포함 |
| `service/repository/CompanyRepository.java` | Spring Data JPA 리포지토리 |
| `dto/RegionalBenchmarkDto.java` | 벤치마크 응답 DTO (연간 요약 + 월별 전기/가스 분리 12개 항목) |
| `dto/external/KepcoRegionalResponseDto.java` | 한전 `city.do` 응답 매핑 |
| `client/KepcoRegionalClient.java` | 한전 시도별 전기사용량 Feign 클라이언트 (`city.do`) |
| `service/CarbonMockGenerator.java` | 계절성·지역·업종 반영 Mock 생성기 |
| `service/BenchmarkService.java` | 핵심 비교 서비스 (API 호출 + Fallback + Redis 캐시) |
| `controller/BenchmarkController.java` | `GET /api/analysis/benchmark` 엔드포인트 |

#### analysis-service-ui (React)

| 파일 | 역할 |
|------|------|
| `src/components/analysis/CarbonBenchmarkChart.jsx` | 전기·가스 분리 Stacked Bar 차트 + 성과 요약 카드 |

---

### 수정된 파일

| 파일 | 변경 내용 |
|------|-----------|
| `controller/CarbonEmissionController.java` | 누락된 `GET /stats` 엔드포인트 복구 (Dashboard.jsx 호출 대상) |
| `service/CarbonMockGenerator.java` | `generateCompanyElec()`, `generateRegionalElec()` 추가 |
| `service/BenchmarkService.java` | 내부 배열 `double[]` → `double[][]` 로 변경 (`[0]`합산 `[1]`전기 `[2]`가스) |
| `dto/RegionalBenchmarkDto.java` | `MonthlyData`에 전기/가스 분리 필드 6개 추가 |
| `src/components/Dashboard.jsx` | `benchmarkData` state, `fetchBenchmarkData()`, 차트 카드 섹션 추가 |

---

### 전체 데이터 흐름

```
Dashboard.jsx
  fetchBenchmarkData(companyId)
    → GET /api/analysis/benchmark
        ?companyId=9&year=2025&regionCode=11&ksicCode=26110&employeeCount=500

BenchmarkService.getBenchmark()
  │
  ├─ resolveCompanyEmissions()  ─────────────────────────────────────────
  │    ExternalDataService.getIntegratedMonthlyStats()  (DB 조회)
  │      ELECTRIC: carbonAmount 그대로 사용  (이미 tCO2eq)
  │      GAS:      carbonAmount / 1000       (kgCO2eq → tCO2eq)
  │    → DB 비어있으면 CarbonMockGenerator.generateCompanyData() 대체
  │    → 반환: double[][] [0]=합산 [1]=전기 [2]=가스
  │
  ├─ resolveRegionalAverage()  ──────────────────────────────────────────
  │    fetchRegionalElecTco2()
  │      KepcoRegionalClient → city.do  (시도별 전력)
  │      총전력 / 고객수 × 규모보정 → (kWh/1000) × 0.4781 = tCO2eq
  │
  │    fetchRegionalGasTco2()
  │      KogasClient → 전국 산업용 총량(MJ)
  │      × 시도별 소비 비중 / 지역 산업체수 × 규모보정 × 0.0561/1000 = tCO2eq
  │
  │    전기·가스 각 6개월 이상 → 합산  |  부족하면 CarbonMockGenerator 대체
  │    → 반환: double[][] [0]=합산 [1]=전기 [2]=가스
  │
  └─ buildMonthlyData()  →  RegionalBenchmarkDto  →  프론트엔드

CarbonBenchmarkChart.jsx
  Stacked Bar 2쌍 (우리 기업 / 지역 평균)
    우리 기업: 전기=인디고(#6366f1) + 가스=주황(#f97316)
    지역 평균: 전기=하늘색(#a5b4fc) + 가스=연주황(#fdba74)
  가스 상단 bar: 해당 월 합산 기준 평균 이하=주황, 초과=빨강(#f87171)
  성과 요약 카드: 연간 합산 + 전기/가스 분리 수치 + 절감률
```

---

### 신규 API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/analysis/benchmark` | 기업 vs 지역 평균 월별 벤치마크 |
| GET | `/api/analysis/carbon/stats` | 기업 월별 탄소 배출 통계 (기존 누락분 복구) |

**`/api/analysis/benchmark` 파라미터:**

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `companyId` | 필수 | 기업 ID |
| `year` | 2025 | 조회 연도 |
| `regionCode` | "11" | 시도코드 (11=서울, 31=울산 등) |
| `ksicCode` | "26110" | 한국표준산업분류코드 |
| `employeeCount` | 500 | 임직원 수 (규모 보정용) |

---

### 핵심 설계 결정

**① 기존 `industryType.do` → `city.do` 교체 이유**  
`industryType.do`는 전국 업종 집계만 제공해 지역 비교 불가.  
`city.do`(시도별)를 사용해야 "서울 평균", "울산 평균" 등 지역 단위 비교 가능.

**② Kogas API 지역별 파라미터 부재 문제**  
`getSupplyValuePerformanceList`는 전국 용도별 집계만 제공(지역 필터 없음).  
→ **전국 산업용 총량 × 시도별 소비 비중** (에너지경제연구원 통계 기반)으로 배분.  
비중 테이블: `BenchmarkService.REGION_GAS_SHARE` (17개 시도)

**③ ExternalDataService 단위 불일치 (기존 버그, 우회 처리)**

| 에너지원 | 저장 공식 | 실제 단위 |
|---------|----------|-----------|
| ELECTRIC | `(kWh / 1000) × 0.4781` | **tCO2eq** |
| GAS | `MJ × 0.0561` | **kgCO2eq** |

ExternalDataService 자체는 건드리지 않고, BenchmarkService에서 소스별로 꺼내 tCO2eq로 변환 후 합산.

**④ double[][] 배열 내부 규약**
```
[0] = 합산 tCO2eq   (DTO의 xEmissionTco2 필드)
[1] = 전기 tCO2eq   (DTO의 xElecEmissionTco2 / xAvgElecTco2 필드)
[2] = 가스 tCO2eq   (DTO의 xGasEmissionTco2  / xAvgGasTco2  필드)
```

---

### Redis 캐시 설정 필요 사항

`@Cacheable(value = "benchmark", key = "#companyId + '_' + #year + '_' + #regionCode")`  
`RedisConfig.java`의 `RedisCacheManager`에 `"benchmark"` 캐시가 없으면 인메모리로 동작.  
운영 전 아래 추가 필요:

```java
RedisCacheConfiguration benchmarkCfg = RedisCacheConfiguration.defaultCacheConfig()
    .entryTtl(Duration.ofHours(24));
return RedisCacheManager.builder(connectionFactory)
    .withCacheConfiguration("benchmark", benchmarkCfg)
    .build();
```

---

### 다음 세션 체크리스트

- [ ] `company` 테이블 DB 마이그레이션 스크립트 작성 (`Company.java` 기반)
- [ ] `Dashboard.jsx`의 `regionCode`·`employeeCount` 하드코딩 제거 → 실제 기업 데이터 연동
- [ ] Kepco `city.do` API 키로 실제 호출 테스트 — 응답 구조 일치 여부 확인
- [ ] `ExternalDataService` ELECTRIC/GAS 단위를 kgCO2eq 또는 tCO2eq 중 하나로 통일
- [ ] `RedisConfig`에 `"benchmark"` 캐시 설정 추가
- [ ] `REGION_GAS_SHARE` 테이블을 최신 지역에너지통계연보로 검증

---

### 알려진 제약사항

- Kepco `city.do` 엔드포인트 실재 여부 미검증 (기존 `industryType.do`와 동일 base URL 사용)
- 가스 지역 배분은 추정 비중이므로 통계청 데이터로 검증 권장
- `employeeCount` 500이 기본값 — 대기업(5,000명) vs 중소기업(50명) 차이를 감안해 보정 필요
- Mock Generator 시드가 `year × 1000 + employeeCount`로 고정 — 같은 파라미터면 항상 동일 결과
