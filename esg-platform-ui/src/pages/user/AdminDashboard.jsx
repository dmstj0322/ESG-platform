import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyId = user?.companyId || localStorage.getItem('companyId');

  const [activeTab, setActiveTab] = useState('POSTS'); // 'POSTS' 또는 'ORDERS'
  const [posts, setPosts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [postFilter, setPostFilter] = useState('ALL');

  // // --- [상태] 상품(Products) 관련 ---
  // const [products, setProducts] = useState([]);
  // const [productForm, setProductForm] = useState({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0 });
  // const [file, setFile] = useState(null); // 이미지 파일
  // const [voucherText, setVoucherText] = useState(""); // 핀번호 텍스트
  // const [isProductEdit, setIsProductEdit] = useState(false);
  // const [editProductId, setEditProductId] = useState(null);

  // --- [초기 로드] ---
  useEffect(() => {
    if (activeTab === 'POSTS') fetchAllPosts();
    if (activeTab === 'ORDERS') fetchAllOrders();
  }, [activeTab, companyId]);

  const fetchAllPosts = async () => {
    try {
      const res = await api.get('/admin/posts', { headers: { 'X-Company-Id': companyId } });
      const sortedData = res.data.sort((a, b) => b.id - a.id);
      setPosts(sortedData);
    } catch (err) { alert("인증글 목록을 불러오는데 실패했습니다."); }
  };

  const fetchAllOrders = async () => {
    try {
      const res = await api.get('/market/admin/orders', { headers: { 'X-Company-Id': companyId } });
      setOrders(res.data.content);
    } catch (err) { console.error("주문 목록을 불러오는데 실패했습니다."); }
  };

  const handleApprove = async (postId) => {
    if (!window.confirm("정말 승인하시겠습니까?")) return;
    try {
      await api.post(`/admin/posts/${postId}/approve`);
      alert("승인되었습니다!");
      fetchAllPosts();
    } catch (err) { alert("승인 처리 중 오류 발생"); }
  };

  const handleReject = async (postId) => {
    const reason = prompt("거절 사유를 입력하세요:");
    if (!reason) return;
    try {
      await api.post(`/admin/posts/${postId}/reject`, { reason });
      alert("거절되었습니다.");
      fetchAllPosts();
    } catch (err) { alert("거절 처리 중 오류 발생"); }
  };

  const filteredPosts = posts.filter(post => {
    if (postFilter === 'ALL') return true;
    if (postFilter === 'AI_SUCCESS') return post.aiResult === 'SUCCESS';
    return post.adminStatus === postFilter;
  });

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm("정말 이 주문을 취소하시겠습니까?")) return;
    try {
      await api.post(`/market/admin/orders/${orderId}/cancel`, {
        headers: { 'X-Company-Id': companyId }
      });
      alert("주문이 취소되었습니다.");
      fetchAllOrders();
    } catch (err) {
      alert("취소 처리에 실패했습니다.");
    }
  };

  // --- 바우처 메일 재전송 ---
  const handleResendEmail = async (orderId) => {
    try {
      await api.post(`/market/admin/orders/${orderId}/resend`);
      alert("바우처 재전송 요청을 보냈습니다.");
    } catch (err) {
      alert("재전송 실패");
    }
  };

  // const fetchProducts = async () => {
  //   try {
  //     const res = await api.get('/market/products', { headers: { 'X-Company-Id': companyId } });
  //     setProducts(res.data.content || []);
  //   } catch (err) { console.error("상품 목록 로드 실패", err); }
  // };

  // const handleProductSubmit = async (e) => {
  //   e.preventDefault();
  //   try {
  //     const formData = new FormData();

  //     // 1. 파일 첨부
  //     if (file) formData.append("file", file);

  //     // 2. JSON 데이터(DTO) 첨부
  //     formData.append("dto", new Blob([JSON.stringify(productForm)], { type: "application/json" }));

  //     // 3. 핀번호 리스트 첨부 (기프티콘일 경우에만)
  //     if (!isProductEdit && productForm.category === 'GIFTICON' && voucherText) {
  //       const vouchers = voucherText.split('\n').filter(v => v.trim() !== "");
  //       vouchers.forEach(v => formData.append("vouchers", v));
  //     }

  //     if (isProductEdit) {
  //       // 수정 (단순 정보 수정)
  //       await api.put(`/market/admin/products/${editProductId}`, productForm, { headers: { 'X-Company-Id': companyId } });
  //       alert("상품이 수정되었습니다.");
  //     } else {
  //       // 신규 등록 (Multipart)
  //       await api.post('/market/admin/products', formData, { 
  //         headers: { 
  //           'X-Company-Id': companyId
  //         } 
  //       });
  //       alert("상품 및 바우처가 성공적으로 등록되었습니다!");
  //     }

  //     // 폼 초기화
  //     setProductForm({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0 });
  //     setFile(null);
  //     setVoucherText("");
  //     setIsProductEdit(false);
  //     setEditProductId(null);
  //     fetchProducts();
  //   } catch (err) {
  //     alert("상품 처리 실패: " + (err.response?.data?.message || err.message));
  //   }
  // };

  // const startProductEdit = (p) => {
  //   setProductForm({ name: p.name, price: p.price, content: p.content, category: p.category, stock: p.stock });
  //   setEditProductId(p.id);
  //   setIsProductEdit(true);
  //   window.scrollTo(0, 0); // 폼으로 화면 올리기
  // };

  // const handleProductDelete = async (id) => {
  //   if (!window.confirm("정말 이 상품을 삭제하시겠습니까?")) return;
  //   try {
  //     await api.delete(`/market/admin/products/${id}`, { headers: { 'X-Company-Id': companyId } });
  //     alert("삭제되었습니다.");
  //     fetchProducts();
  //   } catch (err) { alert("삭제 실패"); }
  // };

  console.log(orders);

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>

      {/* --- 고도화된 헤더 --- */}
      <div style={headerContainerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#333' }}>관리자 대시보드</h1>
          <p style={{ margin: '5px 0 0 0', color: '#888', fontSize: '14px' }}>플랫폼 운영 및 주문 현황을 관리합니다.</p>
        </div>
        <button onClick={() => navigate('/admin/products')} style={navToProductBtnStyle}>
          📦 상품 등록 및 재고 관리
        </button>
      </div>

      {/* --- 세련된 탭 바 --- */}
      <div style={tabBarStyle}>
        <button onClick={() => setActiveTab('POSTS')} style={tabItemStyle(activeTab === 'POSTS')}>
          📝 인증글 관리 <span style={countBadgeStyle}>{posts.length}</span>
        </button>
        <button onClick={() => setActiveTab('ORDERS')} style={tabItemStyle(activeTab === 'ORDERS')}>
          🛒 주문 내역 <span style={countBadgeStyle}>{orders.length}</span>
        </button>
      </div>

      {/* --- 대시보드 헤더 및 탭 --- */}
      {/* <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2>⚙️ 통합 관리자 대시보드</h2>
        <button onClick={() => navigate('/admin/products')} style={navToProductBtnStyle}>
          📦 상품 등록 및 관리
        </button>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setActiveTab('POSTS')} style={tabBtnStyle(activeTab === 'POSTS')}>
            📝 인증글 관리
          </button>
          <button onClick={() => setActiveTab('ORDERS')} style={tabBtnStyle(activeTab === 'ORDERS')}>
            🛒 주문 관리
          </button>
        </div>
      </header> */}

      {activeTab === 'POSTS' && (
        <div>
          <div style={{ marginTop: '20px', marginBottom: '20px' }}>
            {['ALL', 'WAITING', 'APPROVED', 'REJECTED'].map(status => (
              <button
                key={status}
                onClick={() => setPostFilter(status)}
                style={{ ...filterBtnStyle, backgroundColor: postFilter === status ? '#333' : '#fff', color: postFilter === status ? '#fff' : '#333' }}
              >
                {status}
              </button>
            ))}
          </div>
          {filteredPosts.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '50px', color: '#888' }}>해당 조건의 게시글이 없습니다.</p>
          ) : (
            filteredPosts.map(post => (
              <div key={post.id} style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '20px', marginBottom: '15px', backgroundColor: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>{post.title}</h3>
                  {post.aiScore >= 0.8 && (
                    <span style={aiBadgeStyle}>AI 분석 성공</span>
                  )}
                </div>
                <p style={{ margin: '0 0 15px 0', color: '#666' }}>작성자 ID: {post.memberId}</p>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  {post.imageUrls && post.imageUrls.map((url, index) => (
                    <img key={index} src={url} alt="인증샷" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }} />
                  ))}
                </div>
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                  <p style={{ margin: '0 0 5px 0' }}>🤖 AI 예측 활동: <strong>{post.aiResult}</strong></p>
                  <p style={{ margin: 0 }}>🎯 AI 신뢰도: <span style={{ color: post.aiScore < 0.8 ? '#fa5252' : '#339af0', fontWeight: 'bold' }}>{(post.aiScore * 100).toFixed(1)}%</span></p>
                </div>
                {post.adminStatus === 'WAITING' ? (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => handleApprove(post.id)} style={{ ...actionBtnStyle, backgroundColor: '#20c997' }}>승인하기</button>
                    <button onClick={() => handleReject(post.id)} style={{ ...actionBtnStyle, backgroundColor: '#fa5252' }}>거절하기</button>
                  </div>
                ) : (
                  <span style={{ fontWeight: 'bold', color: post.adminStatus === 'APPROVED' ? '#20c997' : '#fa5252' }}>
                    [{post.adminStatus}]
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'ORDERS' && (
        // <div>
        //   {/* 상품 등록/수정 폼 */}
        //   <div style={{ backgroundColor: '#f8f9fa', padding: '30px', borderRadius: '12px', marginBottom: '40px', border: '1px solid #e9ecef' }}>
        //     <h3 style={{ marginTop: 0, color: '#339af0' }}>{isProductEdit ? "상품 정보 수정" : "신규 상품 및 바우처 등록"}</h3>
        //     <form onSubmit={handleProductSubmit} style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>

        //       {/* 왼쪽: 기본 정보 및 파일 업로드 */}
        //       <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        //         <input type="text" placeholder="상품명" style={inputStyle} value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} required />
        //         <div style={{ display: 'flex', gap: '10px' }}>
        //           <select style={inputStyle} value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})}>
        //             <option value="GIFTICON">기프티콘 (바코드형)</option>
        //             <option value="DONATION">기부 상품 (무제한)</option>
        //           </select>
        //           <input type="number" placeholder="가격(P)" style={inputStyle} value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} required />
        //         </div>
        //         <textarea placeholder="상품 상세 설명" style={{ ...inputStyle, height: '80px' }} value={productForm.content} onChange={e => setProductForm({...productForm, content: e.target.value})} />

        //         <div style={{ padding: '10px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}>
        //           <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#555' }}>🖼️ 상품 홍보 이미지 (선택)</label>
        //           <input type="file" onChange={e => setFile(e.target.files[0])} />
        //         </div>
        //       </div>

        //       {/* 오른쪽: 핀번호 입력 (기프티콘일 경우에만) */}
        //       {productForm.category === 'GIFTICON' && !isProductEdit && (
        //         <div style={{ flex: 1, minWidth: '300px' }}>
        //           <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#555' }}>
        //             🎫 핀번호(바코드) 대량 입력
        //           </label>
        //           <textarea 
        //             placeholder="한 줄에 하나씩 입력하세요.&#13;&#10;예:&#13;&#10;GT-1234-5678&#13;&#10;GT-9988-7766" 
        //             style={{ ...inputStyle, height: '220px', fontFamily: 'monospace' }} 
        //             value={voucherText}
        //             onChange={e => setVoucherText(e.target.value)}
        //             required
        //           />
        //           <p style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>* 입력한 핀번호 수만큼 재고가 자동 설정됩니다.</p>
        //         </div>
        //       )}

        //       <div style={{ width: '100%', textAlign: 'right' }}>
        //         <button type="submit" style={submitBtnStyle}>
        //           {isProductEdit ? "정보 수정하기" : "상품 등록 (S3 업로드 및 바코드 저장)"}
        //         </button>
        //         {isProductEdit && (
        //           <button type="button" onClick={() => { setIsProductEdit(false); setProductForm({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0 }); }} style={cancelBtnStyle}>
        //             취소
        //           </button>
        //         )}
        //       </div>
        //     </form>
        //   </div>

        //   {/* 등록된 상품 리스트 테이블 */}
        //   <h3 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px' }}>등록된 마켓 상품 목록</h3>
        //   <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        //     <thead style={{ backgroundColor: '#333', color: '#fff' }}>
        //       <tr>
        //         <th style={thStyle}>ID</th>
        //         <th style={thStyle}>카테고리</th>
        //         <th style={thStyle}>상품명</th>
        //         <th style={thStyle}>가격</th>
        //         <th style={thStyle}>재고</th>
        //         <th style={thStyle}>관리</th>
        //       </tr>
        //     </thead>
        //     <tbody>
        //       {products.map(p => (
        //         <tr key={p.id} style={{ borderBottom: '1px solid #eee', textAlign: 'center', height: '50px' }}>
        //           <td>{p.id}</td>
        //           <td><span style={{ backgroundColor: '#e7f5ff', color: '#1c7ed6', padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>{p.category}</span></td>
        //           <td style={{ fontWeight: 'bold' }}>{p.name}</td>
        //           <td style={{ color: '#20c997', fontWeight: 'bold' }}>{p.price.toLocaleString()} P</td>
        //           <td style={{ color: p.stock <= 5 ? '#fa5252' : '#333' }}>{p.category === 'DONATION' ? '무제한' : `${p.stock}개`}</td>
        //           <td>
        //             <button onClick={() => startProductEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✏️</button>
        //             <button onClick={() => handleProductDelete(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#fa5252' }}>🗑️</button>
        //           </td>
        //         </tr>
        //       ))}
        //     </tbody>
        //   </table>
        // </div>

        // <div>
        //   <h3>🛒 전체 회원 주문 현황</h3>
        //   <table style={tableStyle}>
        //     <thead>
        //       <tr style={{ backgroundColor: '#f1f3f5' }}>
        //         <th>주문ID</th><th>회원ID</th><th>상품명</th><th>금액</th><th>일시</th><th>상태</th>
        //       </tr>
        //     </thead>
        //     <tbody>
        //       {orders.map(o => (
        //         <tr key={o.id} style={{ textAlign: 'center', borderBottom: '1px solid #eee' }}>
        //           <td>{o.id}</td><td>{o.memberId}</td><td>{o.productName}</td>
        //           <td>{o.totalPrice.toLocaleString()}P</td>
        //           <td>{new Date(o.orderDate).toLocaleString()}</td>
        //           <td><span style={statusBadgeStyle}>{o.status}</span></td>
        //         </tr>
        //       ))}
        //     </tbody>
        //   </table>
        // </div>

        <div>
          <div style={{ marginTop: '20px', marginBottom: '20px' }}>
            <h2>주문 내역 (Company ID: {companyId})</h2>
            <table style={tableStyle}>
              <thead>
                <tr style={{ backgroundColor: '#f1f3f5' }}>
                  <th>주문 ID</th>
                  <th>회원 ID</th>
                  <th>상품명</th>
                  <th>금액</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.orderId} style={{ borderBottom: '1px solid #eee' }}>
                    <td>{order.orderId}</td>
                    <td>{order.memberId}</td>
                    <td>{order.productName}</td>
                    <td>{order.totalPrice?.toLocaleString()}원</td>
                    <td>{order.status}</td>
                    <td>
                      <button
                        onClick={() => handleResendEmail(order.orderId)}
                        style={{ ...actionBtnStyle, backgroundColor: '#339af0', marginRight: '5px' }}
                      >
                        재전송
                      </button>
                      {order.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleCancelOrder(order.orderId)}
                          style={{ ...actionBtnStyle, backgroundColor: '#fa5252' }}
                        >
                          주문취소
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// // --- 스타일 객체 ---
// // const navToProductBtnStyle = {
// //   backgroundColor: '#339af0', 
// //   color: '#fff', 
// //   border: 'none', 
// //   padding: '10px 20px', 
// //   borderRadius: '8px', 
// //   cursor: 'pointer', 
// //   fontWeight: 'bold',
// //   boxShadow: '0 4px 6px rgba(51, 154, 240, 0.2)'
// // };
// const tabBtnStyle = (active) => ({
//   padding: '12px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer',
//   backgroundColor: active ? '#339af0' : '#e9ecef', color: active ? '#fff' : '#495057',
//   fontWeight: 'bold', fontSize: '16px', transition: '0.2s'
// });
// const filterBtnStyle = { padding: '8px 16px', border: '1px solid #ddd', borderRadius: '20px', cursor: 'pointer', marginRight: '10px', fontWeight: 'bold' };
// const aiBadgeStyle = { padding: '4px 8px', backgroundColor: '#e6fffa', color: '#2c7a7b', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #b2f5ea' };
// // const actionBtnStyle = { color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
// const inputStyle = { padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
// const submitBtnStyle = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '15px 30px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };
// const cancelBtnStyle = { marginLeft: '10px', padding: '15px 20px', borderRadius: '8px', border: '1px solid #ddd', cursor: 'pointer', backgroundColor: '#fff' };
// const thStyle = { padding: '15px 10px', borderBottom: '2px solid #ddd' };

const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '20px' };
// // const statusBadgeStyle = { padding: '4px 8px', backgroundColor: '#e7f5ff', color: '#1971c2', borderRadius: '4px', fontSize: '12px' };

// const headerContainerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #eee', paddingBottom: '20px' };
// const navToProductBtnStyle = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', transition: '0.2s' };
// const tabBarStyle = { display: 'flex', gap: '5px', borderBottom: '2px solid #f1f3f5' };
// const tabItemStyle = (active) => ({
//   padding: '15px 30px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', fontWeight: active ? 'bold' : 'normal',
//   color: active ? '#339af0' : '#888', borderBottom: active ? '3px solid #339af0' : '3px solid transparent', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '8px'
// });
// const countBadgeStyle = { backgroundColor: '#f1f3f5', color: '#495057', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' };
// const contentBoxStyle = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', overflow: 'hidden' };
// const orderTableStyle = { width: '100%', borderCollapse: 'collapse', textAlign: 'center' };
// const actionBtnStyle = (color) => ({ backgroundColor: 'transparent', border: `1px solid ${color}`, color: color, padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginLeft: '5px' });
// const statusBadge = (status) => ({
//   padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold',
//   backgroundColor: status === 'COMPLETED' ? '#e7f5ff' : '#fff5f5', color: status === 'COMPLETED' ? '#1c7ed6' : '#fa5252'
// });

const headerContainerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '40px',
  borderBottom: '1px solid #eee',
  paddingBottom: '20px'
};

const navToProductBtnStyle = {
  backgroundColor: '#339af0',
  color: '#fff',
  border: 'none',
  padding: '12px 24px',
  borderRadius: '10px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '15px',
  boxShadow: '0 4px 6px rgba(51, 154, 240, 0.2)',
  transition: '0.2s'
};

const tabBarStyle = { display: 'flex', gap: '5px', borderBottom: '2px solid #f1f3f5' };

const tabItemStyle = (active) => ({
  padding: '15px 30px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontSize: '16px',
  fontWeight: active ? 'bold' : 'normal',
  color: active ? '#339af0' : '#888',
  borderBottom: active ? '3px solid #339af0' : '3px solid transparent',
  transition: '0.2s',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const countBadgeStyle = { backgroundColor: '#f1f3f5', color: '#495057', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' };
const contentBoxStyle = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', overflow: 'hidden' };
const orderTableStyle = { width: '100%', borderCollapse: 'collapse', textAlign: 'center' };

// 함수형으로 통일 (재전송/취소 버튼 색상 대응)
const actionBtnStyle = (color) => ({
  backgroundColor: 'transparent',
  border: `1px solid ${color}`,
  color: color,
  padding: '5px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  marginLeft: '5px',
  transition: '0.2s'
});

const statusBadge = (status) => ({
  padding: '4px 10px',
  borderRadius: '20px',
  fontSize: '11px',
  fontWeight: 'bold',
  backgroundColor: status === 'COMPLETED' ? '#e7f5ff' : '#fff5f5',
  color: status === 'COMPLETED' ? '#1c7ed6' : '#fa5252'
});

const filterBtnStyle = { padding: '8px 16px', border: '1px solid #ddd', borderRadius: '20px', cursor: 'pointer', marginRight: '10px', fontWeight: 'bold' };
const aiBadgeStyle = { padding: '4px 8px', backgroundColor: '#e6fffa', color: '#2c7a7b', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold', border: '1px solid #b2f5ea' };

export default AdminDashboard;