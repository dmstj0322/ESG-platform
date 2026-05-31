-- 1. 뱃지(Badge) 데이터 자동 삽입
-- target_activity_type: TUMBLER, TRANSPORT, RECYCLE 중 하나와 일치해야 합니다.
-- target_count: 해당 활동을 몇 번 달성해야 뱃지를 얻는지 설정

-- 텀블러 뱃지
INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '텀블러 새싹', '텀블러 사용 5회 달성', 'TUMBLER', 5, '🌱'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '텀블러 새싹');

INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '텀블러 프로', '텀블러 사용 20회 달성', 'TUMBLER', 20, '🌿'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '텀블러 프로');

INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '텀블러 마스터', '텀블러 사용 50회 달성', 'TUMBLER', 50, '🌳'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '텀블러 마스터');

-- 2. 대중교통 뱃지
INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '에코 뚜벅이', '대중교통 이용 5회 달성', 'TRANSPORT', 5, '👟'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '에코 뚜벅이');

INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '에코 라이더', '대중교통 이용 20회 달성', 'TRANSPORT', 20, '🚲'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '에코 라이더');

INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '대중교통 마스터', '대중교통 이용 50회 달성', 'TRANSPORT', 50, '🚇'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '대중교통 마스터');

-- 3. 분리배출 뱃지
INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '분리배출 요정', '분리배출 5회 달성', 'RECYCLE', 5, '♻️'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '분리배출 요정');

INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '지구 방위대', '분리배출 20회 달성', 'RECYCLE', 20, '🌍'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '지구 방위대');

INSERT INTO badge (name, description, target_activity_type, target_count, image_url)
SELECT '환경부 장관', '분리배출 50회 달성', 'RECYCLE', 50, '👑'
WHERE NOT EXISTS (SELECT 1 FROM badge WHERE name = '환경부 장관');