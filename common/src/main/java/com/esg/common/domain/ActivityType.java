package com.esg.common.domain;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public enum ActivityType {
  TUMBLER(
    // 🌟 Primary: 명확한 다회용기/텀블러
    List.of("tumbler", "thermos", "reusable", "flask", "lunch_box", "tupperware", "vacuum_flask"),

    // ✅ Secondary: 포괄적인 용기
    List.of("mug", "cup", "tableware", "cookware", "bakeware", "bowl", "coffee_cup", "bottle", "water_bottle", "container", "drinkware", "cylinder", "food_storage"),

    // 🚨 Reject: 일회용품, 테이크아웃 컵의 강력한 증거
    List.of("disposable", "straw", "drinking_straw", "paper_cup", "plastic_cup", "sleeve", "cup_sleeve", "plastic_bottle", "takeout", "fast_food"),

    "텀블러 및 다회용기 사용",
    300
  ),

  TRANSPORT(
    // 🌟 Primary: 명확한 대중교통/자전거 수단
    List.of("subway", "train", "bus", "bicycle", "metro"),

    // ✅ Secondary: 대중교통 관련 환경/부품
    List.of("public_transport", "railway", "transit", "commuter", "passenger", "station", "stop", "commercial_vehicle"),

    // 🚨 Reject: 개인 승용차/오토바이/택시 철저히 차단
    List.of("car", "taxi", "cab", "motorcycle", "scooter", "moped", "personal_luxury_car", "luxury_vehicle", "traffic_jam"),

    "대중교통 및 자전거 이용",
    1500
  ),

  RECYCLE(
    // 🌟 Primary: '분리배출/재활용'을 명확히 지칭하는 단어
    List.of("recycling", "recycling_bin", "waste_sorting"),

    // ✅ Secondary: 쓰레기통 자체나 재활용되는 재질들
    List.of("waste_container", "trash_can", "bin", "garbage", "plastic_bottle", "bottle", "box", "cardboard", "can", "glass_bottle", "paper", "packaging"),

    // 🚨 Reject: 안 씻은 용기, 음식물, 길거리 무단투기
    List.of("food", "meal", "junk_food", "litter", "soft_drink", "beverage", "bottled_water", "drinking_straw"),

    "분리배출",
    500
  ),
//  TUMBLER(
//    // 🌟 Primary (결정적 키워드 - 가중치 높음): 텀블러 및 다회용기
//    List.of("tumbler", "thermos", "reusable", "flask", "lunch_box", "tupperware", "container", "food_storage", "cylinder", "drinkware", "bottle", "water_bottle"),
//
//    // ✅ Secondary (보조 키워드 - 가중치 보통)
//    List.of("mug", "cup", "tableware", "vacuum_flask", "cookware", "bakeware", "bowl", "coffee_cup"),
//
//    // 🚨 Reject (부정 키워드): 일회용품의 강력한 증거 (플라스틱 컵은 보통 straw나 disposable과 함께 잡힘)
//    List.of("disposable", "straw", "drinking_straw", "paper_cup", "plastic_cup", "sleeve", "plastic_bottle"),
//
//    "텀블러 및 다회용기 사용",
//    300
//  ),
//
//  TRANSPORT(
//    // 🌟 Primary: 명확한 대중교통/자전거 수단
//    List.of("subway", "train", "bus", "bicycle", "metro"),
//
//    // ✅ Secondary: 대중교통 관련 환경/부품
//    List.of("public_transport", "railway", "transit", "commuter", "passenger", "station", "stop", "commercial_vehicle"),
//
//    // 🚨 Reject: 개인 승용차 관련 강력한 증거
//    List.of("car", "driving", "taxi", "motorcycle", "traffic_jam", "luxury_car", "scooter"),
//
//    "대중교통 및 자전거 이용",
//    1500
//  ),
//
//  RECYCLE(
//    // 🌟 Primary: '분리배출'이라는 행위/장소를 증명하는 결정적 단어
//    List.of("recycling", "recycling_bin", "waste_container", "waste_sorting", "trash_can", "bin", "garbage"),
//
//    // ✅ Secondary: 분리배출되는 '재질' (단독으로는 점수가 낮지만 Primary와 결합하면 고득점)
//    List.of("plastic", "plastic_bottle", "bottle", "box", "cardboard", "can", "glass_bottle", "paper", "packaging"),
//
//    // 🚨 Reject: 내용물을 안 비운 쓰레기, 또는 길거리 무단투기
//    List.of("food", "meal", "junk_food", "litter", "soft_drink", "beverage", "drinkware", "drinking_straw", "cup"),
//
//    "분리배출",
//    500
//  ),

  FAIL(List.of(), List.of(), List.of(), "인증 실패", 0);

  private final List<String> primaryKeywords; // 발견 시 점수 1.5배 (결정타)
  private final List<String> keywords;        // 보조 키워드 (일반 점수)
  private final List<String> rejectKeywords;  // 발견 시 즉시 탈락
  private final String description;
  private final int co2ReductionGram;
}
