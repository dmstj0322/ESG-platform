import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';

// 🌟 추가된 공통 서브 내비게이션
const AdminSubNav = ({ active }) => {
  const navigate = useNavigate();
  return (
    <div style={subNavContainerStyle}>
      <button onClick={() => navigate('/admin/dashboard')} style={subTabStyle(active === 'DASHBOARD')}>통합 대시보드</button>
      <button onClick={() => navigate('/admin/products')} style={subTabStyle(active === 'PRODUCTS')}>상품/재고 관리</button>
    </div>
  );
};

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = user?.companyId || localStorage.getItem('companyId');

  const [activeTab, setActiveTab] = useState('POSTS');
  const [posts, setPosts] = useState([]);
  const [orders, setOrders] = useState([]);

  // 인증글 필터링 상태
  const [postFilter, setPostFilter] = useState('ALL');

  // 주문 필터링 상태
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderCategoryFilter, setOrderCategoryFilter] = useState('ALL');

  const [loading, setLoading] = useState(false);

  // 카운트 상태
  const [totalPostsCount, setTotalPostsCount] = useState(0);
  const [allPostsCount, setAllPostsCount] = useState(0);
  const [orderTotalCount, setOrderTotalCount] = useState(0);
  const [allOrdersCount, setAllOrdersCount] = useState(0);

  // 페이지 상태
  const [postPage, setPostPage] = useState(0);
  const [postTotalPages, setPostTotalPages] = useState(1);
  const [orderPage, setOrderPage] = useState(0);
  const [orderTotalPages, setOrderTotalPages] = useState(1);

  // 관리자가 수동으로 선택한 활동 타입을 저장하는 상태
  const [selectedTypes, setSelectedTypes] = useState({});
  const [editingPostId, setEditingPostId] = useState(null);

  const getActivityName = (type) => {
    console.log("현재 전달받은 활동 타입:", type);
    const map = {
      TUMBLER: '텀블러/다회용기 사용',
      TRANSPORT: '대중교통 이용',
      RECYCLE: '분리배출',
      FAIL: '인증 실패'
    };
    return map[type] || 'ESG 활동';
  };

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      let postUrl = `/admin/posts?page=${postPage}&size=12&sort=createdDate,desc`;
      if (postFilter !== 'ALL') {
        postUrl += `&status=${postFilter}`;
      }
      let totalPostUrl = `/admin/posts?page=0&size=1`;

      let orderUrl = `/market/admin/orders?page=${orderPage}&size=10&sort=id,desc`;
      if (orderStatusFilter !== 'ALL') {
        orderUrl += `&status=${orderStatusFilter}`;
      }
      if (orderCategoryFilter !== 'ALL') {
        orderUrl += `&category=${orderCategoryFilter}`;
      }
      let totalOrderUrl = `/market/admin/orders?page=0&size=1`;

      const [postsRes, totalPostsRes, ordersRes, totalOrdersRes] = await Promise.all([
        api.get(postUrl, { headers: { 'X-Company-Id': companyId } }),
        api.get(totalPostUrl, { headers: { 'X-Company-Id': companyId } }),
        api.get(orderUrl, { headers: { 'X-Company-Id': companyId } }),
        api.get(totalOrderUrl, { headers: { 'X-Company-Id': companyId } })
      ]);

      setPosts(postsRes.data.content || []);
      setPostTotalPages(postsRes.data.totalPages || 1);
      setTotalPostsCount(postsRes.data.totalElements || 0);
      setAllPostsCount(totalPostsRes.data.totalElements || 0);

      setOrders(ordersRes.data.content || []);
      setOrderTotalPages(ordersRes.data.totalPages || 1);
      setOrderTotalCount(ordersRes.data.totalElements || 0);
      setAllOrdersCount(totalOrdersRes.data.totalElements || 0);

    } catch (err) {
      console.error("데이터 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, postPage, postFilter, orderPage, orderStatusFilter, orderCategoryFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (postId, aiPredictedType) => {
    const defaultType = (aiPredictedType && aiPredictedType !== 'FAIL') ? aiPredictedType : 'TUMBLER';
    const finalType = selectedTypes[postId] || defaultType;

    if (!window.confirm(`해당 활동을 [${finalType}] 타입으로 승인하시겠습니까?`)) return;

    try {
      await api.post(`/admin/posts/${postId}/approve`, { activityType: finalType });
      toast.success(`✅ ${finalType} 타입으로 승인되었습니다.`, { containerId: 'main-toast' });
      setSelectedTypes(prev => {
        const newState = { ...prev };
        delete newState[postId];
        return newState;
      });
      fetchData();
    } catch (err) {
      toast.error("승인 처리 중 오류가 발생했습니다.", { containerId: 'main-toast' });
    }
  };

  const handleReject = async (postId) => {
    const reason = prompt("거절 사유:");
    if (!reason) return;
    try {
      await api.post(`/admin/posts/${postId}/reject`, { reason });
      toast.success("🚫 거절되었습니다.", { containerId: 'main-toast' });
      fetchData();
    } catch (err) {
      toast.error("거절 처리 중 오류가 발생했습니다.", { containerId: 'main-toast' });
    }
  };

  const handleUpdateType = async (postId, currentType, aiResult) => {
    const fallbackType = (aiResult && aiResult !== 'FAIL') ? aiResult : 'TUMBLER';
    const newType = selectedTypes[postId] || currentType || fallbackType;

    if (!window.confirm(`활동 타입을 [${newType}]로 수정하시겠습니까?`)) return;

    try {
      await api.patch(`/admin/posts/${postId}/type`, { activityType: newType });
      toast.success(`✅ 타입이 수정되었습니다.`, { containerId: 'main-toast' });
      setEditingPostId(null);
      fetchData();
    } catch (err) {
      toast.error("수정 실패: " + (err.response?.data || "서버 오류"), { containerId: 'main-toast' });
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("주문을 취소하시겠습니까?")) return;
    try {
      await api.post(`/market/admin/orders/${orderId}/cancel`, {}, {
        headers: { 'X-Company-Id': companyId }
      });
      toast.success("📦 주문이 취소되었습니다.", { containerId: 'main-toast' });
      fetchData();
    } catch (err) {
      toast.error("취소 실패: " + (err.response?.data?.message || "오류 발생"), { containerId: 'main-toast' });
    }
  };

  const handleResendEmail = async (orderId) => {
    try {
      await api.post(`/market/admin/orders/${orderId}/resend`);
      toast.success("📧 이메일이 재전송되었습니다.", { containerId: 'main-toast' });
    } catch (err) {
      toast.error("이메일 재전송 실패", { containerId: 'main-toast' });
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPostPage(0);
    setOrderPage(0);
    setPostFilter('ALL');
    setOrderStatusFilter('ALL');
    setOrderCategoryFilter('ALL');
  };

  return (
    <div style={containerStyle}>
      {/* 🌟 수정완료: 이제 기존 버튼 대신 탭이 상단에 배치됩니다! */}
      <AdminSubNav active="DASHBOARD" />

      <div style={headerContainerStyle}>
        <div>
          <h1 style={dashboardTitleStyle}>관리자 전체 관리</h1>
          <p style={subtitleStyle}>Green-Trace 플랫폼 통합 관리 도구</p>
        </div>
      </div>

      <div style={tabBarStyle}>
        <button onClick={() => handleTabChange('POSTS')} style={tabItemStyle(activeTab === 'POSTS')}>
          📝 인증글 관리 <span style={countBadgeStyle}>{allPostsCount}</span>
        </button>
        <button onClick={() => handleTabChange('ORDERS')} style={tabItemStyle(activeTab === 'ORDERS')}>
          🛒 주문/결제 내역 <span style={countBadgeStyle}>{allOrdersCount}</span>
        </button>
      </div>

      {activeTab === 'POSTS' && (
        <div style={{ marginTop: '25px' }}>
          <div style={filterGroupStyle}>
            {['ALL', 'WAITING', 'APPROVED', 'REJECTED'].map(status => (
              <button key={status} onClick={() => { setPostFilter(status); setPostPage(0); }} style={filterBtnStyle(postFilter === status)}>
                {status}
              </button>
            ))}
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#16A87A' }}>데이터 동기화 중...</div>}

          <div style={{ marginBottom: '15px', fontSize: '14px', color: '#868e96' }}>
            필터링된 항목: <strong>{totalPostsCount}</strong>건
          </div>

          <div style={postGridStyle}>
            {posts.map(post => {
              const isEditing = editingPostId === post.id;

              return (
                <div key={post.id} style={postCardStyle}>
                  <div style={cardHeaderStyle}>
                    <span style={postIdStyle}>#{post.id}</span>
                    <h3 style={postTitleStyle}>{post.title}</h3>
                    <span style={statusBadge(post.adminStatus)}>{post.adminStatus}</span>
                  </div>

                  <div style={imgScrollStyle}>
                    {post.imageUrls?.map((url, i) => <img key={i} src={url} alt="인증" style={postImgStyle} />)}
                  </div>

                  <div style={aiAnalysisBoxStyle}>
                    <div style={{ marginBottom: '10px' }}>
                      <span style={aiLabelStyle}>👤 사용자 선택 활동</span>
                      <p style={{ margin: '4px 0', fontSize: '14px', fontWeight: 'bold', color: '#0D7A58' }}>
                        {getActivityName(post.activityType)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={aiLabelStyle}>🤖 AI 분석 결과</span>
                      <span style={aiScoreStyle(post.aiScore)}>{(post.aiScore * 100).toFixed(1)}% 신뢰</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#495057' }}>예측 활동: <strong>{getActivityName(post.aiResult)}</strong></p>
                  </div>

                  <div style={unifiedBoxStyle(post.adminStatus, isEditing)}>
                    {post.adminStatus === 'WAITING' && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '13px', color: '#495057', fontWeight: 'bold', minWidth: '55px' }}>분류 지정</span>
                          <select
                            style={unifiedSelectStyle}
                            value={selectedTypes[post.id] || (post.aiResult !== 'FAIL' ? post.aiResult : 'TUMBLER')}
                            onChange={(e) => setSelectedTypes(prev => ({ ...prev, [post.id]: e.target.value }))}
                          >
                            <option value="TUMBLER">텀블러/다회용기 (300g)</option>
                            <option value="TRANSPORT">대중교통 (1500g)</option>
                            <option value="RECYCLE">분리배출 (500g)</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleApprove(post.id, post.aiResult)} style={{ ...unifiedBtnStyle, backgroundColor: '#16A87A', color: '#fff' }}>승인</button>
                          <button onClick={() => handleReject(post.id)} style={{ ...unifiedBtnStyle, backgroundColor: '#fff', color: '#fa5252', border: '1px solid #fa5252' }}>반려</button>
                        </div>
                      </>
                    )}

                    {post.adminStatus === 'APPROVED' && (
                      isEditing ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '13px', color: '#495057', fontWeight: 'bold', minWidth: '55px' }}>분류 수정</span>
                            <select
                              style={unifiedSelectStyle}
                              value={selectedTypes[post.id] || post.activityType || (post.aiResult && post.aiResult !== 'FAIL' ? post.aiResult : 'TUMBLER')}
                              onChange={(e) => setSelectedTypes(prev => ({ ...prev, [post.id]: e.target.value }))}
                            >
                              <option value="TUMBLER">텀블러/다회용기 (300g)</option>
                              <option value="TRANSPORT">대중교통 (1500g)</option>
                              <option value="RECYCLE">분리배출 (500g)</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                handleUpdateType(post.id, post.activityType, post.aiResult);
                                setEditingPostId(null);
                              }}
                              style={{ ...unifiedBtnStyle, backgroundColor: '#16A87A', color: '#fff' }}
                            >확인</button>
                            <button
                              onClick={() => setEditingPostId(null)}
                              style={{ ...unifiedBtnStyle, backgroundColor: '#fff', color: '#868e96', border: '1px solid #dee2e6' }}
                            >취소</button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                          <span style={{ fontSize: '14px', color: '#0D7A58', fontWeight: 'bold' }}>✓ {getActivityName(post.activityType)}</span>
                          <button
                            onClick={() => setEditingPostId(post.id)}
                            style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #16A87A', color: '#16A87A', backgroundColor: '#fff', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            타입 수정
                          </button>
                        </div>
                      )
                    )}

                    {post.adminStatus === 'REJECTED' && post.rejectionReason && (
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontSize: '14px', color: '#c92a2a', fontWeight: 'bold' }}>
                          ❌ 반려 사유: <span style={{ fontWeight: 'normal', color: '#495057' }}>{post.rejectionReason}</span>
                        </span>
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
          </div>

          {postTotalPages > 1 && (
            <div style={paginationContainerStyle}>
              <button disabled={postPage === 0} onClick={() => setPostPage(p => p - 1)} style={pageBtnStyle(postPage === 0)}>이전</button>
              <span style={pageInfoStyle}>{postPage + 1} / {postTotalPages}</span>
              <button disabled={postPage === postTotalPages - 1} onClick={() => setPostPage(p => p + 1)} style={pageBtnStyle(postPage === postTotalPages - 1)}>다음</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'ORDERS' && (
        <div style={{ marginTop: '25px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '25px' }}>
            <div style={orderFilterGroupStyle}>
              <span style={filterLabelStyle}>상태:</span>
              <button onClick={() => { setOrderStatusFilter('ALL'); setOrderPage(0); }} style={filterBtnStyle(orderStatusFilter === 'ALL')}>전체보기</button>
              <button onClick={() => { setOrderStatusFilter('COMPLETED'); setOrderPage(0); }} style={filterBtnStyle(orderStatusFilter === 'COMPLETED')}>🔵 주문 완료</button>
              <button onClick={() => { setOrderStatusFilter('CANCELED'); setOrderPage(0); }} style={filterBtnStyle(orderStatusFilter === 'CANCELED')}>🔴 취소됨</button>
            </div>
            <div style={orderFilterGroupStyle}>
              <span style={filterLabelStyle}>분류:</span>
              <button onClick={() => { setOrderCategoryFilter('ALL'); setOrderPage(0); }} style={filterBtnStyle(orderCategoryFilter === 'ALL')}>전체보기</button>
              <button onClick={() => { setOrderCategoryFilter('GIFTICON'); setOrderPage(0); }} style={filterBtnStyle(orderCategoryFilter === 'GIFTICON')}>🎁 기프티콘</button>
              <button onClick={() => { setOrderCategoryFilter('DONATION'); setOrderPage(0); }} style={filterBtnStyle(orderCategoryFilter === 'DONATION')}>🤝 기부 캠페인</button>
            </div>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#16A87A' }}>데이터 동기화 중...</div>}

          <div style={{ marginBottom: '15px', fontSize: '14px', color: '#868e96' }}>
            필터링된 항목: <strong>{orderTotalCount}</strong>건
          </div>

          <div style={orderContentWrapper}>
            <table style={orderTableStyle}>
              <thead>
                <tr style={tableHeaderRowStyle}>
                  <th>주문번호</th>
                  <th>주문자</th>
                  <th>상품명</th>
                  <th>카테고리</th>
                  <th>결제금액</th>
                  <th>주문 일시</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {orders.length > 0 ? (
                  orders.map(order => (
                    <tr key={order.orderId} style={tableRowStyle}>
                      <td style={{ fontWeight: 'bold', color: '#868e96' }}>{order.orderId}</td>
                      <td style={{ color: '#495057' }}>{order.nickname} ({order.memberId})</td>
                      <td style={{ textAlign: 'center', color: '#333', fontWeight: '500' }}>{order.productName}</td>
                      <td>{order.category === 'GIFTICON' ? '🎁 기프티콘' : '🤝 기부 캠페인'}</td>
                      <td style={{ color: '#16A87A', fontWeight: 'bold' }}>{order.totalPrice?.toLocaleString()} P</td>
                      <td style={{ color: '#868e96', fontSize: '13px' }}>
                        {order.createdDate ? new Date(order.createdDate).toLocaleString() : '-'}
                      </td>
                      <td><span style={orderStatusBadge(order.status)}>{order.status}</span></td>
                      <td>
                        {order.status !== 'CANCELED' ? (
                          <>
                            <button onClick={() => handleResendEmail(order.orderId)} style={actionBtnStyle('#16A87A')}>재전송</button>
                            <button onClick={() => handleCancelOrder(order.orderId)} style={actionBtnStyle('#fa5252')}>취소</button>
                          </>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#adb5bd', fontStyle: 'italic' }}>처리 불가</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" style={{ padding: '40px', color: '#adb5bd', textAlign: 'center' }}>해당 조건에 맞는 주문 내역이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>

            {orderTotalPages > 1 && (
              <div style={paginationContainerStyle}>
                <button disabled={orderPage === 0} onClick={() => setOrderPage(p => p - 1)} style={pageBtnStyle(orderPage === 0)}>이전</button>
                <span style={pageInfoStyle}>{orderPage + 1} / {orderTotalPages}</span>
                <button disabled={orderPage === orderTotalPages - 1} onClick={() => setOrderPage(p => p + 1)} style={pageBtnStyle(orderPage === orderTotalPages - 1)}>다음</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- 스타일링 속성 명세 ---
const unifiedBoxStyle = (status, isEditing) => {
  const isLarge = status === 'WAITING' || isEditing;
  return {
    marginTop: '15px',
    padding: isLarge ? '14px 16px' : '0 16px',
    height: isLarge ? 'auto' : '52px',
    minHeight: isLarge ? '96px' : '52px',
    borderRadius: '12px',
    border: '1px solid',
    borderColor: status === 'APPROVED' ? '#d0ffdb' : status === 'WAITING' ? '#ffec99' : '#ffc9c9',
    backgroundColor: status === 'APPROVED' ? '#f1fff8' : status === 'WAITING' ? '#fff9db' : '#fff5f5',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '10px'
  };
};

const unifiedSelectStyle = {
  flex: 1, height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #16A87A', fontSize: '13px', color: '#495057', backgroundColor: '#fff', outline: 'none', cursor: 'pointer'
};

const unifiedBtnStyle = {
  flex: 1, height: '38px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s'
};

// 🌟 추가된 내비게이션 스타일 
const subNavContainerStyle = { display: 'flex', gap: '30px', marginBottom: '30px', borderBottom: '2px solid #f1f5f3' };
const subTabStyle = (active) => ({ padding: '10px 5px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: active ? '700' : '500', color: active ? '#16A87A' : '#868e96', borderBottom: active ? '3px solid #16A87A' : 'none' });

const containerStyle = { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#fdfdfd', minHeight: '100vh' };
const headerContainerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #eee', paddingBottom: '25px' };
const dashboardTitleStyle = { margin: 0, fontSize: '28px', fontWeight: '800', color: '#333' };
const subtitleStyle = { margin: '5px 0 0 0', color: '#adb5bd', fontSize: '15px' };

const tabBarStyle = { display: 'flex', gap: '30px', borderBottom: '2px solid #f1f5f3', marginBottom: '20px' };
const tabItemStyle = (active) => ({ padding: '15px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '17px', fontWeight: active ? 'bold' : '500', color: active ? '#16A87A' : '#adb5bd', borderBottom: active ? '3px solid #16A87A' : 'none' });

const countBadgeStyle = { backgroundColor: '#E6F7F1', color: '#16A87A', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold' };

const filterGroupStyle = { display: 'flex', gap: '10px', marginBottom: '25px' };
const orderFilterGroupStyle = { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' };
const filterLabelStyle = { fontSize: '14px', fontWeight: 'bold', color: '#495057', minWidth: '45px' };

const filterBtnStyle = (active) => ({
  padding: '8px 20px', borderRadius: '20px', border: active ? 'none' : '1px solid #dee6e3',
  backgroundColor: active ? '#16A87A' : '#fff', color: active ? '#fff' : '#495057', cursor: 'pointer', fontWeight: '600', fontSize: '14px'
});

const postGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' };
const postCardStyle = { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1fff8', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const cardHeaderStyle = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' };
const postIdStyle = { fontSize: '12px', color: '#adb5bd', fontWeight: 'bold' };
const postTitleStyle = { margin: 0, fontSize: '16px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#212529' };

const imgScrollStyle = { display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '15px', paddingBottom: '5px' };
const postImgStyle = { width: '100px', height: '100px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #eee' };

const aiAnalysisBoxStyle = { backgroundColor: '#f8fffb', padding: '12px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #d3f9d8' };
const aiLabelStyle = { fontSize: '12px', color: '#868e96', fontWeight: 'bold' };
const aiScoreStyle = (score) => ({ fontSize: '12px', color: score >= 0.8 ? '#16A87A' : '#fa5252', fontWeight: 'bold' });

const statusBadge = (status) => ({
  padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold',
  backgroundColor: status === 'APPROVED' ? '#E6F7F1' : status === 'WAITING' ? '#fff9db' : '#fff5f5',
  color: status === 'APPROVED' ? '#16A87A' : status === 'WAITING' ? '#f08c00' : '#fa5252'
});

const orderContentWrapper = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  border: '1px solid #f1fff8',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  overflow: 'hidden'
};

const orderTableStyle = { width: '100%', borderCollapse: 'collapse' };
const tableHeaderRowStyle = { backgroundColor: '#f1fff8', textAlign: 'center', height: '50px', fontSize: '14px', color: '#495057', borderBottom: '2px solid #eee' };
const tableRowStyle = { borderBottom: '1px solid #f1fff8', textAlign: 'center', height: '60px', fontSize: '14px' };

const actionBtnStyle = (color) => ({
  backgroundColor: 'transparent', border: `1px solid ${color}`, color: color, padding: '6px 12px', borderRadius: '8px',
  cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginLeft: '5px', transition: '0.2s'
});

const orderStatusBadge = (status) => ({
  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold',
  backgroundColor: status === 'COMPLETED' ? '#E6F7F1' : '#fff5f5', color: status === 'COMPLETED' ? '#16A87A' : '#fa5252'
});

const paginationContainerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0', gap: '20px' };
const pageBtnStyle = (disabled) => ({
  padding: '8px 16px', borderRadius: '10px', border: '1px solid #dee6e3', backgroundColor: disabled ? '#f1fff8' : '#fff',
  color: disabled ? '#adb5bd' : '#16A87A', cursor: disabled ? 'default' : 'pointer', fontWeight: 'bold', transition: '0.2s'
});
const pageInfoStyle = { fontSize: '15px', fontWeight: '600', color: '#495057' };

export default AdminDashboard;