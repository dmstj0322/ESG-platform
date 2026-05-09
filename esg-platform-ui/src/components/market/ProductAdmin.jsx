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

    const sendData = new FormData();
    sendData.append("file", file); // 홍보 이미지
    sendData.append("dto", new Blob([JSON.stringify(formData)], { type: "application/json" })); // 상품 정보

    if (!isEditing && formData.category === 'GIFTICON' && voucherText) {
      const voucherArray = voucherText.split('\n').filter(v => v.trim() !== "");
      voucherArray.forEach(v => sendData.append("vouchers", v));
    }

    try {
      if (isEditing) {
        await api.put(`/market/admin/products/${editId}`, formData, { headers: { 'X-Company-Id': companyId } });
        alert("상품이 수정되었습니다.");
      } else {
        await api.post('/market/admin/products', sendData, { headers: { 'X-Company-Id': companyId } });
        alert("등록 완료");
      }
      resetForm();
      fetchProducts();
    } catch (err) { alert("작업 실패"); }
  };

  const handleEdit = (p) => {
    setFormData({ name: p.name, price: p.price, content: p.content, category: p.category, stock: p.stock });
    setEditId(p.id);
    setIsEditing(true);
    window.scrollTo(0, 0);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    try {
      await api.delete(`/market/admin/products/${id}`, { headers: { 'X-Company-Id': companyId } });
      alert("삭제되었습니다.");
      fetchProducts();
    } catch (err) { alert(err.response?.data?.message || "삭제 실패"); }
  };

  const handleAddVouchers = async (productId) => {
    const vouchers = voucherInput.text.split('\n').filter(v => v.trim() !== "");
    if (vouchers.length === 0) return alert("추가할 핀번호를 입력하세요.");

    try {
      await api.post(`/market/admin/products/${productId}/vouchers`, vouchers, {
        headers: { 'X-Company-Id': companyId }
      });
      alert(`${vouchers.length}개의 핀번호가 추가되었습니다.`);
      setVoucherInput({ id: null, text: '' });
      fetchProducts();
    } catch (err) { alert("핀번호 추가 실패"); }
  };

  const resetForm = () => {
    setFormData({ name: '', price: '', content: '', category: 'GIFTICON' });
    setFile(null);
    setVoucherText("");
    setIsEditing(false);
    setEditId(null);
  };

  return (
    <div style={{ padding: '30px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#339af0' }}>📦 ESG 마켓 상품 관리 (Admin)</h2>

      {/* 등록/수정 폼 섹션 */}
      {/* <div style={formWrapperStyle}>
        <h3 style={{ marginTop: 0 }}>{isEditing ? "상품 정보 수정" : "새 상품 등록"}</h3>
        <form onSubmit={handleSubmit} style={gridFormStyle}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <input type="text" placeholder="상품명" style={inputStyle} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <input type="number" placeholder="가격(P)" style={inputStyle} value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} required />
            <select style={inputStyle} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
              <option value="GIFTICON">기프티콘</option>
              <option value="DONATION">기부</option>
            </select>
            <textarea placeholder="상품 설명" style={{ ...inputStyle, height: '80px' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />

            <div style={{ marginTop: '10px' }}>
              <label style={labelStyle}>🖼️ 홍보 이미지 업로드</label>
              <input type="file" onChange={e => setFile(e.target.files[0])} />
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <label style={labelStyle}>🎫 핀번호 목록 (한 줄에 하나씩)</label>
            <textarea
              placeholder="예:&#13;&#10;GT-CUP-001&#13;&#10;GT-CUP-002"
              style={{ ...inputStyle, height: '220px', backgroundColor: '#fdfdfd' }}
              value={voucherText}
              onChange={e => setVoucherText(e.target.value)}
              required={!isEditing} // 신규 등록 시 필수
            />
          </div>

          <div style={{ width: '100%', textAlign: 'right' }}>
            <button type="submit" style={submitBtnStyle}>
              {isEditing ? "정보 수정하기" : "상품 및 핀번호 등록"}
            </button>
            {isEditing && <button type="button" onClick={() => setIsEditing(false)} style={cancelBtnStyle}>취소</button>}
          </div>
        </form>
      </div> */}

      {/* 상품 리스트 표 */}
      {/* <table style={tableStyle}>
        <thead>
          <tr style={theadStyle}>
            <th>ID</th><th>카테고리</th><th>상품명</th><th>가격</th><th>재고(핀수)</th><th>관리</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id} style={trStyle}>
              <td>{p.id}</td>
              <td><span style={categoryBadge}>{p.category}</span></td>
              <td style={{ fontWeight: 'bold' }}>{p.name}</td>
              <td>{p.price.toLocaleString()} P</td>
              <td style={{ color: p.stock < 5 ? 'red' : 'inherit' }}>{p.stock}개</td>
              <td>
                <button onClick={() => {
                  setFormData({ name: p.name, price: p.price, content: p.content, category: p.category });
                  setEditId(p.id);
                  setIsEditing(true);
                  window.scrollTo(0, 0);
                }} style={actionBtnStyle}>✏️</button>
                <button onClick={() => handleDelete(p.id)} style={{ ...actionBtnStyle, color: '#ff6b6b' }}>🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; */}

      <div style={formWrapperStyle}>
        <h3 style={{ marginTop: 0 }}>{isEditing ? "상품 수정" : "새 상품 등록"}</h3>
        <form onSubmit={handleSubmit} style={gridFormStyle}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <label style={labelStyle}>상품명</label>
            <input type="text" style={inputStyle} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <label style={labelStyle}>가격(P)</label>
            <input type="number" style={inputStyle} value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} required />
            <label style={labelStyle}>카테고리</label>
            <select style={inputStyle} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
              <option value="GIFTICON">기프티콘</option>
              <option value="DONATION">기부</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>설명</label>
            <textarea style={{ ...inputStyle, height: '80px' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />
            <label style={labelStyle}>대표 이미지</label>
            <input type="file" onChange={e => setFile(e.target.files[0])} />
            {!isEditing && formData.category === 'GIFTICON' && (
              <>
                <label style={labelStyle}>초기 핀번호 (줄바꿈 구분)</label>
                <textarea style={{ ...inputStyle, height: '60px' }} value={voucherText} onChange={e => setVoucherText(e.target.value)} />
              </>
            )}
          </div>
          <div style={{ width: '100%', marginTop: '20px' }}>
            <button type="submit" style={submitBtnStyle}>{isEditing ? "수정하기" : "등록하기"}</button>
            {isEditing && <button type="button" onClick={resetForm} style={cancelBtnStyle}>취소</button>}
          </div>
        </form>
      </div>

      {/* 상품 목록 리스트 */}
      <table style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <th>이미지</th><th>상품명</th><th>재고</th><th>핀번호 보충</th><th>관리</th>
          </tr>
        </thead>
        <tbody>
          {products.map(p => (
            <tr key={p.id} style={{ textAlign: 'center', borderBottom: '1px solid #eee' }}>
              <td><img src={p.voucherUrl} width="50" height="50" style={{ objectFit: 'cover' }} alt="" /></td>
              <td>{p.name}</td>
              <td style={{ fontWeight: 'bold', color: '#339af0' }}>{p.stock}개</td>
              <td>
                <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                  <textarea
                    placeholder="핀번호 입력"
                    style={{ height: '30px', width: '120px', fontSize: '12px' }}
                    value={voucherInput.id === p.id ? voucherInput.text : ''}
                    onChange={(e) => setVoucherInput({ id: p.id, text: e.target.value })}
                  />
                  <button onClick={() => handleAddVouchers(p.id)} style={smallBtnStyle}>보충</button>
                </div>
              </td>
              <td>
                <button onClick={() => { setIsEditing(true); setEditId(p.id); setFormData(p); }} style={iconBtnStyle}>✏️</button>
                <button onClick={() => handleDelete(p.id)} style={{ ...iconBtnStyle, color: '#ff6b6b' }}>🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const iconBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' };
const smallBtnStyle = { backgroundColor: '#20c997', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' };

// --- 스타일 정의 ---
const formWrapperStyle = { backgroundColor: '#f8f9fa', padding: '30px', borderRadius: '12px', border: '1px solid #e9ecef', marginBottom: '40px' };
const gridFormStyle = { display: 'flex', flexWrap: 'wrap', gap: '30px' };
const inputStyle = { padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
const labelStyle = { display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px', color: '#555' };
const submitBtnStyle = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '15px 30px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };
const cancelBtnStyle = { marginLeft: '10px', padding: '15px 20px', borderRadius: '8px', border: '1px solid #ddd', cursor: 'pointer' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' };
const theadStyle = { backgroundColor: '#333', color: '#fff' };
const trStyle = { borderBottom: '1px solid #eee', textAlign: 'center', height: '60px' };
const actionBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '5px' };
const categoryBadge = { backgroundColor: '#e7f5ff', color: '#1c7ed6', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' };

export default ProductAdmin;