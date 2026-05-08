package com.esg.marketservice.repository;

import com.esg.marketservice.domain.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {
  boolean existsByOrderItemsProductId(Long productId);

  Page<Order> findByCompanyId(Long companyId, Pageable pageable);
  Page<Order> findByMemberId(Long memberId, Pageable pageable);
}
