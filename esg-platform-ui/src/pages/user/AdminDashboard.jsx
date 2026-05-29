import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = user?.companyId || localStorage.getItem('companyId');

  const [activeTab, setActiveTab] = useState('POSTS'); 
  const [posts, setPosts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [postFilter, setPostFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);

  // 🔄 데이터 로딩 함수 통합
  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [postsRes, ordersRes] = await Promise.all([
        api.get('/admin/posts', { headers: { 'X-Company-Id': companyId } }),
        api.get('/market/admin/orders', { headers: { 'X-Company-Id': companyId } })
      ]);
      
      setPosts(postsRes.data.sort((a, b) => b.id - a.id));
      setOrders(ordersRes.data.content || []);
    } catch (err) {
      console.error("데이터 로드 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // 페이지 진입 시 및 컴포넌트 마운트 시 즉시 반영을 위해 호출
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- [인증글 액션] ---
  const handleApprove = async (postId) => {
    if (!window.confirm("승인하시겠습니까?")) return;
    try {
      await api.post(`/admin/posts/${postId}/approve`);
      alert("승인 완료");
      fetchData(); // 전체 데이터 갱신
    } catch (err) { alert("처리 오류"); }
  };

  const handleReject = async (postId) => {
    const reason = prompt("거절 사유:");
    if (!reason) return;
    try {
      await api.post(`/admin/posts/${postId}/reject`, { reason });
      alert("거절 완료");
      fetchData();
    } catch (err) { alert("처리 오류"); }
  };

  // --- [주문 액션] ---
  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("주문을 취소하시겠습니까?")) return;
    try {
      await api.post(`/market/admin/orders/${orderId}/cancel`, {}, {
        headers: { 'X-Company-Id': companyId }
      });
      alert("주문 취소 완료");
      fetchData();
    } catch (err) { alert("취소 실패"); }
  };

  const handleResendEmail = async (orderId) => {
    try {
      await api.post(`/market/admin/orders/${orderId}/resend`);
      alert("이메일이 재전송되었습니다.");
    } catch (err) { alert("재전송 실패"); }
  };

  const filteredPosts = posts.filter(post => {
    if (postFilter === 'ALL') return true;
    if (postFilter === 'AI_SUCCESS') return post.aiResult === 'SUCCESS';
    return post.adminStatus === postFilter;
  });

  return (
    <div style={containerStyle}>
      {/* 🚀 Header */}
      <div style={headerContainerStyle}>
        <div>
          <h1 style={dashboardTitleStyle}>관리자 대시보드</h1>
          <p style={subtitleStyle}>Green-Trace 플랫폼 통합 관리 도구</p>
        </div>
        <button onClick={() => navigate('/admin/products')} style={navToProductBtnStyle}>
          📦 상품/재고 관리 바로가기
        </button>
      </div>

      {/* 📊 Tab Bar */}
      <div style={tabBarStyle}>
        <button onClick={() => setActiveTab('POSTS')} style={tabItemStyle(activeTab === 'POSTS')}>
          📝 인증글 관리 <span style={countBadgeStyle}>{posts.length}</span>
        </button>
        <button onClick={() => setActiveTab('ORDERS')} style={tabItemStyle(activeTab === 'ORDERS')}>
          🛒 주문/결제 내역 <span style={countBadgeStyle}>{orders.length}</span>
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#339af0' }}>데이터 동기화 중...</div>}

      {/* 📝 인증글 관리 탭 */}
      {activeTab === 'POSTS' && (
        <div style={{ marginTop: '25px' }}>
          <div style={filterGroupStyle}>
            {['ALL', 'WAITING', 'APPROVED', 'REJECTED'].map(status => (
              <button
                key={status}
                onClick={() => setPostFilter(status)}
                style={filterBtnStyle(postFilter === status)}
              >
                {status}
              </button>
            ))}
          </div>

          <div style={postGridStyle}>
            {filteredPosts.map(post => (
              <div key={post.id} style={postCardStyle}>
                <div style={cardHeaderStyle}>
                  <span style={postIdStyle}>#{post.id}</span>
                  <h3 style={postTitleStyle}>{post.title}</h3>
                  <span style={statusBadge(post.adminStatus)}>{post.adminStatus}</span>
                </div>
                
                <div style={imgScrollStyle}>
                  {post.imageUrls?.map((url, i) => (
                    <img key={i} src={url} alt="인증" style={postImgStyle} />
                  ))}
                </div>

                <div style={aiAnalysisBoxStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={aiLabelStyle}>ESG 활동 분석 결과</span>
                    <span style={aiScoreStyle(post.aiScore)}>{(post.aiScore * 100).toFixed(1)}% 신뢰</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px' }}>예측 활동: <strong>{post.aiResult}</strong></p>
                </div>

                {post.adminStatus === 'WAITING' && (
                  <div style={btnGroupStyle}>
                    <button onClick={() => handleApprove(post.id)} style={approveBtnStyle}>최종 승인</button>
                    <button onClick={() => handleReject(post.id)} style={rejectBtnStyle}>반려</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🛒 주문 관리 탭 */}
      {activeTab === 'ORDERS' && (
        <div style={orderContentWrapper}>
          <table style={orderTableStyle}>
            <thead>
              <tr style={tableHeaderRowStyle}>
                <th>주문번호</th>
                <th>회원번호</th>
                <th>상품명</th>
                <th>결제금액</th>
                <th>상태</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.orderId} style={tableRowStyle}>
                  <td style={{ fontWeight: 'bold', color: '#868e96' }}>{order.orderId}</td>
                  <td>{order.memberId}</td>
                  <td style={{ textAlign: 'center' }}>{order.productName}</td>
                  <td style={{ color: '#22b8cf', fontWeight: 'bold' }}>{order.totalPrice?.toLocaleString()} P</td>
                  <td><span style={orderStatusBadge(order.status)}>{order.status}</span></td>
                  <td>
                    <button onClick={() => handleResendEmail(order.orderId)} style={actionBtnStyle('#339af0')}>재전송</button>
                    {order.status !== 'CANCELLED' && (
                      <button onClick={() => handleCancelOrder(order.orderId)} style={actionBtnStyle('#fa5252')}>취소</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// --- 스타일링 (Blue 테마 기반) ---
const containerStyle = { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#fdfdfd', minHeight: '100vh' };
const headerContainerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #eee', paddingBottom: '25px' };
const dashboardTitleStyle = { margin: 0, fontSize: '28px', fontWeight: '800', color: '#333' };
const subtitleStyle = { margin: '5px 0 0 0', color: '#adb5bd', fontSize: '15px' };

const navToProductBtnStyle = { 
  backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '12px', 
  cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 12px rgba(51, 154, 240, 0.3)', transition: '0.2s' 
};

const tabBarStyle = { display: 'flex', gap: '30px', borderBottom: '2px solid #f1f3f5', marginBottom: '20px' };
const tabItemStyle = (active) => ({
  padding: '15px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '17px', 
  fontWeight: active ? 'bold' : '500', color: active ? '#339af0' : '#adb5bd', 
  borderBottom: active ? '3px solid #339af0' : '3px solid transparent', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '10px'
});

const countBadgeStyle = { backgroundColor: '#e7f5ff', color: '#339af0', padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold' };

// --- 게시글 스타일 ---
const filterGroupStyle = { display: 'flex', gap: '10px', marginBottom: '25px' };
const filterBtnStyle = (active) => ({
  padding: '8px 20px', borderRadius: '20px', border: active ? 'none' : '1px solid #dee2e6',
  backgroundColor: active ? '#333' : '#fff', color: active ? '#fff' : '#495057', cursor: 'pointer', fontWeight: '600', fontSize: '14px'
});

const postGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' };
const postCardStyle = { backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #f1f3f5', padding: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' };
const cardHeaderStyle = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' };
const postIdStyle = { fontSize: '12px', color: '#adb5bd', fontWeight: 'bold' };
const postTitleStyle = { margin: 0, fontSize: '16px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

const imgScrollStyle = { display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '15px', paddingBottom: '5px' };
const postImgStyle = { width: '100px', height: '100px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #eee' };

const aiAnalysisBoxStyle = { backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '12px', marginBottom: '15px' };
const aiLabelStyle = { fontSize: '12px', color: '#868e96', fontWeight: 'bold' };
const aiScoreStyle = (score) => ({ fontSize: '12px', color: score >= 0.8 ? '#339af0' : '#fa5252', fontWeight: 'bold' });

const btnGroupStyle = { display: 'flex', gap: '10px' };
const approveBtnStyle = { flex: 1, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#339af0', color: '#fff', fontWeight: 'bold', cursor: 'pointer' };
const rejectBtnStyle = { flex: 1, padding: '10px', border: '1px solid #fa5252', borderRadius: '8px', backgroundColor: '#fff', color: '#fa5252', fontWeight: 'bold', cursor: 'pointer' };

const statusBadge = (status) => ({
  padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold',
  backgroundColor: status === 'APPROVED' ? '#ebfbee' : status === 'WAITING' ? '#fff9db' : '#fff5f5',
  color: status === 'APPROVED' ? '#2f9e44' : status === 'WAITING' ? '#f08c00' : '#fa5252'
});

// --- 주문 테이블 스타일 ---
const orderContentWrapper = { backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #f1f3f5', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' };
const orderTableStyle = { width: '100%', borderCollapse: 'collapse' };
const tableHeaderRowStyle = { backgroundColor: '#f8f9fa', borderBottom: '2px solid #eee', textAlign: 'center', height: '50px', fontSize: '14px', color: '#495057' };
const tableRowStyle = { borderBottom: '1px solid #f8f9fa', textAlign: 'center', height: '60px', fontSize: '14px' };

const actionBtnStyle = (color) => ({
  backgroundColor: 'transparent', border: `1px solid ${color}`, color: color, padding: '6px 12px', borderRadius: '8px', 
  cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginLeft: '5px', transition: '0.2s'
});

const orderStatusBadge = (status) => ({
  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold',
  backgroundColor: status === 'COMPLETED' ? '#e7f5ff' : '#fff5f5', color: status === 'COMPLETED' ? '#1c7ed6' : '#fa5252'
});

export default AdminDashboard;