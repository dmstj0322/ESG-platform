package com.esg.marketservice.controller;

import com.esg.marketservice.domain.Category;
import com.esg.marketservice.domain.OrderStatus;
import com.esg.marketservice.dto.OrderResponseDto;
import com.esg.marketservice.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/admin/orders")
public class OrderAdminController {
  private final OrderService orderService;

  @GetMapping
  public ResponseEntity<Page<OrderResponseDto>> getAdminOrders(
    @RequestHeader("X-Company-Id") Long companyId,
    @RequestParam(required = false) OrderStatus status,
    @RequestParam(required = false) Category category,
    @PageableDefault(size = 10) Pageable pageable) {
    return ResponseEntity.ok(orderService.getAllOrdersByCompany(companyId, status, category, pageable));
  }

  @PostMapping("/{orderId}/cancel")
  public ResponseEntity<Void> cancelOrder(
    @RequestHeader("X-Company-Id") Long companyId,
    @PathVariable Long orderId) {
    orderService.cancelOrder(companyId, orderId);
    return ResponseEntity.ok().build();
  }

  @PostMapping("/{orderId}/resend")
  public ResponseEntity<Void> resendEmail(@PathVariable Long orderId) {
    orderService.resendVoucherEvent(orderId);
    return ResponseEntity.ok().build();
  }
}
