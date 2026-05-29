Create DATABASE if not exists esg_db default character set utf8mb4 default collate utf8mb4_unicode_ci;
Create DATABASE if not exists auth_db default character set utf8mb4 default collate utf8mb4_unicode_ci;
Create DATABASE if not exists community_db default character set utf8mb4 default collate utf8mb4_unicode_ci;
Create DATABASE if not exists market_db default character set utf8mb4 default collate utf8mb4_unicode_ci;
Create DATABASE if not exists point_db default character set utf8mb4 default collate utf8mb4_unicode_ci;

USE esg_db;

CREATE TABLE IF NOT EXISTS environment_data (
    id                BIGINT         NOT NULL AUTO_INCREMENT,
    company_id        BIGINT         NOT NULL,
    year_month        VARCHAR(7)     NOT NULL,
    electricity_kwh   DOUBLE,
    gas_mj            DOUBLE,
    carbon_tco2       DOUBLE,
    waste_kg          DOUBLE,
    water_m3          DOUBLE,
    data_source       VARCHAR(15)    NOT NULL,
    upload_session_id VARCHAR(36),
    original_file_name VARCHAR(255),
    uploaded_at       DATETIME       NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_env_company_month UNIQUE (company_id, year_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- environment_benchmarks 테이블: JPA ddl-auto=update로 자동 생성되나
-- 기존 DB에 source 컬럼이 없을 경우 수동 추가용 (필요 시만 실행)
-- ALTER TABLE environment_benchmarks ADD COLUMN IF NOT EXISTS electricity_source VARCHAR(100);
-- ALTER TABLE environment_benchmarks ADD COLUMN IF NOT EXISTS gas_source        VARCHAR(100);
-- ALTER TABLE environment_benchmarks ADD COLUMN IF NOT EXISTS carbon_source     VARCHAR(100);
-- ALTER TABLE environment_benchmarks ADD COLUMN IF NOT EXISTS waste_source      VARCHAR(100);
-- ALTER TABLE environment_benchmarks ADD COLUMN IF NOT EXISTS water_source      VARCHAR(100);

-- ── point-service 전용 테이블 (esg_db 공유) ─────────────────────────────

-- 회사 ESG 활동 누적 풀: Kafka ESG 이벤트(TUMBLER/TRANSPORT/RECYCLE)로 적립,
-- ESG 분석 성공 후 Social 가산점 반영분 차감. 개인 point_balance 와 완전 분리.
CREATE TABLE IF NOT EXISTS company_esg_pool (
    company_id    BIGINT       NOT NULL,
    esg_points    BIGINT       NOT NULL DEFAULT 0,
    version       BIGINT       NOT NULL DEFAULT 0,
    created_date  DATETIME(6)  NULL,
    modified_date DATETIME(6)  NULL,
    PRIMARY KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회사 ESG 활동 누적 포인트 풀 — ESG 분석 시 차감 대상';

-- Kafka ESG 이벤트 중복 처리 방지 (at-least-once → exactly-once).
-- eventId = PostCreatedEvent.postId.
CREATE TABLE IF NOT EXISTS processed_event (
    event_id      BIGINT       NOT NULL,
    created_date  DATETIME(6)  NULL,
    modified_date DATETIME(6)  NULL,
    PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Kafka ESG 이벤트 중복 처리 방지 이력';