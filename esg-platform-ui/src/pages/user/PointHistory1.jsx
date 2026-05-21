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
              {/* 🌟 백엔드에서 받아올 잔액 열 */}
              <th style={{ ...thStyle, textAlign: 'right' }}>잔액</th>
            </tr>
          </thead>
          <tbody>
            {(!pointPage.content || pointPage.content.length === 0) ? (
              <tr>
                <td colSpan="5" style={emptyStyle}>
                  이용 내역이 없습니다.
                </td>
              </tr>
            ) : (
              pointPage.content.map((item) => (
                <tr key={item.id} style={trStyle}>
                  <td style={tdStyle}>
                    {new Date(item.createdDate || item.createdAt).toLocaleDateString('ko-KR', {
                      year: 'numeric', month: '2-digit', day: '2-digit'
                    })}
                  </td>
                  <td style={tdStyle}>
                    <span style={badgeStyle(item.type)}>
                      {item.type === 'EARN' || item.type === '적립' ? '적립' : item.type === 'USE' || item.type === '사용' ? '사용' : item.type}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: '#495057' }}>{item.description}</td>
                  
                  {/* 포인트 변화량 */}
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', color: item.amount > 0 ? '#339af0' : '#ff6b6b' }}>
                    {item.amount > 0 ? '+' : ''}{item.amount.toLocaleString()} P
                  </td>
                  
                  {/* 🌟 백엔드에서 넘겨주는 balance 출력 */}
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '800', color: '#212529' }}>
                    {item.balance !== undefined && item.balance !== null ? `${item.balance.toLocaleString()} P` : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pointPage.totalPages > 0 && (
        <div style={paginationStyle}>
          <button 
            disabled={currentPage === 0} 
            onClick={() => setCurrentPage(p => p - 1)} 
            style={pageBtnStyle(currentPage === 0)}
          >
            이전
          </button>
          <span style={pageInfoStyle}>{currentPage + 1} / {pointPage.totalPages}</span>
          <button 
            disabled={currentPage + 1 >= pointPage.totalPages} 
            onClick={() => setCurrentPage(p => p + 1)} 
            style={pageBtnStyle(currentPage + 1 >= pointPage.totalPages)}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
};

// --- ✨ 깔끔하고 모던한 스타일 정의 ---
const containerStyle = { padding: '40px 20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' };

const headerWrapperStyle = { marginBottom: '24px' };
const titleStyle = { color: '#212529', fontSize: '24px', fontWeight: '800', margin: '0 0 8px 0' };
const subtitleStyle = { color: '#868e96', fontSize: '15px', margin: 0 };

const cardStyle = { 
  backgroundColor: '#fff', 
  borderRadius: '16px', 
  boxShadow: '0 4px 20px rgba(0,0,0,0.04)', 
  border: '1px solid #f1f3f5',
  overflow: 'hidden' 
};

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

const trStyle = { borderBottom: '1px solid #f8f9fa', transition: 'background-color 0.2s' };

const tdStyle = { padding: '18px 20px', fontSize: '15px', color: '#343a40', verticalAlign: 'middle' };

const badgeStyle = (type) => ({
  padding: '6px 12px',
  borderRadius: '20px',
  fontSize: '13px',
  fontWeight: '600',
  backgroundColor: type === 'EARN' || type === '적립' ? '#e7f5ff' : '#fff5f5',
  color: type === 'EARN' || type === '적립' ? '#339af0' : '#ff6b6b',
  display: 'inline-block',
  minWidth: '40px',
  textAlign: 'center'
});

const emptyStyle = { padding: '60px', textAlign: 'center', color: '#adb5bd', fontSize: '15px' };

const paginationStyle = { marginTop: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px' };
const pageBtnStyle = (disabled) => ({
  padding: '8px 16px',
  border: disabled ? '1px solid #e9ecef' : '1px solid #339af0',
  backgroundColor: disabled ? '#f8f9fa' : '#fff',
  color: disabled ? '#adb5bd' : '#339af0',
  borderRadius: '8px',
  fontWeight: '600',
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: '0.2s'
});
const pageInfoStyle = { fontSize: '15px', color: '#495057', fontWeight: '500' };

export default PointHistory;