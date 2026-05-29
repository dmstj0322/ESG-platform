import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MyPage = () => {
  const [orders, setOrders] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [myComments, setMyComments] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.memberId) {
      fetchMyOrders();
      fetchMyActivity();
    }
  }, [user]);

  const fetchMyOrders = async () => {
    try {
      const res = await api.get('/market/orders/my', { headers: { 'X-Member-Id': user.memberId } });
      setOrders(res.data.content);
    } catch (err) {
      console.error("주문 내역 조회 실패");
    }
  };

  const fetchMyActivity = async () => {
    try {
      const config = {
        headers: {
          'X-Member-Id': user.memberId,
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      };

      const [postsRes, commentsRes, likesRes] = await Promise.all([
        api.get('/community/posts/my-posts', config),
        api.get('/community/posts/my-comments', config),
        api.get('/community/posts/my-likes', config)
      ]);

      setMyPosts(postsRes.data.content);
      setMyComments(commentsRes.data.content);
      setLikedPosts(likesRes.data.content);
    } catch (err) { console.error("활동 내역 로드 실패"); }
  };

  const handleCancel = async (orderId, productName) => {
    if (!window.confirm(`[${productName}] 결제를 정말 취소하시겠습니까?\n사용한 포인트는 즉시 환불됩니다.`)) return;
    try {
      await api.post(`/market/orders/${orderId}/cancel`, {}, {
        headers: { 'X-Member-Id': user.memberId }
      });
      alert("정상적으로 취소 및 포인트 환불이 완료되었습니다.");
      fetchMyOrders();
    } catch (err) {
      alert(err.response?.data?.message || "취소가 불가능한 주문입니다.");
    }
  };

  // ✅ [핵심 기능] 취소 가능 여부 사전 검증 로직
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
    <div style={{ padding: '40px 20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', backgroundColor: '#fdfdfd' }}>
      <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '40px', color: '#1a1a1a' }}>My Page</h1>

      {/* 1. 주문 내역 섹션 */}
      <section style={sectionCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>🛍️ 나의 주문 내역 ({orders.length})</h3>
          <Link to="/my-activity/orders" style={moreLinkStyle}>전체보기 〉</Link>
        </div>
        {orders.length === 0 ? <p style={{ color: '#999' }}>주문 내역이 없습니다.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {orders.slice(0, 5).map(o => {
              const { canCancel, reason } = checkIsCancelable(o);

              return (
                <div key={o.orderId} style={orderItemStyle}>
                  <div style={{ flex: 1, opacity: o.status === 'CANCELLED' ? 0.5 : 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '18px', marginBottom: '5px' }}>
                      {o.status === 'CANCELLED' ? <del>{o.productName}</del> : o.productName}
                    </div>
                    <div style={{ color: '#22b8cf', fontWeight: 'bold' }}>{o.totalPrice.toLocaleString()} P</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={statusBadgeStyle(o.status)}>{o.status}</span>

                    {o.status !== 'CANCELLED' && (
                      <button onClick={() => navigate(`/my-page/${o.orderId}`)} style={viewVoucherBtnStyle}>
                        {o.category === 'DONATION' ? '인증서 확인' : '바우처 확인'}
                      </button>
                    )}

                    {/* ✅ 검증 결과에 따라 동적 버튼 렌더링 */}
                    {canCancel ? (
                      <button onClick={() => handleCancel(o.orderId, o.productName)} style={cancelBtnStyle}>결제 취소</button>
                    ) : (
                      o.status !== 'CANCELLED' && (
                        <button disabled style={disabledCancelBtnStyle}>{reason}</button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {orders.length > 5 && (
          <div onClick={() => navigate('/my-activity/orders')} style={moreIndicatorStyle}>
            나머지 {orders.length - 5}개 주문 더보기 <span>▼</span>
          </div>
        )}
      </section>

      {/* 2. 내가 쓴 게시글 섹션 */}
      <section style={sectionCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>📝 내가 쓴 글 ({myPosts.length})</h3>
          <Link to="/my-activity/posts" style={moreLinkStyle}>전체보기 〉</Link>
        </div>

        {myPosts.length === 0 ? <p style={emptyTextStyle}>작성한 글이 없습니다.</p> :
          myPosts.slice(0, 5).map(post => (
            <div key={post.id} style={activityItemStyle}>
              <Link to={`/posts/${post.id}`} style={linkStyle}>{post.title}</Link>
              <span style={dateTextStyle}>{new Date(post.createdDate).toLocaleDateString()}</span>
            </div>
          ))
        }
        {myPosts.length > 5 && (
          <div onClick={() => navigate('/my-activity/posts')} style={moreIndicatorStyle}>
            나머지 {myPosts.length - 5}개 게시글 더보기 <span>▼</span>
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {/* 3. 좋아요 한 글 섹션 */}
        <section style={sectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>❤️ 좋아요 ({likedPosts.length})</h3>
            <Link to="/my-activity/likes" style={moreLinkStyle}>더보기</Link>
          </div>
          {likedPosts.slice(0, 5).map(post => (
            <div key={post.id} style={activityItemStyle}>
              <Link to={`/posts/${post.id}`} style={linkStyle}>{post.title}</Link>
            </div>
          ))}
          {likedPosts.length > 5 && (
            <div onClick={() => navigate('/my-activity/likes')} style={moreIndicatorStyle}>
              나머지 {likedPosts.length - 5}개 좋아요 더보기 <span>▼</span>
            </div>
          )}
        </section>

        {/* 4. 내가 쓴 댓글 섹션 */}
        <section style={sectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>💬 댓글 ({myComments.length})</h3>
            <Link to="/my-activity/comments" style={moreLinkStyle}>더보기</Link>
          </div>
          {myComments.slice(0, 5).map(comment => (
            <div key={comment.id} style={activityItemStyle}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#444' }}>{comment.content}</p>
                <Link to={`/posts/${comment.postId}`} style={{ fontSize: '12px', color: '#339af0', textDecoration: 'none' }}>원문 보기</Link>
              </div>
            </div>
          ))}
          {myComments.length > 5 && (
            <div onClick={() => navigate('/my-activity/comments')} style={moreIndicatorStyle}>
              나머지 {myComments.length - 5}개 댓글 더보기 <span>▼</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// --- 스타일 객체 ---
const moreLinkStyle = { fontSize: '13px', color: '#adb5bd', textDecoration: 'none', fontWeight: '500' };
const emptyTextStyle = { color: '#adb5bd', fontSize: '14px', padding: '20px 0' };
const dateTextStyle = { fontSize: '12px', color: '#dee2e6', marginLeft: '10px' };

const sectionCardStyle = { backgroundColor: '#fff', padding: '25px', borderRadius: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border: '1px solid #f1f3f5', marginBottom: '25px' };
const sectionTitleStyle = { marginTop: 0, marginBottom: '20px', fontSize: '20px', color: '#333', borderLeft: '5px solid #339af0', paddingLeft: '12px' };
const orderItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #f8f9fa' };

const statusBadgeStyle = (status) => ({
  padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
  backgroundColor: status === 'CANCELLED' ? '#fff5f5' : '#e7f5ff',
  color: status === 'CANCELLED' ? '#fa5252' : '#1c7ed6', minWidth: '65px', textAlign: 'center'
});

const viewVoucherBtnStyle = {
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

const activityItemStyle = { padding: '12px 0', borderBottom: '1px solid #f8f9fa' };
const linkStyle = { textDecoration: 'none', color: '#495057', fontSize: '15px', fontWeight: '500' };

const moreIndicatorStyle = {
  marginTop: '15px', padding: '14px', backgroundColor: '#e7f5ff', borderRadius: '12px', color: '#1c7ed6', fontSize: '14px', fontWeight: '700', 
  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', cursor: 'pointer', border: 'none', transition: 'background-color 0.2s ease',
};

export default MyPage;