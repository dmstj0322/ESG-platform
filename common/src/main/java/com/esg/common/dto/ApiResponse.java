package com.esg.common.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class ApiResponse<T> {
  private String status;
  private String message;
  private T data;

  public static <T> ApiResponse<T> success(T data) {
    return new ApiResponse<>("SUCCESS", "요청에 성공했습니다.", data);
  }
}
