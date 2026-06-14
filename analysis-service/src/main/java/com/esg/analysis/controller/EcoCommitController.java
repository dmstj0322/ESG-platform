package com.esg.analysis.controller;

import com.esg.analysis.service.EcoCommitService;
import com.esg.common.security.AuthUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/eco")
@RequiredArgsConstructor
public class EcoCommitController {

    private final EcoCommitService ecoCommitService;

    /**
     * [GET] 성과 확정 전 예상 수치 미리보기
     * 프론트 위젯에서 호출: 반영 예정 에코 포인트 / 탄소 / 소나무 수 표시
     */
    @GetMapping("/preview")
    public ResponseEntity<Map<String, Object>> preview(@RequestHeader("X-Company-Id") Long companyId) {
        log.info("[EcoPreview] 기업 ID: {}", companyId);
        Map<String, Object> preview = ecoCommitService.getPreview(companyId);
        return ResponseEntity.ok(preview);
    }


}
