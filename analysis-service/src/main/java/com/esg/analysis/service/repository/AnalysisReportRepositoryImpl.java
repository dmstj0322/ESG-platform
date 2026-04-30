package com.esg.analysis.service.repository;

import com.esg.analysis.dto.GradeStatDto;
import com.esg.analysis.service.domain.AnalysisReport;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

// Q클래스 경로는 본인의 프로젝트 구조에 맞게 수정하세요 (예: com.esg.analysis.domain.QAnalysisReport)
import static com.esg.analysis.service.domain.QAnalysisReport.analysisReport;

@RequiredArgsConstructor
public class AnalysisReportRepositoryImpl implements AnalysisReportRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    /**
     * 1. 기본적인 카운트 쿼리
     */
    @Override
    public long countByCompanyAndStatus(Long companyId, String status) {
        return queryFactory
                .select(analysisReport.count())
                .from(analysisReport)
                .where(
                        analysisReport.companyId.eq(companyId),
                        statusEq(status)
                )
                .fetchOne();
    }

    /**
     * 2. [신규 추가] 등급별 분포 통계 조회
     */
    @Override
    public List<GradeStatDto> getGradeDistribution(Long companyId) {
        return queryFactory
                .select(Projections.constructor(GradeStatDto.class,
                        analysisReport.grade,
                        analysisReport.count()
                ))
                .from(analysisReport)
                .where(analysisReport.companyId.eq(companyId))
                .groupBy(analysisReport.grade)
                .orderBy(analysisReport.grade.asc())
                .fetch();
    }

    /**
     * 3. 다중 조건 검색 (회사ID + 상태 + 등급 + 날짜범위)
     */
    @Override
    public List<AnalysisReport> findReportsByComplexCondition(
            Long companyId, String status, String grade, LocalDateTime startDate, LocalDateTime endDate) {

        return queryFactory
                .selectFrom(analysisReport)
                .where(
                        analysisReport.companyId.eq(companyId),
                        statusEq(status),
                        gradeEq(grade),
                        betweenDate(startDate, endDate)
                )
                .orderBy(analysisReport.createdDate.desc())
                .fetch();
    }

    @Override
    public List<AnalysisReport> findTopReportsByGrade(String grade, int limit) {
        return queryFactory
                .selectFrom(analysisReport)
                .where(gradeEq(grade))
                .orderBy(analysisReport.createdDate.desc())
                .limit(limit)
                .fetch();
    }

    // --- [동적 쿼리 도우미 메서드] ---
    private BooleanExpression statusEq(String status) {
        return StringUtils.hasText(status) ? analysisReport.status.eq(status) : null;
    }

    private BooleanExpression gradeEq(String grade) {
        return StringUtils.hasText(grade) ? analysisReport.grade.eq(grade) : null;
    }

    private BooleanExpression betweenDate(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) return null;
        return analysisReport.createdDate.between(start, end);
    }
}