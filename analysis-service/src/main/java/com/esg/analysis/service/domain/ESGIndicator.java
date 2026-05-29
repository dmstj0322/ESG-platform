package com.esg.analysis.service.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "esg_indicators")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ESGIndicator {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 1)
    private String category; // E, S, G

    @Column(nullable = false, unique = true, length = 10)
    private String code; // E-101, S-201, G-301 ...

    @Column(nullable = false)
    private String title; // 전력 사용량

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false)
    private double weight; // 카테고리 내 상대 가중치 (0.0~1.0)

    @Column(columnDefinition = "TEXT")
    private String keywords; // RAG 검색용 키워드 (공백 구분)
}
