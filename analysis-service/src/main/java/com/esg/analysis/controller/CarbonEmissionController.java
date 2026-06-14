package com.esg.analysis.controller;

import com.esg.analysis.dto.CarbonEmissionStatDto;
import com.esg.analysis.service.ExternalDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;


@RestController
@RequestMapping("/carbon")
@RequiredArgsConstructor

public class CarbonEmissionController {

  private final ExternalDataService externalDataService;


  @GetMapping("/stats")
  public ResponseEntity<List<CarbonEmissionStatDto>> getMonthlyStats(
          @RequestHeader("X-Company-Id") Long companyId,
          @RequestParam int year) {
    List<CarbonEmissionStatDto> stats = externalDataService.getIntegratedMonthlyStats(companyId, year);
    return ResponseEntity.ok(stats);
  }

}

