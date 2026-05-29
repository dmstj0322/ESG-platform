package com.esg.marketservice.repository;

import com.esg.marketservice.domain.DonationRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DonationRecordRepository extends JpaRepository<DonationRecord, Long> {
 Optional<DonationRecord> findByMemberIdAndProductId(Long memberId, Long productId);
}
