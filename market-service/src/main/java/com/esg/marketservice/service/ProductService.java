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
                              MultipartFile file, List<String> vouchers) throws IOException {
    String imageUrl = (file != null && !file.isEmpty()) ? s3Uploader.upload(file, "products") : dto.voucherUrl();

    Product product = Product.builder()
      .name(dto.name())
      .price(dto.price())
      .stock(dto.stock() != null ? dto.stock() : 0)
      .category(dto.category())
      .companyId(companyId)
      .content(dto.content())
      .voucherUrl(imageUrl)
      .targetAmount(dto.category() == Category.DONATION ? dto.targetAmount() : null)
      .currentAmount(0L)
      .status(ProductStatus.ON_SALE)
      .build();

    Product savedProduct = productRepository.save(product);

    if (dto.category() == Category.GIFTICON && vouchers != null && !vouchers.isEmpty()) {
      addVouchers(savedProduct.getId(), vouchers);
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
      .filter(s -> !s.trim().isEmpty())
      .map(serial -> Voucher.builder()
        .serialNumber(serial)
        .productId(productId)
        .isUsed(false)
        .build())
      .toList();

    voucherRepository.saveAll(newVouchers);

    if (product.getCategory() == Category.GIFTICON) {
      product.addStock(newVouchers.size());
    }
    log.info("상품 ID {} 에 핀번호 {}개 추가 완료", productId, newVouchers.size());
  }

  @Transactional(readOnly = true)
  public List<String> getUnusedVouchers(Long companyId, Long productId) {
    // 1. 권한 검증 및 상품 확인
    findActiveProduct(companyId, productId);

    // 2. orderId가 null인(아직 안 팔린) 바우처들만 찾아서 핀번호 추출
    return voucherRepository.findByProductIdAndOrderIdIsNull(productId)
      .stream()
      .map(Voucher::getSerialNumber)
      .toList();
  }
}
