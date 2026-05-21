import React, { useEffect, useState } from 'react';
import api from '../../api/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MyPage = () => {
  const [orders, setOrders] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [myComments, setMyComments] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  const [userPoints, setUserPoints] = useState(0);
  const [activeTab, setActiveTab] = useState('ORDERS');

  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.memberId) {
      fetchMyOrders();
      fetchMyActivity();
      fetchMyPoints();
    }
  }, [user]);

  const fetchMyPoints = async () => {
    const memberId = user?.memberId || user?.id || localStorage.getItem('memberId');
    if (!memberId) return;
    try {
      const res = await api.get(`/points/${memberId}/balance`);
      setUserPoints(res.data || 0);
    } catch (err) { console.error("포인트 조회 실패"); }
  };

  const fetchMyOrders = async () => {
    try {
      const res = await api.get('/market/orders/my?sort=id,desc', { headers: { 'X-Member-Id': user.memberId } });
      setOrders(res.data.content || []);
    } catch (err) { console.error("주문 내역 조회 실패"); }
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
        api.get('/community/posts/my-posts?sort=id,desc', config),
        api.get('/community/posts/my-comments?sort=id,desc', config),
        api.get('/community/posts/my-likes?sort=id,desc', config)
      ]);
      setMyPosts(postsRes.data.content || []);
      setMyComments(commentsRes.data.content || []);
      setLikedPosts(likesRes.data.content || []);
    } catch (err) { console.error("활동 내역 로드 실패"); }
  };

  const handleCancel = async (orderId, productName) => {
    if (!window.confirm(`[${productName}] 결제를 취소하시겠습니까?`)) return;
    try {
      await api.post(`/market/orders/${orderId}/cancel`, {}, { headers: { 'X-Member-Id': user.memberId } });
      alert("취소 및 포인트 환불이 완료되었습니다.");
      fetchMyOrders();
      fetchMyPoints();
    } catch (err) { alert(err.response?.data?.message || "취소 불가"); }
  };

  const checkIsCancelable = (order) => {
    if (order.status === 'ED') return { canCancel: false, reason: '취소 완료' };
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

  const renderVerifyBadge = (status) => {
    if (status === 'APPROVED') return <span style={verifyBadgeStyle('#ebfbee', '#2b8a3e')}>✅ 인증 완료</span>;
    if (status === 'REJECTED') return <span style={verifyBadgeStyle('#fff5f5', '#e03131')}>❌ 인증 반려</span>;
    return <span style={verifyBadgeStyle('#fff4e6', '#fd7e14')}>⏳ 심사 대기</span>;
  };

  return (
    <div style={pageContainer}>
      <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '24px', color: '#1a1a1a' }}>My Page</h1>

      {/* 상단 프로필 & 포인트 대시보드 */}
      <div style={dashboardCardStyle}>
        <div style={profileSectionStyle}>
          <div style={avatarStyle}>👤</div>
          <div>
            <div style={nicknameStyle}>{user?.nickname || '사용자'} 님</div>
            <span style={roleBadgeStyle}>{user?.role}</span>
          </div>
        </div>
        <div style={verticalDividerStyle} />
        <div style={pointSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '6px' }}>
            <div style={pointLabelStyle}>🌱 나의 ESG 보유 포인트</div>
            <Link to="/points/history" style={pointHistoryLinkStyle}>내역 보기 〉</Link>
          </div>
          <div style={pointValueStyle}>{userPoints.toLocaleString()} P</div>
        </div>
      </div>

      {/* 탭 메뉴 */}
      <div style={tabContainerStyle}>
        <button style={activeTab === 'ORDERS' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('ORDERS')}>
          마켓 주문 내역 ({orders.length})
        </button>
        <button style={activeTab === 'POSTS' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('POSTS')}>
          내가 쓴 글 ({myPosts.length})
        </button>
        <button style={activeTab === 'COMMENTS' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('COMMENTS')}>
          작성한 댓글 ({myComments.length})
        </button>
        <button style={activeTab === 'LIKES' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('LIKES')}>
          좋아요 한 글 ({likedPosts.length})
        </button>
      </div>

      <div style={contentContainerStyle}>
        {/* 1. 마켓 주문 내역 */}
        {activeTab === 'ORDERS' && (
          <div style={listWrapper}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>최근 주문 내역</h3>
              <button onClick={() => navigate('/my-activity/orders')} style={viewAllBtnStyle}>전체보기 〉</button>
            </div>
            <div style={listWrapper}>
              {orders.length === 0 ? <div style={emptyTextStyle}>주문 내역이 없습니다.</div> : (
                orders.slice(0, 5).map(o => {
                  const { canCancel, reason } = checkIsCancelable(o);
                  return (
                    <div key={o.orderId || o.id} style={listCardStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, opacity: o.status === 'CANCELED' ? 0.5 : 1 }}>
                        <span style={statusBadgeStyle(o.status)}>{o.status}</span>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '17px', color: '#212529', marginBottom: '6px' }}>
                            {o.status === 'CANCELED' ? <del>{o.productName}</del> : o.productName}
                          </div>
                          <div style={{ fontSize: '13px', color: '#868e96', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#22b8cf', fontWeight: '800' }}>{o.totalPrice?.toLocaleString()} P</span>
                            <span>|</span>
                            <span>{new Date(o.orderDate || o.createdDate).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        {o.status !== 'CANCELED' && (
                          <button onClick={() => navigate(`/my-page/${o.orderId}`)} style={viewVoucherBtnStyle}>
                            {o.category === 'DONATION' ? '인증서 확인' : '바우처 확인'}
                          </button>
                        )}
                        {canCancel ? (
                          <button onClick={() => handleCancel(o.orderId, o.productName)} style={cancelBtnStyle}>결제 취소</button>
                        ) : (
                          o.status !== 'CANCELED' && (
                            <button disabled style={disabledCancelBtnStyle}>{reason}</button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 2. 내 게시글 */}
        {activeTab === 'POSTS' && (
          <div style={listWrapper}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>최근 작성한 글</h3>
              <button onClick={() => navigate('/my-activity/posts')} style={viewAllBtnStyle}>전체보기 〉</button>
            </div>
            <div style={listWrapper}>
              {myPosts.length === 0 ? <div style={emptyTextStyle}>작성한 글이 없습니다.</div> : myPosts.slice(0, 5).map(post => (
                <div key={post.id} style={listCardStyle} onClick={() => navigate(`/posts/${post.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, overflow: 'hidden', cursor: 'pointer' }}>
                    {post.imageUrls?.[0] ? (
                      <img src={post.imageUrls[0]} style={thumbnailImgStyle} alt="thumb" />
                    ) : (
                      <div style={iconCircleStyle('#e7f5ff', '#339af0')}>📝</div>
                    )}
                    <div style={{ textAlign: 'left', flex: 1, overflow: 'hidden' }}>
                      <div style={mainTitleStyle}>{post.title}</div>
                      <div style={subContentStyle}>{post.content}</div>
                    </div>
                  </div>

                  <div style={rightMetaStyle}>
                    {renderVerifyBadge(post.adminStatus)}
                    <span>{new Date(post.createdDate || post.createdAt).toLocaleDateString()}</span>
                    <span style={arrowStyle}>〉</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. 내 댓글 (🌟 꺾쇠 화살표와 함께 원문 제목을 댓글 아래로 이동!) */}
        {activeTab === 'COMMENTS' && (
          <div style={listWrapper}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>최근 작성한 댓글</h3>
              <button onClick={() => navigate('/my-activity/comments')} style={viewAllBtnStyle}>전체보기 〉</button>
            </div>
            <div style={listWrapper}>
              {myComments.length === 0 ? <div style={emptyTextStyle}>작성한 댓글이 없습니다.</div> :
                myComments.slice(0, 5).map(comment => (
                  <div key={comment.id} style={listCardStyle} onClick={() => navigate(`/posts/${comment.postId}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, cursor: 'pointer', overflow: 'hidden' }}>
                      <div style={iconCircleStyle('#f3f0ff', '#845ef7')}>💬</div>
                      <div style={{ flex: 1, overflow: 'hidden', textAlign: 'left' }}>
                        <div style={mainTitleStyle}>"{comment.content}"</div>
                        {/* 🌟 원문 게시글 제목을 내용 바로 아래에 렌더링 */}
                        <div style={postTitleInCommentStyle}>
                          <span style={{ color: '#adb5bd', fontSize: '14px' }}>→</span> {comment.postTitle || '원문 게시글'}
                        </div>
                      </div>
                    </div>
                    {/* 날짜와 이동 화살표만 우측에 남김 */}
                    <div style={rightMetaStyle}>
                      <span>{new Date(comment.createdDate || comment.createdAt).toLocaleDateString()}</span>
                      <span style={arrowStyle}>〉</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 4. 좋아요 한 글 */}
        {activeTab === 'LIKES' && (
          <div style={listWrapper}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>좋아요 한 글</h3>
              <button onClick={() => navigate('/my-activity/likes')} style={viewAllBtnStyle}>전체보기 〉</button>
            </div>
            <div style={listWrapper}>
              {likedPosts.length === 0 ? <div style={emptyTextStyle}>좋아요 내역이 없습니다.</div> : likedPosts.slice(0, 5).map(post => (
                <div key={post.id} style={listCardStyle} onClick={() => navigate(`/posts/${post.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, cursor: 'pointer', overflow: 'hidden' }}>
                    <div style={iconCircleStyle('#fff5f5', '#fa5252')}>❤️</div>
                    <div style={mainTitleStyle}>{post.title}</div>
                  </div>
                  <div style={rightMetaStyle}>
                    <span>작성자: {post.nickname}</span>
                    <span>{new Date(post.createdDate || post.createdAt).toLocaleDateString()}</span>
                    <span style={arrowStyle}>〉</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- 스타일 속성 명세 ---
const pageContainer = { padding: '40px 20px', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', backgroundColor: '#fdfdfd', minHeight: '100vh' };
const dashboardCardStyle = { display: 'flex', alignItems: 'center', padding: '30px', marginBottom: '35px', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e9ecef', boxShadow: '0 12px 30px rgba(51, 154, 240, 0.04)' };
const profileSectionStyle = { display: 'flex', alignItems: 'center', gap: '18px', flex: 1 };
const avatarStyle = { width: '54px', height: '54px', borderRadius: '50%', backgroundColor: '#f1f3f5', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '24px' };
const nicknameStyle = { fontSize: '20px', fontWeight: '800', color: '#212529', marginBottom: '6px' };
const roleBadgeStyle = { display: 'inline-block', backgroundColor: '#e8f7ff', color: '#0062b3', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' };

const verticalDividerStyle = { width: '1px', height: '60px', backgroundColor: '#e9ecef', margin: '0 30px' };

const pointSectionStyle = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' };
const pointLabelStyle = { fontSize: '13px', color: '#868e96', fontWeight: '600' };
const pointHistoryLinkStyle = { fontSize: '12px', color: '#adb5bd', textDecoration: 'none', fontWeight: '600', transition: 'color 0.2s' };
const pointValueStyle = { fontSize: '30px', fontWeight: '900', color: '#339af0', letterSpacing: '-0.5px' };

const tabContainerStyle = { display: 'flex', borderBottom: '1px solid #dee2e6', backgroundColor: '#fff', borderRadius: '16px 16px 0 0', border: '1px solid #e9ecef' };
const tabStyle = { padding: '16px 20px', backgroundColor: 'transparent', color: '#868e96', border: 'none', borderBottom: '3px solid transparent', cursor: 'pointer', fontWeight: 'bold' };
const activeTabStyle = { ...tabStyle, color: '#0062b3', borderBottom: '3px solid #339af0' };
const contentContainerStyle = { padding: '24px 0' };

const sectionHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '15px', marginBottom: '15px', borderBottom: '2px solid #f1f3f5' };
const sectionTitleStyle = { margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#343a40' };
const viewAllBtnStyle = { background: 'none', border: 'none', color: '#868e96', fontSize: '14px', fontWeight: '600', cursor: 'pointer', padding: '0' };

const listWrapper = { display: 'flex', flexDirection: 'column', gap: '12px' };
const listCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', backgroundColor: '#fff', border: '1px solid #e9ecef', borderRadius: '12px' };

const mainTitleStyle = { fontWeight: '700', color: '#212529', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const subContentStyle = { fontSize: '14px', color: '#868e96', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

// 🌟 변경된 원문 제목 스타일 (아래쪽 배치 및 정렬 맞춤)
const postTitleInCommentStyle = { fontSize: '13px', color: '#868e96', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

const rightMetaStyle = { display: 'flex', alignItems: 'center', gap: '16px', color: '#adb5bd', fontSize: '13px', flexShrink: 0 };
const arrowStyle = { fontWeight: 'bold', fontSize: '14px', color: '#ced4da' };

const thumbnailImgStyle = { width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 };
const verifyBadgeStyle = (bg, color) => ({ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', backgroundColor: bg, color: color, display: 'inline-block' });
const iconCircleStyle = (bg, color) => ({ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: bg, color: color, display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 });

const statusBadgeStyle = (status) => ({ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', backgroundColor: status === 'CANCELED' ? '#fff5f5' : '#e7f5ff', color: status === 'CANCELED' ? '#fa5252' : '#1c7ed6' });
const viewVoucherBtnStyle = { padding: '6px 12px', backgroundColor: '#339af0', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' };
const cancelBtnStyle = { padding: '6px 12px', backgroundColor: '#fff', color: '#fa5252', border: '1px solid #fa5252', borderRadius: '6px', cursor: 'pointer' };
const disabledCancelBtnStyle = { width: '95px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', color: '#adb5bd', border: '1px solid #dee2e6', borderRadius: '8px', cursor: 'not-allowed', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 };

const emptyTextStyle = { textAlign: 'center', padding: '60px 0', color: '#adb5bd', fontSize: '15px', fontWeight: '500' };

export default MyPage;