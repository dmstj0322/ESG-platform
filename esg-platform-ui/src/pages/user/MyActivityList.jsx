import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';

const ACTIVITY_CONFIG = {
  posts: { title: '내가 쓴 글', url: '/community/posts/my-posts' },
  comments: { title: '작성한 댓글', url: '/community/posts/my-comments' },
  likes: { title: '좋아요 한 글', url: '/community/posts/my-likes' },
  orders: { title: '나의 주문 내역', url: '/market/orders/my?sort=id,desc' }
};

const MyActivityList = () => {
  const { type } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [isLast, setIsLast] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const currentConfig = ACTIVITY_CONFIG[type] || ACTIVITY_CONFIG.posts;

  const fetchItems = useCallback(async (pageNum) => {
    if (!user?.memberId) return;

    setIsLoading(true);
    try {
      const res = await api.get(currentConfig.url, {
        params: { page: pageNum, size: 10 },
        headers: {
          'X-Member-Id': user.memberId,
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = res.data;
      if (pageNum === 0) {
        setItems(data.content || []);
      } else {
        setItems(prev => [...prev, ...(data.content || [])]);
      }
      setIsLast(data.last);
    } catch (err) {
      console.error("데이터 로드 실패", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.memberId, currentConfig.url]);

  useEffect(() => {
    setItems([]);
    setPage(0);
    setIsLast(false);
    fetchItems(0);
  }, [type, fetchItems]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchItems(nextPage);
  };

  const handleCancel = async (orderId, productName) => {
    if (!window.confirm(`[${productName}] 주문을 취소하시겠습니까?`)) return;
    try {
      await api.post(`/market/orders/${orderId}/cancel`, {}, { headers: { 'X-Member-Id': user.memberId } });
      // alert("취소 및 포인트 환불이 완료되었습니다.");
      toast.success("✅ 취소 및 포인트 환불이 완료되었습니다.", { containerId: 'main-toast' });
      setItems(prev => prev.map(item => (item.orderId === orderId) ? { ...item, status: 'CANCELED' } : item));
    } catch (err) {
      // alert(err.response?.data?.message || "취소가 불가능한 주문입니다.");
      toast.error(err.response?.data?.message || "❌ 취소할 수 없는 주문입니다.", { containerId: 'main-toast' });
    }
  };

  const checkIsCancelable = (order) => {
    if (order.status === 'CANCELED') return { canCancel: false, reason: '취소 완료' };
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
      <div style={headerWrapperStyle}>
        <Link to="/mypage" style={backLinkStyle}>〈 마이페이지로 가기</Link>
        <h2 style={titleStyle}>{currentConfig.title} 전체보기</h2>
      </div>

      <div style={listWrapper}>
        {items.length === 0 && !isLoading ? (
          <div style={emptyTextStyle}>내역이 존재하지 않습니다.</div>
        ) : (
          items.map((item, index) => {
            if (type === 'orders') {
              const { canCancel, reason } = checkIsCancelable(item);
              return (
                <div key={item.orderId || index} style={listCardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, opacity: item.status === 'CANCELED' ? 0.5 : 1 }}>
                    {/* 🌟 기존 코드에 뱃지만 추가 */}
                    {item.category === 'GIFTICON' ? (
                      <div style={iconCircleStyle('#E6F7F1', '#16A87A')}>🎁</div>
                    ) : (
                      <div style={iconCircleStyle('#f3f0ff', '#7048e8')}>🤝</div>
                    )}
                    <span style={statusBadgeStyle(item.status)}>{item.status}</span>
                    <div>
                      <div style={{ textAlign: 'left', fontWeight: 'bold', fontSize: '17px', color: '#212529', marginBottom: '6px' }}>
                        {item.status === 'CANCELED' ? <del>{item.productName}</del> : item.productName}
                      </div>
                      <div style={{ fontSize: '13px', color: '#868e96', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#16A87A', fontWeight: '800', whiteSpace: 'nowrap' }}>{item.totalPrice?.toLocaleString()} P</span>
                        <span>|</span>
                        <span style={{ whiteSpace: 'nowrap' }}>{new Date(item.createdDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {item.status !== 'CANCELED' && (
                      <button onClick={() => navigate(`/my-page/${item.orderId}`)} style={viewVoucherBtnStyle}>
                        {item.category === 'DONATION' ? '인증서 확인' : '바우처 확인'}
                      </button>
                    )}
                    {canCancel ? (
                      <button onClick={() => handleCancel(item.orderId, item.productName)} style={cancelBtnStyle}>결제 취소</button>
                    ) : (
                      item.status !== 'CANCELED' && (
                        <button disabled style={disabledCancelBtnStyle}>{reason}</button>
                      )
                    )}
                    {item.status === 'CANCELED' && (
                      <span style={{ fontSize: '13px', color: '#adb5bd', paddingRight: '5px' }}>취소 완료</span>
                    )}
                  </div>
                </div>
              );
            }

            if (type === 'posts') {
              return (
                <div key={item.id || index} style={listCardStyle} onClick={() => navigate(`/posts/${item.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, overflow: 'hidden', cursor: 'pointer' }}>
                    {/* {item.imageUrls?.[0] ? (
                      <img src={item.imageUrls[0]} style={thumbnailImgStyle} alt="thumb" />
                    ) : (
                      <div style={iconCircleStyle('#E6F7F1', '#16A87A')}>📝</div>
                    )} */}
                    <div style={{ position: 'relative', width: '50px', height: '50px' }}>
                      {item.imageUrls?.[0] ? (
                        <>
                          <img src={item.imageUrls[0]} style={thumbnailImgStyle} alt="thumb" />
                          {/* 사진이 1장보다 많을 때만 표시 */}
                          {item.imageUrls.length > 1 && (
                            <div style={{
                              position: 'absolute',
                              top: 0, left: 0, width: '100%', height: '100%',
                              backgroundColor: 'rgba(0, 0, 0, 0.4)',
                              color: '#fff',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              borderRadius: '8px'
                            }}>
                              +{item.imageUrls.length - 1}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={iconCircleStyle('#E6F7F1', '#16A87A')}>📝</div>
                      )}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <div style={mainTitleStyle}>{item.title}</div>
                      <div style={subContentStyle}>{item.content}</div>
                    </div>
                  </div>
                  {/* <div style={rightMetaStyle}>
                    {renderVerifyBadge(item.adminStatus)}
                    <span>{new Date(item.createdDate || item.createdAt).toLocaleDateString()}</span>
                    <span style={arrowStyle}>〉</span>
                  </div> */}
                  <div style={rightMetaStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                      {renderVerifyBadge(item.adminStatus)}
                      {item.adminStatus === 'REJECTED' && item.rejectionReason && (
                        <div style={{ fontSize: '11px', color: '#e03131', fontWeight: 'bold', marginTop: '4px', maxWidth: '120px', textAlign: 'right' }}>
                          <strong>반려 사유: </strong> {item.rejectionReason}
                        </div>
                      )}
                    </div>
                    <span>{new Date(item.createdDate).toLocaleDateString()}</span>
                    <span style={arrowStyle}>〉</span>
                  </div>
                </div>
              );
            }

            if (type === 'comments') {
              return (
                <div key={item.id || index} style={listCardStyle} onClick={() => navigate(`/posts/${item.postId}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, cursor: 'pointer', overflow: 'hidden' }}>
                    <div style={iconCircleStyle('#f3f0ff', '#845ef7')}>💬</div>
                    <div style={{ flex: 1, overflow: 'hidden', textAlign: 'left' }}>
                      <div style={mainTitleStyle}>"{item.content}"</div>
                      <div style={postTitleInCommentStyle}>
                        <span style={{ color: '#adb5bd', fontSize: '14px' }}>→</span> {item.postTitle || '원문 게시글'}
                      </div>
                    </div>
                  </div>
                  <div style={rightMetaStyle}>
                    <span>{new Date(item.createdDate || item.createdAt).toLocaleDateString()}</span>
                    <span style={arrowStyle}>〉</span>
                  </div>
                </div>
              );
            }

            if (type === 'likes') {
              return (
                <div key={item.id || index} style={listCardStyle} onClick={() => navigate(`/posts/${item.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, cursor: 'pointer' }}>
                    <div style={iconCircleStyle('#fff5f5', '#fa5252')}>❤️</div>
                    <div style={mainTitleStyle}>{item.title}</div>
                  </div>
                  <div style={rightMetaStyle}>
                    <span>작성자: {item.nickname}</span>
                    <span>{new Date(item.createdDate || item.createdAt).toLocaleDateString()}</span>
                    <span style={arrowStyle}>〉</span>
                  </div>
                </div>
              );
            }

            return null;
          })
        )}
      </div>

      {!isLast && items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '30px' }}>
          <button onClick={handleLoadMore} disabled={isLoading} style={loadMoreBtnStyle}>
            {isLoading ? '로딩 중...' : '활동 내역 더보기 ▼'}
          </button>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 🎨 스타일 명세 
// ==========================================
const pageContainer = { padding: '40px 20px', maxWidth: '900px', margin: '0 auto', backgroundColor: '#fdfdfd', minHeight: '100vh', fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };

const headerWrapperStyle = { marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '8px' };
const backLinkStyle = { textDecoration: 'none', color: '#adb5bd', fontSize: '14px', fontWeight: 'bold' };
const titleStyle = { color: '#212529', fontSize: '24px', fontWeight: '800', margin: 0 };

const listWrapper = { display: 'flex', flexDirection: 'column', gap: '12px' };
const listCardStyle = { display: 'flex', flexWrap: 'wrap', rowGap: '10px', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', backgroundColor: '#fff', border: '1px solid #e9ecef', borderRadius: '12px' };

const mainTitleStyle = { fontWeight: '700', color: '#212529', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left', width: '100%' };
const subContentStyle = { fontSize: '14px', color: '#868e96', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left', width: '100%' };
const postTitleInCommentStyle = { fontSize: '13px', color: '#868e96', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

const rightMetaStyle = { display: 'flex', alignItems: 'center', gap: '16px', color: '#adb5bd', fontSize: '13px', flexShrink: 0 };
const arrowStyle = { fontWeight: 'bold', fontSize: '14px', color: '#ced4da' };

const thumbnailImgStyle = { width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 };
const verifyBadgeStyle = (bg, color) => ({ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', backgroundColor: bg, color: color, display: 'inline-block' });
const iconCircleStyle = (bg, color) => ({ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: bg, color: color, display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 });

const statusBadgeStyle = (status) => ({ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', backgroundColor: status === 'CANCELED' ? '#fff5f5' : '#E6F7F1', color: status === 'CANCELED' ? '#fa5252' : '#0D7A58' });
const viewVoucherBtnStyle = { padding: '6px 12px', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' };
const cancelBtnStyle = { padding: '6px 12px', backgroundColor: '#fff', color: '#fa5252', border: '1px solid #fa5252', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' };
const disabledCancelBtnStyle = { padding: '6px 12px', backgroundColor: '#f8f9fa', color: '#adb5bd', border: '1px solid #dee2e6', borderRadius: '6px', cursor: 'not-allowed', fontSize: '12px', fontWeight: 'bold' };

const loadMoreBtnStyle = { padding: '12px 30px', backgroundColor: '#fff', border: '1px solid #dee2e6', borderRadius: '10px', color: '#16A87A', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' };
const emptyTextStyle = { textAlign: 'center', padding: '60px 0', color: '#adb5bd', fontSize: '15px' };

export default MyActivityList;