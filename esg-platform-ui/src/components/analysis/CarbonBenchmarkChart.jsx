import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList,
} from 'recharts';
import { Statistic, Row, Col, Typography, Alert } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, WarningFilled } from '@ant-design/icons';

const { Text } = Typography;

const MY_ELEC_COLOR = '#1d4ed8'; // 토스블루 — 우리 기업
const DANGER_COLOR  = '#ef4444'; // 초과 시 경고 빨강

/**
 * 탄소 배출량 지역 벤치마크 차트
 * Props: data — RegionalBenchmarkDto (/api/analysis/benchmark/company/{id} 응답)
 */
const CarbonBenchmarkChart = ({ data }) => {
    if (!data?.monthlyData) return null;

    const {
        monthlyData,
        annualMyTotal,
        annualRegionAvgTotal,
        regionName,
        industryName,
    } = data;

    // 연간 분리 합계
    const annualMyElec = monthlyData.reduce((s, d) => s + (d.myElecEmissionTco2 ?? 0), 0);
    const annualMyGas  = monthlyData.reduce((s, d) => s + (d.myGasEmissionTco2  ?? 0), 0);
    const annualAvgElec = monthlyData.reduce((s, d) => s + (d.regionAvgElecTco2 ?? 0), 0);
    const annualAvgGas  = monthlyData.reduce((s, d) => s + (d.regionAvgGasTco2  ?? 0), 0);

    const computedIsBetter = annualMyTotal <= annualRegionAvgTotal;
    const computedPercent  = annualRegionAvgTotal > 0
        ? Math.abs((annualRegionAvgTotal - annualMyTotal) / annualRegionAvgTotal * 100)
        : 0;

    const summaryBg     = computedIsBetter
        ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
        : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)';
    const summaryBorder = computedIsBetter ? '#93c5fd' : '#fca5a5';
    const textColor     = computedIsBetter ? '#1e40af' : '#991b1b';
    const accentColor   = computedIsBetter ? '#1d4ed8' : DANGER_COLOR;

    return (
        <div>
            {/* ── 성과 요약 카드 ── */}
            <div style={{
                background: summaryBg,
                border: `1px solid ${summaryBorder}`,
                borderRadius: '16px',
                padding: '20px 28px',
                marginBottom: '20px',
            }}>
                <Text strong style={{ fontSize: '15px', color: textColor, display: 'block', marginBottom: '14px' }}>
                    {computedIsBetter
                        ? `✅ 우리 기업은 ${regionName} ${industryName} 업종 평균보다 ${computedPercent.toFixed(1)}% 적게 배출합니다.`
                        : `⚠️ 우리 기업은 ${regionName} ${industryName} 업종 평균보다 ${computedPercent.toFixed(1)}% 높습니다. 집중 관리가 필요합니다.`
                    }
                </Text>
                <Row gutter={40} wrap>
                    <Col>
                        <Statistic
                            title={<span style={{ color: textColor, fontSize: '12px' }}>우리 기업 연간</span>}
                            value={annualMyTotal} suffix="tCO₂eq" precision={1}
                            styles={{ content: { color: textColor, fontWeight: 700 } }}
                        />
                        <div style={{ marginTop: '4px', fontSize: '12px', color: textColor, opacity: 0.75 }}>
                            ⚡ {annualMyElec.toFixed(1)} t &nbsp;|&nbsp; 🔥 {annualMyGas.toFixed(1)} t
                        </div>
                    </Col>
                    <Col>
                        <Statistic
                            title={<span style={{ color: textColor, fontSize: '12px' }}>{regionName} 업종 평균</span>}
                            value={annualRegionAvgTotal} suffix="tCO₂eq" precision={1}
                            styles={{ content: { color: textColor, fontWeight: 700 } }}
                        />
                        <div style={{ marginTop: '4px', fontSize: '12px', color: textColor, opacity: 0.75 }}>
                            ⚡ {annualAvgElec.toFixed(1)} t &nbsp;|&nbsp; 🔥 {annualAvgGas.toFixed(1)} t
                        </div>
                    </Col>
                    <Col>
                        <Statistic
                            title={<span style={{ color: textColor, fontSize: '12px' }}>
                                {computedIsBetter ? '연간 절감률' : '연간 초과율'}
                            </span>}
                            value={computedPercent} suffix="%" precision={1}
                            prefix={computedIsBetter
                                ? <ArrowDownOutlined style={{ color: accentColor }} />
                                : <ArrowUpOutlined  style={{ color: accentColor }} />}
                            styles={{ content: { color: accentColor, fontWeight: 800, fontSize: '24px' } }}
                        />
                    </Col>
                </Row>
            </div>

            {/* ── 초과 시 경고 배너 ── */}
            {!computedIsBetter && (
                <Alert
                    type="error"
                    showIcon
                    icon={<WarningFilled />}
                    message={
                        <span style={{ fontWeight: 700 }}>
                            평균보다 {computedPercent.toFixed(1)}% 높습니다. 관리가 필요합니다.
                        </span>
                    }
                    description={`${regionName} ${industryName} 업종 동종기업 대비 연간 ${(annualMyTotal - annualRegionAvgTotal).toFixed(1)} tCO₂eq 초과 배출 중.
에너지 효율 개선 및 재생에너지 전환 계획 수립을 즉시 권고합니다.`}
                    style={{ marginBottom: '20px', borderRadius: '12px' }}
                />
            )}

            {/* ── 연간 배출량 가로 막대 비교 ── */}
            <div style={{ marginTop: '8px' }}>
                <Text strong style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '12px' }}>
                    연간 탄소 배출량 비교 (tCO₂eq)
                </Text>
                <ResponsiveContainer width="100%" height={110}>
                    <BarChart
                        data={[
                            { name: '우리 기업', value: annualMyTotal },
                            { name: `${regionName} 업종 평균`, value: annualRegionAvgTotal },
                        ]}
                        layout="vertical"
                        margin={{ top: 4, right: 72, left: 8, bottom: 4 }}
                    >
                        <XAxis type="number" hide />
                        <YAxis
                            type="category"
                            dataKey="name"
                            width={110}
                            tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            formatter={(v) => [`${v.toFixed(1)} tCO₂eq`, '연간 배출량']}
                            contentStyle={{ borderRadius: '10px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={32}>
                            <LabelList
                                dataKey="value"
                                position="right"
                                formatter={(v) => `${v.toFixed(1)} t`}
                                style={{ fontSize: 12, fill: '#374151', fontWeight: 700 }}
                            />
                            <Cell fill={computedIsBetter ? MY_ELEC_COLOR : DANGER_COLOR} />
                            <Cell fill="#94a3b8" />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                <Text type="secondary" style={{ fontSize: '11px', display: 'block', textAlign: 'right', marginTop: '6px' }}>
                    우리 기업(진파랑/빨강) vs {regionName} {industryName} 업종 평균(회색)
                </Text>
            </div>
        </div>
    );
};

export default CarbonBenchmarkChart;
