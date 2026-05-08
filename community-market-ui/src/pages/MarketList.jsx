import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const MarketList = () => {
  const [products, setProducts] = useState([]);
  // const [showForm, setShowForm] = useState(false);

  // // 1. 상태 추가: 기존 상품 정보 외에 파일과 핀번호 텍스트를 관리
  // const [newProduct, setNewProduct] = useState({
  //   name: '', price: '', content: '', category: 'GIFTICON'
  // });
  // const [file, setFile] = useState(null); // S3 업로드용 이미지
  // const [voucherText, setVoucherText] = useState(""); // 바코드(핀번호) 뭉치
  // const [editingProduct, setEditingProduct] = useState(null);

  const { user } = useAuth();
  const navigate = useNavigate();
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

  // // 2. 등록 로직 변경: FormData를 사용하여 파일, JSON, 리스트를 한 번에 전송
  // const handleRegisterProduct = async (e) => {
  //   e.preventDefault();
  //   try {
  //     const formData = new FormData();

  //     // 파일 추가
  //     if (file) {
  //       formData.append("file", file);
  //     }

  //     // JSON 데이터 추가 (Blob 형태)
  //     const dto = { ...newProduct };
  //     formData.append("dto", new Blob([JSON.stringify(dto)], { type: "application/json" }));

  //     // 핀번호 리스트 파싱 및 추가 (기프티콘일 때만)
  //     if (newProduct.category === 'GIFTICON' && voucherText) {
  //       const vouchers = voucherText.split('\n').filter(v => v.trim() !== "");
  //       vouchers.forEach(v => formData.append("vouchers", v));
  //     }

  //     // 백엔드 API 호출 (multipart/form-data)
  //     await api.post('/market/admin/products', formData, { 
  //       headers: { 
  //         'X-Company-Id': companyId
  //       } 
  //     });

  //     alert("상품과 바우처가 성공적으로 등록되었습니다.");

  //     // 폼 초기화
  //     setShowForm(false);
  //     setNewProduct({ name: '', price: '', content: '', category: 'GIFTICON' });
  //     setFile(null);
  //     setVoucherText("");

  //     fetchProducts();
  //   } catch (err) {
  //     alert("상품 등록에 실패했습니다.");
  //   }
  // };

  // const handleOrder = async (productId) => {
  //   if (!window.confirm("구매하시겠습니까?")) return;
  //   try {
  //     const memberId = localStorage.getItem('memberId');
  //     await api.post('/market/orders', { productId, count: 1 }, {
  //       headers: { 'X-Member-Id': memberId, 'X-Company-Id': companyId }
  //     });
  //     alert("주문 성공! 바우처가 이메일로 발송됩니다.");
  //     fetchProducts(); // 재고 갱신을 위해 다시 불러오기
  //   } catch (err) {
  //     alert(err.response?.data?.message || "주문 실패");
  //   }
  // };

  // const handleUpdateProduct = async (e) => {
  //   e.preventDefault();
  //   try {
  //     await api.put(`/market/admin/products/${editingProduct.id}`, editingProduct);
  //     alert("수정되었습니다.");
  //     setEditingProduct(null);
  //     fetchProducts();
  //   } catch (err) {
  //     alert("수정 실패");
  //   }
  // };

  // const handleDelete = async (e, productId) => {
  //   e.stopPropagation();
  //   if (!window.confirm("정말 이 상품을 삭제하시겠습니까?")) return;
  //   try {
  //     await api.delete(`/market/admin/products/${productId}`, { headers: { 'X-Company-Id': companyId } });
  //     alert("삭제되었습니다.");
  //     fetchProducts();
  //   } catch (err) {
  //     alert("삭제 실패");
  //   }
  // };

  //   return (
  //     <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
  //       <header style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  //         <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>🌱 ESG 마켓</h2>
  //         {user?.role === 'ADMIN' && (
  //           <button onClick={() => setShowForm(!showForm)} style={adminBtnStyle}>
  //             {showForm ? "닫기" : "➕ 새 상품 등록 (Admin)"}
  //           </button>
  //         )}
  //       </header>

  //       {/* 3. 관리자 등록 섹션 UI 수정 (이미지 & 핀번호 입력란 추가) */}
  //       {showForm && user?.role === 'ADMIN' && (
  //         <div style={formContainerStyle}>
  //           <h3 style={{ marginTop: 0, color: '#339af0' }}>상품 및 바우처 등록</h3>
  //           <form onSubmit={handleRegisterProduct} style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>

  //             <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '250px' }}>
  //               <input type="text" placeholder="상품명" style={inputStyle} value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} required />
  //               <div style={{ display: 'flex', gap: '10px' }}>
  //                 <select style={inputStyle} value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}>
  //                   <option value="GIFTICON">기프티콘</option>
  //                   <option value="DONATION">기부</option>
  //                 </select>
  //                 <input type="number" placeholder="가격(P)" style={inputStyle} value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} required />
  //               </div>
  //               <input type="text" placeholder="간단 설명" style={inputStyle} value={newProduct.content} onChange={e => setNewProduct({ ...newProduct, content: e.target.value })} />

  //               {/* 이미지 업로드 */}
  //               <div style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '6px', backgroundColor: '#fdfdfd' }}>
  //                 <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '5px' }}>🖼️ 상품 이미지 (선택)</label>
  //                 <input type="file" onChange={e => setFile(e.target.files[0])} />
  //               </div>
  //             </div>

  //             {/* 핀번호 대량 등록 (기프티콘일 경우에만 표시) */}
  //             {newProduct.category === 'GIFTICON' && (
  //               <div style={{ flex: 1, minWidth: '250px' }}>
  //                 <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '5px' }}>🎫 핀번호 목록 (한 줄에 하나씩 입력)</label>
  //                 <textarea 
  //                   style={{ ...inputStyle, height: '140px', fontFamily: 'monospace', resize: 'vertical' }} 
  //                   placeholder="예:&#13;&#10;GT-1234-5678&#13;&#10;GT-9988-7766"
  //                   value={voucherText}
  //                   onChange={e => setVoucherText(e.target.value)}
  //                   required
  //                 />
  //                 <p style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>* 입력한 핀번호 개수만큼 재고가 자동 설정됩니다.</p>
  //               </div>
  //             )}

  //             <div style={{ width: '100%', textAlign: 'right', marginTop: '10px' }}>
  //               <button type="submit" style={submitBtnStyle}>등록하기</button>
  //             </div>
  //           </form>
  //         </div>
  //       )}

  //       {/* 수정 모달 (기존 유지) */}
  //       {editingProduct && (
  //         <div style={modalOverlayStyle}>
  //           <div style={modalContentStyle}>
  //             <h3>상품 정보 수정</h3>
  //             <form onSubmit={handleUpdateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
  //               <input type="text" value={editingProduct.name} style={inputStyle} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} required />
  //               <input type="number" value={editingProduct.price} style={inputStyle} onChange={e => setEditingProduct({ ...editingProduct, price: e.target.value })} required />
  //               <input type="number" value={editingProduct.stock} style={inputStyle} onChange={e => setEditingProduct({ ...editingProduct, stock: e.target.value })} required />
  //               <textarea value={editingProduct.content} style={{ ...inputStyle, height: '100px' }} onChange={e => setEditingProduct({ ...editingProduct, content: e.target.value })} />
  //               <div style={{ display: 'flex', gap: '10px' }}>
  //                 <button type="submit" style={{ ...inputStyle, backgroundColor: '#20c997', color: '#fff' }}>저장</button>
  //                 <button type="button" onClick={() => setEditingProduct(null)} style={{ ...inputStyle, backgroundColor: '#e9ecef', color: '#333' }}>취소</button>
  //               </div>
  //             </form>
  //           </div>
  //         </div>
  //       )}

  //       {/* 상품 그리드 (기존 유지) */}
  //       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '30px' }}>
  //         {products.map(p => (
  //           <div key={p.id} style={cardStyle} onClick={() => navigate(`/products/${p.id}`)}>
  //             <div style={{ position: 'relative', height: '250px', backgroundColor: '#eee', borderRadius: '10px 10px 0 0' }}>
  //               <img
  //                 src={p.voucherUrl || 'https://via.placeholder.com/300x200?text=Green+Trace'}
  //                 alt={p.name}
  //                 style={{ width: '100%', height: '100%', objectFit: 'cover' }}
  //               />
  //               <span style={tagStyle}>{p.category}</span>
  //               {p.stock <= 0 && (
  //                 <div style={soldOutOverlay}>Sold Out</div>
  //               )}
  //             </div>

  //             <div style={{ padding: '20px' }}>
  //               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
  //                 <h3 style={{ fontSize: '18px', margin: '0 0 10px 0', color: '#2c3e50' }}>{p.name}</h3>
  //                 {user?.role === 'ADMIN' && (
  //                   <div style={{ display: 'flex', gap: '5px' }}>
  //                     <button onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }} style={adminIconBtnStyle}>✏️</button>
  //                     <button onClick={(e) => handleDelete(e, p.id)} style={{ ...adminIconBtnStyle, color: '#dc3545' }}>🗑️</button>
  //                   </div>
  //                 )}
  //               </div>

  //               <p style={{ color: '#20c997', fontWeight: 'bold', fontSize: '20px', margin: '10px 0' }}>
  //                 {p.price.toLocaleString()} <span style={{ fontSize: '14px' }}>P</span>
  //               </p>

  //               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
  //                 <span style={{ color: '#888', fontSize: '13px' }}>
  //                   재고: {p.category === 'DONATION' ? '무제한' : `${p.stock}개`}
  //                 </span>
  //                 <span style={{ color: '#20c997', fontSize: '13px', fontWeight: 'bold' }}>상세보기 →</span>
  //               </div>
  //             </div>
  //           </div>
  //         ))}
  //       </div>
  //     </div>
  //   );
  // };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#1a1a1a', margin: 0 }}>🌱 ESG Market</h2>
        {user?.role === 'ADMIN' && (
          <button onClick={() => navigate('/admin/products')} style={adminLinkBtnStyle}>
            ⚙️ 상품 관리
          </button>
        )}
      </header>

      {/* 상품 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '30px' }}>
        {products.map(p => (
          <div key={p.id} style={cardStyle} onClick={() => navigate(`/products/${p.id}`)}>
            <div style={{ position: 'relative', height: '220px', overflow: 'hidden' }}>
              <img
                src={p.voucherUrl || 'https://via.placeholder.com/300x200?text=Green+Trace'}
                alt={p.name}
                style={imageStyle}
              />
              <span style={categoryTagStyle}>{p.category}</span>
              {p.stock <= 0 && <div style={soldOutOverlayStyle}>품절</div>}
            </div>

            <div style={{ padding: '20px' }}>
              <h3 style={productTitleStyle}>{p.name}</h3>
              <p style={priceStyle}>{p.price.toLocaleString()} <span style={{ fontSize: '14px' }}>P</span></p>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '13px' }}>
                <span>재고: {p.category === 'DONATION' ? '무제한' : `${p.stock}개`}</span>
                <span style={{ color: '#339af0' }}>상세보기 →</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// // --- 스타일 ---
// const adminLinkBtnStyle = { backgroundColor: '#343a40', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
// // const cardStyle = { borderRadius: '15px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 10px 20px rgba(0,0,0,0.05)', cursor: 'pointer', transition: '0.3s' };
// const imageStyle = { width: '100%', height: '100%', objectFit: 'cover' };
// const categoryTagStyle = { position: 'absolute', top: '12px', left: '12px', backgroundColor: 'rgba(51, 154, 240, 0.9)', color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' };
// const soldOutOverlayStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px', fontWeight: 'bold' };
// const productTitleStyle = { fontSize: '18px', margin: '0 0 10px 0', color: '#333' };
// const priceStyle = { color: '#22b8cf', fontWeight: 'bold', fontSize: '22px', margin: '0 0 15px 0' };

// // 스타일 가이드 (기존 유지 및 추가)
// const formContainerStyle = { marginBottom: '40px', padding: '30px', backgroundColor: '#f8f9fa', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' };
// const inputStyle = { padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
// const cardStyle = { border: '1px solid #f1f3f5', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'transform 0.2s' };
// const tagStyle = { position: 'absolute', top: '15px', left: '15px', backgroundColor: '#339af0', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' };
// const soldOutOverlay = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', color: '#fa5252', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '24px', fontWeight: 'bold' };
// const adminIconBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '5px' };
// const adminBtnStyle = { backgroundColor: '#333', color: '#fff', padding: '12px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' };
// const submitBtnStyle = { backgroundColor: '#339af0', color: '#fff', padding: '12px 30px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };
// const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
// const modalContentStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' };

const adminLinkBtnStyle = {
  backgroundColor: '#343a40',
  color: '#fff',
  padding: '10px 20px',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

const cardStyle = {
  borderRadius: '15px',
  overflow: 'hidden',
  backgroundColor: '#fff',
  boxShadow: '0 10px 20px rgba(0,0,0,0.05)',
  cursor: 'pointer',
  transition: '0.3s',
  border: '1px solid #f1f3f5'
};

const imageStyle = { width: '100%', height: '100%', objectFit: 'cover' };

const categoryTagStyle = {
  position: 'absolute',
  top: '12px',
  left: '12px',
  backgroundColor: 'rgba(51, 154, 240, 0.9)',
  color: '#fff',
  padding: '4px 12px',
  borderRadius: '20px',
  fontSize: '11px',
  fontWeight: 'bold'
};

const soldOutOverlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)',
  color: '#fff',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: '20px',
  fontWeight: 'bold'
};

const productTitleStyle = { fontSize: '18px', margin: '0 0 10px 0', color: '#333' };
const priceStyle = { color: '#22b8cf', fontWeight: 'bold', fontSize: '22px', margin: '0 0 15px 0' };

export default MarketList;