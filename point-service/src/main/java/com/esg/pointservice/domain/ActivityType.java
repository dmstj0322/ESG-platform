package com.esg.pointservice.domain;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.List;

@Getter
@AllArgsConstructor
public enum ActivityType {
  TUMBLER(List.of("tumbler", "cup", "drinkware", "mug"), "텀블러 사용"),
  TRANSPORT(List.of("bus", "train", "subway", "metro", "bicycle"), "대중교통 이용"),
  RECYCLE(List.of("plastic", "waste", "container", "recycling", "bottle"), "분리배출");

  private final List<String> keywords;
  private final String description;
}
