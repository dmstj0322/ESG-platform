package com.esg.pointservice.domain;

import com.esg.common.BaseTimeEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Kafka 이벤트 중복 처리 방지. eventId(postId) 기준으로 처리 여부를 추적한다. */
@Entity
@Table(name = "processed_event")
@Getter
@NoArgsConstructor
public class ProcessedEvent extends BaseTimeEntity {

    @Id
    private Long eventId;

    public ProcessedEvent(Long eventId) {
        this.eventId = eventId;
    }
}
