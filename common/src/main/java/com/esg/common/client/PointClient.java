package com.esg.common.client;

import com.esg.common.dto.PointRequest;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "point-service")
public interface PointClient {
  @PostMapping("/points/earn")
  void earnPoints(@RequestBody PointRequest pointRequest);

  @PostMapping("/points/use")
  void usePoints(@RequestBody PointRequest pointRequest);
}
