package com.esg.pointservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "company_esg_pool")
@Getter
@NoArgsConstructor
public class CompanyEsgPool extends BaseTimeEntity {

    @Id
    private Long companyId;

    private Long esgPoints;

    @Version
    private Long version;

    public CompanyEsgPool(Long companyId) {
        this.companyId = companyId;
        this.esgPoints = 0L;
    }

    public void add(Long amount) {
        this.esgPoints += amount;
    }

    /** 차감. 잔액보다 많으면 0으로 내림 (분석 재시도 안전 처리). */
    public void consume(Long amount) {
        this.esgPoints = Math.max(0L, this.esgPoints - amount);
    }
}
