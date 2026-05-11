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
  
  // ✅ 등록 폼 노출 여부 상태 추가
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [companyId]);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/market/products', { headers: { 'X-Company-Id': companyId } });
      setProducts(res.data.content);
    } catch (err) { console.error("목록 로드 실패"); }
  };

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
    setShowForm(true); // ✅ 수정 시 폼 자동 열기
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
    setShowForm(false); // ✅ 폼 닫기
  };

  return (
    <div style={pageContainerStyle}>
      <header style={headerStyle}>
        <div>
          <h2 style={titleStyle}>📦 ESG Market Management</h2>
          <p style={subtitleStyle}>마켓 상품 현황 및 재고 관리</p>
        </div>
        {/* ✅ 등록 폼 토글 버튼 */}
        <button 
          onClick={() => { if(showForm) resetForm(); else setShowForm(true); }} 
          style={showForm ? cancelBtnStyle : registerBtnStyle}
        >
          {showForm ? "닫기" : "➕ 새 상품 등록"}
        </button>
      </header>

      {/* 🆕 토글형 등록/수정 폼 */}
      {showForm && (
        <div style={formWrapperStyle}>
          <h3 style={formTitleStyle}>{isEditing ? "✏️ 상품 정보 수정" : "➕ 신규 상품 정보 입력"}</h3>
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
                    <option value="DONATION">기부</option>
                  </select>
                </div>
              </div>

              <label style={labelStyle}>대표 이미지 {isEditing && "(변경 시에만 선택)"}</label>
              <input type="file" style={{fontSize: '13px'}} onChange={e => setFile(e.target.files[0])} />
            </div>

            <div style={formRightStyle}>
              <label style={labelStyle}>상세 설명</label>
              <textarea style={{ ...inputStyle, height: '80px', resize: 'none' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />
              
              {!isEditing && formData.category === 'GIFTICON' && (
                <div style={{ marginTop: '10px' }}>
                  <label style={labelStyle}>🎫 초기 핀번호 (줄바꿈 구분)</label>
                  <textarea 
                    style={{ ...inputStyle, height: '110px', backgroundColor: '#f1faff', borderColor: '#339af0' }} 
                    value={voucherText} 
                    onChange={e => setVoucherText(e.target.value)} 
                    placeholder="예:&#10;ABC-123-DEF&#10;GHI-456-JKL" 
                  />
                </div>
              )}
            </div>

            <div style={formFooterStyle}>
              <button type="submit" style={submitBtnStyle}>{isEditing ? "수정 완료" : "상품 등록"}</button>
            </div>
          </form>
        </div>
      )}

      {/* 📊 관리 리스트 대시보드 */}
      <div style={tableContainerStyle}>
        <div style={tableHeaderBox}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>📋 상품 목록</h3>
          <span style={{ color: '#868e96', fontSize: '13px' }}>총 {products.length}개의 항목</span>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr style={theadStyle}>
              <th>이미지</th>
              <th>카테고리/상태</th>
              <th>상품명</th>
              <th>가격</th>
              <th>재고</th>
              <th>핀번호 보충</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={trStyle}>
                <td><img src={p.voucherUrl} width="55" height="55" style={imgPreviewStyle} alt="" /></td>
                <td>
                  <span style={categoryBadge(p.category)}>{p.category}</span>
                  <div style={{ fontSize: '11px', marginTop: '5px', color: getStatusColor(p.status), fontWeight: 'bold' }}>
                    {p.status === 'ON_SALE' ? '● 판매중' : p.status === 'SOLD_OUT' ? '○ 종료됨' : 'ø 숨김'}
                  </div>
                </td>
                <td style={productNameStyle}>{p.name}</td>
                <td style={priceStyle}>{p.price.toLocaleString()} P</td>
                <td style={stockStyle(p.stock)}>{p.category === 'DONATION' ? '무제한' : `${p.stock}개`}</td>
                <td>
                  {p.category === 'GIFTICON' && (
                    <div style={replenishBoxStyle}>
                      <textarea
                        placeholder="핀번호"
                        style={smallTextareaStyle}
                        value={voucherInput.id === p.id ? voucherInput.text : ''}
                        onChange={(e) => setVoucherInput({ id: p.id, text: e.target.value })}
                      />
                      <button onClick={() => handleAddVouchers(p.id)} style={smallBtnStyle}>보충</button>
                    </div>
                  )}
                </td>
                <td>
                  <div style={actionGroupStyle}>
                    <button onClick={() => handleEdit(p)} title="수정" style={iconBtnStyle('#339af0')}>✏️</button>
                    {p.status === 'ON_SALE' ? (
                      <button onClick={() => handleUpdateStatus(p.id, 'SOLD_OUT')} style={statusBtnStyle('#fa5252')}>종료</button>
                    ) : (
                      <button onClick={() => handleUpdateStatus(p.id, 'ON_SALE')} style={statusBtnStyle('#22b8cf')}>판매</button>
                    )}
                    <button onClick={() => handleUpdateStatus(p.id, 'HIDDEN')} style={statusBtnStyle('#adb5bd')}>숨김</button>
                    <button onClick={() => handleDelete(p.id)} style={iconBtnStyle('#ff6b6b')}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- 스타일링 (Blue/Modern) ---
const pageContainerStyle = { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#fdfdfd', minHeight: '100vh' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '2px solid #339af0', paddingBottom: '20px' };
const titleStyle = { fontSize: '28px', color: '#1a1a1a', margin: 0, fontWeight: '800' };
const subtitleStyle = { color: '#868e96', marginTop: '5px', fontSize: '15px' };

const registerBtnStyle = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(51, 154, 240, 0.3)' };
const cancelBtnStyle = { backgroundColor: '#f1f3f5', color: '#495057', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' };

const formWrapperStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', marginBottom: '40px', border: '1px solid #e9ecef' };
const formTitleStyle = { marginTop: 0, marginBottom: '25px', fontSize: '18px', color: '#333' };
const gridFormStyle = { display: 'flex', flexWrap: 'wrap', gap: '30px' };
const formLeftStyle = { flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '15px' };
const formRightStyle = { flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '15px' };
const formFooterStyle = { width: '100%', textAlign: 'right' };
const submitBtnStyle = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '15px 40px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };

const tableContainerStyle = { backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f3f5' };
const tableHeaderBox = { padding: '20px 25px', borderBottom: '1px solid #f1f3f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const theadStyle = { backgroundColor: '#f8f9fa', color: '#495057', borderBottom: '2px solid #dee2e6' };
const trStyle = { borderBottom: '1px solid #f8f9fa', textAlign: 'center', transition: '0.2s' };

const imgPreviewStyle = { borderRadius: '10px', objectFit: 'cover', border: '1px solid #eee' };
const categoryBadge = (cat) => ({ backgroundColor: cat === 'GIFTICON' ? '#e7f5ff' : '#f3f0ff', color: cat === 'GIFTICON' ? '#339af0' : '#845ef7', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' });
const getStatusColor = (status) => status === 'ON_SALE' ? '#339af0' : (status === 'SOLD_OUT' ? '#fa5252' : '#adb5bd');
const productNameStyle = { fontWeight: 'bold', color: '#333', textAlign: 'left', padding: '20px' };
const priceStyle = { fontWeight: '700', color: '#22b8cf' };
const stockStyle = (stock) => ({ fontWeight: 'bold', color: stock < 5 ? '#fa5252' : '#339af0' });

const replenishBoxStyle = { display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' };
const smallTextareaStyle = { height: '35px', width: '110px', fontSize: '12px', padding: '8px', borderRadius: '8px', border: '1px solid #dee2e6', resize: 'none', outline: 'none' };
const smallBtnStyle = { backgroundColor: '#20c997', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' };

const actionGroupStyle = { display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' };
const iconBtnStyle = (color) => ({ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color, padding: '5px' });
const statusBtnStyle = (color) => ({ backgroundColor: 'transparent', color, border: `1px solid ${color}`, padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' });

const inputStyle = { padding: '12px 16px', border: '1px solid #dee2e6', borderRadius: '10px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
const labelStyle = { display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: '#495057' };

export default ProductAdmin;