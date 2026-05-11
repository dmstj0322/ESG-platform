package com.esg.analysis.service.repository;

import com.esg.analysis.dto.CarbonEmissionStatDto;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

import java.util.List;
import com.esg.analysis.service.domain.CarbonEmission;
import static com.esg.analysis.service.domain.QCarbonEmission.carbonEmission;

@Repository("carbonEmissionRepositoryCustomImpl")
@RequiredArgsConstructor
public class CarbonEmissionRepositoryCustomImpl implements CarbonEmissionRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<CarbonEmissionStatDto> getMonthlyStats(Long companyId, int year) {
        String yearStr = String.valueOf(year);

        return queryFactory
                .select(Projections.constructor(CarbonEmissionStatDto.class,
                        // substring(4)를 사용하여 "202403"에서 "03" 부분을 안전하게 추출
                        carbonEmission.yearMonth.substring(4).castToNum(Integer.class),
                        carbonEmission.totalUsage,
                        carbonEmission.carbonAmount,
                        carbonEmission.energySource
                ))
                .from(carbonEmission)
                .where(
                        carbonEmission.companyId.eq(companyId),
                        // 연도로 시작하는 모든 데이터 검색
                        carbonEmission.yearMonth.startsWith(yearStr)
                )
                .fetch();
    }
}