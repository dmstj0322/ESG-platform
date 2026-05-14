package com.esg.marketservice.service;

import com.esg.common.client.AuthClient;
import com.esg.common.client.PointClient;
import com.esg.common.dto.MemberResponse;
import com.esg.common.dto.PointRequest;
import com.esg.marketservice.domain.*;
import com.esg.marketservice.dto.OrderResponseDto;
import com.esg.marketservice.dto.OrderViewResponseDto;
import com.esg.marketservice.event.OrderCreatedEvent;
import com.esg.marketservice.kafka.OrderEventProducer;
import com.esg.marketservice.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {
  private final ProductRepository productRepository;
  private final OrderRepository orderRepository;
  private final VoucherRepository voucherRepository;
  private final DonationRecordRepository donationRecordRepository;
  private final RedissonClient redissonClient;
  private final PointClient pointClient;
  private final AuthClient authClient;
  private final OrderEventProducer orderEventProducer;

  @Value("${app.frontend.url}")
  private String frontendBaseUrl;

  @Transactional
  public Long createOrder(Long memberId, Long companyId, Long productId, int count) {
    String lockKey = "lock:product:" + productId;
    RLock lock = redissonClient.getLock(lockKey);

    try {
      if (!lock.tryLock(5, TimeUnit.SECONDS)) {
        log.info("락 획득 실패 - productId: {}", productId);
        throw new RuntimeException("현재 주문이 많아 잠시 후 다시 시도해주세요.");
      }
      log.info("락 획득 성공 - productId: {}", productId);

      // 재고 및 상태 검증
      Product product = productRepository.findById(productId)
        .orElseThrow(() -> new IllegalArgumentException("상품을 찾을 수 없습니다."));

      if (product.getStatus() != ProductStatus.ON_SALE) {
        throw new IllegalStateException("현재 판매 중인 상품이 아닙니다.");
      }

      MemberResponse employee = authClient.getMemberById(memberId);
      String adminEmail = authClient.getAdminEmailByCompanyId(companyId);

      // 포인트 서비스 연동 (포인트 차감 요청)
      Long totalAmount = product.getPrice() * count;
      pointClient.usePoints(new PointRequest(memberId, companyId, totalAmount, product.getName() + " 구매"));

      try {
        donateOrder(product, employee, totalAmount, count);

        // OrderItem 및 Order 생성 (내부에서 재고 차감 실행)
        OrderItem orderItem = OrderItem.createOrderItem(product, count);
        Order order = Order.createOrder(memberId, product.getCompanyId(), List.of(orderItem));

        Order savedOrder = orderRepository.save(order);
        log.info("주문 생성 완료 - orderId: {}", savedOrder.getId());

        if (product.getCategory() == Category.GIFTICON) {
          Voucher voucher = voucherRepository.findFirstByProductIdAndOrderIdIsNull(productId)
            .orElseThrow(() -> new RuntimeException("사용 가능한 바우처 재고가 없습니다."));

          voucher.assignToOrder(order.getId());
        }

        String detailLink = String.format("%s/my-page/%d", frontendBaseUrl, order.getId());

        orderEventProducer.sendOrderEvent(new OrderCreatedEvent(
          savedOrder.getId(),
          memberId,
          companyId,
          employee.email(),
          adminEmail,
          product.getName(),
          product.getVoucherUrl(),
          detailLink,
          savedOrder.getTotalPrice(),
          "AUTO_SEND_BY_ADMIN",
          product.getCategory()
        ));

        return savedOrder.getId();

      } catch (Exception e) {
        log.error("주문 생성 중 진짜 에러 발생: ", e);
        log.error("주문 저장 실패, 포인트 환불 진행 - memberId: {}, amount: {}", memberId, totalAmount);
        pointClient.earnPoints(new PointRequest(memberId, companyId, totalAmount, "주문 생성 실패로 인한 환불"));
        throw new RuntimeException("주문 처리 중 오류가 발생하여 결제가 취소되었습니다.");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new RuntimeException("시스템 오류가 발생했습니다.");
    } finally {
      // 락 해제
      if (lock.isHeldByCurrentThread()) {
        lock.unlock();
        log.info("락 해제 완료 - productId: {}", productId);
      }
    }
  }

  public void donateOrder(Product product, MemberResponse employee, Long totalAmount, int count) {
    if (product.getCategory() == Category.DONATION) {
      // [기부 전용 로직]
      DonationRecord record = DonationRecord.builder()
        .memberId(employee.memberId())
        .memberName(employee.name())
        .productId(product.getId())
        .productName(product.getName())
        .amount(totalAmount)
        .build();

      record.generateCertificateNo(); // 고유 증서 번호 생성
      donationRecordRepository.save(record);

      // 상품의 현재 모금액 합산 및 목표 달성 여부 체크 (Product 엔티티 내부 로직 실행)
      product.addDonation(totalAmount);

      log.info("기부 참여 기록 완료 - 유저: {}, 캠페인: {}, 금액: {}", employee.name(), product.getName(), totalAmount);
    } else {
      product.removeStock(count);
    }

  }

  @Transactional(readOnly = true)
  public Page<OrderResponseDto> getAllOrdersByCompany(Long companyId, Pageable pageable) {
    return orderRepository.findByCompanyId(companyId, pageable)
      .map(OrderResponseDto::new);
  }

  @Transactional(readOnly = true)
  public Page<OrderResponseDto> getMyOrders(Long memberId, Pageable pageable) {
    return orderRepository.findByMemberId(memberId, pageable)
      .map(OrderResponseDto::new);
  }

  @Transactional
  public void cancelOrder(Long companyId, Long orderId) {
    Order order = orderRepository.findById(orderId)
      .orElseThrow(() -> new IllegalArgumentException("주문 내역이 없습니다."));

    if (!order.getCompanyId().equals(companyId)) {
      throw new RuntimeException("해당 주문에 대한 권한이 없습니다.");
    }

    Product product = order.getOrderItems().get(0).getProduct();

    order.cancel(); // 상태 변경 및 재고 addStock 실행

    if (product.getCategory() == Category.GIFTICON) {
      voucherRepository.findByOrderId(orderId).ifPresent(Voucher::releaseOrder);
    }

    try {
      pointClient.earnPoints(new PointRequest(
        order.getMemberId(), order.getCompanyId(), order.getTotalPrice(),
        "관리자 주문 취소 환불: " + order.getId()
      ));

      MemberResponse employee = authClient.getMemberById(order.getMemberId());
      String adminEmail = authClient.getAdminEmailByCompanyId(order.getCompanyId());
      String detailLink = String.format("%s/my-page/%d", frontendBaseUrl, order.getId());

      orderEventProducer.sendOrderEvent(new OrderCreatedEvent(
        order.getId(),
        order.getMemberId(),
        order.getCompanyId(),
        employee.email(),
        adminEmail,
        product.getName(),
        product.getVoucherUrl(),
        detailLink,
        order.getTotalPrice(),
        "CANCELED_BY_ADMIN",
        product.getCategory()
      ));

      log.info("관리자 취소 및 포인트 환불 완료 - orderId: {}, amount: {}", orderId, order.getTotalPrice());
    } catch (Exception e) {
      log.error("포인트 환불 서비스 호출 실패 - orderId: {}", orderId);
      throw new RuntimeException("포인트 환불 처리 중 오류가 발생했습니다.");
    }
  }

  @Transactional
  public void cancelOrderByMember(Long memberId, Long orderId) {
    Order order = orderRepository.findById(orderId)
      .orElseThrow(() -> new IllegalArgumentException("주문 내역이 없습니다."));

    if (!order.getMemberId().equals(memberId)) {
      throw new RuntimeException("본인의 주문만 취소할 수 있습니다.");
    }

    if (order.getStatus() == OrderStatus.CANCELED) {
      throw new IllegalStateException("이미 취소된 주문입니다.");
    }

    Product product = order.getOrderItems().get(0).getProduct();

    if (product.getCategory() == Category.DONATION) {
      throw new IllegalStateException("기부 캠페인 참여 내역은 취소할 수 없습니다. 고객센터에 문의해주세요.");

    } else if (product.getCategory() == Category.GIFTICON) {
      if (order.getCreatedDate().plusDays(7).isBefore(LocalDateTime.now())) {
        throw new IllegalStateException("구매 후 7일이 지나 직접 취소가 불가능합니다. 고객센터에 문의해주세요.");
      }

      Voucher voucher = voucherRepository.findByOrderId(orderId).orElse(null);
      if (voucher != null) {
        if (voucher.isUsed()) {
          throw new IllegalStateException("이미 매장에서 사용 완료된 기프티콘은 취소할 수 없습니다.");
        }
        voucher.releaseOrder();
      }
    }

    order.cancel();

    pointClient.earnPoints(new PointRequest(
      order.getMemberId(), order.getCompanyId(), order.getTotalPrice(),
      "회원 직접 취소 환불: " + order.getId()
    ));

    try {
      MemberResponse employee = authClient.getMemberById(memberId);
      String adminEmail = authClient.getAdminEmailByCompanyId(order.getCompanyId());
      String detailLink = String.format("%s/my-page/%d", frontendBaseUrl, order.getId());

      orderEventProducer.sendOrderEvent(new OrderCreatedEvent(
        order.getId(),
        order.getMemberId(),
        order.getCompanyId(),
        employee.email(),
        adminEmail,
        product.getName(),
        product.getVoucherUrl(),
        detailLink,
        order.getTotalPrice(),
        "CANCELED_BY_MEMBER",
        product.getCategory()
      ));

      log.info("취소 알림 이벤트 발행 완료 - orderId: {}", orderId);
    } catch (Exception e) {
      log.error("취소 알림 이벤트 발행 중 오류 발생 - orderId: {}", orderId, e);
    }

    log.info("회원 직접 취소 완료 - memberId: {}, orderId: {}", memberId, orderId);
  }

  public void resendVoucherEvent(Long orderId) {
    Order order = orderRepository.findById(orderId)
      .orElseThrow(() -> new IllegalArgumentException("주문 내역 없음"));

    Product product = order.getOrderItems().get(0).getProduct();

    MemberResponse employee = authClient.getMemberById(order.getMemberId());
    String adminEmail = authClient.getAdminEmailByCompanyId(order.getCompanyId());

    String detailLink = String.format("%s/my-page/%d", frontendBaseUrl, order.getId());

    orderEventProducer.sendOrderEvent(new OrderCreatedEvent(
      order.getId(),
      order.getMemberId(),
      order.getCompanyId(),
      employee.email(),
      adminEmail,
      product.getName(),
      product.getVoucherUrl(),
      detailLink,
      order.getTotalPrice(),
      "AUTO_SEND_BY_ADMIN",
      product.getCategory()
    ));
  }

  @Transactional(readOnly = true)
  public OrderViewResponseDto getOrderViewDetails(Long memberId, Long orderId) {
    Order order = orderRepository.findById(orderId)
      .orElseThrow(() -> new RuntimeException("주문 내역을 찾을 수 없습니다."));

    if (!order.getMemberId().equals(memberId)) {
      throw new RuntimeException("해당 주문에 접근 권한이 없습니다.");
    }

    Product product = order.getOrderItems().get(0).getProduct();

    String serialNumber = "N/A";
    String certificateNumber = "N/A";

    if (product.getCategory() == Category.GIFTICON) {
      serialNumber = voucherRepository.findByOrderId(orderId).map(Voucher::getSerialNumber).orElse("N/A");
    } else if (product.getCategory() == Category.DONATION) {
      certificateNumber = donationRecordRepository.findByMemberIdAndProductId(memberId, product.getId())
        .map(DonationRecord::getCertificateNo).orElse(null);
    }

    return OrderViewResponseDto.builder()
      .productName(product.getName())
      .voucherUrl(product.getVoucherUrl())
      .serialNumber(serialNumber) // 실제 로직에선 쿠폰 번호 매핑
      .certificateNumber(certificateNumber)
      .category(product.getCategory().name())
      .totalPrice(order.getTotalPrice())
      .orderDate(order.getCreatedDate().toString())
      .build();
  }

  @Transactional
  public void useVoucher(String serialNumber) {
    Voucher voucher = voucherRepository.findBySerialNumber(serialNumber)
      .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 바코드입니다."));

    if (voucher.getOrderId() == null) {
      throw new IllegalStateException("판매되지 않은 바우처는 사용할 수 없습니다.");
    }

    if (voucher.isUsed()) {
      throw new IllegalStateException("이미 사용 완료된 바우처입니다.");
    }

    voucher.markAsUsed();
    log.info("바우처 사용 완료 처리 - Serial: {}", serialNumber);
  }
}
