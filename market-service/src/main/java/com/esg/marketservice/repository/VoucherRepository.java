package com.esg.marketservice.repository;

import com.esg.marketservice.domain.Voucher;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface VoucherRepository extends JpaRepository<Voucher, Long> {
  Optional<Voucher> findByOrderId(Long orderId);

  Optional<Voucher> findFirstByProductIdAndOrderIdIsNull(Long productId);
}
