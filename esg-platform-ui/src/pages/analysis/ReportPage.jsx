import React, { useRef, useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import { Empty, Spin, message } from 'antd';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  Download, ArrowLeft, Shield, Leaf, Users, BarChart3,
  AlertTriangle, TrendingUp, FileText, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAnalysis } from '../../context/AnalysisContext';
import EvidenceTable from '../../components/analysis/EvidenceTable';
import { exportESGReport } from '../../components/analysis/exportESGReport';

// ── Toss 디자인 토큰 ──────────────────────────────────────────────
const C = {
  blue:    '#3182F6',
  blueL:   '#EBF3FF',
  blueM:   '#1B6AC9',
  green:   '#00C073',
  greenL:  '#E8FBF1',
  greenD:  '#007A4D',
  amber:   '#FF9F0A',
  amberL:  '#FFF3E0',
  amberD:  '#B36B00',
  red:     '#FF3B30',
  redL:    '#FFF0EF',
  redD:    '#C0392B',
  purple:  '#6B47ED',
  purpleL: '#F0ECFF',
  white:   '#FFFFFF',
  bg:      '#F2F4F6',
  gray50:  '#F9FAFB',
  gray100: '#F2F3F5',
  gray200: '#E5E8EB',
  gray300: '#D1D6DB',
  gray500: '#8B95A1',
  gray700: '#4E5968',
  gray900: '#191F28',
  navy:    '#1B2B4B',
};

const SHADOW_CARD  = '0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)';
const SHADOW_HOVER = '0 4px 20px rgba(0,0,0,0.10)';

const gradeColor = (g) => {
  if (g === 'S') return C.purple;
  if (g === 'A') return C.green;
  if (g === 'B') return C.blue;
  if (g === 'C') return C.amber;
  return C.red;
};

const catIcon = (cat) => {
  if (cat === 'Environment') return <Leaf   size={16} color={C.green}  />;
  if (cat === 'Social')      return <Users  size={16} color={C.blue}   />;
  return                            <Shield size={16} color={C.amber}  />;
};
const catLabel = (cat) =>
  cat === 'Environment' ? '환경 (E)' : cat === 'Social' ? '사회 (S)' : '지배구조 (G)';
const catColor = (cat) =>
  cat === 'Environment' ? C.green : cat === 'Social' ? C.blue : C.amber;

const getCachedReport = () => {
  try {
    const cached = JSON.parse(localStorage.getItem('esg_report_cache') || 'null');
    return cached?.sections?.length ? cached : null;
  } catch { return null; }
};

// ── 4단 불렛 파서 ─────────────────────────────────────────────────
const FOUR_BULLET_DEFS = [
  { key: '현황', label: '현황',      icon: '📊', color: C.blue,   bg: C.blueL  },
  { key: '준수', label: '준수 여부', icon: '✅', color: C.green,  bg: C.greenL },
  { key: '성과', label: '성과',      icon: '🏆', color: C.amber,  bg: C.amberL },
  { key: '제언', label: '개선 제언', icon: '💡', color: C.purple, bg: C.purpleL },
];

const parseFourBullets = (text) => {
  if (!text) return null;
  const plain = typeof text === 'string'
    ? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const markerRe = /\[(현황[^\]]*|(?:가이드라인\s*)?준수\s*여부|성과\s*평가|성과|개선\s*제언|개선)\]/g;
  const parts = plain.split(markerRe);
  if (parts.length < 4) return null;
  const result = { 현황: '', 준수: '', 성과: '', 제언: '' };
  for (let i = 1; i < parts.length; i += 2) {
    const marker  = parts[i] || '';
    const content = (parts[i + 1] || '').trim();
    if (marker.includes('현황'))                         result.현황 = content;
    else if (marker.includes('준수'))                    result.준수 = content;
    else if (marker.includes('성과'))                    result.성과 = content;
    else if (marker.includes('제언') || marker.includes('개선')) result.제언 = content;
  }
  return Object.values(result).some(v => v.length > 5) ? result : null;
};

// ── 4단 불렛 뷰 ──────────────────────────────────────────────────
const FourBulletDisplay = ({ text, htmlContent }) => {
  const bullets = parseFourBullets(text || htmlContent?.replace(/<[^>]+>/g, ' ') || '');
  if (!bullets) {
    return (
      <div
        style={{ lineHeight: '1.85', color: C.gray700, fontSize: '14px' }}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent || text || '') }}
      />
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {FOUR_BULLET_DEFS.map(def => {
        const content = bullets[def.key];
        if (!content) return null;
        return (
          <div key={def.key} style={{
            background: def.bg,
            borderRadius: '12px',
            padding: '14px 16px',
            borderLeft: `3px solid ${def.color}`,
          }}>
            <div style={{
              fontWeight: 700, fontSize: '12px', color: def.color,
              marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              <span>{def.icon}</span> {def.label}
            </div>
            <div style={{ fontSize: '13px', color: C.gray700, lineHeight: '1.65' }}>
              {content}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── 세부 코멘트 셀 (전체 내용 표시, 잘림 없음) ──────────────────
const SubCommentCell = ({ comment }) => {
  if (!comment) return null;
  const bullets = parseFourBullets(comment);
  if (bullets) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {FOUR_BULLET_DEFS.filter(d => bullets[d.key]).map(d => (
          <div key={d.key} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
            <span style={{
              flexShrink: 0, marginTop: '1px',
              fontSize: '11px', fontWeight: 700, color: d.color,
              background: `${d.color}14`,
              padding: '2px 8px', borderRadius: '5px', whiteSpace: 'nowrap',
            }}>
              {d.icon} {d.label}
            </span>
            <span style={{ fontSize: '13px', color: '#475569', lineHeight: '1.7' }}>
              {bullets[d.key]}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.75' }}>
      {comment.replace(/<[^>]+>/g, ' ').trim()}
    </div>
  );
};

// ── 신뢰도 배지 ──────────────────────────────────────────────────
const ConfidenceBadge = ({ score }) => {
  const v = score ?? 0;
  const { color, label } =
    v >= 80 ? { color: C.green,  label: '높음' } :
    v >= 60 ? { color: C.amber,  label: '보통' } :
    v >= 40 ? { color: '#f97316', label: '약함' } :
              { color: C.red,    label: '낮음' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{v}%</span>
      <span style={{
        background: `${color}18`, color,
        padding: '1px 7px', borderRadius: '99px', fontSize: '10px', fontWeight: 600,
      }}>{label}</span>
    </div>
  );
};

// ── 점수 게이지 바 ────────────────────────────────────────────────
const ScoreBar = ({ score, color }) => (
  <div style={{
    height: '5px', background: C.gray200, borderRadius: '99px',
    overflow: 'hidden', width: '100%', marginTop: '6px',
  }}>
    <div style={{
      height: '100%', width: `${Math.max(0, Math.min(100, score))}%`,
      background: color, borderRadius: '99px',
      transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
    }} />
  </div>
);

// ── 총평 헤더 카드 ────────────────────────────────────────────────
const OverallHeader = ({ report, profileName }) => {
  const grade = report.finalGrade;
  const color = gradeColor(grade);
  const displayName = report.companyName || profileName;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.navy} 0%, #1e4d8c 100%)`,
      borderRadius: '20px', padding: '36px 44px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexWrap: 'wrap', gap: '36px',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#93c5fd', fontSize: '12px', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em' }}>
          K-ESG 종합 진단 결과서 · 산업통상자원부 가이드라인 (2021)
        </div>
        <h2 style={{ color: C.white, fontSize: '26px', fontWeight: 900, margin: '0 0 18px', lineHeight: 1.3 }}>
          {displayName ? `${displayName} ESG 성과 분석 리포트` : 'ESG 성과 분석 리포트'}
        </h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {report.sections.map(s => (
            <div key={s.category} style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px', padding: '10px 16px', color: C.white,
            }}>
              <div style={{ fontSize: '11px', color: '#93c5fd', marginBottom: '3px' }}>
                {catLabel(s.category)}
              </div>
              <div style={{ fontWeight: 800, fontSize: '18px', fontVariantNumeric: 'tabular-nums' }}>
                {s.score}점
                <span style={{ marginLeft: '6px', fontSize: '13px', color: gradeColor(s.grade) }}>
                  ({s.grade})
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{
        width: '128px', height: '128px', borderRadius: '50%',
        background: `radial-gradient(circle, ${color}44 0%, ${color}22 100%)`,
        border: `3px solid ${color}`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, boxShadow: `0 0 28px ${color}44`,
      }}>
        <div style={{ fontSize: '52px', fontWeight: 900, color: C.white, lineHeight: 1 }}>{grade}</div>
        <div style={{ fontSize: '11px', color: '#93c5fd', marginTop: '5px', fontWeight: 600 }}>종합 등급</div>
      </div>
    </div>
  );
};

// ── 마크다운 볼드 → HTML 변환 ─────────────────────────────────────
const markdownToHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#1d4ed8;font-weight:800">$1</strong>')
    .replace(/\n\n/g, '</p><p style="margin:13px 0 0">')
    .replace(/\n/g, '<br/>');
};

// ── 종합 소견 — 리디자인 ──────────────────────────────────────────
const OverallOpinionSection = ({ fullReport, overallOpinion }) => {
  // overallOpinion 우선 사용. 없으면 fullReport에서 종합 소견 섹션만 추출.
  const getOpinionHtml = () => {
    if (overallOpinion) {
      return markdownToHtml(overallOpinion);
    }
    if (fullReport) {
      const plain = fullReport.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const match = plain.match(/종합 소견[^\[]{0,30}([\s\S]*?)(?:지표별 정밀 진단|Risk|$)/i);
      return (match ? match[1].trim() : plain.slice(0, 700)).replace(/\n/g, '<br/>');
    }
    return '';
  };

  const opinionHtml = getOpinionHtml();
  if (!opinionHtml) return null;

  return (
    <div style={{
      background: C.white,
      borderRadius: '20px',
      border: `1px solid ${C.gray200}`,
      boxShadow: '0 2px 20px rgba(49,130,246,0.07), 0 1px 4px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      {/* 상단 그라데이션 액센트 바 */}
      <div style={{
        height: '3px',
        background: 'linear-gradient(90deg, #3182F6 0%, #6B47ED 50%, #00C073 100%)',
      }} />

      {/* 헤더 */}
      <div style={{
        padding: '22px 32px 18px',
        background: 'linear-gradient(135deg, #f5f8ff 0%, #ffffff 75%)',
        borderBottom: `1px solid ${C.gray100}`,
        display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '11px', flexShrink: 0,
          background: 'linear-gradient(135deg, #3182F6 0%, #6B47ED 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(49,130,246,0.28)',
        }}>
          <FileText size={17} color="#ffffff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '17px', color: '#0f172a', lineHeight: 1.25 }}>
            전문가 종합 소견
          </div>
          <div style={{ fontSize: '11.5px', color: C.gray500, marginTop: '3px' }}>
            K-ESG 가이드라인(산업통상자원부, 2021) 기준 · AI 정밀 분석
          </div>
        </div>
        <span style={{
          flexShrink: 0,
          background: '#EBF3FF', color: '#1B6AC9',
          fontSize: '11px', padding: '5px 13px',
          borderRadius: '99px', fontWeight: 700, letterSpacing: '0.02em',
        }}>
          ESG 컨설턴트 총평
        </span>
      </div>

      {/* 본문 */}
      <div style={{ padding: '28px 32px 30px', position: 'relative', overflow: 'hidden' }}>
        {/* 장식용 따옴표 */}
        <div style={{
          position: 'absolute', top: '2px', right: '26px',
          fontSize: '130px', color: '#eef4ff',
          fontFamily: 'Georgia, "Times New Roman", serif',
          lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
          fontWeight: 900, zIndex: 0,
        }}>
          &#8220;
        </div>
        <div
          style={{
            position: 'relative', zIndex: 1,
            lineHeight: '1.95',
            color: '#334155',
            fontSize: '14.5px',
            letterSpacing: '0.01em',
          }}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(`<p style="margin:0">${opinionHtml}</p>`),
          }}
        />
      </div>
    </div>
  );
};

// ── 세부 지표 카드 — Toss 스타일 ────────────────────────────────
const SubIndicatorCard = ({ sub, color }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: C.white,
      borderRadius: '14px',
      border: `1px solid ${C.gray200}`,
      overflow: 'hidden',
      transition: 'box-shadow 0.18s ease',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = SHADOW_HOVER)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* 지표 요약 행 — 항상 표시 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '14px 18px', cursor: 'pointer',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* K-ESG 코드 */}
        <span style={{
          background: `${color}15`, color,
          padding: '3px 9px', borderRadius: '7px',
          fontSize: '11px', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {sub.kesgCode || '—'}
        </span>

        {/* 지표명 */}
        <span style={{
          fontWeight: 600, fontSize: '13px', color: C.gray900,
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sub.title}
        </span>

        {/* 점수 */}
        <span style={{
          fontWeight: 800, fontSize: '16px', color,
          flexShrink: 0, fontVariantNumeric: 'tabular-nums',
        }}>
          {sub.score}점
        </span>

        {/* 등급 배지 */}
        <span style={{
          background: gradeColor(sub.grade),
          color: C.white, padding: '3px 10px',
          borderRadius: '99px', fontSize: '12px', fontWeight: 800, flexShrink: 0,
        }}>
          {sub.grade}
        </span>

        {/* 신뢰도 */}
        <ConfidenceBadge score={sub.confidenceScore} />

        {/* 펼치기 아이콘 */}
        <div style={{ color: C.gray300, flexShrink: 0, marginLeft: '4px' }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* 점수 바 */}
      <div style={{ padding: '0 18px 2px' }}>
        <ScoreBar score={sub.score} color={color} />
      </div>

      {/* 상세 내용 — 펼치면 표시 */}
      {expanded && (
        <div style={{
          padding: '14px 18px 16px',
          borderTop: `1px solid ${C.gray100}`,
          background: C.gray50,
        }}>
          <SubCommentCell comment={sub.comment} />

          {sub.evidenceText && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              background: C.white,
              border: `1px solid ${C.gray200}`,
              borderLeft: `3px solid ${color}`,
              borderRadius: '0 8px 8px 0',
              fontSize: '12px', color: C.gray500, fontStyle: 'italic',
            }}>
              📄 &ldquo;{sub.evidenceText}&rdquo;
              {sub.pageNumber > 0 && (
                <span style={{
                  marginLeft: '6px', fontStyle: 'normal',
                  background: C.blueL, color: C.blue,
                  padding: '1px 7px', borderRadius: '5px',
                  fontSize: '11px', fontWeight: 700,
                }}>
                  p.{sub.pageNumber}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── 부문별 카드 — Toss 스타일 ─────────────────────────────────────
const SectionCard = ({ section }) => {
  const color = catColor(section.category);
  const grade = section.grade;

  const diagnosisLabel =
    section.score >= 90 ? '최우수 관리' :
    section.score >= 70 ? '양호' :
    section.score >= 50 ? '보완 필요' :
    '미흡';

  const diagnosisColor =
    section.score >= 90 ? C.green :
    section.score >= 70 ? C.blue  :
    section.score >= 50 ? C.amber :
    C.red;

  return (
    <div style={{
      background: C.white,
      borderRadius: '20px',
      border: `1px solid ${C.gray200}`,
      boxShadow: SHADOW_CARD,
      overflow: 'hidden',
    }}>
      {/* 상단 컬러 바 */}
      <div style={{ height: '4px', background: color }} />

      {/* 카드 헤더 */}
      <div style={{
        padding: '22px 26px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: `${color}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {catIcon(section.category)}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: C.gray900 }}>
              {catLabel(section.category)}
            </div>
            <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                background: `${diagnosisColor}15`, color: diagnosisColor,
                fontSize: '11px', fontWeight: 700,
                padding: '2px 8px', borderRadius: '6px',
              }}>
                {diagnosisLabel}
              </span>
            </div>
          </div>
        </div>

        {/* 점수 + 등급 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: '34px', fontWeight: 900, color, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {section.score}
              <span style={{ fontSize: '14px', fontWeight: 500, color: C.gray500, marginLeft: '2px' }}>점</span>
            </div>
            <div style={{ fontSize: '11px', color: C.gray300, marginTop: '2px' }}>100점 만점</div>
          </div>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: gradeColor(grade),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.white, fontSize: '20px', fontWeight: 900,
            boxShadow: `0 4px 12px ${gradeColor(grade)}44`,
          }}>
            {grade}
          </div>
        </div>
      </div>

      {/* 점수 게이지 */}
      <div style={{ padding: '0 26px 16px' }}>
        <ScoreBar score={section.score} color={color} />
      </div>

      {/* 카테고리 코멘트 */}
      {section.comment && (
        <div style={{
          padding: '18px 26px',
          background: C.gray50,
          borderTop: `1px solid ${C.gray100}`,
          borderBottom: `1px solid ${C.gray100}`,
        }}>
          <FourBulletDisplay text={section.comment} />
          {(section.category === 'Environment' || section.category === 'Social') &&
            section.ecoBonus > 0 && (
            <div style={{
              marginTop: '12px', padding: '8px 14px',
              background: C.greenL, borderRadius: '8px',
              borderLeft: `3px solid ${C.green}`,
              fontSize: '12px', color: C.greenD, fontWeight: 600,
            }}>
              🌿 임직원 에코 포인트 성과로 이 점수에{' '}
              <strong>+{section.ecoBonus}점</strong>이 가산되었습니다.
            </div>
          )}
        </div>
      )}

      {/* 세부 지표 */}
      {section.subIndicators?.length > 0 && (
        <div style={{ padding: '20px 26px 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: '12px',
          }}>
            <BarChart3 size={14} color={color} />
            <span style={{ fontWeight: 700, fontSize: '13px', color: C.gray700 }}>
              세부 지표별 정밀 진단
            </span>
            <span style={{
              background: C.gray100, color: C.gray500,
              fontSize: '11px', padding: '1px 7px', borderRadius: '99px', fontWeight: 600,
            }}>
              {section.subIndicators.length}개 지표
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {section.subIndicators.map((sub, i) => (
              <SubIndicatorCard key={i} sub={sub} color={color} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Risk & Opportunity ────────────────────────────────────────────
const RiskOpportunitySection = ({ riskOpportunity }) => {
  if (!riskOpportunity) return null;
  return (
    <div style={{
      background: C.white,
      borderRadius: '20px',
      border: `1px solid ${C.gray200}`,
      boxShadow: SHADOW_CARD,
      overflow: 'hidden',
    }}>
      <div style={{ height: '4px', background: C.red }} />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <div style={{
            width: '4px', height: '20px', background: C.red, borderRadius: '2px',
          }} />
          <span style={{ fontWeight: 800, fontSize: '16px', color: C.gray900 }}>
            Risk &amp; Opportunity 분석
          </span>
        </div>
        <div
          style={{ lineHeight: '1.85', color: C.gray700, fontSize: '14px' }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(riskOpportunity.replace(/\n/g, '<br/>')) }}
        />
      </div>
    </div>
  );
};

// ── 에코 포인트 성과 ──────────────────────────────────────────────
const EcoPointSection = ({ report, isSettled }) => {
  if (!report.ecoPoints) return null;
  return (
    <div style={{
      background: C.white,
      borderRadius: '20px',
      border: `1px solid ${C.gray200}`,
      boxShadow: SHADOW_CARD,
      overflow: 'hidden',
    }}>
      <div style={{ height: '4px', background: C.green }} />
      <div style={{
        padding: '24px 28px',
        background: `linear-gradient(135deg, ${C.greenL} 0%, #d1fae5 100%)`,
        position: 'relative',
      }}>
        {isSettled && (
          <div style={{
            position: 'absolute', top: '16px', right: '20px',
            background: C.green, color: C.white,
            fontSize: '11px', fontWeight: 700, padding: '4px 12px',
            borderRadius: '99px',
          }}>
            ✓ 이번 분기 성과 확정
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Leaf size={16} color={C.greenD} />
          <span style={{ fontWeight: 800, fontSize: '15px', color: C.greenD }}>
            임직원 에코 포인트 성과 반영 내역
          </span>
        </div>
        <div style={{ display: 'flex', gap: '36px', flexWrap: 'wrap' }}>
          {[
            { label: '에코 포인트', value: `${Number(report.ecoPoints).toLocaleString()} EP` },
            { label: '탄소 절감량', value: `${report.carbonReductionKg} kg CO₂eq` },
            { label: '소나무 식재 효과', value: `${report.equivalentTrees} 그루` },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '12px', color: C.greenD, opacity: 0.7, marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: C.greenD, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── PDF 내보내기 ──────────────────────────────────────────────────
const exportHtml2Canvas = async (elementId, fileName) => {
  const el = document.getElementById(elementId);
  if (!el) return;
  const prevOverflow = el.style.overflow;
  el.style.overflow = 'visible';

  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(imgs.map(img =>
    img.complete ? Promise.resolve()
    : new Promise(r => { img.onload = r; img.onerror = r; })
  ));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = await html2canvas(el, {
    scale: 2, useCORS: true, allowTaint: true,
    backgroundColor: '#ffffff', logging: false,
    ignoreElements: node => node.hasAttribute?.('data-html2canvas-ignore'),
  });
  el.style.overflow = prevOverflow;

  const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = pdf.internal.pageSize.getWidth();
  const pageH  = pdf.internal.pageSize.getHeight();
  const pxPerMm   = canvas.width / pageW;
  const pxPerPage = Math.floor(pageH * pxPerMm);

  let srcY = 0;
  while (srcY < canvas.height) {
    if (srcY > 0) pdf.addPage();
    const srcH = Math.min(pxPerPage, canvas.height - srcY);
    if (srcH <= 0) break;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = srcH;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, pageW, srcH / pxPerMm);
    srcY += pxPerPage;
  }
  pdf.save(fileName);
};

// ── 메인 리포트 페이지 ────────────────────────────────────────────
export default function ReportPage() {
  const navigate = useNavigate();
  const { latestReport, companyId, companyProfileName, ecoPreview, benchmarkData, carbonStats, fetchLatestData } = useAnalysis();

  const [pageLoading, setPageLoading] = useState(false);
  const [exporting, setExporting]     = useState(false);
  const [pdfLoading, setPdfLoading]   = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setPageLoading(true);
    const safetyTimer = setTimeout(() => setPageLoading(false), 2000);
    fetchLatestData(companyId).finally(() => {
      clearTimeout(safetyTimer);
      setPageLoading(false);
    });
    return () => clearTimeout(safetyTimer);
  }, [companyId, fetchLatestData]);

  const handleHtml2CanvasPdf = async () => {
    setExporting(true);
    try {
      const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '');
      const name = latestReport?.companyName || companyProfileName || `기업${companyId}`;
      await exportHtml2Canvas('report-content', `${name}_ESG종합진단_${dateStr}.pdf`);
    } catch (e) { console.error('PDF 생성 오류:', e); }
    finally { setExporting(false); }
  };

  const handleProfessionalPdf = async () => {
    const report = latestReport || getCachedReport();
    if (!report) {
      message.error('리포트 데이터가 없습니다. 먼저 분석을 실행해 주세요.');
      return;
    }
    setPdfLoading(true);
    try {
      await exportESGReport(
        report, companyId, {},
        {
          name: report.companyName || companyProfileName
            || benchmarkData?.companyName
            || localStorage.getItem('esg_companyName')
            || `기업 ID ${companyId}`,
          analysisYear:  new Date().getFullYear(),
          industry:      benchmarkData?.industryName || '제조업',
          region:        benchmarkData?.regionName   || '',
          analysisRange: `${new Date().getFullYear()}년 1월 ~ 12월`,
        },
        carbonStats || [],
        benchmarkData || null
      );
    } catch (e) {
      console.error('PDF 생성 오류:', e);
      message.error(`PDF 생성에 실패했습니다: ${e?.message || '알 수 없는 오류'}`);
    } finally {
      setPdfLoading(false);
    }
  };

  if (pageLoading && !latestReport) {
    return (
      <div style={{ padding: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <Spin size="large" />
        <div style={{ color: C.gray500, fontSize: '14px' }}>최신 리포트를 불러오는 중...</div>
      </div>
    );
  }

  if (!latestReport) {
    return (
      <div style={{ padding: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
        <Empty description={
          <span style={{ color: C.gray500 }}>
            분석 리포트가 없습니다.<br />
            <span style={{ color: C.blue, cursor: 'pointer' }} onClick={() => navigate('/analysis')}>
              분석 페이지에서 PDF를 업로드해 주세요.
            </span>
          </span>
        } />
      </div>
    );
  }

  return (
    <div style={{ padding: '36px 48px', width: '100%', boxSizing: 'border-box', background: C.bg, minHeight: '100vh' }}>

      {/* 액션 헤더 */}
      <div
        data-html2canvas-ignore
        style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '8px 14px', background: C.white,
              border: `1px solid ${C.gray200}`, borderRadius: '10px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              color: C.gray700, fontSize: '13px', fontWeight: 500,
              boxShadow: SHADOW_CARD,
            }}
          >
            <ArrowLeft size={14} /> 대시보드
          </button>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: C.gray900 }}>
            {(latestReport.companyName || companyProfileName)
              ? `${latestReport.companyName || companyProfileName} ESG 성과 분석 리포트`
              : 'ESG 성과 분석 리포트'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleHtml2CanvasPdf}
            disabled={exporting}
            style={{
              padding: '10px 18px', background: C.white,
              border: `1px solid ${C.gray200}`,
              borderRadius: '10px', cursor: exporting ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '7px',
              color: C.gray700, opacity: exporting ? 0.6 : 1,
              boxShadow: SHADOW_CARD,
            }}
          >
            {exporting ? <Spin size="small" /> : <Download size={14} />}
            화면 캡처 PDF
          </button>
          <button
            onClick={handleProfessionalPdf}
            disabled={pdfLoading}
            style={{
              padding: '10px 18px', background: C.blue, color: C.white,
              border: 'none', borderRadius: '10px',
              cursor: pdfLoading ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '13px',
              display: 'flex', alignItems: 'center', gap: '7px',
              opacity: pdfLoading ? 0.7 : 1,
              boxShadow: `0 4px 12px ${C.blue}44`,
            }}
          >
            {pdfLoading ? <Spin size="small" /> : <FileText size={14} />}
            전문 리포트 PDF
          </button>
        </div>
      </div>

      {/* 리포트 본문 */}
      <div
        id="report-content"
        style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'visible' }}
      >
        {/* 1. 총평 헤더 */}
        <OverallHeader report={latestReport} profileName={companyProfileName} />

        {/* 2. 종합 소견 */}
        <OverallOpinionSection
          fullReport={latestReport.fullReport}
          overallOpinion={latestReport.overallOpinion}
        />

        {/* 3. 에코 포인트 성과 */}
        <EcoPointSection report={latestReport} isSettled={ecoPreview?.isSettled} />

        {/* 4. 지표별 정밀 진단 */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '14px', paddingLeft: '4px',
          }}>
            <BarChart3 size={17} color={C.gray900} />
            <span style={{ fontWeight: 800, fontSize: '16px', color: C.gray900 }}>
              지표별 정밀 진단
            </span>
            <span style={{ color: C.gray300, fontSize: '12px', fontWeight: 500 }}>
              — 각 지표를 클릭하면 세부 내용을 확인할 수 있습니다
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {latestReport.sections.map(s => (
              <SectionCard key={s.category} section={s} />
            ))}
          </div>
        </div>

        {/* 5. Risk & Opportunity */}
        {latestReport.riskOpportunity && (
          <RiskOpportunitySection riskOpportunity={latestReport.riskOpportunity} />
        )}

        {/* 6. F-303 데이터 출처 매핑 */}
        {latestReport.evidenceMapping?.length > 0 && (
          <div style={{
            background: C.white, borderRadius: '20px', padding: '24px 28px',
            border: `1px solid ${C.gray200}`, boxShadow: SHADOW_CARD,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
              <div style={{ width: '4px', height: '20px', background: C.blue, borderRadius: '2px' }} />
              <span style={{ fontWeight: 800, fontSize: '16px', color: C.gray900 }}>
                데이터 출처 정밀 매핑
              </span>
              <span style={{
                background: C.blueL, color: C.blue,
                fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 700,
              }}>
                Source Attribution
              </span>
              <span
                data-html2canvas-ignore
                style={{ color: C.gray300, fontSize: '12px', marginLeft: 'auto' }}
              >
                클릭 정렬 · 키워드 검색 지원
              </span>
            </div>
            <EvidenceTable data={latestReport.evidenceMapping} />
          </div>
        )}

        {/* 푸터 */}
        <div style={{
          textAlign: 'center', padding: '20px',
          color: C.gray300, fontSize: '12px',
          borderTop: `1px solid ${C.gray200}`,
        }}>
          ECO POINT ESG Management Platform · K-ESG 가이드라인(산업통상자원부, 2021) 기준
          · AI 분석 결과로 실제 공시 자료와 다를 수 있습니다.
        </div>
      </div>
    </div>
  );
}
