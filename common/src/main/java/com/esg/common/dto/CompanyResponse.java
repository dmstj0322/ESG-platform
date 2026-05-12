package com.esg.common.dto;

public record CompanyResponse(
  Long id,
  String name,
  String emailDomain,
  String regionCode,
  String regionName,
  String ksicCode,
  String industryName,
  Integer employeeCount
) {
}
