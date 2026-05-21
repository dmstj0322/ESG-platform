package com.esg.marketservice.repository;

import com.esg.marketservice.domain.Category;
import com.esg.marketservice.domain.Order;
import com.esg.marketservice.domain.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface OrderRepository extends JpaRepository<Order, Long> {
  boolean existsByOrderItemsProductId(Long productId);

  Page<Order> findByCompanyId(Long companyId, Pageable pageable);
  Page<Order> findByMemberId(Long memberId, Pageable pageable);

  @Query("SELECT DISTINCT o FROM Order o JOIN o.orderItems oi JOIN oi.product p " +
    "WHERE (:companyId = 0L OR o.companyId = :companyId) " +
    "AND (:status IS NULL OR o.status = :status) " +
    "AND (:category IS NULL OR p.category = :category)")
  Page<Order> findOrdersWithFilters(Long companyId, OrderStatus status, Category category, Pageable pageable);
}
