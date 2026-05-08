import React, { useState, useEffect } from 'react';
import api from '../api';

const PointHistory = () => {
  const [pointPage, setPointPage] = useState({
    content: [],
    totalPages: 0,
    number: 0 // 현재 페이지 번호
  });
  const [currentPage, setCurrentPage] = useState(0);
  const memberId = localStorage.getItem('memberId');

  useEffect(() => {
    api.get(`/points/${memberId}/history?page=${currentPage}&size=10`)
      .then(res => {
        setPointPage(res.data)
      })
      .catch(err => console.error("포인트 내역 불러오기 실패", err));
  }, [memberId, currentPage]);

  return (
    <div>
      <h2>포인트 이용 내역</h2>
      <table>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
            <th style={{ padding: '12px', textAlign: 'center', width: '15%' }}>거래 일자</th>
            <th style={{ padding: '12px', textAlign: 'center', width: '15%' }}>유형</th>
            <th style={{ padding: '12px', textAlign: 'left', width: '45%' }}>상세 내용</th>
            <th style={{ padding: '12px', textAlign: 'right', width: '25%' }}>포인트 변화</th>
          </tr>
        </thead>
        <tbody>
          {pointPage.content.length > 0 ?
            (pointPage.content.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.createdDate).toLocaleDateString()}</td>
                <td>{item.type}</td>
                <td>{item.description}</td>
                <td style={{ color: item.amount > 0 ? 'green' : 'red', fontWeight: 'bold' }}>
                  {item.amount > 0 ? '+' : ''}{item.amount.toLocaleString()} P
                </td>
              </tr>
            ))
            ) : (
              <tr><td colSpan="4">내역이 없습니다.</td></tr>
            )}
        </tbody>
      </table>
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button
          disabled={currentPage === 0}
          onClick={() => setCurrentPage(prev => prev - 1)}
        >
          이전
        </button>
        <span style={{ margin: '0 15px' }}>
          {currentPage + 1} / {pointPage.totalPages}
        </span>
        <button
          disabled={currentPage + 1 >= pointPage.totalPages}
          onClick={() => setCurrentPage(prev => prev + 1)}
        >
          다음
        </button>
      </div>
    </div>
  );
};

export default PointHistory;