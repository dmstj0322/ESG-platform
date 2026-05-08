package com.esg.marketservice.repository;

import com.esg.marketservice.domain.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {
  Page<Product> findByDeletedFalse(Pageable pageable);
  Page<Product> findByCompanyIdAndDeletedFalse(Long companyId, Pageable pageable);
  Optional<Product> findByIdAndDeletedFalse(Long id);
}
