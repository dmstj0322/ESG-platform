import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const MarketList = () => {
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '', price: '', content: '', category: 'GIFTICON', stock: 0
  });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editingProduct, setEditingProduct] = useState(null);
  const companyId = user?.companyId || localStorage.getItem('companyId');

  useEffect(() => {
    if (companyId) fetchProducts();
  }, [companyId]);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/market/products', { headers: { 'X-Company-Id': companyId } });
      setProducts(res.data.content);
    } catch (err) {
      alert("상품 목록을 불러오지 못했습니다.");
    }
  };

  const handleRegisterProduct = async (e) => {
    e.preventDefault();
    try {
      const finalStock = newProduct.category === 'DONATION' ? 999999 : newProduct.stock;
      const productData = { ...newProduct, stock: finalStock };

      await api.post('/market/admin/products', productData, { headers: { 'X-Company-Id': companyId } });
      alert("상품이 등록되었습니다.");
      setShowForm(false);
      fetchProducts();
    } catch (err) {
      alert("상품 등록에 실패했습니다.");
    }
  };

  const handleOrder = async (productId) => {
    if (!window.confirm("구매하시겠습니까?")) return;
    try {
      const memberId = localStorage.getItem('memberId');
      await api.post('/market/orders', { productId, count: 1 }, {
        headers: { 'X-Member-Id': memberId, 'X-Company-Id': companyId }
      });
      alert("주문 성공! 바우처가 이메일로 발송됩니다.");
      fetchProducts(); // 재고 갱신을 위해 다시 불러오기
    } catch (err) {
      alert(err.response?.data?.message || "주문 실패");
    }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/market/admin/products/${editingProduct.id}`, editingProduct);
      alert("수정되었습니다.");
      setEditingProduct(null);
      fetchProducts();
    } catch (err) {
      alert("수정 실패");
    }
  };

  const handleDelete = async (e, productId) => {
    e.stopPropagation();
    if (!window.confirm("정말 이 상품을 삭제하시겠습니까?")) return;
    try {
      await api.delete(`/market/admin/products/${productId}`, { headers: { 'X-Company-Id': companyId } });
      alert("삭제되었습니다.");
      fetchProducts(); // 목록 새로고침
    } catch (err) {
      alert("삭제 실패");
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ marginBottom: '30px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>🌱 ESG 마켓</h2>
        {user?.role === 'ADMIN' && (
          <button onClick={() => setShowForm(!showForm)} style={adminBtnStyle}>
            {showForm ? "취소" : "➕ 새 상품 등록 (Admin)"}
          </button>
        )}
      </header>

      {/* 관리자 등록 섹션 */}
      {showForm && user?.role === 'ADMIN' && (
        <div style={formContainerStyle}>
          <form onSubmit={handleRegisterProduct} style={formStyle}>
            <input type="text" placeholder="상품명" style={inputStyle} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} required />
            <select style={inputStyle} value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}>
              <option value="GIFTICON">기프티콘</option>
              <option value="DONATION">기부</option>
            </select>
            <input type="number" placeholder="가격(P)" style={inputStyle} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} required />
            <input type="text" placeholder="설명" style={inputStyle} onChange={e => setNewProduct({ ...newProduct, content: e.target.value })} />
            <button type="submit" style={{ ...inputStyle, backgroundColor: '#333', color: '#fff' }}>등록하기</button>
          </form>
        </div>
      )}

      {editingProduct && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3>상품 정보 수정</h3>
            <form onSubmit={handleUpdateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input type="text" value={editingProduct.name} style={inputStyle} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} required />
              <input type="number" value={editingProduct.price} style={inputStyle} onChange={e => setEditingProduct({ ...editingProduct, price: e.target.value })} required />
              <input type="number" value={editingProduct.stock} style={inputStyle} onChange={e => setEditingProduct({ ...editingProduct, stock: e.target.value })} required />
              <textarea value={editingProduct.content} style={{ ...inputStyle, height: '100px' }} onChange={e => setEditingProduct({ ...editingProduct, content: e.target.value })} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ ...inputStyle, backgroundColor: '#20c997', color: '#fff' }}>저장</button>
                <button type="button" onClick={() => setEditingProduct(null)} style={{ ...inputStyle, backgroundColor: '#e9ecef', color: '#333' }}>취소</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 상품 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '30px' }}>
        {products.map(p => (
          <div key={p.id} style={cardStyle} onClick={() => navigate(`/products/${p.id}`)}>
            {/* 이미지 플레이스홀더 및 상태 태그 */}
            <div style={{ position: 'relative', height: '250px', backgroundColor: '#eee', borderRadius: '10px 10px 0 0' }}>
              <img
                src={p.imageUrl || 'https://via.placeholder.com/300x200?text=Green+Trace'}
                alt={p.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <span style={tagStyle}>{p.category}</span>
              {/* 재고가 0일 때 Sold Out 레이어 표시 */}
              {p.stock <= 0 && (
                <div style={soldOutOverlay}>Sold Out</div>
              )}
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: '18px', margin: '0 0 10px 0', color: '#2c3e50' }}>{p.name}</h3>
                {user?.role === 'ADMIN' && (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => setEditingProduct(p)} style={adminIconBtnStyle}>✏️</button>
                    <button onClick={() => handleDelete(p.id)} style={{ ...adminIconBtnStyle, color: '#dc3545' }}>🗑️</button>
                  </div>
                )}
              </div>

              <p style={{ color: '#20c997', fontWeight: 'bold', fontSize: '20px', margin: '10px 0' }}>
                {p.price.toLocaleString()} <span style={{ fontSize: '14px' }}>P</span>
              </p>
              <p style={{ color: '#888', fontSize: '13px' }}>
                Stock: {p.category === 'DONATION' ? '무제한' : `${p.stock} ea`}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                <span style={{ color: '#888', fontSize: '13px' }}>재고: {p.stock}개</span>
                <span style={{ color: '#20c997', fontSize: '12px', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/products/${p.id}`);
                  }}>상세보기 →
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 스타일 가이드
const formContainerStyle = { marginBottom: '40px', padding: '25px', backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e9ecef', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const formStyle = { display: 'flex', gap: '10px', flexWrap: 'wrap' };
const inputStyle = { padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', flex: '1', minWidth: '150px' };
const cardStyle = { border: '1px solid #f1f3f5', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' };
const tagStyle = { position: 'absolute', top: '15px', left: '15px', backgroundColor: '#20c997', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' };
const soldOutOverlay = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', color: '#d9534f', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px', fontWeight: 'bold' };
const purchaseBtnStyle = { width: '100%', padding: '12px', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' };
const adminIconBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '5px' };
const adminBtnStyle = {
  backgroundColor: '#333',
  color: '#fff',
  padding: '10px 18px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '14px',
  marginBottom: '20px'
};

// 모달 스타일
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContentStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' };

export default MarketList;