-- =============================================================
-- ESG Pool Migration Script
-- point-service 신규 테이블: company_esg_pool, processed_event
-- 실행 DB: esg_db (point-service datasource)
-- 실행 방법: MySQL Workbench 또는 CLI에서 직접 실행
-- =============================================================

USE esg_db;

-- -------------------------------------------------------------
-- [1] company_esg_pool 테이블 생성
--     회사 ESG 활동 적립금 (Kafka ESG 이벤트 기반 누적)
--     개인 point_balance 와 완전 분리된 회사 단위 Pool
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_esg_pool (
    company_id    BIGINT       NOT NULL,
    esg_points    BIGINT       NOT NULL DEFAULT 0,
    version       BIGINT       NOT NULL DEFAULT 0,
    created_date  DATETIME(6)  NULL,
    modified_date DATETIME(6)  NULL,
    PRIMARY KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='회사 ESG 활동 누적 포인트 풀 — ESG 분석 시 차감 대상';

-- -------------------------------------------------------------
-- [2] processed_event 테이블 생성
--     Kafka 이벤트 중복 처리 방지 (at-least-once → exactly-once)
--     event_id = PostCreatedEvent.postId (Kafka 메시지 PK)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processed_event (
    event_id      BIGINT       NOT NULL,
    created_date  DATETIME(6)  NULL,
    modified_date DATETIME(6)  NULL,
    PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Kafka ESG 이벤트 중복 처리 방지 — eventId(postId) 기준 처리 이력';

-- -------------------------------------------------------------
-- [3] 초기 데이터 Migration
--     기존 point_balance 기반 회사별 SUM → company_esg_pool 적재
--     ON DUPLICATE KEY: 재실행 안전 (멱등성 보장)
-- -------------------------------------------------------------
INSERT INTO company_esg_pool (company_id, esg_points, version, created_date, modified_date)
SELECT
    pb.company_id,
    SUM(pb.balance)  AS esg_points,
    0                AS version,
    NOW()            AS created_date,
    NOW()            AS modified_date
FROM point_balance pb
WHERE pb.company_id IS NOT NULL
GROUP BY pb.company_id
ON DUPLICATE KEY UPDATE
    esg_points    = VALUES(esg_points),
    modified_date = NOW();

-- -------------------------------------------------------------
-- [4] 검증 쿼리
-- -------------------------------------------------------------
SELECT
    'company_esg_pool' AS table_name,
    COUNT(*)           AS row_count,
    SUM(esg_points)    AS total_pool_points
FROM company_esg_pool;

SELECT
    c.company_id,
    c.esg_points AS pool_points,
    pb_sum.balance_sum,
    c.created_date,
    c.modified_date
FROM company_esg_pool c
LEFT JOIN (
    SELECT company_id, SUM(balance) AS balance_sum
    FROM point_balance
    GROUP BY company_id
) pb_sum ON c.company_id = pb_sum.company_id
ORDER BY c.company_id;

-- company_id=8 개별 확인
SELECT company_id, esg_points, version, created_date
FROM company_esg_pool
WHERE company_id = 8;
