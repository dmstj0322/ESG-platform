package com.esg.marketservice.repository;

import com.esg.marketservice.domain.Category;
import com.esg.marketservice.domain.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {
  Page<Product> findByDeletedFalse(Pageable pageable);
  Page<Product> findByCompanyIdAndDeletedFalse(Long companyId, Pageable pageable);
  Optional<Product> findByIdAndDeletedFalse(Long id);

  @Query("SELECT p FROM Product p WHERE p.deleted = false " +
    "AND (:companyId = 0L OR p.companyId = :companyId) " +
    "AND (:category IS NULL OR p.category = :category) " +
    "AND (:name IS NULL OR p.name LIKE %:name%)")
  Page<Product> findProductsWithFilters(Long companyId, Category category, String name, Pageable pageable);
}
