package com.esg.authservice.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Company {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false, unique = true)
  private String emailDomain;

  @Column(name = "region_code", length = 10)
  private String regionCode;

  @Column(name = "region_name", length = 50)
  private String regionName;

  @Column(name = "ksic_code", length = 10)
  private String ksicCode;

  @Column(name = "industry_name", length = 100)
  private String industryName;

  @Column(name = "employee_count")
  private Integer employeeCount;

  public void updateProfile(String regionCode, String regionName,
                            String ksicCode, String industryName,
                            Integer employeeCount) {
    this.regionCode    = regionCode;
    this.regionName    = regionName;
    this.ksicCode      = ksicCode;
    this.industryName  = industryName;
    this.employeeCount = employeeCount;
  }
}
