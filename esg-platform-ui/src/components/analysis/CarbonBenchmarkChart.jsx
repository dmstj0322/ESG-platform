import React from 'react';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, Cell, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Statistic, Row, Col, Typography, Alert } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, WarningFilled } from '@ant-design/icons';

const { Text } = Typography;

// 색상 팔레트 (Toss/금융권 스타일 — 화이트/그레이/토스블루만 사용)
const MY_ELEC_COLOR  = '#1d4ed8'; // 토스블루 — 우리 기업 전기
const MY_GAS_COLOR   = '#f97316'; // 주황      — 우리 기업 가스
const AVG_ELEC_COLOR = '#93c5fd'; // 연파랑    — 지역 평균 전기
const AVG_GAS_COLOR  = '#fed7aa'; // 연주황    — 지역 평균 가스
const DANGER_COLOR   = '#ef4444'; // 초과 시 경고 빨강
const AVG_LINE_COLOR = '#dc2626'; // 지역 평균 합계 기준선 색상

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    const get = (key) => payload.find(p => p.dataKey === key)?.value ?? 0;

    const myElec  = get('myElecEmissionTco2');
    const myGas   = get('myGasEmissionTco2');
    const avgElec = get('regionAvgElecTco2');
    const avgGas  = get('regionAvgGasTco2');
    const myTotal  = myElec + myGas;
    const avgTotal = avgElec + avgGas;
    const diffPct  = avgTotal > 0 ? ((avgTotal - myTotal) / avgTotal * 100).toFixed(1) : null;
    const isBetter = parseFloat(diffPct) >= 0;

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '14px 18px',
            fontSize: '13px',
            minWidth: '210px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
            <p style={{ fontWeight: 700, marginBottom: '8px', color: '#1e293b' }}>{label}</p>

            <p style={{ color: '#475569', fontWeight: 600, marginBottom: '4px' }}>우리 기업</p>
            <p style={{ color: MY_ELEC_COLOR }}>⚡ 전기: {myElec.toFixed(1)} tCO₂eq</p>
            <p style={{ color: MY_GAS_COLOR  }}>🔥 가스: {myGas.toFixed(1)} tCO₂eq</p>
            <p style={{ color: '#1e293b', fontWeight: 700 }}>합계: {myTotal.toFixed(1)} tCO₂eq</p>

            <hr style={{ margin: '8px 0', borderColor: '#f1f5f9' }} />

            <p style={{ color: '#475569', fontWeight: 600, marginBottom: '4px' }}>지역 업종 평균</p>
            <p style={{ color: AVG_ELEC_COLOR }}>⚡ 전기: {avgElec.toFixed(1)} tCO₂eq</p>
            <p style={{ color: AVG_GAS_COLOR  }}>🔥 가스: {avgGas.toFixed(1)} tCO₂eq</p>
            <p style={{ color: '#475569', fontWeight: 600 }}>합계: {avgTotal.toFixed(1)} tCO₂eq</p>

            {diffPct !== null && (
                <p style={{ color: isBetter ? '#059669' : DANGER_COLOR, fontWeight: 700, marginTop: '8px' }}>
                    {isBetter
                        ? `▼ ${diffPct}% 절감 — 관리 우수`
                        : `▲ ${Math.abs(diffPct)}% 초과 — 관리 필요`}
                </p>
            )}
        </div>
    );
};

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
    const annualMyElec  = monthlyData.reduce((s, d) => s + (d.myElecEmissionTco2 ?? 0), 0);
    const annualMyGas   = monthlyData.reduce((s, d) => s + (d.myGasEmissionTco2  ?? 0), 0);
    const annualAvgElec = monthlyData.reduce((s, d) => s + (d.regionAvgElecTco2  ?? 0), 0);
    const annualAvgGas  = monthlyData.reduce((s, d) => s + (d.regionAvgGasTco2   ?? 0), 0);

    const computedIsBetter = annualMyTotal <= annualRegionAvgTotal;
    const computedPercent  = annualRegionAvgTotal > 0
        ? Math.abs((annualRegionAvgTotal - annualMyTotal) / annualRegionAvgTotal * 100)
        : 0;

    // 지역 월평균 기준선 (연간 평균을 12개월로 나눔 — ReferenceLine 에 사용)
    const monthlyAvgReference = annualRegionAvgTotal > 0
        ? parseFloat((annualRegionAvgTotal / 12).toFixed(1))
        : null;

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

            {/* ── 월별 ComposedChart (막대 + 지역 평균 기준선) ── */}
            <ResponsiveContainer width="100%" height={520}>
                <ComposedChart
                    data={monthlyData}
                    margin={{ top: 12, right: 20, left: 0, bottom: 4 }}
                    barGap={6}
                    barCategoryGap="28%"
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis
                        unit=" t"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        width={62}
                        tickFormatter={(v) => v.toFixed(0)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        formatter={(value) => ({
                            myElecEmissionTco2:       '우리 기업 — 전기',
                            myGasEmissionTco2:        '우리 기업 — 가스',
                            regionAvgElecTco2:        `${regionName} 평균 — 전기`,
                            regionAvgGasTco2:         `${regionName} 평균 — 가스`,
                            regionAvgEmissionTco2:    `${regionName} 월평균 합계 (기준선)`,
                        }[value] ?? value)}
                    />

                    {/* 지역 업종 평균 합계 기준선 — 핵심 시각화 */}
                    {monthlyAvgReference != null && (
                        <ReferenceLine
                            y={monthlyAvgReference}
                            stroke={AVG_LINE_COLOR}
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            label={{
                                value: `지역 월평균 ${monthlyAvgReference} t`,
                                position: 'insideTopRight',
                                fill: AVG_LINE_COLOR,
                                fontSize: 11,
                                fontWeight: 700,
                            }}
                        />
                    )}

                    {/* 우리 기업 스택 */}
                    <Bar dataKey="myElecEmissionTco2" name="myElecEmissionTco2"
                         stackId="my" fill={MY_ELEC_COLOR} maxBarSize={32}
                         radius={[0, 0, 0, 0]} />
                    <Bar dataKey="myGasEmissionTco2" name="myGasEmissionTco2"
                         stackId="my" fill={MY_GAS_COLOR} maxBarSize={32}
                         radius={[3, 3, 0, 0]}>
                        {monthlyData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.betterThanAverage ? MY_GAS_COLOR : DANGER_COLOR} />
                        ))}
                    </Bar>

                    {/* 지역 평균 스택 */}
                    <Bar dataKey="regionAvgElecTco2" name="regionAvgElecTco2"
                         stackId="avg" fill={AVG_ELEC_COLOR} maxBarSize={32}
                         radius={[0, 0, 0, 0]} />
                    <Bar dataKey="regionAvgGasTco2" name="regionAvgGasTco2"
                         stackId="avg" fill={AVG_GAS_COLOR} maxBarSize={32}
                         radius={[3, 3, 0, 0]} />

                    {/* 지역 평균 합계 꺾은선 — 월별 추세 명시 */}
                    <Line
                        type="monotone"
                        dataKey="regionAvgEmissionTco2"
                        name="regionAvgEmissionTco2"
                        stroke={AVG_LINE_COLOR}
                        strokeWidth={2}
                        dot={{ r: 3, fill: AVG_LINE_COLOR }}
                        strokeDasharray="5 3"
                    />
                </ComposedChart>
            </ResponsiveContainer>

            {/* 월별 초과 현황 세부 표 */}
            {monthlyData.some(m => !m.betterThanAverage) && (
                <div style={{ marginTop: '16px' }}>
                    <Text type="secondary" style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                        ⚠️ 평균 초과 월 상세
                    </Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {monthlyData.filter(m => !m.betterThanAverage).map(m => (
                            <div key={m.month} style={{
                                background: '#fef2f2',
                                border: '1px solid #fca5a5',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                color: '#991b1b',
                            }}>
                                <strong>{m.monthLabel}</strong>
                                &nbsp;평균보다 {Math.abs(m.reductionPercent).toFixed(1)}% 높음
                                &nbsp;({m.myEmissionTco2.toFixed(1)} t vs {m.regionAvgEmissionTco2.toFixed(1)} t)
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Text type="secondary" style={{ fontSize: '11px', display: 'block', textAlign: 'right', marginTop: '10px' }}>
                ⚡ 전기(진파랑/연파랑) | 🔥 가스(주황/연주황) | 빨강 막대 = 지역 평균 초과 월 |
                점선 = 지역 업종 월평균 기준선
            </Text>
        </div>
    );
};

export default CarbonBenchmarkChart;
