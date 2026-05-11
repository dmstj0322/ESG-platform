import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const ProductAdmin = () => {
  const { user } = useAuth();
  const companyId = user?.companyId || localStorage.getItem('companyId');

  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0 });
  const [file, setFile] = useState(null);
  const [voucherText, setVoucherText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [voucherInput, setVoucherInput] = useState({ id: null, text: '' });
  
  const [showForm, setShowForm] = useState(false);
  // ✅ 검색 및 필터링 상태 추가
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");

  useEffect(() => {
    fetchProducts();
  }, [companyId]);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/market/products', { headers: { 'X-Company-Id': companyId } });
      setProducts(res.data.content);
    } catch (err) { console.error("목록 로드 실패"); }
  };

  // ✅ 검색/필터링 로직
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "ALL" || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sendData = new FormData();
    if (file) sendData.append("file", file);

    const dto = { ...formData, stock: formData.stock || 0 };
    sendData.append("dto", new Blob([JSON.stringify(dto)], { type: "application/json" }));

    if (!isEditing && formData.category === 'GIFTICON' && voucherText) {
      const voucherArray = voucherText.split('\n').filter(v => v.trim() !== "");
      voucherArray.forEach(v => sendData.append("vouchers", v));
    }

    try {
      if (isEditing) {
        await api.put(`/market/admin/products/${editId}`, sendData, { 
          headers: { 'X-Company-Id': companyId, 'Content-Type': 'multipart/form-data' } 
        });
        alert("수정되었습니다.");
      } else {
        await api.post('/market/admin/products', sendData, { 
          headers: { 'X-Company-Id': companyId, 'Content-Type': 'multipart/form-data' } 
        });
        alert("등록되었습니다.");
      }
      resetForm();
      fetchProducts();
    } catch (err) { alert("작업 실패"); }
  };

  const handleEdit = (p) => {
    setFormData({ name: p.name, price: p.price, content: p.content, category: p.category, stock: p.stock });
    setEditId(p.id);
    setIsEditing(true);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateStatus = async (productId, newStatus) => {
    try {
      await api.patch(`/market/admin/products/${productId}/status`, JSON.stringify(newStatus), {
        headers: { 'X-Company-Id': companyId, 'Content-Type': 'application/json' }
      });
      fetchProducts();
    } catch (err) { alert("상태 변경 실패"); }
  };

  const handleAddVouchers = async (productId) => {
    const vouchers = voucherInput.text.split('\n').filter(v => v.trim() !== "");
    if (vouchers.length === 0) return alert("핀번호를 입력하세요.");
    try {
      await api.post(`/market/admin/products/${productId}/vouchers`, vouchers, { headers: { 'X-Company-Id': companyId } });
      alert("보충 완료");
      setVoucherInput({ id: null, text: '' });
      fetchProducts();
    } catch (err) { alert("보충 실패"); }
  };

  const resetForm = () => {
    setFormData({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0 });
    setFile(null);
    setVoucherText("");
    setIsEditing(false);
    setEditId(null);
    setShowForm(false);
  };

  return (
    <div style={pageContainerStyle}>
      <header style={headerStyle}>
        <div>
          <h2 style={titleStyle}>🛡️ Product Inventory</h2>
          <p style={subtitleStyle}>재고 현황 파악 및 신규 상품 관리</p>
        </div>
        <button 
          onClick={() => { if(showForm) resetForm(); else setShowForm(true); }} 
          style={showForm ? cancelBtnStyle : registerBtnStyle}
        >
          {showForm ? "닫기" : "➕ 신규 상품 추가"}
        </button>
      </header>

      {/* 폼 섹션 (토글 방식) */}
      {showForm && (
        <div style={formWrapperStyle}>
          <h3 style={formTitleStyle}>{isEditing ? "✨ 정보 수정" : "🆕 신규 등록"}</h3>
          <form onSubmit={handleSubmit} style={gridFormStyle}>
            <div style={formLeftStyle}>
              <label style={labelStyle}>상품 이름</label>
              <input type="text" style={inputStyle} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>가격 (P)</label>
                  <input type="number" style={inputStyle} value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>카테고리</label>
                  <select style={inputStyle} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                    <option value="GIFTICON">기프티콘</option>
                    <option value="DONATION">기부 캠페인</option>
                  </select>
                </div>
              </div>
              <label style={labelStyle}>대표 이미지</label>
              <input type="file" style={{fontSize: '12px'}} onChange={e => setFile(e.target.files[0])} />
            </div>
            <div style={formRightStyle}>
              <label style={labelStyle}>상세 설명</label>
              <textarea style={{ ...inputStyle, height: '80px', resize: 'none' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />
              {!isEditing && formData.category === 'GIFTICON' && (
                <div style={{ marginTop: '10px' }}>
                  <label style={labelStyle}>🎫 초기 핀번호 (줄바꿈 구분)</label>
                  <textarea style={{ ...inputStyle, height: '110px', backgroundColor: '#f1faff' }} value={voucherText} onChange={e => setVoucherText(e.target.value)} placeholder="ABC-123..." />
                </div>
              )}
            </div>
            <div style={formFooterStyle}>
              <button type="submit" style={submitBtnStyle}>{isEditing ? "수정 완료" : "등록 완료"}</button>
            </div>
          </form>
        </div>
      )}

      {/* 🔍 검색 및 필터링 바 */}
      <div style={searchBarStyle}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input 
            type="text" 
            placeholder="상품명으로 검색하세요..." 
            style={searchInputStyle}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select 
          style={filterSelectStyle}
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="ALL">전체 카테고리</option>
          <option value="GIFTICON">기프티콘</option>
          <option value="DONATION">기부 캠페인</option>
        </select>
      </div>

      {/* 📊 메인 리스트 */}
      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={theadStyle}>
              <th style={{ width: '80px' }}>이미지</th>
              <th style={{ width: '120px' }}>구분/상태</th>
              <th>상품 정보</th>
              <th style={{ width: '100px' }}>가격</th>
              <th style={{ width: '80px' }}>재고</th>
              <th style={{ width: '200px' }}>핀번호 관리</th>
              <th style={{ width: '180px' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => (
              <tr key={p.id} style={trStyle}>
                <td><img src={p.voucherUrl} width="50" height="50" style={imgStyle} alt="" /></td>
                <td>
                  <span style={categoryBadge(p.category)}>{p.category === 'DONATION' ? '기부' : '기프트'}</span>
                  <div style={statusText(p.status)}>{p.status}</div>
                </td>
                <td style={{ textAlign: 'left', padding: '15px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#333' }}>{p.name}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>ID: {p.id}</div>
                </td>
                <td style={priceStyle}>{p.price.toLocaleString()} P</td>
                <td style={stockStyle(p.stock)}>{p.category === 'DONATION' ? '∞' : p.stock}</td>
                <td>
                  {p.category === 'GIFTICON' ? (
                    <div style={replenishWrapper}>
                      <input 
                        type="text"
                        placeholder="핀번호 입력"
                        style={miniInputStyle}
                        value={voucherInput.id === p.id ? voucherInput.text : ''}
                        onChange={(e) => setVoucherInput({ id: p.id, text: e.target.value })}
                      />
                      <button onClick={() => handleAddVouchers(p.id)} style={miniBtnStyle}>추가</button>
                    </div>
                  ) : <span style={{color: '#dee2e6'}}>-</span>}
                </td>
                <td>
                  <div style={actionGroup}>
                    <button onClick={() => handleEdit(p)} style={editBtn}>수정</button>
                    {p.status === 'ON_SALE' 
                      ? <button onClick={() => handleUpdateStatus(p.id, 'SOLD_OUT')} style={soldOutBtn}>종료</button>
                      : <button onClick={() => handleUpdateStatus(p.id, 'ON_SALE')} style={saleBtn}>판매</button>
                    }
                    <button onClick={() => handleUpdateStatus(p.id, 'HIDDEN')} style={hideBtn}>숨김</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && <div style={emptyStyle}>검색 결과가 없습니다.</div>}
      </div>
    </div>
  );
};

// --- 스타일 개선 (지저분함 해소 포인트) ---
const pageContainerStyle = { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#fdfdfd' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' };
const titleStyle = { margin: 0, fontSize: '26px', fontWeight: '800' };
const subtitleStyle = { margin: '5px 0 0 0', color: '#adb5bd', fontSize: '14px' };

const registerBtnStyle = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const cancelBtnStyle = { backgroundColor: '#f1f3f5', color: '#495057', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };

const searchBarStyle = { display: 'flex', gap: '15px', marginBottom: '20px' };
const searchInputStyle = { flex: 1, padding: '12px 20px', borderRadius: '12px', border: '1px solid #eee', fontSize: '14px', outline: 'none', backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' };
const filterSelectStyle = { padding: '0 15px', borderRadius: '12px', border: '1px solid #eee', backgroundColor: '#fff', fontSize: '14px', cursor: 'pointer' };

const tableContainerStyle = { backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #f1f3f5', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const theadStyle = { backgroundColor: '#f8f9fa', height: '50px', fontSize: '13px', color: '#868e96', borderBottom: '1px solid #eee' };
const trStyle = { borderBottom: '1px solid #f8f9fa', textAlign: 'center' };

const imgStyle = { borderRadius: '8px', objectFit: 'cover' };
const categoryBadge = (cat) => ({ backgroundColor: cat === 'GIFTICON' ? '#e7f5ff' : '#f3f0ff', color: cat === 'GIFTICON' ? '#339af0' : '#845ef7', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' });
const statusText = (status) => ({ fontSize: '10px', marginTop: '4px', color: status === 'ON_SALE' ? '#20c997' : '#fa5252', fontWeight: 'bold' });
const priceStyle = { fontWeight: '700', color: '#495057' };
const stockStyle = (stock) => ({ fontWeight: '800', color: stock < 5 ? '#fa5252' : '#339af0' });

const replenishWrapper = { display: 'flex', gap: '5px', justifyContent: 'center', padding: '0 10px' };
const miniInputStyle = { width: '100px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #eee', fontSize: '12px', outline: 'none' };
const miniBtnStyle = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' };

const actionGroup = { display: 'flex', gap: '5px', justifyContent: 'center' };
const baseBtn = { padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', border: '1px solid transparent' };
const editBtn = { ...baseBtn, backgroundColor: '#fff', color: '#339af0', borderColor: '#339af0' };
const soldOutBtn = { ...baseBtn, backgroundColor: '#fff', color: '#fa5252', borderColor: '#fa5252' };
const saleBtn = { ...baseBtn, backgroundColor: '#fff', color: '#20c997', borderColor: '#20c997' };
const hideBtn = { ...baseBtn, backgroundColor: '#fff', color: '#adb5bd', borderColor: '#adb5bd' };

const emptyStyle = { padding: '50px', textAlign: 'center', color: '#adb5bd' };

// 폼 스타일은 이전과 동일하게 유지하되 디자인 톤만 맞춤
const formWrapperStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', marginBottom: '30px', border: '1px solid #e9ecef' };
const gridFormStyle = { display: 'flex', flexWrap: 'wrap', gap: '25px' };
const formLeftStyle = { flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '15px' };
const formRightStyle = { flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '15px' };
const formFooterStyle = { width: '100%', textAlign: 'right' };
const submitBtnStyle = { backgroundColor: '#333', color: '#fff', border: 'none', padding: '12px 30px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const inputStyle = { padding: '12px', border: '1px solid #eee', borderRadius: '10px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
const labelStyle = { display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px', color: '#495057' };
const formTitleStyle = { marginTop: 0, marginBottom: '20px', fontSize: '18px' };

export default ProductAdmin;