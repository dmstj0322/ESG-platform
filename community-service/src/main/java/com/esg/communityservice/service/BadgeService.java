package com.esg.communityservice.service;

import com.esg.common.domain.ActivityType;
import com.esg.communityservice.domain.AdminStatus;
import com.esg.communityservice.domain.Badge;
import com.esg.communityservice.domain.MemberBadge;
import com.esg.communityservice.dto.BadgeDashboardDto;
import com.esg.communityservice.kafka.NotificationProducer;
import com.esg.communityservice.repository.BadgeRepository;
import com.esg.communityservice.repository.MemberBadgeRepository;
import com.esg.communityservice.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class BadgeService {
  private final BadgeRepository badgeRepository;
  private final MemberBadgeRepository memberBadgeRepository;
  private final PostRepository postRepository;
  private final NotificationProducer notificationProducer;

  @Transactional
  public void checkAndUnlockBadge(Long memberId, ActivityType activityType) {
    log.info("뱃지 지급 체크 시작: Member={}, Type={}", memberId, activityType);
    long successCount = postRepository.countByMemberIdAndActivityTypeAndAdminStatus(
      memberId, activityType, AdminStatus.APPROVED
    );

    List<Badge> targetBadges = badgeRepository.findByTargetActivityType(activityType);

    for (Badge badge : targetBadges) {
      if (successCount >= badge.getTargetCount() &&
      !memberBadgeRepository.existsByMemberIdAndBadgeId(memberId, badge.getId())) {

        MemberBadge newBadge = new MemberBadge(memberId, badge);
        memberBadgeRepository.save(newBadge);

        String message = String.format("🏆 축하합니다! [%s] 뱃지를 획득하셨습니다!", badge.getName());
        notificationProducer.send(memberId, message, "BADGE_EARNED", badge.getId());
        log.info("🏆 유저 {} 뱃지 신규 획득: {}", memberId, badge.getName());
      }
    }
  }

  @Transactional(readOnly = true)
  public BadgeDashboardDto getBadgeDashboard(Long memberId) {
    // 1. 유저가 획득한 뱃지 내역 조회 후 DTO 변환
    List<BadgeDashboardDto.BadgeDto> earnedBadges = memberBadgeRepository.findByMemberId(memberId).stream()
      .map(mb -> new BadgeDashboardDto.BadgeDto(
        mb.getBadge().getId(),
        mb.getBadge().getName(),
        mb.getBadge().getDescription(),
        mb.getBadge().getImageUrl()
      )).toList();

    // 2. 활동 유형별 최종 APPROVED(인증 성공)된 게시글 총 개수 연산 (FAIL 제외)
    Map<String, Long> activityCounts = new HashMap<>();
    for (ActivityType type : ActivityType.values()) {
      if (type == ActivityType.FAIL) continue;

      long count = postRepository.countByMemberIdAndActivityTypeAndAdminStatus(
        memberId, type, AdminStatus.APPROVED
      );
      activityCounts.put(type.name(), count);
    }

    Long representativeBadgeId = memberBadgeRepository.findByMemberIdAndIsRepresentativeTrue(memberId)
      .map(mb -> mb.getBadge().getId())
      .orElse(null);

    return new BadgeDashboardDto(activityCounts, earnedBadges, representativeBadgeId);
  }

  @Transactional
  public void setRepresentativeBadge(Long memberId, Long badgeId) {
    // 1. 기존 대표 뱃지가 있다면 해제
    memberBadgeRepository.findByMemberIdAndIsRepresentativeTrue(memberId)
      .ifPresent(MemberBadge::unsetRepresentative);

    // 2. 새로 선택한 뱃지를 대표로 설정
    MemberBadge targetBadge = memberBadgeRepository.findByMemberIdAndBadgeId(memberId, badgeId)
      .orElseThrow(() -> new IllegalArgumentException("보유하지 않은 뱃지입니다."));

    targetBadge.setRepresentative();
  }
}
