import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const MyActivityList = () => {
  const { type } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [isLast, setIsLast] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 페이지 타이틀 및 API 엔드포인트 매핑
  const config = {
    posts: { title: '내가 쓴 글', url: '/community/posts/my-posts' },
    comments: { title: '작성한 댓글', url: '/community/posts/my-comments' },
    likes: { title: '좋아요 한 글', url: '/community/posts/my-likes' },
    orders: { title: '나의 주문 내역', url: '/market/orders/my' }
  };

  const currentConfig = config[type] || config.posts;

  const fetchItems = useCallback(async (pageNum) => {
    if (!user?.memberId) return;
    
    setIsLoading(true);
    try {
      const res = await api.get(currentConfig.url, {
        params: { page: pageNum, size: 10 }, // 백엔드 Pageable 대응
        headers: { 'X-Member-Id': user.memberId }
      });

      const { content, last } = res.data;
      
      setItems(prev => pageNum === 0 ? content : [...prev, ...content]);
      setIsLast(last);
    } catch (err) {
      console.error("데이터 로드 실패:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentConfig.url]);

  // 타입이 바뀌거나 초기 로딩 시 실행
  useEffect(() => {
    setItems([]);
    setPage(0);
    fetchItems(0);
  }, [type, fetchItems]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchItems(nextPage);
  };

  return (
    <div style={containerStyle}>
      {/* 헤더 영역 */}
      <div style={headerStyle}>
        <button onClick={() => navigate(-1)} style={backBtnStyle}>〈 뒤로가기</button>
        <h2 style={titleStyle}>{currentConfig.title}</h2>
      </div>

      {/* 리스트 영역 */}
      <div style={listWrapperStyle}>
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id || item.orderId} style={itemCardStyle}>
              {type === 'orders' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: '700', fontSize: '17px', marginBottom: '5px' }}>{item.productName}</div>
                    <div style={{ color: '#22b8cf', fontWeight: 'bold' }}>{item.totalPrice?.toLocaleString()} P</div>
                    <div style={{ fontSize: '12px', color: '#adb5bd', marginTop: '4px' }}>{new Date(item.createdDate).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={statusBadgeStyle(item.status)}>{item.status}</span>
                    {item.status !== 'CANCELLED' && (
                      <button 
                        onClick={() => navigate(`/my-page/${item.orderId}`)} 
                        style={voucherBtnStyle}>
                        {item.category === 'DONATION' ? '인증서 확인' : '바우처 확인'}
                      </button>
                    )}
                  </div>
                </div>
              ) : type === 'comments' ? (
                <div style={{ textAlign: 'left' }}>
                  <p style={commentContentStyle}>{item.content}</p>
                  <Link to={`/posts/${item.postId}`} style={sourceLinkStyle}>원문 게시글 보기 →</Link>
                </div>
              ) : (
                <Link to={`/posts/${item.id}`} style={postLinkStyle}>
                  <div style={{ fontWeight: '600', fontSize: '16px' }}>{item.title}</div>
                  <div style={dateStyle}>{new Date(item.createdDate).toLocaleDateString()}</div>
                </Link>
              )}
            </div>
          ))
        ) : (
          !isLoading && <p style={emptyTextStyle}>활동 내역이 없습니다.</p>
        )}
      </div>

      {/* 더보기 버튼 */}
      {!isLast && items.length > 0 && (
        <button onClick={handleLoadMore} style={loadMoreBtnStyle} disabled={isLoading}>
          {isLoading ? '로딩 중...' : '활동 더 불러오기 ↓'}
        </button>
      )}
    </div>
  );
};

const containerStyle = { maxWidth: '700px', margin: '40px auto', padding: '0 20px', textAlign: 'left' };
const headerStyle = { display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px' };
const backBtnStyle = { background: 'none', border: 'none', color: '#868e96', cursor: 'pointer', fontSize: '14px' };
const titleStyle = { fontSize: '24px', fontWeight: '850', margin: 0, color: '#333' };
const listWrapperStyle = { display: 'flex', flexDirection: 'column', gap: '15px' };
const itemCardStyle = { padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f3f5', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' };
const postLinkStyle = { textDecoration: 'none', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' };
const commentContentStyle = { margin: '0 0 8px 0', fontSize: '15px', color: '#444' };
const sourceLinkStyle = { fontSize: '12px', color: '#339af0', textDecoration: 'none' };
const dateStyle = { fontSize: '13px', color: '#adb5bd' };
const loadMoreBtnStyle = { width: '100%', padding: '15px', marginTop: '20px', backgroundColor: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '10px', color: '#495057', fontWeight: 'bold', cursor: 'pointer' };
const emptyTextStyle = { textAlign: 'center', padding: '50px 0', color: '#adb5bd' };

// 주문 내역 전용 추가 스타일
const statusBadgeStyle = (status) => ({
  padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
  backgroundColor: status === 'CANCELLED' ? '#fff5f5' : '#e7f5ff',
  color: status === 'CANCELLED' ? '#fa5252' : '#1c7ed6'
});
const voucherBtnStyle = {
  backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '8px 16px',
  borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
};

export default MyActivityList;