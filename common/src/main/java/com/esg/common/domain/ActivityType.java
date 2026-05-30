package com.esg.common.domain;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public enum ActivityType {
  TUMBLER(
    // 🌟 Primary (결정적 키워드 - 가중치 높음): 텀블러 및 다회용기
    List.of("tumbler", "thermos", "reusable", "flask", "lunch_box", "tupperware", "container", "food_storage", "cylinder", "drinkware", "bottle", "water_bottle"),

    // ✅ Secondary (보조 키워드 - 가중치 보통)
    List.of("mug", "cup", "tableware", "vacuum_flask", "cookware", "bakeware", "bowl", "coffee_cup"),

    // 🚨 Reject (부정 키워드): 일회용품의 강력한 증거 (플라스틱 컵은 보통 straw나 disposable과 함께 잡힘)
    List.of("disposable", "straw", "drinking_straw", "paper_cup", "plastic_cup", "sleeve", "plastic_bottle"),

    "텀블러 및 다회용기 사용",
    300
  ),

  TRANSPORT(
    // 🌟 Primary: 명확한 대중교통/자전거 수단
    List.of("subway", "train", "bus", "bicycle", "metro"),

    // ✅ Secondary: 대중교통 관련 환경/부품
    List.of("public_transport", "railway", "transit", "commuter", "passenger", "station", "stop"),

    // 🚨 Reject: 개인 승용차 관련 강력한 증거
    List.of("car", "driving", "taxi", "motor_vehicle", "traffic_jam"),

    "대중교통 및 자전거 이용",
    1500
  ),

  RECYCLE(
    // 🌟 Primary: '분리배출'이라는 행위/장소를 증명하는 결정적 단어
    List.of("recycling", "recycling_bin", "waste_container", "waste_sorting", "trash_can", "bin", "garbage"),

    // ✅ Secondary: 분리배출되는 '재질' (단독으로는 점수가 낮지만 Primary와 결합하면 고득점)
    List.of("plastic", "plastic_bottle", "bottle", "box", "cardboard", "can", "glass_bottle", "paper", "packaging"),

    // 🚨 Reject: 내용물을 안 비운 쓰레기, 또는 길거리 무단투기
    List.of("food", "meal", "junk_food", "litter", "soft_drink", "beverage", "drinkware", "drinking_straw", "cup"),

    "분리배출",
    500
  ),

  FAIL(List.of(), List.of(), List.of(), "인증 실패", 0);

  private final List<String> primaryKeywords; // 발견 시 점수 1.5배 (결정타)
  private final List<String> keywords;        // 보조 키워드 (일반 점수)
  private final List<String> rejectKeywords;  // 발견 시 즉시 탈락
  private final String description;
  private final int co2ReductionGram;

//  TUMBLER(
//    // ✅ 긍정: 텀블러, 다회용기, 보온병을 의미하는 단어
//    List.of("tumbler", "reusable", "mug", "thermos", "flask", "water_bottle", "drinkware", "cup", "tableware", "food_storage"),
//    // 🚨 부정: 일회용품, 테이크아웃 컵, 빨대 (발견 시 즉시 0점)
//    List.of("plastic_cup", "paper_cup", "disposable", "takeout", "straw"),
//    "텀블러 및 다회용기 사용",
//    300
//  ),
//
//  TRANSPORT(
//    // ✅ 긍정: 대중교통 및 자전거 관련 단어
//    List.of("bus", "bus_stop", "train", "subway", "subway_station", "metro", "railway", "bicycle", "public_transport"),
//    // 🚨 부정: 개인 승용차, 운전, 택시
//    List.of("car", "driving", "traffic", "taxi", "motorcycle"),
//    "대중교통 및 자전거 이용",
//    1500
//  ),
//
//  RECYCLE(
//    // ✅ 긍정: 분리수거함, 분리배출 단어
//    List.of("recycling", "recycling_bin", "waste", "waste_container", "plastic_bag", "bin_bag", "cardboard"),
//    // 🚨 부정: 음식물, 마시는 중인 액체, 카페 테이블 등 (단순 방치 방지)
//    List.of("food", "drink", "liquid", "cafe", "restaurant"),
//    "분리배출",
//    500
//  ),
//
//  FAIL(List.of(), List.of(), "인증 실패", 0);
//
//  private final List<String> keywords;
//  private final List<String> rejectKeywords;
//  private final String description;
//  private final int co2ReductionGram;
}
