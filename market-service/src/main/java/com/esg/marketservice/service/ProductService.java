package com.esg.marketservice.service;

import com.esg.infra.s3.S3Uploader;
import com.esg.marketservice.domain.Category;
import com.esg.marketservice.domain.Product;
import com.esg.marketservice.domain.ProductStatus;
import com.esg.marketservice.domain.Voucher;
import com.esg.marketservice.dto.ProductRequestDto;
import com.esg.marketservice.dto.ProductResponseDto;
import com.esg.marketservice.repository.OrderRepository;
import com.esg.marketservice.repository.ProductRepository;
import com.esg.marketservice.repository.VoucherRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductService {
  private final ProductRepository productRepository;
  private final OrderRepository orderRepository;
  private final VoucherRepository voucherRepository;
  private final S3Uploader s3Uploader;

  @Transactional
  public Long registerProduct(Long companyId, ProductRequestDto dto,
                              MultipartFile file, List<String> serialNumbers) throws IOException {
    String imageUrl = null;
    if (file != null && !file.isEmpty()) {
      imageUrl = s3Uploader.upload(file, "products");
    }

    int initialStock = 0;
    if (dto.category() == Category.DONATION) {
      initialStock = 999999; // 기부 상품은 재고 무제한 처리
    } else if (serialNumbers != null) {
      // 빈 줄을 제외한 실제 핀번호 개수만큼만 재고 산정
      initialStock = (int) serialNumbers.stream().filter(s -> !s.trim().isEmpty()).count();
    }

    Product product = Product.builder()
      .name(dto.name())
      .price(dto.price())
      .stock(initialStock)
      .category(dto.category())
      .companyId(companyId)
      .status(ProductStatus.ON_SALE)
      .content(dto.content())
      .voucherUrl(imageUrl)
      .build();

    Product savedProduct = productRepository.save(product);

    if (dto.category() == Category.GIFTICON && serialNumbers != null && !serialNumbers.isEmpty()) {
      List<Voucher> vouchers = serialNumbers.stream()
        .filter(serial -> !serial.trim().isEmpty())
        .map(serial -> Voucher.builder()
          .serialNumber(serial.trim())
          .productId(savedProduct.getId())
          .isUsed(false)
          .build())
        .toList();
      voucherRepository.saveAll(vouchers);
      log.info("기프티콘 등록 완료 - ID: {}, 핀번호 {}개 저장", savedProduct.getId(), vouchers.size());
    } else {
      log.info("기부 상품 등록 완료 - ID: {}, 초기 재고: {}", savedProduct.getId(), initialStock);
    }

    return savedProduct.getId();
  }

  @Transactional(readOnly = true)
  public Page<ProductResponseDto> getProducts(Long companyId, Pageable pageable) {
    if (companyId == 0L) {
      return productRepository.findByDeletedFalse(pageable).map(ProductResponseDto::new);
    }

    return productRepository.findByCompanyIdAndDeletedFalse(companyId, pageable)
      .map(ProductResponseDto::new);
  }

  @Transactional(readOnly = true)
  public ProductResponseDto getProductDetail(Long companyId, Long productId) {
    Product product = findActiveProduct(companyId, productId);

    return new ProductResponseDto(product);
  }

  @Transactional
  public void updateProduct(Long companyId, Long productId, ProductRequestDto dto, MultipartFile file) throws IOException {
    Product product = findActiveProduct(companyId, productId);

    String imageUrl = product.getVoucherUrl(); // 기본적으로 기존 URL 유지

    if (file != null && !file.isEmpty()) {
      imageUrl = s3Uploader.upload(file, "products");
      log.info("상품 이미지 변경 완료: {}", imageUrl);
    }

    product.update(dto.name(), dto.price(), dto.stock(), dto.category(), dto.content(), imageUrl);

    log.info("상품 상품 수정 완료 - ID: {}, Company: {}", productId, companyId);
  }

  @Transactional
  public void updateStatus(Long companyId, Long productId, ProductStatus newStatus) {
    Product product = findActiveProduct(companyId, productId);
    product.changeStatus(newStatus);
  }

  @Transactional
  public void deleteProduct(Long companyId, Long productId) {
    Product product = findActiveProduct(companyId, productId);

    if (orderRepository.existsByOrderItemsProductId(productId)) {
      throw new IllegalStateException("이미 주문 내역이 존재하는 상품은 삭제할 수 없습니다. 대신 품절 처리를 해주세요.");
    }
    product.delete();
    log.info("상품 논리 삭제 완료 - ID: {}, Company: {}", productId, companyId);
  }

  private Product findActiveProduct(Long companyId, Long productId) {
    Product product = productRepository.findByIdAndDeletedFalse(productId)
      .orElseThrow(() -> new IllegalArgumentException("상품을 찾을 수 없거나 이미 삭제되었습니다."));

    if (companyId != 0L && !product.getCompanyId().equals(companyId)) {
      throw new RuntimeException("해당 상품에 대한 권한이 없습니다.");
    }
    return product;
  }

  @Transactional
  public void addVouchers(Long productId, List<String> serialNumbers) {
    Product product = productRepository.findById(productId)
      .orElseThrow(() -> new IllegalArgumentException("상품을 찾을 수 없습니다."));

    List<Voucher> newVouchers = serialNumbers.stream()
      .map(serial -> Voucher.builder()
        .serialNumber(serial)
        .productId(productId)
        .isUsed(false)
        .build())
      .toList();

    voucherRepository.saveAll(newVouchers);

    product.addStock(newVouchers.size());
    log.info("상품 ID {} 에 핀번호 {}개 추가 완료", productId, newVouchers.size());
  }
}
