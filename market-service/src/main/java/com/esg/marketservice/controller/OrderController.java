package com.esg.marketservice.controller;

import com.esg.common.security.AuthUser;
import com.esg.marketservice.dto.OrderRequestDto;
import com.esg.marketservice.dto.OrderResponseDto;
import com.esg.marketservice.dto.OrderViewResponseDto;
import com.esg.marketservice.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/orders")
public class OrderController {
  private final OrderService orderService;

  @PostMapping
  public ResponseEntity<Long> placeOrder(@AuthenticationPrincipal AuthUser authUser,
                                         @RequestBody OrderRequestDto dto) {
    Long orderId = orderService.createOrder(
      authUser.memberId(),
      authUser.companyId(),
      dto.productId(),
      dto.count()
    );
    return ResponseEntity.ok(orderId);
  }

  @GetMapping("/my")
  public ResponseEntity<Page<OrderResponseDto>> getMyOrders(
    @AuthenticationPrincipal AuthUser authUser,
    @PageableDefault(size = 10) Pageable pageable) {
    return ResponseEntity.ok(orderService.getMyOrders(authUser.memberId(), pageable));
  }

  @PostMapping("/{orderId}/cancel")
  public ResponseEntity<Void> cancelMyOrder(
    @AuthenticationPrincipal AuthUser authUser,
    @PathVariable Long orderId) {

    orderService.cancelOrderByMember(authUser.memberId(), orderId);
    return ResponseEntity.ok().build();
  }

  @GetMapping("/{orderId}/view")
  public ResponseEntity<OrderViewResponseDto> getOrderDetailsForView(
    @AuthenticationPrincipal AuthUser authUser,
    @PathVariable Long orderId) {

    OrderViewResponseDto response = orderService.getOrderViewDetails(authUser.memberId(), orderId);
    return ResponseEntity.ok(response);
  }

  @PostMapping("/use-voucher")
  public ResponseEntity<String> useVoucher(@RequestBody String serialNumber) {
    String cleanSerial = serialNumber.replace("\"", "").trim();
    orderService.useVoucher(cleanSerial);
    return ResponseEntity.ok("정상적으로 사용 처리되었습니다.");
  }
}
