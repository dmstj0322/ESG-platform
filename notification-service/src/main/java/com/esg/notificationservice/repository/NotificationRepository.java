package com.esg.notificationservice.repository;

import com.esg.notificationservice.domain.Notification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
  boolean existsByMemberIdAndIsReadFalse(Long memberId);
  Page<Notification> findByMemberIdOrderByCreatedDateDesc(Long memberId, Pageable pageable);

  long countByMemberIdAndIsReadFalse(Long memberId);

  @Modifying(clearAutomatically = true)
  @Query("UPDATE Notification n SET n.isRead = true WHERE n.memberId = :memberId AND n.isRead = false")
  void markAllAsReadByMemberId(@Param("memberId") Long memberId);

  @Query("SELECT n FROM Notification n WHERE n.memberId = :memberId " +
    "AND (:keyword IS NULL OR n.message LIKE %:keyword%) " +
    "ORDER BY n.createdDate DESC")
  Page<Notification> findByMemberIdAndFilter(
    @Param("memberId") Long memberId,
    @Param("keyword") String keyword,
    Pageable pageable
  );
}
