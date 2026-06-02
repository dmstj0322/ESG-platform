import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
// import { textAlign } from 'html2canvas/dist/types/css/property-descriptors/text-align';

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
        {/* <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}> */}
        <div style={tableScrollContainer}>
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
                      color: history.type === 'USE' ? '#ff6b6b' : (history.type === 'REFUND' ? '#7048e8' : '#16A87A')
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
const containerStyle = { maxWidth: '62.5rem', margin: '1.25rem auto', padding: '0 1.25rem', textAlign: 'left' };
const headerWrapperStyle = { marginBottom: '1.5625rem' };
const titleStyle = { fontSize: '1.5rem', fontWeight: '800', color: '#212529', margin: '0 0 0.5rem 0' };
const subtitleStyle = { fontSize: '0.875rem', color: '#868e96', margin: 0 };

const cardStyle = { backgroundColor: '#fff', borderRadius: '0.75rem', border: '1px solid #e9ecef', boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.02)', width: '100%', overflow: 'hidden' };
const tableScrollContainer = { width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch'};
const tableStyle = { width: '100%', minWidth: '37.5rem', borderCollapse: 'collapse', textAlign: 'left'};
const thStyle = { padding: '1rem 1.5rem', backgroundColor: '#f8f9fa', color: '#868e96', fontWeight: '600', fontSize: '0.875rem', borderBottom: '1px solid #f1f3f5', whiteSpace: 'nowrap'};
const trStyle = { borderBottom: '1px solid #f1f3f5', transition: 'background-color 0.2s' };
const tdStyle = { padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#343a40', verticalAlign: 'middle', whiteSpace: 'nowrap' };

const badgeStyle = (type) => {
  const isEarn = type === 'EARN' || type === '적립';
  const isRefund = type === 'REFUND' || type === '환불';

  let backgroundColor = '#fff5f5'; 
  let color = '#ff6b6b';
  
  if (isEarn) {
    backgroundColor = '#E6F7F1';   
    color = '#16A87A';
  } else if (isRefund) {
    backgroundColor = '#f3f0ff';   
    color = '#7048e8';
  }

  return {
    padding: '0.375rem 0.75rem', 
    borderRadius: '1.25rem',     
    fontWeight: '600',
    fontSize: '0.8125rem',         
    backgroundColor,
    color,
    display: 'inline-block',
    whiteSpace: 'nowrap'
  };
};

const emptyStyle = { padding: '3.75rem', textAlign: 'center', color: '#adb5bd', fontSize: '0.9375rem' };
const paginationContainerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.9375rem', marginTop: '1.5625rem' };
const pageBtnStyle = { padding: '0.375rem 0.75rem', border: '1px solid #ced4da', backgroundColor: '#fff', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '500' };

export default PointHistory;