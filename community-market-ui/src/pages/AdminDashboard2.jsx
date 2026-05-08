import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeTab, setActiveTab] = useState('POSTS'); // 'POSTS' or 'PRODUCTS'

  // 상품 등록/수정용 폼 상태
  const [productForm, setProductForm] = useState({ name: '', price: '', content: '', category: 'GIFTICON', stock: 100 });
  const [isProductEdit, setIsProductEdit] = useState(false);
  const [editProductId, setEditProductId] = useState(null);

  const companyId = user?.companyId || localStorage.getItem('companyId');

  useEffect(() => {
    fetchPosts();
    fetchProducts();
  }, [companyId]);

  // --- [데이터 통신부] ---
  const fetchPosts = async () => {
    try {
      const res = await api.get('/admin/posts', {
        headers: { 'X-Company-Id': companyId }
      });
      setPosts(res.data.sort((a, b) => b.id - a.id));
    } catch (err) { console.error("인증글 로드 실패"); }
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/market/products', { headers: { 'X-Company-Id': companyId } });
      setProducts(res.data.content);
    } catch (err) { console.error("상품 목록 로드 실패"); }
  };

  // --- [인증글 관리 로직] ---
  const handleApprove = async (postId) => {
    if (!window.confirm("승인하시겠습니까? 포인트가 지급됩니다.")) return;
    try {
      await api.post(`/admin/posts/${postId}/approve`);
      alert("승인 완료");
      fetchPosts();
    } catch (err) { alert("처리 실패"); }
  };

  const handleReject = async (postId) => {
    const reason = prompt("거절 사유를 입력하세요:");
    if (!reason) return;
    try {
      await api.post(`/admin/posts/${postId}/reject`, { reason });
      alert("거절 완료");
      fetchPosts();
    } catch (err) { alert("처리 실패"); }
  };

  // --- [상품 관리 로직] ---
  const handleProductSubmit = async (e) => {
    // e.preventDefault();
    // try {
    //   if (isProductEdit) {
    //     await api.put(`/market/admin/products/${editProductId}`, productForm);
    //     alert("수정되었습니다.");
    //   } else {
    //     await api.post('/market/admin/products', productForm, { headers: { 'X-Company-Id': companyId } });
    //     alert("등록되었습니다.");
    //   }
    //   setProductForm({ name: '', price: '', content: '', category: 'GIFTICON', stock: 100 });
    //   setIsProductEdit(false);
    //   fetchProducts();
    // } catch (err) { alert("상품 처리 실패"); 

    // }

    e.preventDefault();

    // 1. 핀번호 배열 생성
    const voucherArray = voucherText ? voucherText.split('\n').filter(v => v.trim() !== "") : [];

    // 2. FormData 세팅
    const formData = new FormData();
    if (file) {
      formData.append("file", file); // 파일 첨부
    }

    // JSON 데이터를 'dto'라는 이름의 Blob으로 첨부 (백엔드 @RequestPart("dto") 대응)
    formData.append("dto", new Blob([JSON.stringify(productForm)], { type: "application/json" }));

    // 핀번호를 'vouchers'라는 이름으로 배열 전송
    voucherArray.forEach(v => formData.append("vouchers", v));

    try {
      if (isProductEdit) {
        await api.put(`/admin/products/${editProductId}`, productForm);
        alert("수정되었습니다.");
      } else {
        // /market/admin/products -> /admin/products 로 변경
        await api.post('/admin/products', formData, {
          headers: {
            'X-Company-Id': companyId,
            'Content-Type': 'multipart/form-data' // 중요
          }
        });
        alert("상품 및 바우처 등록 성공!");
      }

      // 폼 초기화
      setProductForm({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0 });
      setFile(null);
      setVoucherText("");
      setIsProductEdit(false);
      fetchProducts(); // 이 함수 내부의 api.get 주소도 '/admin/products' 로 맞추세요
    } catch (err) {
      alert("상품 처리 실패: " + (err.response?.data?.message || ""));
    }
  };

  const startProductEdit = (p) => {
    setProductForm({ name: p.name, price: p.price, content: p.content, category: p.category, stock: p.stock });
    setEditProductId(p.id);
    setIsProductEdit(true);
  };

  const handleProductDelete = async (id) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      await api.delete(`/market/admin/products/${id}`);
      fetchProducts();
    } catch (err) { alert("삭제 실패"); }
  };

  return (
    <div style={{ padding: '30px', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <header style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>관리자 통합 대시보드</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>{user?.companyId} 기업 관리 모드</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setActiveTab('POSTS')} style={tabBtnStyle(activeTab === 'POSTS')}>인증 리뷰 큐</button>
            <button onClick={() => setActiveTab('PRODUCTS')} style={tabBtnStyle(activeTab === 'PRODUCTS')}>ESG 마켓 관리</button>
          </div>
        </header>

        {/* 탭 1: 인증글 리뷰 큐 */}
        {activeTab === 'POSTS' && (
          <section style={cardContainerStyle}>
            <h2 style={sectionTitleStyle}>실천 인증 리뷰 큐 ({posts.filter(p => p.adminStatus === 'WAITING').length})</h2>
            <table style={tableStyle}>
              <thead>
                <tr style={theadStyle}>
                  <th>ID</th><th>인증샷</th><th>제목 / 작성자</th><th>AI 분석 결과</th><th>신뢰도</th><th>액션</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(post => (
                  <tr key={post.id} style={trStyle}>
                    <td>{post.id}</td>
                    <td>
                      {post.imageUrls?.[0] && <img src={post.imageUrls[0]} alt="img" style={{ width: '50px', height: '50px', borderRadius: '4px' }} />}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <strong>{post.title}</strong><br />
                      <small>Member ID: {post.memberId}</small>
                    </td>
                    <td><span style={badgeStyle(post.aiScore >= 0.8)}>{post.aiResult}</span></td>
                    <td><b style={{ color: post.aiScore >= 0.8 ? '#2b8a3e' : '#e03131' }}>{(post.aiScore * 100).toFixed(1)}%</b></td>
                    <td>
                      {post.adminStatus === 'WAITING' ? (
                        <>
                          <button onClick={() => handleApprove(post.id)} style={approveBtnStyle}>승인</button>
                          <button onClick={() => handleReject(post.id)} style={rejectBtnStyle}>거절</button>
                        </>
                      ) : (
                        <span style={{ color: '#888' }}>{post.adminStatus}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 탭 2: 상품 관리 */}
        {activeTab === 'PRODUCTS' && (
          <>
            <section style={{ ...cardContainerStyle, marginBottom: '20px' }}>
              <h2 style={sectionTitleStyle}>{isProductEdit ? "상품 수정" : "새 상품 등록"}</h2>
              <form onSubmit={handleProductSubmit} style={{ display: 'flex', gap: '10px' }}>
                <input style={inputStyle} type="text" placeholder="상품명" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} required />
                <input style={inputStyle} type="number" placeholder="가격(P)" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} required />
                <input style={inputStyle} type="number" placeholder="재고" value={productForm.stock} onChange={e => setProductForm({ ...productForm, stock: e.target.value })} required />
                <select style={inputStyle} value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })}>
                  <option value="GIFTICON">기프티콘</option>
                  <option value="DONATION">기부</option>
                </select>
                <button type="submit" style={submitBtnStyle}>{isProductEdit ? "수정" : "등록"}</button>
                {isProductEdit && <button type="button" onClick={() => setIsProductEdit(false)}>취소</button>}
              </form>
            </section>

            <section style={cardContainerStyle}>
              <h2 style={sectionTitleStyle}>등록된 상품 리스트</h2>
              <table style={tableStyle}>
                <thead>
                  <tr style={theadStyle}>
                    <th>ID</th><th>카테고리</th><th>상품명</th><th>가격</th><th>재고</th><th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} style={trStyle}>
                      <td>{p.id}</td>
                      <td>{p.category}</td>
                      <td><strong>{p.name}</strong></td>
                      <td style={{ color: '#20c997', fontWeight: 'bold' }}>{p.price.toLocaleString()}P</td>
                      <td>{p.stock}</td>
                      <td>
                        <button onClick={() => startProductEdit(p)} style={editBtnStyle}>✏️</button>
                        <button onClick={() => handleProductDelete(p.id)} style={deleteBtnStyle}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

// --- [Style Objects] ---
const tabBtnStyle = (active) => ({
  padding: '10px 20px', borderRadius: '20px', border: 'none', cursor: 'pointer',
  backgroundColor: active ? '#20c997' : '#e9ecef', color: active ? '#fff' : '#495057',
  fontWeight: 'bold', transition: 'all 0.2s'
});
const cardContainerStyle = { backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' };
const sectionTitleStyle = { fontSize: '18px', marginBottom: '20px', color: '#333' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '10px' };
const theadStyle = { borderBottom: '2px solid #eee', color: '#888', fontSize: '14px' };
const trStyle = { borderBottom: '1px solid #f1f3f5', textAlign: 'center', height: '60px' };
const inputStyle = { padding: '10px', borderRadius: '6px', border: '1px solid #ddd', flex: 1 };
const badgeStyle = (success) => ({
  backgroundColor: success ? '#ebfbee' : '#fff5f5', color: success ? '#2b8a3e' : '#e03131',
  padding: '4px 10px', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold'
});
const approveBtnStyle = { backgroundColor: '#20c997', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' };
const rejectBtnStyle = { backgroundColor: '#ff6b6b', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer' };
const submitBtnStyle = { backgroundColor: '#333', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' };
const editBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' };
const deleteBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#ff6b6b' };

export default AdminDashboard;