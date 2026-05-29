import React, { useState, useEffect } from 'react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const ProductAdmin = () => {
  const { user } = useAuth();
  const companyId = user?.companyId || localStorage.getItem('companyId');

  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0, targetAmount: 0 });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null); // ✅ 이미지 미리보기 URL 상태 추가
  const [voucherText, setVoucherText] = useState("");
  const [addVoucherText, setAddVoucherText] = useState("");
  const [existingVouchers, setExistingVouchers] = useState([]); // ✅ 기존 핀번호 상태 추가

  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
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

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "ALL" || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // ✅ 파일 선택 시 호출되는 함수 (미리보기 생성)
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      // 브라우저 내 임시 URL 생성하여 미리보기 반영
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(objectUrl);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sendData = new FormData();
    if (file) sendData.append("file", file);

    const dto = {
      ...formData,
      stock: formData.category === 'DONATION' ? 0 : (formData.stock || 0),
      targetAmount: formData.category === 'DONATION' ? formData.targetAmount : null
    };
    sendData.append("dto", new Blob([JSON.stringify(dto)], { type: "application/json" }));

    try {
      if (isEditing) {
        await api.put(`/market/admin/products/${editId}`, sendData, {
          headers: { 'X-Company-Id': companyId }
        });
        alert("수정되었습니다.");
      } else {
        await api.post('/market/admin/products', sendData, {
          headers: { 'X-Company-Id': companyId }
        });
        alert("등록되었습니다.");
      }
      resetForm();
      fetchProducts();
    } catch (err) { alert("작업 처리에 실패했습니다."); }
  };

  const handleEdit = (p) => {
    setFormData({ name: p.name, price: p.price, content: p.content, category: p.category, stock: p.stock, targetAmount: p.targetAmount || 0 });
    setEditId(p.id);
    setIsEditing(true);
    setShowForm(true);
    setPreviewUrl(p.voucherUrl); // ✅ 수정 시 기존 이미지 URL을 미리보기에 설정
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

  const handleAddVouchers = async () => {
    const vouchers = addVoucherText.split('\n').filter(v => v.trim() !== "");
    if (vouchers.length === 0) return alert("추가할 핀번호를 입력하세요.");
    try {
      await api.post(`/market/admin/products/${editId}/vouchers`, vouchers, { headers: { 'X-Company-Id': companyId } });
      alert("바우처가 성공적으로 보충되었습니다.");
      setAddVoucherText('');
      fetchProducts();
      fetchExistingVouchers(editId); // ✅ 보충 후 남은 핀번호 목록 새로고침
    } catch (err) { alert("보충 실패"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("정말 삭제하시겠습니까? (주문 내역이 있으면 삭제 불가)")) return;
    try {
      await api.delete(`/market/admin/products/${id}`, { headers: { 'X-Company-Id': companyId } });
      fetchProducts();
    } catch (err) { alert(err.response?.data?.message || "삭제 실패"); }
  };

  const resetForm = () => {
    setFormData({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0, targetAmount: 0 });
    setFile(null);
    setPreviewUrl(null); // ✅ 리셋 시 미리보기 초기화
    setVoucherText("");
    setAddVoucherText("");
    setExistingVouchers([]); // 초기화
    setIsEditing(false);
    setEditId(null);
    setShowForm(false);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "ALL" || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={pageContainer}>
      <header style={headerContainer}>
        <div>
          <h2 style={titleStyle}>📦 상품 및 캠페인 관리</h2>
          <p style={subtitleStyle}>마켓에 노출될 상품과 기부 캠페인을 등록하고 관리합니다.</p>
        </div>
        <button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} style={showForm ? btnCancel : btnPrimary}>
          {showForm ? "닫기" : "➕ 새 상품 등록"}
        </button>
      </header>

      {showForm && (
        <div style={formCard}>
          <div style={formHeader}>
            <h3 style={formTitle}>{isEditing ? "✏️ 상품 정보 수정" : "🆕 신규 상품 등록"}</h3>
            <span style={{ fontSize: '12px', color: '#adb5bd' }}>* 필수 입력 항목입니다.</span>
          </div>

          <form onSubmit={handleSubmit} style={formGrid}>
            <div style={formSection}>
              <div style={inputGroup}>
                <label style={labelStyle}>상품/캠페인 이름 *</label>
                <input type="text" style={inputStyle} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div style={inputGroup}>
                  <label style={labelStyle}>카테고리 *</label>
                  <select style={inputStyle} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} disabled={isEditing}>
                    <option value="GIFTICON">🎁 기프티콘</option>
                    <option value="DONATION">🤝 기부 캠페인</option>
                  </select>
                </div>
                <div style={inputGroup}>
                  <label style={labelStyle}>{formData.category === 'DONATION' ? '1회 참여 금액 (P) *' : '판매 가격 (P) *'}</label>
                  <input type="number" style={inputStyle} value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} required />
                </div>
              </div>

              {/* ✅ 이미지 미리보기 영역 추가 */}
              <label style={labelStyle}>대표 이미지</label>
              {previewUrl && (
                <div style={previewContainerStyle}>
                  <img src={previewUrl} alt="Preview" style={previewImageStyle} />
                  <p style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>
                    {isEditing ? "현재 등록된 이미지" : "선택된 이미지 미리보기"}
                  </p>
                </div>
              )}
              <input type="file" style={{ fontSize: '12px' }} onChange={handleFileChange} />
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

            {/* 우측 상세 설명 및 이미지 구역 */}
            <div style={formSection}>
              <div style={inputGroup}>
                <label style={labelStyle}>상세 설명</label>
                <textarea style={{ ...inputStyle, height: '110px', resize: 'none' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />
              </div>

              <div style={inputGroup}>
                <label style={labelStyle}>대표 이미지</label>
                {/* <div style={imageUploadBox}>
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" style={previewImage} />
                  ) : (
                    <div style={{ color: '#adb5bd', fontSize: '13px', padding: '30px 0' }}>이미지를 선택해주세요</div>
                  )}
                  <input type="file" style={{ width: '100%', marginTop: '10px', fontSize: '13px' }} onChange={handleFileChange} />
                </div> */}
                <label style={imageUploadWrapper}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }} // 기본 버튼 숨기기
                  />
                  {previewUrl ? (
                    <div style={previewContainer}>
                      <img src={previewUrl} alt="Preview" style={previewImage} />
                      <div style={changeBadge}>🔄 이미지 변경</div>
                    </div>
                  ) : (
                    <div style={uploadPlaceholder}>
                      <span style={uploadIcon}>📸</span>
                      <span style={uploadMainText}>클릭하여 이미지 선택</span>
                      <span style={uploadSubText}>JPG, PNG, GIF 지원</span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f3f5', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={resetForm} style={btnCancelLine}>초기화</button>
              <button type="submit" style={btnSubmit}>{isEditing ? "수정 사항 저장" : "상품 등록 완료"}</button>
            </div>
          </form>
        </div>
      )}

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
          <option value="GIFTICON">🎁 기프티콘</option>
          <option value="DONATION">🤝 기부 캠페인</option>
        </select>
      </div>

      <div style={tableContainerStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={thRowStyle}>
              <th width="100">이미지</th>
              <th width="130">분류/상태</th>
              <th width="200">상품 정보</th>
              <th width="150">가격/참여목표액</th>
              <th width="120">잔여 재고</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => (
              <tr key={p.id} style={tdRowStyle}>
                <td align="center"><img src={p.voucherUrl} style={tableImg} alt="" /></td>
                <td align="center">
                  <div style={badgeCategory(p.category)}>{p.category === 'DONATION' ? '기부' : '기프트'}</div>
                  <div style={badgeStatus(p.status)}>{p.status}</div>
                </td>
                <td style={{ padding: '0 20px', textAlign: 'left' }}>
                  <div style={tableTitle}>{p.name}</div>
                  <div style={tableSub}>ID: {p.id}</div>
                </td>
                <td align="center" style={tablePriceContainer}>
                  {p.category === 'DONATION' ? (
                    <div style={donationPriceWrapper}>
                      <div style={participationPrice}>{p.price.toLocaleString()} P</div>
                      <div style={targetAmountLabel}>목표: {p.targetAmount?.toLocaleString() || 0} P</div>
                    </div>
                  ) : (
                    <span style={gifticonPrice}>{p.price.toLocaleString()} P</span>
                  )}
                </td>
                <td align="center" style={{ fontWeight: 'bold', fontSize: '15px', color: p.category === 'DONATION' ? '#339af0' : (p.stock < 5 ? '#fa5252' : '#495057') }}>
                  {p.category === 'DONATION' ? '∞' : `${p.stock} 개`}
                </td>
                <td align="center">
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <button onClick={() => handleEdit(p)} style={btnOutline('#339af0')}>수정</button>
                    {p.status === 'ON_SALE'
                      ? <button onClick={() => handleUpdateStatus(p.id, 'SOLD_OUT')} style={soldOutBtn}>종료</button>
                      : <button onClick={() => handleUpdateStatus(p.id, 'ON_SALE')} style={saleBtn}>판매</button>
                    }
                    {p.status === 'HIDDEN' ? (
                      <button onClick={() => handleDelete(p.id)} style={iconBtnStyle} title="영구 삭제">🗑️</button>
                    ) : (
                      <button onClick={() => handleUpdateStatus(p.id, 'HIDDEN')} style={statusBtnStyle('#adb5bd')}>숨김</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && <div style={emptyState}>조건에 맞는 상품이 없습니다.</div>}
      </div>
    </div>
  );
};

// --- 스타일 정의 ---
const pageContainerStyle = { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#fdfdfd' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' };
const titleStyle = { margin: 0, fontSize: '26px', fontWeight: '800' };
const subtitleStyle = { margin: '5px 0 0 0', color: '#adb5bd', fontSize: '14px' };

const btnPrimary = { backgroundColor: '#339af0', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(51, 154, 240, 0.2)', transition: 'background 0.2s' };
const btnCancel = { backgroundColor: '#e9ecef', color: '#495057', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' };
const btnSubmit = { backgroundColor: '#1864ab', color: '#fff', border: 'none', padding: '12px 30px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' };
const btnCancelLine = { backgroundColor: 'transparent', color: '#868e96', border: '1px solid #dee2e6', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };

const formCard = { backgroundColor: '#fff', padding: '35px', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.04)', marginBottom: '35px', border: '1px solid #f1f3f5' };
const formHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '2px solid #f8f9fa', paddingBottom: '15px' };
const formTitle = { margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#343a40' };
const formGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' };
const formSection = { display: 'flex', flexDirection: 'column', gap: '15px' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '8px' };

const labelStyle = { fontWeight: '600', fontSize: '13px', color: '#495057' };
const inputStyle = { padding: '14px', border: '1px solid #dee2e6', borderRadius: '8px', fontSize: '14px', color: '#212529', backgroundColor: '#fff', outline: 'none' };

// ✅ 기존 핀번호 보여주는 스크롤 박스 스타일
const existingVoucherBox = {
  maxHeight: '120px', overflowY: 'auto', padding: '10px 15px', backgroundColor: '#fff',
  border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '13px', color: '#495057',
  lineHeight: '1.6', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)'
};

const filterBar = { display: 'flex', gap: '15px', marginBottom: '20px' };
const searchInput = { flex: 1, padding: '14px 20px', borderRadius: '12px', border: '1px solid #e9ecef', fontSize: '14px', outline: 'none' };
const filterSelect = { padding: '0 20px', borderRadius: '12px', border: '1px solid #e9ecef', fontSize: '14px', backgroundColor: '#fff', cursor: 'pointer', outline: 'none' };

const tableCard = { backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 5px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f3f5' };
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
const iconBtnStyle = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' };
const statusBtnStyle = (color) => ({ backgroundColor: 'transparent', color, border: `1px solid ${color}`, padding: '4px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' });

const emptyStyle = { padding: '50px', textAlign: 'center', color: '#adb5bd' };

const formWrapperStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', marginBottom: '30px', border: '1px solid #e9ecef' };
const gridFormStyle = { display: 'flex', flexWrap: 'wrap', gap: '25px' };
const formLeftStyle = { flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '15px' };
const formRightStyle = { flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '15px' };
const formFooterStyle = { width: '100%', textAlign: 'right' };
const submitBtnStyle = { backgroundColor: '#333', color: '#fff', border: 'none', padding: '12px 30px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const inputStyle = { padding: '12px', border: '1px solid #eee', borderRadius: '10px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
const labelStyle = { display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px', color: '#495057' };
const formTitleStyle = { marginTop: 0, marginBottom: '20px', fontSize: '18px' };

// ✅ 미리보기 관련 추가 스타일
const previewContainerStyle = {
  marginBottom: '10px',
  textAlign: 'center',
  border: '1px dashed #dee2e6',
  padding: '10px',
  borderRadius: '8px',
  backgroundColor: '#f8f9fa'
};

const previewImageStyle = {
  maxWidth: '100%',
  maxHeight: '150px',
  borderRadius: '4px',
  objectFit: 'contain'
};

export default ProductAdmin;