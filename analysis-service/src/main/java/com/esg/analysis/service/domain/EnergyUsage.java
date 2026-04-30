package com.esg.analysis.service.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EnergyUsage extends BaseTimeEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private Long companyId;

  private Double usageValue;    // 사용량 (ex: 500.0)

  private Double carbonValue;   // 탄소 배출량 (ex: 0.23) -> 쿼리에서 사용됨!

  private String sourceType;    // 에너지원 (ex: ELECTRICITY, GAS) -> 쿼리에서 사용됨!

  private LocalDate usageDate;  // 사용 날짜 -> 쿼리에서 사용됨!

  private String unit;          // 단위 (kWh, MJ 등)
}
