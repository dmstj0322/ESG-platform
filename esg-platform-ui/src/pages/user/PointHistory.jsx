import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const PointHistory = () => {
  const { user } = useAuth();
  const [pointPage, setPointPage] = useState({ content: [], totalPages: 0 });
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const memberId = user?.memberId || user?.id || localStorage.getItem('memberId');
    if (!memberId) return;

    api.get(`/points/${memberId}/history?page=${currentPage}&size=10`)
      .then(res => setPointPage(res.data))
      .catch(err => console.error("내역 로드 실패", err));
  }, [user, currentPage]);

  // 서버에서 내려오는 영문 코드를 직관적인 한글로 매핑
  const typeMap = {
    'EARN': '적립',
    'USE': '사용',
    'REFUND': '환불'
  };

  return (
    <div style={containerStyle}>
      <div style={headerWrapperStyle}>
        <h2 style={titleStyle}>포인트 이용 내역</h2>
        <p style={subtitleStyle}>적립 및 사용된 포인트와 잔액 상세 내역입니다.</p>
      </div>

      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>거래 일자</th>
              <th style={thStyle}>유형</th>
              <th style={thStyle}>상세 내용</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>포인트 변화</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>현재 잔액</th>
            </tr>
          </thead>
          <tbody>
            {pointPage.content && pointPage.content.length > 0 ? (
              pointPage.content.map((history) => (
                <tr key={history.id} style={trStyle}>
                  <td style={tdStyle}>{new Date(history.createdDate).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(history.type)}>
                      {typeMap[history.type] || history.type}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: '500' }}>{history.description}</td>
                  <td style={{ 
                    ...tdStyle, 
                    textAlign: 'right', 
                    fontWeight: 'bold',
                    // 유형별 텍스트 색상 차별화 (적립: 블루, 사용: 레드, 환불: 퍼플)
                    color: history.type === 'USE' ? '#ff6b6b' : (history.type === 'REFUND' ? '#7048e8' : '#339af0')
                  }}>
                    {history.amount > 0 ? `+${history.amount.toLocaleString()}` : history.amount.toLocaleString()} P
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#868e96' }}>
                    {history.balance?.toLocaleString()} P
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={emptyStyle}>
                  포인트 이용 내역이 존재하지 않습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 인터페이스 */}
      {pointPage.totalPages > 1 && (
        <div style={paginationContainerStyle}>
          <button 
            disabled={currentPage === 0} 
            style={pageBtnStyle} 
            onClick={() => setCurrentPage(prev => prev - 1)}
          >
            이전
          </button>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>
            {currentPage + 1} / {pointPage.totalPages}
          </span>
          <button 
            disabled={currentPage === pointPage.totalPages - 1} 
            style={pageBtnStyle} 
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
};

// UI 스타일 컴포넌트 구조 정의
const containerStyle = { maxWidth: '1000px', margin: '40px auto', padding: '0 20px', textAlign: 'left' };
const headerWrapperStyle = { marginBottom: '25px' };
const titleStyle = { fontSize: '24px', fontWeight: '800', color: '#212529', margin: '0 0 8px 0' };
const subtitleStyle = { fontSize: '14px', color: '#868e96', margin: 0 };

const cardStyle = { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', textAlign: 'left' };

const thStyle = { 
  padding: '16px 20px', 
  backgroundColor: '#f8f9fa', 
  color: '#868e96', 
  fontWeight: '600', 
  fontSize: '14px',
  borderBottom: '1px solid #f1f3f5',
  whiteSpace: 'nowrap'
};

const trStyle = { borderBottom: '1px solid #f1f3f5', transition: 'background-color 0.2s' };
const tdStyle = { padding: '18px 20px', fontSize: '15px', color: '#343a40', verticalAlign: 'middle' };

// 🌟 적립/사용/환불 상태값 뱃지 디자인 스타일링 함수
const badgeStyle = (type) => {
  const isEarn = type === 'EARN' || type === '적립';
  const isRefund = type === 'REFUND' || type === '환불';
  
  let backgroundColor = '#fff5f5'; // 기본값: USE (연빨강)
  let color = '#ff6b6b';
  
  if (isEarn) {
    backgroundColor = '#e7f5ff';   // EARN: 포인트 컬러 팔레트 연동 (연파랑)
    color = '#339af0';
  } else if (isRefund) {
    backgroundColor = '#f3f0ff';   // REFUND: 신규 아키텍처 디자인 반영 (연보라)
    color = '#7048e8';             
  }

  return {
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    backgroundColor,
    color,
    display: 'inline-block',
    minWidth: '50px',
    textAlign: 'center'
  };
};

const emptyStyle = { padding: '60px', textAlign: 'center', color: '#adb5bd', fontSize: '15px' };

const paginationContainerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '25px' };
const pageBtnStyle = { padding: '6px 12px', border: '1px solid #ced4da', backgroundColor: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' };

export default PointHistory;