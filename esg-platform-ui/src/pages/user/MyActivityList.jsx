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
        params: { page: pageNum, size: 10 },
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

  // ✅ 리스트 내 취소 로직
  const handleCancel = async (orderId, productName) => {
    if (!window.confirm(`[${productName}] 결제를 정말 취소하시겠습니까?`)) return;
    try {
      await api.post(`/market/orders/${orderId}/cancel`, {}, {
        headers: { 'X-Member-Id': user.memberId }
      });
      alert("정상적으로 취소 및 포인트 환불이 완료되었습니다.");
      setItems([]);
      setPage(0);
      fetchItems(0);
    } catch (err) {
      alert(err.response?.data?.message || "취소가 불가능한 주문입니다.");
    }
  };

  // ✅ 취소 가능 여부 사전 검증
  const checkIsCancelable = (order) => {
    if (order.status === 'CANCELLED') return { canCancel: false, reason: '취소 완료' };
    if (order.category === 'DONATION') return { canCancel: false, reason: '기부 취소 불가' };
    
    const orderDateStr = order.createdDate || order.orderDate;
    if (orderDateStr) {
      const orderDate = new Date(orderDateStr);
      const now = new Date();
      const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 7) return { canCancel: false, reason: '7일 경과' };
    }
    
    return { canCancel: true, reason: '' };
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button onClick={() => navigate(-1)} style={backBtnStyle}>〈 뒤로가기</button>
        <h2 style={titleStyle}>{currentConfig.title}</h2>
      </div>

      <div style={listWrapperStyle}>
        {items.length > 0 ? (
          items.map((item) => {
            const { canCancel, reason } = type === 'orders' ? checkIsCancelable(item) : { canCancel: false, reason: '' };
            const isCanceled = item.status === 'CANCELLED';

            return (
              <div key={item.id || item.orderId} style={{ ...itemCardStyle, opacity: isCanceled ? 0.6 : 1 }}>
                {type === 'orders' ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: '700', fontSize: '17px', marginBottom: '5px' }}>
                        {isCanceled ? <del>{item.productName}</del> : item.productName}
                      </div>
                      <div style={{ color: '#22b8cf', fontWeight: 'bold' }}>{item.totalPrice?.toLocaleString()} P</div>
                      <div style={{ fontSize: '12px', color: '#adb5bd', marginTop: '4px' }}>
                        {new Date(item.createdDate || item.orderDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={statusBadgeStyle(item.status)}>{item.status}</span>
                      
                      {!isCanceled && (
                        <button onClick={() => navigate(`/my-page/${item.orderId}`)} style={voucherBtnStyle}>
                          {item.category === 'DONATION' ? '인증서 확인' : '바우처 확인'}
                        </button>
                      )}

                      {/* ✅ 리스트의 동적 버튼 렌더링 */}
                      {canCancel ? (
                        <button onClick={() => handleCancel(item.orderId, item.productName)} style={cancelBtnStyle}>결제 취소</button>
                      ) : (
                        !isCanceled && (
                          <button disabled style={disabledCancelBtnStyle}>{reason}</button>
                        )
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
            );
          })
        ) : (
          !isLoading && <p style={emptyTextStyle}>활동 내역이 없습니다.</p>
        )}
      </div>

      {!isLast && items.length > 0 && (
        <button onClick={handleLoadMore} style={loadMoreBtnStyle} disabled={isLoading}>
          {isLoading ? '로딩 중...' : '활동 더 불러오기 ↓'}
        </button>
      )}
    </div>
  );
};

// --- 스타일 객체 ---
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

const statusBadgeStyle = (status) => ({
  padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
  backgroundColor: status === 'CANCELLED' ? '#fff5f5' : '#e7f5ff',
  color: status === 'CANCELLED' ? '#fa5252' : '#1c7ed6', minWidth: '65px', textAlign: 'center'
});

const voucherBtnStyle = { 
  width: '90px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#339af0', color: '#fff', 
  border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', boxSizing: 'border-box', flexShrink: 0
};

const cancelBtnStyle = { 
  width: '90px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', color: '#fa5252', 
  border: '1px solid #fa5252', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', boxSizing: 'border-box', flexShrink: 0
};

const disabledCancelBtnStyle = { 
  width: '90px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', color: '#adb5bd', 
  border: '1px solid #dee2e6', borderRadius: '8px', cursor: 'not-allowed', fontSize: '12px', fontWeight: 'bold', boxSizing: 'border-box', flexShrink: 0
};
export default MyActivityList;