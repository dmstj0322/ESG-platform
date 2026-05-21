import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

// 🌟 게시글 심사 상태에 대한 텍스트 및 디자인 설정을 단일 객체로 통합 관리
const POST_STATUS_CONFIG = {
  WAITING: { text: '⏳ 대기 중', color: '#fd7e14', bgColor: '#fff4e6' },
  APPROVED: { text: '✅ 승인됨', color: '#2b8a3e', bgColor: '#ebfbee' },
  REJECTED: { text: '❌ 관리자 반려', color: '#e03131', bgColor: '#fff5f5' },
  AUTO_REJECTED: { text: '🤖❌ AI 자동 반려', color: '#c92a2a', bgColor: '#fff0f0' }
};

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = user?.companyId || localStorage.getItem('companyId');

  const [activeTab, setActiveTab] = useState('POSTS'); // POSTS 또는 ORDERS
  const [posts, setPosts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [postFilter, setPostFilter] = useState('ALL'); // ALL, WAITING, APPROVED, REJECTED, AUTO_REJECTED
  const [loading, setLoading] = useState(false);

  // 원본 대시보드2 카운트 상태 복구
  const [totalPostsCount, setTotalPostsCount] = useState(0);
  const [orderTotalCount, setOrderTotalCount] = useState(0);

  // 페이지네이션 상태
  const [postPage, setPostPage] = useState(1); // 프론트엔드 페이징용 (1부터 시작)
  const [orderPage, setOrderPage] = useState(0); // 백엔드 페이징용 (Spring은 0부터 시작)
  const [orderTotalPages, setOrderTotalPages] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const activityMap = {
    'TUMBLER': '🥤 텀블러 사용',
    'tumbler': '🥤 텀블러 사용',
    'TRANSPORT': '🚲 대중교통 이용',
    'transport': '🚲 대중교통 이용',
    'RECYCLE': '♻️ 분리배출',
    'recycle': '♻️ 분리배출',
    'FAIL': '❌ 인증 실패',
    'fail': '❌ 인증 실패'
  };

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [postsRes, ordersRes] = await Promise.all([
         api.get('/admin/posts', { headers: { 'X-Company-Id': companyId } }),
        api.get(`/market/admin/orders?page=${orderPage}&size=10&sort=id,desc`, { headers: { 'X-Company-Id': companyId } })
      ]);
      
      // 원본 데이터 주입 로직 복구
      const postData = postsRes.data.content || postsRes.data || [];
      setPosts(postData);
      setTotalPostsCount(postsRes.data.totalElements || postData.length);
      
      setOrders(ordersRes.data.content || []);
      setOrderTotalPages(ordersRes.data.totalPages || 1);
      setOrderTotalCount(ordersRes.data.totalElements || 0);
    } catch (err) {
      console.error("대시보드 데이터 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, orderPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 🌟 통합 객체를 사용하는 배지 렌더러
  const renderAdminStatusBadge = (status) => {
    const config = POST_STATUS_CONFIG[status] || { text: '⏳ 대기 중', color: '#fd7e14', bgColor: '#fff4e6' };
    return (
      <span style={{
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 'bold',
        color: config.color,
        backgroundColor: config.bgColor,
        border: `1px solid ${config.color}30`,
        display: 'inline-block',
        textAlign: 'center'
      }}>
        {config.text}
      </span>
    );
  };

  const handleApprove = async (postId) => {
    if (!window.confirm("이 활동 인증을 승인하시겠습니까? 포인트가 즉시 지급됩니다.")) return;
    try {
      await api.post(`/admin/posts/${postId}/approve`);
      alert("성공적으로 승인되었습니다.");
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || "승인 처리 중 오류가 발생했습니다.");
    }
  };

  const handleReject = async (postId) => {
    const reason = prompt("반려 사유를 입력해주세요:");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("반려 사유는 필수 입력 사항입니다.");
      return;
    }

    try {
      await api.post(`/admin/posts/${postId}/reject`, { reason });
      alert("반려 처리가 완료되었습니다.");
      fetchData();
    } catch (err) {
      alert("반려 처리 중 오류가 발생했습니다.");
    }
  };

  // 게시글 필터링 로직
  const filteredPosts = posts.filter(post => {
    if (postFilter === 'ALL') return true;
    return post.adminStatus === postFilter;
  });

  // 프론트엔드 페이징 계산
  const indexOfLastPost = postPage * ITEMS_PER_PAGE;
  const indexOfFirstPost = indexOfLastPost - ITEMS_PER_PAGE;
  const currentPosts = filteredPosts.slice(indexOfFirstPost, indexOfLastPost);
  const totalPostPages = Math.ceil(filteredPosts.length / ITEMS_PER_PAGE);

  if (loading) return <div style={{ padding: '50px', textAlign: 'center', fontWeight: 'bold' }}>데이터를 불러오는 중입니다...</div>;

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>🛡️ 관리자 어드민 대시보드</h2>
      
      {/* 탭 메뉴 카운트 노출 정상화 */}
      <div style={tabWrapperStyle}>
        <button 
          style={tabBtnStyle(activeTab === 'POSTS')} 
          onClick={() => setActiveTab('POSTS')}
        >
          📸 인증 게시글 관리 ({totalPostsCount})
        </button>
        <button 
          style={tabBtnStyle(activeTab === 'ORDERS')} 
          onClick={() => setActiveTab('ORDERS')}
        >
          📦 상품/기부 주문 관리 ({orderTotalCount})
        </button>
      </div>

      {/* 1. 게시글 관리 탭 */}
      {activeTab === 'POSTS' && (
        <div>
          <div style={filterContainerStyle}>
            <button style={filterBtnStyle(postFilter === 'ALL')} onClick={() => { setPostFilter('ALL'); setPostPage(1); }}>전체보기</button>
            <button style={filterBtnStyle(postFilter === 'WAITING')} onClick={() => { setPostFilter('WAITING'); setPostPage(1); }}>⏳ 대기 중</button>
            <button style={filterBtnStyle(postFilter === 'APPROVED')} onClick={() => { setPostFilter('APPROVED'); setPostPage(1); }}>✅ 승인됨</button>
            <button style={filterBtnStyle(postFilter === 'REJECTED')} onClick={() => { setPostFilter('REJECTED'); setPostPage(1); }}>❌ 관리자 반려</button>
            <button style={filterBtnStyle(postFilter === 'AUTO_REJECTED')} onClick={() => { setPostFilter('AUTO_REJECTED'); setPostPage(1); }}>🤖 AI 자동 반려</button>
          </div>

          <div style={cardStyle}>
            <table style={tableStyle}>
              <thead>
                <tr style={tableHeaderRowStyle}>
                  <th style={{ width: '80px' }}>Post ID</th>
                  <th style={{ width: '120px' }}>작성자</th>
                  <th>제목 및 내용</th>
                  <th style={{ width: '150px' }}>인증 분류</th>
                  <th style={{ width: '90px' }}>AI 점수</th>
                  <th style={{ width: '150px' }}>심사 상태</th>
                  <th style={{ width: '150px' }}>관리 기능</th>
                </tr>
              </thead>
              <tbody>
                {currentPosts.length > 0 ? (
                  currentPosts.map((post) => (
                    <tr key={post.id} style={tableRowStyle}>
                      <td>{post.id}</td>
                      <td>
                        <span style={{ fontWeight: '600' }}>{post.nickname || `유저 #${post.memberId}`}</span>
                      </td>
                      <td style={{ textAlign: 'left', padding: '12px' }}>
                        <div style={{ fontWeight: 'bold', color: '#212529', marginBottom: '4px', cursor: 'pointer' }} onClick={() => navigate(`/posts/${post.id}`)}>
                          {post.title}
                        </div>
                        <div style={{ fontSize: '13px', color: '#868e96', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                          {post.content}
                        </div>
                        {['REJECTED', 'AUTO_REJECTED'].includes(post.adminStatus) && post.rejectionReason && (
                          <div style={rejectionReasonMiniStyle}>
                            <b>사유:</b> {post.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td>{activityMap[post.aiResult] || activityMap[post.aiResult?.toLowerCase()] || '🌱 미분류 활동'}</td>
                      <td style={{ fontWeight: '600', color: post.aiScore >= 0.8 ? '#339af0' : '#fa5252' }}>
                        {post.aiScore != null ? post.aiScore.toFixed(2) : '-'}
                      </td>
                      <td>{renderAdminStatusBadge(post.adminStatus)}</td>
                      <td>
                        {post.adminStatus === 'WAITING' ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button style={actionBtnStyle('#339af0')} onClick={() => handleApprove(post.id)}>승인</button>
                            <button style={actionBtnStyle('#fa5252')} onClick={() => handleReject(post.id)}>반려</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#adb5bd' }}>처리가 완료됨</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" style={{ padding: '40px', color: '#adb5bd', textAlign: 'center' }}>해당 조건에 부합하는 인증 정보가 존재하지 않습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPostPages > 1 && (
            <div style={paginationContainerStyle}>
              <button disabled={postPage === 1} style={pageBtnStyle} onClick={() => setPostPage(prev => prev - 1)}>이전</button>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>{postPage} / {totalPostPages}</span>
              <button disabled={postPage === totalPostPages} style={pageBtnStyle} onClick={() => setPostPage(prev => prev + 1)}>다음</button>
            </div>
          )}
        </div>
      )}

      {/* 2. 주문 관리 탭 */}
      {activeTab === 'ORDERS' && (
        <div style={cardStyle}>
          <table style={orderTableStyle}>
            <thead>
              <tr style={tableHeaderRowStyle}>
                <th style={{ width: '90px' }}>주문 번호</th>
                <th>상품명</th>
                <th style={{ width: '120px' }}>카테고리</th>
                <th style={{ width: '100px' }}>소요 포인트</th>
                <th style={{ width: '150px' }}>주문 상태</th>
              </tr>
            </thead>
            <tbody>
              {orders.length > 0 ? (
                orders.map((order) => (
                  <tr key={order.id} style={tableRowStyle}>
                    <td>{order.id}</td>
                    <td style={{ textAlign: 'left', paddingLeft: '20px', fontWeight: '500' }}>{order.productName}</td>
                    <td>{order.category === 'GIFTICON' ? '🎟️ 기프티콘' : '❤️ 기부 후원'}</td>
                    <td style={{ fontWeight: 'bold', color: '#495057' }}>{order.pointPrice?.toLocaleString()} P</td>
                    <td>
                      <span style={{
                        padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold',
                        backgroundColor: order.status === 'COMPLETED' ? '#e7f5ff' : '#fff5f5',
                        color: order.status === 'COMPLETED' ? '#339af0' : '#fa5252'
                      }}>
                        {order.status === 'COMPLETED' ? '주문 완료' : '취소됨'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ padding: '40px', color: '#adb5bd', textAlign: 'center' }}>인입된 주문 내역 기록이 비어있습니다.</td>
                </tr>
              )}
            </tbody>
          </table>

          {orderTotalPages > 1 && (
            <div style={paginationContainerStyle}>
              <button disabled={orderPage === 0} style={pageBtnStyle} onClick={() => setOrderPage(prev => prev - 1)}>이전</button>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#495057' }}>{orderPage + 1} / {orderTotalPages}</span>
              <button disabled={orderPage === orderTotalPages - 1} style={pageBtnStyle} onClick={() => setOrderPage(prev => prev + 1)}>다음</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 스타일 가이드 라인 복구
const containerStyle = { maxWidth: '1100px', margin: '40px auto', padding: '0 20px', textAlign: 'left' };
const titleStyle = { fontSize: '26px', fontWeight: '800', color: '#212529', marginBottom: '25px' };
const tabWrapperStyle = { display: 'flex', gap: '10px', marginBottom: '25px', borderBottom: '2px solid #dee2e6' };
const tabBtnStyle = (active) => ({
  padding: '12px 24px', border: 'none', background: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
  color: active ? '#339af0' : '#868e96', borderBottom: active ? '3px solid #339af0' : '3px solid transparent', marginBottom: '-2px', transition: '0.15s ease'
});
const filterContainerStyle = { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' };
const filterBtnStyle = (active) => ({
  padding: '8px 16px', borderRadius: '20px', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: '600',
  backgroundColor: active ? '#339af0' : '#e9ecef', color: active ? '#fff' : '#495057', transition: '0.15s ease'
});
const cardStyle = { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '14px' };
const orderTableStyle = { width: '100%', borderCollapse: 'collapse' };
const tableHeaderRowStyle = { backgroundColor: '#f8f9fa', height: '48px', color: '#495057', borderBottom: '1px solid #dee2e6', textAlign: 'center' };
const tableRowStyle = { borderBottom: '1px solid #f1f3f5', height: '56px', textAlign: 'center', transition: 'background-color 0.15s' };
const actionBtnStyle = (color) => ({
  backgroundColor: 'transparent', border: `1px solid ${color}`, color: color, padding: '5px 10px', borderRadius: '6px',
  cursor: 'pointer', fontSize: '12px', fontWeight: '700', transition: 'all 0.2s', marginLeft: '5px'
});
const rejectionReasonMiniStyle = { marginTop: '4px', fontSize: '12px', color: '#e03131', backgroundColor: '#fff5f5', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' };
const paginationContainerStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '25px' };
const pageBtnStyle = { padding: '6px 12px', border: '1px solid #ced4da', backgroundColor: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' };

export default AdminDashboard;