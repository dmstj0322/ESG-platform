package com.esg.marketservice.controller;

import com.esg.marketservice.domain.ProductStatus;
import com.esg.marketservice.dto.ProductRequestDto;
import com.esg.marketservice.dto.ProductResponseDto;
import com.esg.marketservice.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/admin/products")
public class ProductAdminController {
  private final ProductService productService;

  @PreAuthorize("hasRole('ADMIN')")
  @PostMapping(consumes = {MediaType.APPLICATION_JSON_VALUE, MediaType.MULTIPART_FORM_DATA_VALUE})
  public ResponseEntity<Long> registerProduct(@RequestHeader("X-Company-Id") Long companyId,
                                              @RequestPart("dto") ProductRequestDto dto,
                                              @RequestPart(value = "file", required = false) MultipartFile file,
                                              @RequestParam(value = "vouchers", required = false) List<String> vouchers) throws IOException {
    Long productId = productService.registerProduct(companyId, dto, file, vouchers);
    return ResponseEntity.ok(productId);
  }

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping
  public ResponseEntity<Page<ProductResponseDto>> getProducts(@RequestHeader("X-Company-Id") Long companyId,
                                                              @RequestParam(value = "category", required = false, defaultValue = "ALL") String category,
                                                              @RequestParam(value = "name", required = false) String name,
                                                              @PageableDefault(size = 10) Pageable pageable) {
    return ResponseEntity.ok(productService.getProducts(companyId, category, name, pageable));
  }

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping("/{productId}")
  public ResponseEntity<ProductResponseDto> getProductDetail(
    @RequestHeader("X-Company-Id") Long companyId,
    @PathVariable Long productId) {
    return ResponseEntity.ok(productService.getProductDetail(companyId, productId));
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PutMapping(value = "/{productId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<Void> updateProduct(
    @RequestHeader("X-Company-Id") Long companyId,
    @PathVariable Long productId,
    @RequestPart("dto") ProductRequestDto dto,
    @RequestPart(value = "file", required = false) MultipartFile file) throws IOException {
    productService.updateProduct(companyId, productId, dto, file);
    return ResponseEntity.ok().build();
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PatchMapping("/{productId}/status")
  public ResponseEntity<Void> updateProductStatus(
    @RequestHeader("X-Company-Id") Long companyId,
    @PathVariable Long productId,
    @RequestBody ProductStatus status) {
    productService.updateStatus(companyId, productId, status);
    return ResponseEntity.ok().build();
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PatchMapping("/{productId}/hidden")
  public ResponseEntity<Void> updateProductHidden(
    @RequestHeader("X-Company-Id") Long companyId,
    @PathVariable Long productId,
    @RequestBody boolean hidden) {
    productService.updateHiddenStatus(companyId, productId, hidden);
    return ResponseEntity.ok().build();
  }

  @PreAuthorize("hasRole('ADMIN')")
  @DeleteMapping("/{productId}")
  public ResponseEntity<Void> deleteProduct(
    @RequestHeader("X-Company-Id") Long companyId,
    @PathVariable Long productId) {
    productService.deleteProduct(companyId, productId);
    return ResponseEntity.noContent().build();
  }

  @PreAuthorize("hasRole('ADMIN')")
  @PostMapping("/{productId}/vouchers")
  public ResponseEntity<Void> addVouchers(
    @PathVariable Long productId,
    @RequestBody List<String> vouchers) {
    productService.addVouchers(productId, vouchers);
    return ResponseEntity.ok().build();
  }

  @PreAuthorize("hasRole('ADMIN')")
  @GetMapping("/{productId}/vouchers")
  public ResponseEntity<List<String>> getUnusedVouchers(
    @RequestHeader("X-Company-Id") Long companyId,
    @PathVariable Long productId) {
    return ResponseEntity.ok(productService.getUnusedVouchers(companyId, productId));
  }
}