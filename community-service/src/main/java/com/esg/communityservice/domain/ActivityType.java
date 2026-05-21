package com.esg.communityservice.domain;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public enum ActivityType {
  TUMBLER(
    // ✅ 긍정: 텀블러, 다회용기, 보온병을 의미하는 단어
    List.of("tumbler", "reusable", "mug", "thermos", "flask"),
    // 🚨 부정: 일회용품, 테이크아웃 컵, 빨대 (발견 시 즉시 0점)
    List.of("plastic_cup", "paper_cup", "disposable", "takeout", "straw", "water_bottle", "plastic_bottle"),
    "텀블러 및 다회용기 사용"
  ),

  TRANSPORT(
    // ✅ 긍정: 대중교통 및 자전거 관련 단어
    List.of("bus", "bus_stop", "train", "subway", "subway_station", "metro", "railway", "bicycle", "public_transport"),
    // 🚨 부정: 개인 승용차, 운전, 택시
    List.of("car", "driving", "traffic", "taxi", "motorcycle"),
    "대중교통 및 자전거 이용"
  ),

  RECYCLE(
    // ✅ 긍정: 분리수거함, 분리배출, 압착(구겨짐) 등 명확한 '행동/환경' 단어
    List.of("recycling", "recycling_bin", "sorting", "waste_container", "crushed", "trash", "bin"),
    // 🚨 부정: 음식물, 마시는 중인 액체, 카페 테이블 등 (단순 방치 방지)
    List.of("food", "drink", "liquid", "cafe", "restaurant"),
    "분리배출"
  ),

  FAIL(List.of(), List.of(), "인증 실패");

  private final List<String> keywords;
  private final List<String> rejectKeywords;
  private final String description;
}
