import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const ProductAdmin = () => {
  const { user } = useAuth();
  const companyId = user?.companyId || localStorage.getItem('companyId');

  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({ name: '', price: '', content: '', category: 'GIFTICON' });
  const [file, setFile] = useState(null);
  const [voucherText, setVoucherText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [voucherInput, setVoucherInput] = useState({ id: null, text: '' });

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

    // 수정 시에는 기존 이미지 유지 가능성이 높으므로 FormData를 상황에 맞게 구성
    const sendData = new FormData();
    if (file) sendData.append("file", file);

    sendData.append("dto", new Blob([JSON.stringify(formData)], { type: "application/json" }));

    // 신규 등록 시 기프티콘일 경우에만 핀번호 추가
    if (!isEditing && formData.category === 'GIFTICON' && voucherText) {
      const voucherArray = voucherText.split('\n').filter(v => v.trim() !== "");
      voucherArray.forEach(v => sendData.append("vouchers", v));
    }

    try {
      if (isEditing) {
        // 수정 API 호출 (multipart/form-data 유지)
        await api.put(`/market/admin/products/${editId}`, sendData, { headers: { 'X-Company-Id': companyId } });
        alert("상품 정보가 성공적으로 수정되었습니다.");
      } else {
        await api.post('/market/admin/products', sendData, { headers: { 'X-Company-Id': companyId } });
        alert("신규 상품이 등록되었습니다.");
      }
      resetForm();
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.message || "작업 중 오류가 발생했습니다.");
    }
  };

  const handleEdit = (p) => {
    setFormData({ name: p.name, price: p.price, content: p.content, category: p.category, stock: p.stock });
    setEditId(p.id);
    setIsEditing(true);
    setVoucherText(""); // 수정 시에는 초기 핀번호 입력란을 숨기므로 초기화
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateStatus = async (productId, newStatus) => {
    const statusText = newStatus === 'SOLD_OUT' ? '참여 종료' : (newStatus === 'HIDDEN' ? '숨김' : '판매 중');
    if (!window.confirm(`상품을 [${statusText}] 상태로 변경하시겠습니까?`)) return;

    try {
      // PATCH 메서드를 사용하여 상태만 업데이트
      await api.patch(`/market/admin/products/${productId}/status`,
        JSON.stringify(newStatus),
        {
          headers: {
            'X-Company-Id': companyId,
            'Content-Type': 'application/json' // 👈 이 부분을 명시적으로 추가하세요!
          }
        }
      );
      alert("상태가 변경되었습니다.");
      fetchProducts(); // 목록 새로고침
    } catch (err) {
      alert("상태 변경에 실패했습니다.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      await api.delete(`/market/admin/products/${id}`, { headers: { 'X-Company-Id': companyId } });
      alert("삭제되었습니다.");
      fetchProducts();
    } catch (err) { alert("삭제 실패"); }
  };

  const handleAddVouchers = async (productId) => {
    const vouchers = voucherInput.text.split('\n').filter(v => v.trim() !== "");
    if (vouchers.length === 0) return alert("추가할 핀번호를 입력하세요.");

    try {
      await api.post(`/market/admin/products/${productId}/vouchers`, vouchers, {
        headers: { 'X-Company-Id': companyId }
      });
      alert(`${vouchers.length}개의 핀번호가 보충되었습니다.`);
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
  };

  return (
    <div style={pageContainerStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>📦 ESG Market Management</h2>
        <p style={subtitleStyle}>상품 등록 및 바우처 재고 관리를 수행합니다.</p>
      </header>

      {/* 등록/수정 폼 섹션 */}
      <div style={formWrapperStyle}>
        <h3 style={formTitleStyle}>{isEditing ? "✏️ 상품 정보 수정" : "➕ 새 상품 등록"}</h3>
        <form onSubmit={handleSubmit} style={gridFormStyle}>
          <div style={formLeftStyle}>
            <label style={labelStyle}>상품/캠페인명</label>
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
            <input type="file" style={fileInputStyle} onChange={e => setFile(e.target.files[0])} />
          </div>

          <div style={formRightStyle}>
            <label style={labelStyle}>상세 설명</label>
            <textarea style={{ ...inputStyle, height: '90px', resize: 'none' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} placeholder="상품의 특징이나 사용처를 입력하세요." />

            {/* ✅ 기프티콘일 때만 바코드 입력란 표시 (수정 시에는 재고 보충 기능을 사용하도록 숨김) */}
            {!isEditing && formData.category === 'GIFTICON' && (
              <div style={{ marginTop: '10px' }}>
                <label style={labelStyle}>🎫 초기 핀번호 (줄바꿈으로 구분)</label>
                <textarea
                  style={{ ...inputStyle, height: '110px', backgroundColor: '#fff', borderColor: '#339af0', resize: 'none' }}
                  value={voucherText}
                  onChange={e => setVoucherText(e.target.value)}
                  placeholder="예:&#10;ABC-123-DEF&#10;GHI-456-JKL"
                  required
                />
              </div>
            )}
          </div>

          <div style={formFooterStyle}>
            <button type="submit" style={submitBtnStyle}>{isEditing ? "수정 완료" : "상품 등록"}</button>
            {isEditing && <button type="button" onClick={resetForm} style={cancelBtnStyle}>취소</button>}
          </div>
        </form>
      </div>

      {/* 상품 목록 리스트 */}
      <div style={tableContainerStyle}>
        <h3 style={{ marginBottom: '20px' }}>📋 현재 판매 상품 목록</h3>
        <table style={tableStyle}>
          <thead>
            <tr style={theadStyle}>
              {/* <th>이미지</th>
              <th>카테고리</th>
              <th>상품명</th>
              <th>판매가</th>
              <th>잔여 재고</th>
              <th>핀번호 보충</th>
              <th>관리</th> */}
              <th>이미지</th><th>상태/카테고리</th><th>상품명</th><th>재고</th><th>관리/보충</th><th>동작</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id} style={trStyle}>
                <td>
                  <img src={p.voucherUrl} width="50" height="50" style={imgPreviewStyle} alt="" />
                </td>
                <td>
                  <span style={categoryBadge(p.category)}>{p.category}</span>
                  <div style={{ fontSize: '11px', marginTop: '5px', color: getStatusColor(p.status), fontWeight: 'bold' }}>
                    {p.status === 'ON_SALE' ? '● 판매중' : p.status === 'SOLD_OUT' ? '○ 종료됨' : 'ø 숨김'}
                  </div>
                </td>
                {/* <div style={{ fontSize: '11px', marginTop: '5px', color: getStatusColor(p.status) }}>
                  현재: {p.status}
                </div> */}
                <td style={productNameStyle}>{p.name}</td>
                <td style={priceStyle}>{p.price.toLocaleString()} P</td>
                <td style={stockStyle(p.stock)}>{p.category === 'DONATION' ? '무제한' : `${p.stock}개`}</td>
                <td>
                  {p.category === 'GIFTICON' && (
                    <div style={replenishBoxStyle}>
                      <textarea
                        placeholder="핀번호 입력"
                        style={smallTextareaStyle}
                        value={voucherInput.id === p.id ? voucherInput.text : ''}
                        onChange={(e) => setVoucherInput({ id: p.id, text: e.target.value })}
                      />
                      <button onClick={() => handleAddVouchers(p.id)} style={smallBtnStyle}>보충</button>
                    </div>
                  )}
                </td>
                {/* <td>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button onClick={() => handleEdit(p)} style={editBtnStyle}>수정</button>
                    <button onClick={() => handleDelete(p.id)} style={deleteBtnStyle}>삭제</button>
                  </div>
                </td> */}
                <td>
                  <div style={actionGroupStyle}>
                    <button onClick={() => handleEdit(p)} style={iconBtnStyle('#339af0')}>✏️</button>
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

// --- 스타일링 (Blue/Modern 테마) ---
const pageContainerStyle = { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#fdfdfd' };
const headerStyle = { marginBottom: '40px', borderBottom: '2px solid #339af0', paddingBottom: '20px' };
const titleStyle = { fontSize: '28px', color: '#1a1a1a', margin: 0 };
const subtitleStyle = { color: '#868e96', marginTop: '8px' };

const formWrapperStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', marginBottom: '50px', border: '1px solid #e9ecef' };
const formTitleStyle = { marginTop: 0, marginBottom: '25px', fontSize: '20px', color: '#333' };
const gridFormStyle = { display: 'flex', flexWrap: 'wrap', gap: '25px' };
const formLeftStyle = { flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '15px' };
const formRightStyle = { flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '15px' };
const formFooterStyle = { width: '100%', textAlign: 'center', marginTop: '10px' };

const inputStyle = { padding: '12px 16px', border: '1px solid #dee2e6', borderRadius: '10px', fontSize: '14px', width: '100%', boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s' };
const fileInputStyle = { fontSize: '13px', color: '#868e96' };
const labelStyle = { display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: '#495057' };

const submitBtnStyle = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '14px 40px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 12px rgba(51, 154, 240, 0.3)' };
const cancelBtnStyle = { marginLeft: '12px', backgroundColor: '#f1f3f5', color: '#495057', border: 'none', padding: '14px 25px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' };

const tableContainerStyle = { backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const theadStyle = { backgroundColor: '#f8f9fa', color: '#495057', borderBottom: '2px solid #dee2e6' };
const trStyle = { borderBottom: '1px solid #f1f3f5', textAlign: 'center', transition: 'background 0.2s' };

const imgPreviewStyle = { borderRadius: '8px', objectFit: 'cover', border: '1px solid #eee' };
// const categoryBadge = (cat) => ({ backgroundColor: cat === 'GIFTICON' ? '#e7f5ff' : '#f3f0ff', color: cat === 'GIFTICON' ? '#339af0' : '#845ef7', padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' });
const productNameStyle = { fontWeight: 'bold', color: '#333', textAlign: 'left', padding: '15px' };
const priceStyle = { fontWeight: '700', color: '#22b8cf' };
// const stockStyle = (stock) => ({ fontWeight: 'bold', color: stock < 5 ? '#fa5252' : '#339af0' });

// const replenishBoxStyle = { display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' };
// const smallTextareaStyle = { height: '35px', width: '130px', fontSize: '12px', padding: '5px', borderRadius: '6px', border: '1px solid #dee2e6', resize: 'none' };
// const smallBtnStyle = { backgroundColor: '#20c997', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' };

const editBtnStyle = { backgroundColor: '#fff', color: '#339af0', border: '1px solid #339af0', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' };
const deleteBtnStyle = { backgroundColor: '#fff', color: '#fa5252', border: '1px solid #fa5252', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' };

const categoryBadge = (cat) => ({
  backgroundColor: cat === 'GIFTICON' ? '#e7f5ff' : '#f3f0ff',
  color: cat === 'GIFTICON' ? '#339af0' : '#845ef7',
  padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold'
});

const getStatusColor = (status) => {
  if (status === 'ON_SALE') return '#339af0';
  if (status === 'SOLD_OUT') return '#fa5252';
  return '#adb5bd';
};

const stockStyle = (stock) => ({ fontWeight: 'bold', color: stock < 5 ? '#fa5252' : '#339af0' });
const actionGroupStyle = { display: 'flex', gap: '5px', justifyContent: 'center', alignItems: 'center' };
const iconBtnStyle = (color) => ({ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color });
const statusBtnStyle = (color) => ({ backgroundColor: 'transparent', color, border: `1px solid ${color}`, padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' });

const replenishBoxStyle = { display: 'flex', gap: '5px', alignItems: 'center' };
const smallTextareaStyle = { height: '35px', width: '120px', fontSize: '11px', padding: '5px', borderRadius: '5px', border: '1px solid #ddd', resize: 'none' };
const smallBtnStyle = { backgroundColor: '#20c997', color: '#fff', border: 'none', borderRadius: '5px', padding: '8px 10px', fontSize: '11px', cursor: 'pointer' };

export default ProductAdmin;