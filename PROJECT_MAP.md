# ESG Platform — Project Map

> 이 파일은 프로젝트 전체 구조와 핵심 기능을 빠르게 파악하기 위한 지도입니다.
> 작업 시작 전 이 파일을 기준으로 맥락을 확인하세요.

---

## 개요

기업의 ESG(Environmental · Social · Governance) 보고서를 AI로 분석하고,
등급(S/A/B/C/D)을 산출하여 시각화하는 **Spring Cloud 마이크로서비스 + React 플랫폼**입니다.

---

## 서비스 구조

```
ESG-platform/
├── eureka-service       — 서비스 디스커버리 (Netflix Eureka)
├── gateway-service      — API 게이트웨이 (Spring Cloud Gateway, port 8081)
├── config-service       — 중앙 설정 서버 (Spring Cloud Config)
├── auth-service         — 인증/인가
├── analysis-service     — ESG 분석 핵심 서비스 (Spring Boot) ★
├── analysis-service-ui  — 프론트엔드 (React + Vite, port 5173) ★
├── community-service    — 커뮤니티 기능
├── market-service       — 마켓 기능
├── point-service        — 포인트/리워드 서비스
└── common               — 공통 DTO/유틸
```

**인프라 (Docker Compose):** MySQL(3306) · Redis(6379) · Kafka+Zookeeper(9092)

---

## analysis-service 핵심 기능

| 기능 | 클래스/파일 | 내용 |
|---|---|---|
| **AI 분석** | `AnalysisService`, `EsgAnalyst` | Groq API (llama-3.3-70b)로 PDF 보고서 분석, E/S/G 각각 점수 산출 |
| **RAG** | `EsgRagService`, `EsgGuidelineService` | K-ESG 가이드라인을 벡터 스토어에 학습, LangChain4j로 유사 가이드라인 검색 |
| **PDF 파싱** | `UpstageService` | Upstage API로 PDF → Markdown 변환 |
| **등급 산출** | `AnalysisService#determineGrade` | E(40%) + S(30%) + G(30%) 가중 합산 → S/A/B/C/D |
| **탄소 배출** | `ExternalDataService`, `CarbonEmissionController` | 한전(KEPCO), 가스공사(KOGAS) 공공 API 연동, 업종 평균 비교 |
| **업종 분석** | `EsgIntegrationService`, `KsicCodeMapper`, `IndustryAnalysisService` | KSIC 코드 기반 업종 평균 산출 |
| **캐시** | `AnalysisApiService` | Redis로 동일 파일 해시 기준 중복 분석 방지, 결과 30일 캐싱 |
| **분산 락** | `AnalysisApiService` | Redisson으로 동일 문서 중복 요청 차단 |
| **Rate Limit** | `AnalysisApiService#resolveBucket` | Bucket4j — 기업당 하루 5회 제한 |
| **비동기 처리** | `AnalysisConsumer`, Kafka | `esg-analysis-requests` 토픽으로 AI 분석 큐 처리 |
| **실시간 알림** | `WebSocketConfig`, `SimpMessagingTemplate` | STOMP WebSocket — `/topic/analysis/{companyId}`로 상태 푸시 |
| **Circuit Breaker** | `config/` + Resilience4j | AI API 장애 대응 (`groqAnalysis` 인스턴스) |
| **포인트 연동** | `PointServiceClient` | point-service Feign Client로 사용자 포인트 조회 |

### 주요 API 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/v1/analysis/report` | PDF 업로드 및 분석 시작 |
| GET | `/api/v1/analysis/latest/{companyId}` | 최신 완료 리포트 조회 |
| GET | `/api/v1/analysis/stats/{companyId}` | 등급 분포 통계 |
| POST | `/api/v1/analysis/admin/ingest` | K-ESG 가이드라인 학습 (Admin) |
| GET | `/api/analysis/carbon/stats` | 월별 탄소 배출 통계 |
| GET | `/api/analysis/carbon/report-data` | PDF 리포트용 통합 데이터 |
| POST | `/api/analysis/carbon/collect` | 공공 API 데이터 수집 실행 |

### 핵심 도메인 모델

- `AnalysisReport` — 분석 리포트 (status: PENDING → COMPLETED)
- `CarbonEmission` — 탄소 배출 데이터
- `EsgScore` — ESG 세부 점수
- `EnergyUsage` — 에너지 사용량

---

## analysis-service-ui 구조

```
analysis-service-ui/src/
├── components/
│   ├── Dashboard.jsx                  — 메인 대시보드 (업로드·결과·WebSocket)
│   ├── analysis/
│   │   ├── ESGAnalysisCharts.jsx      — E/S/G 점수 레이더·바 차트
│   │   └── AnalysisStepProgress.jsx   — 분석 진행 단계 UI
│   └── exportESGReport.js             — PDF 내보내기 로직
└── ...
```

**주요 흐름:**
1. 사용자가 PDF 업로드
2. WebSocket(`/ws-esg`) 연결, `/topic/analysis/{companyId}` 구독
3. 백엔드로 POST 요청 → Kafka 큐 → AI 분석
4. 완료 시 STOMP 메시지 수신 → 결과 자동 갱신
5. ESG 차트 렌더링 + 최종 등급 표시 + PDF 저장

---

## 외부 연동

| 서비스 | 용도 |
|---|---|
| **Groq API** | LLM (llama-3.3-70b) ESG 분석 |
| **Upstage API** | PDF → Markdown 파싱 |
| **한전(KEPCO) API** | 업종별 전력 사용량 평균 |
| **가스공사(KOGAS) API** | 업종별 가스 사용량 평균 |

---

## 현재 주요 작업 흐름 (2026-05-06 기준)

- **analysis-service**: 포인트 연동, AI/RAG 설정, Kafka 소비자, 응답 DTO 구현 진행 중
- **analysis-service-ui**: Dashboard 개선, ESG 차트·스텝 UI 신규 컴포넌트, PDF 내보내기 기능 추가 중
