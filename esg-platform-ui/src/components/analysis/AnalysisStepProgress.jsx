import React, { useEffect, useState } from 'react';
import { Steps } from 'antd';
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const STATUS_TO_STEP = {
    PREPROCESSING:      0,
    INDEXING_REPORT:    1,
    RETRIEVING_CONTEXT: 2,
    AI_ANALYZING:       3,
    MERGING_SCORE:      4,
    COMPLETE:           5,
    FAILED:             5,
};

const STEPS = [
    { title: '전처리',            description: 'PDF 파싱 · 사기 감지' },
    { title: '보고서 인덱싱',     description: '세션 벡터 DB 구축' },
    { title: '지표별 검색',       description: 'K-ESG 18개 지표 Targeted Retrieval' },
    { title: 'AI 심층 분석',      description: 'Selective Context RAG + Groq' },
    { title: '성과 집계',         description: '에코포인트 반영 · 등급 확정' },
    { title: '분석 완료',         description: '리포트 생성 완료' },
];

const AnalysisStepProgress = ({ wsStatus }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!wsStatus) return;
        setVisible(true);
        if (wsStatus === 'COMPLETE') {
            const timer = setTimeout(() => setVisible(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [wsStatus]);

    const currentStep = STATUS_TO_STEP[wsStatus] ?? -1;
    const isFailed    = wsStatus === 'FAILED';
    const isDone      = wsStatus === 'COMPLETE';

    if (!visible) return null;

    const stepsWithIcon = STEPS.map((step, i) => {
        let icon;
        if (isFailed && i === currentStep) {
            icon = <CloseCircleOutlined style={{ color: '#ef4444' }} />;
        } else if (i === currentStep && !isDone) {
            icon = <LoadingOutlined />;
        } else if (i < currentStep || isDone) {
            icon = <CheckCircleOutlined style={{ color: '#6366f1' }} />;
        }
        return { ...step, icon };
    });

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '24px 32px',
            marginBottom: '24px',
            transition: 'opacity 0.5s ease',
            opacity: isDone ? 0.5 : 1,
        }}>
            <Steps
                current={isDone ? STEPS.length : currentStep}
                status={isFailed ? 'error' : isDone ? 'finish' : 'process'}
                items={stepsWithIcon}
            />
        </div>
    );
};

export default AnalysisStepProgress;
