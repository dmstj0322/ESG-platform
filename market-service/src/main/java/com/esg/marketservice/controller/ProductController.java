package com.esg.marketservice.controller;

import com.esg.marketservice.dto.ProductResponseDto;
import com.esg.marketservice.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/products")
public class ProductController {
  private final ProductService productService;

  @GetMapping
  public ResponseEntity<Page<ProductResponseDto>> getMarketProducts(@RequestHeader("X-Company-Id") Long companyId,
                                                                    @RequestParam(value = "category", required = false, defaultValue = "ALL") String category,
                                                                    @RequestParam(value = "name", required = false) String name,
                                                                    @PageableDefault(size = 10) Pageable pageable) {
    return ResponseEntity.ok(productService.getProducts(companyId, category, name, pageable));
  }

  @GetMapping("/{productId}")
  public ResponseEntity<ProductResponseDto> getProductDetail(
    @RequestHeader("X-Company-Id") Long companyId,
    @PathVariable Long productId) {
    return ResponseEntity.ok(productService.getProductDetail(companyId, productId));
  }
}
