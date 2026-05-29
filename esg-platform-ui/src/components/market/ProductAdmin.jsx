import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import ImagePlaceholder from './ImagePlaceholder';
import { toast } from 'react-toastify';

const ProductAdmin = () => {
  const { user } = useAuth();
  const companyId = user?.companyId || localStorage.getItem('companyId');

  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0, targetAmount: 0 });
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [voucherText, setVoucherText] = useState("");
  const [addVoucherText, setAddVoucherText] = useState("");
  const [existingVouchers, setExistingVouchers] = useState([]);

  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");

  const [page, setPage] = useState(0); // Spring Boot는 0페이지부터 시작
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 10;

  const fetchProducts = useCallback(async () => {
    try {
      let url = `/market/products?page=${page}&size=${PAGE_SIZE}&sort=id,desc`;

      if (searchTerm) url += `&name=${encodeURIComponent(searchTerm)}`;
      if (filterCategory !== "ALL") url += `&category=${filterCategory}`;

      const res = await api.get(url, { headers: { 'X-Company-Id': companyId } });

      // Spring Page 객체 구조 (res.data.content, res.data.totalPages) 매핑
      setProducts(res.data.content || []);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error("상품 목록 로드 실패", err);
    }
  }, [companyId, page, filterCategory, searchTerm]);

  // 의존성 배열에 page를 추가하여 페이지 번호 클릭 시 자동으로 서버 데이터를 호출하도록 유도합니다.
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ✅ 특정 상품의 기존 핀번호 불러오기
  const fetchExistingVouchers = async (productId) => {
    try {
      const res = await api.get(`/market/admin/products/${productId}/vouchers`, { headers: { 'X-Company-Id': companyId } });
      setExistingVouchers(res.data);
    } catch (err) { console.error("바우처 로드 실패"); }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
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
        await api.put(`/market/admin/products/${editId}`, sendData, { headers: { 'X-Company-Id': companyId } });
        // alert("성공적으로 수정되었습니다.");
        toast.success("✅ 상품이 성공적으로 수정되었습니다.", { containerId: 'main-toast' });
      } else {
        if (formData.category === 'GIFTICON' && voucherText) {
          voucherText.split('\n').filter(v => v.trim() !== "").forEach(v => sendData.append("vouchers", v));
        }
        await api.post('/market/admin/products', sendData, { headers: { 'X-Company-Id': companyId } });
        // alert("성공적으로 등록되었습니다.");
        toast.success("✅ 상품이 성공적으로 등록되었습니다.", { containerId: 'main-toast' });
        setPage(0); // 🌟 신규 등록 시 첫 번째 페이지(최신글 목록)로 이동시키는 UX
      }
      resetForm();
      fetchProducts();
    } catch (err) {
      // alert("작업 처리에 실패했습니다.");
      toast.error("작업 처리에 실패했습니다.", { containerId: 'main-toast' });
    }
  };

  const handleEdit = (p) => {
    setFormData({ name: p.name, price: p.price, content: p.content, category: p.category, stock: p.stock, targetAmount: p.targetAmount || 0 });
    setEditId(p.id);
    setIsEditing(true);
    setShowForm(true);
    setPreviewUrl(p.voucherUrl);
    setAddVoucherText("");

    if (p.category === 'GIFTICON') {
      fetchExistingVouchers(p.id);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateStatus = async (productId, newStatus) => {
    try {
      await api.patch(`/market/admin/products/${productId}/status`, JSON.stringify(newStatus), {
        headers: { 'X-Company-Id': companyId, 'Content-Type': 'application/json' }
      });
      toast.success("상태가 변경되었습니다.", { containerId: 'main-toast' });
      fetchProducts();
    } catch (err) {
      toast.error("상태 변경에 실패했습니다.", { containerId: 'main-toast' });
    }
  };

  const handleAddVouchers = async () => {
    const vouchers = addVoucherText.split('\n').filter(v => v.trim() !== "");
    if (vouchers.length === 0) {
      toast.warning("추가할 핀번호를 입력하세요.", { containerId: 'main-toast' });
      return;
    }

    try {
      await api.post(`/market/admin/products/${editId}/vouchers`, vouchers, { headers: { 'X-Company-Id': companyId } });
      // alert("바우처가 성공적으로 보충되었습니다.");
      toast.success("🎁 바우처가 성공적으로 보충되었습니다.", { containerId: 'main-toast' });

      setFormData(prev => ({
        ...prev,
        stock: Number(prev.stock || 0) + vouchers.length
      }));

      setAddVoucherText('');
      fetchProducts();
      fetchExistingVouchers(editId);
    } catch (err) {
      // alert("보충 실패");
      toast.error("바우처 보충에 실패했습니다.", { containerId: 'main-toast' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("정말 삭제하시겠습니까? (주문 내역이 있으면 삭제 불가)")) return;
    try {
      await api.delete(`/market/admin/products/${id}`, { headers: { 'X-Company-Id': companyId } });
      toast.success("🗑️ 삭제되었습니다.", { containerId: 'main-toast' });

      // 🌟 삭제 시 현재 페이지의 아이템이 0개가 되면 이전 페이지로 강제 이동시키는 안전장치
      if (products.length === 1 && page > 0) {
        setPage(p => p - 1);
      } else {
        fetchProducts();
      }
    } catch (err) {
      // alert(err.response?.data?.message || "삭제 실패");
      toast.error(err.response?.data?.message || "삭제에 실패했습니다.", { containerId: 'main-toast' });
    }
  };

  const resetForm = () => {
    setFormData({ name: '', price: '', content: '', category: 'GIFTICON', stock: 0, targetAmount: 0 });
    setFile(null);
    setPreviewUrl(null);
    voucherText && setVoucherText("");
    addVoucherText && setAddVoucherText("");
    setExistingVouchers([]);
    setIsEditing(false);
    setEditId(null);
    setShowForm(false);
  };

  // 클라이언트 측 실시간 검색/필터 필터링 (서버 파라미터 결합 전 기본 로직 유연성 확보)
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

      {/* --- 등록 및 수정 폼 --- */}
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

              {formData.category === 'DONATION' ? (
                <div style={{ ...inputGroup, backgroundColor: '#f1faff', padding: '15px', borderRadius: '8px', border: '1px solid #c5f6fa', marginTop: '30px' }}>
                  <label style={{ ...labelStyle, color: '#0b7285' }}>🎯 목표 모금액 (P)</label>
                  <input type="number" style={{ ...inputStyle, border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }} value={formData.targetAmount} onChange={e => setFormData({ ...formData, targetAmount: e.target.value })} placeholder="전체 목표 금액을 입력하세요" />
                </div>
              ) : (
                <div style={{ ...inputGroup, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef', marginTop: '30px' }}>
                  {isEditing ? (
                    <>
                      <label style={{ ...labelStyle, color: '#495057' }}>
                        🎫 현재 등록된 핀번호 (미사용: <span style={{ color: '#339af0' }}>{existingVouchers.length}</span>개)
                      </label>
                      <div style={existingVoucherBox}>
                        {existingVouchers.length > 0
                          ? existingVouchers.map((v, i) => <div key={i} style={{ padding: '3px 0' }}>• {v}</div>)
                          : <div style={{ color: '#adb5bd', textAlign: 'center', padding: '10px 0' }}>미사용 핀번호가 없습니다.</div>}
                      </div>

                      <label style={{ ...labelStyle, color: '#495057', marginTop: '15px' }}>➕ 핀번호 추가 보충 (줄바꿈 구분)</label>
                      <textarea
                        style={{ ...inputStyle, height: '70px', resize: 'none' }}
                        value={addVoucherText}
                        onChange={e => setAddVoucherText(e.target.value)}
                        placeholder="새로운 핀번호 입력"
                      />
                      <button type="button" onClick={handleAddVouchers} style={{ ...btnOutline('#339af0'), width: '100%', marginTop: '5px' }}>
                        핀번호 즉시 추가
                      </button>
                    </>
                  ) : (
                    <>
                      <label style={{ ...labelStyle, color: '#495057' }}>🎫 초기 핀번호 등록 (줄바꿈 구분)</label>
                      <textarea
                        style={{ ...inputStyle, height: '100px', resize: 'none' }}
                        value={voucherText}
                        onChange={e => setVoucherText(e.target.value)}
                        placeholder="ABCD-1234-5678&#13;&#10;EFGH-9012-3456"
                      />
                    </>
                  )}
                </div>
              )}
            </div>

            <div style={formSection}>
              <div style={inputGroup}>
                <label style={labelStyle}>상세 설명</label>
                <textarea style={{ ...inputStyle, height: '110px', resize: 'none' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />
              </div>

              <div style={inputGroup}>
                <label style={labelStyle}>대표 이미지</label>
                <label style={imageUploadWrapper}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {previewUrl ? (
                    <div style={previewContainer}>
                      {/* <img src={previewUrl} alt="Preview" style={previewImage} /> */}
                      <ImagePlaceholder
                        src={previewUrl}
                        alt="preview"
                        category={formData.category}
                        style={previewImage}
                      />
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

      {/* --- 검색 및 필터 --- */}
      <div style={filterBar}>
        <input type="text" placeholder="🔍 상품명 검색..." style={searchInput} value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }} />
        <select style={filterSelect} value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}>
          <option value="ALL">전체 카테고리</option>
          <option value="GIFTICON">🎁 기프티콘</option>
          <option value="DONATION">🤝 기부 캠페인</option>
        </select>
      </div>

      {/* --- 리스트 테이블 --- */}
      <div style={tableCard}>
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
                <td align="center">
                  {/* <img src={p.voucherUrl} style={tableImg} alt="" /> */}
                  <ImagePlaceholder
                    src={p.voucherUrl}
                    alt={p.name}
                    category={p.category}
                    style={tableImg}
                    size="small"
                  />
                </td>
                <td align="center">
                  <div style={badgeCategory(p.category)}>{p.category === 'DONATION' ? '기부 캠페인' : '기프티콘'}</div>
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
                      ? <button onClick={() => handleUpdateStatus(p.id, 'SOLD_OUT')} style={btnOutline('#fa5252')}>종료</button>
                      : <button onClick={() => handleUpdateStatus(p.id, 'ON_SALE')} style={btnOutline('#20c997')}>판매</button>}
                    {p.status === 'HIDDEN'
                      ? <button onClick={() => handleDelete(p.id)} style={btnIcon} title="삭제">🗑️</button>
                      : <button onClick={() => handleUpdateStatus(p.id, 'HIDDEN')} style={btnOutline('#adb5bd')}>숨김</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && <div style={emptyState}>조건에 맞는 상품이 없습니다.</div>}

        {/* 🌟 하단 실시간 백엔드 연동 페이지네이션 UI 바 컨트롤 추가 */}
        {totalPages > 1 && (
          <div style={paginationWrapper}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={pageBtnStyle(page === 0)}>
              이전
            </button>
            <span style={pageInfoStyle}>{page + 1} / {totalPages}</span>
            <button disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)} style={pageBtnStyle(page === totalPages - 1)}>
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 🎨 스타일 속성 (CSS) - 테마 일관성 유지
// ==========================================
const pageContainer = { padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#f8f9fa', minHeight: '100vh' };
const headerContainer = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' };
const titleStyle = { margin: 0, fontSize: '26px', fontWeight: '900', color: '#212529', letterSpacing: '-0.5px' };
const subtitleStyle = { margin: '8px 0 0 0', color: '#868e96', fontSize: '14px' };

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

const existingVoucherBox = { maxHeight: '120px', overflowY: 'auto', padding: '10px 15px', backgroundColor: '#fff', border: '1px solid #dee2e6', borderRadius: '6px', fontSize: '13px', color: '#495057', lineHeight: '1.6', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)' };

const filterBar = { display: 'flex', gap: '15px', marginBottom: '20px' };
const searchInput = { flex: 1, padding: '14px 20px', borderRadius: '12px', border: '1px solid #e9ecef', fontSize: '14px', outline: 'none' };
const filterSelect = { padding: '0 20px', borderRadius: '12px', border: '1px solid #e9ecef', fontSize: '14px', backgroundColor: '#fff', cursor: 'pointer', outline: 'none' };

const tableCard = { backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 5px 20px rgba(0,0,0,0.03)', border: '1px solid #f1f3f5' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const thRowStyle = { backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef', color: '#495057', fontSize: '14px', height: '55px' };
const tdRowStyle = { borderBottom: '1px solid #f1f3f5', height: '75px' };
const tableImg = { width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #f1f3f5' };
const tableTitle = { fontWeight: '700', fontSize: '16px', color: '#212529', marginBottom: '4px' };
const tableSub = { fontSize: '12px', color: '#adb5bd' };
const emptyState = { padding: '60px', textAlign: 'center', color: '#adb5bd', fontSize: '15px' };

const badgeCategory = (cat) => ({ display: 'inline-block', backgroundColor: cat === 'GIFTICON' ? '#e7f5ff' : '#f3f0ff', color: cat === 'GIFTICON' ? '#228be6' : '#845ef7', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' });
const badgeStatus = (status) => ({ fontSize: '11px', fontWeight: 'bold', color: status === 'ON_SALE' ? '#20c997' : (status === 'SOLD_OUT' ? '#fa5252' : '#868e96') });
const btnOutline = (color) => ({ backgroundColor: '#fff', color: color, border: `1px solid ${color}`, padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' });
const btnIcon = { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' };

const tablePriceContainer = { verticalAlign: 'middle', padding: '10px 0' };
const donationPriceWrapper = { display: 'flex', flexDirection: 'column', gap: '2px' };
const participationPrice = { fontWeight: '800', color: '#22b8cf', fontSize: '15px' };
const targetAmountLabel = { fontSize: '11px', color: '#adb5bd', fontWeight: 'normal' };
const gifticonPrice = { fontWeight: '800', color: '#495057', fontSize: '15px' };

const imageUploadWrapper = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '180px', border: '2px dashed #a5d8ff', borderRadius: '12px', backgroundColor: '#f8f9fa', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'border 0.2s ease, background 0.2s ease', boxSizing: 'border-box' };
const uploadPlaceholder = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '30px' };
const uploadIcon = { fontSize: '32px', marginBottom: '4px' };
const uploadMainText = { fontSize: '14px', fontWeight: '800', color: '#339af0' };
const uploadSubText = { fontSize: '12px', color: '#adb5bd', fontWeight: '500' };
const previewContainer = {
  position: 'relative',
  width: '100%',
  minHeight: '180px',
  padding: '10px',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',     // 세로 중앙
  justifyContent: 'center'  // 가로 중앙 (오타 justifyRules -> justifyContent 수정)
};

// 🌟 수정된 previewImage 스타일
const previewImage = {
  maxWidth: '100%',
  maxHeight: '200px',
  objectFit: 'contain',
  borderRadius: '8px',
  boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
  display: 'block',
  margin: '0 auto' // 확실한 중앙 정렬 보장
};
const changeBadge = { position: 'absolute', bottom: '15px', right: '15px', backgroundColor: 'rgba(0, 0, 0, 0.65)', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', backdropFilter: 'blur(4px)', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' };

// 🌟 페이지네이션 스타일 시트 추가
const paginationWrapper = { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px 0', gap: '15px', borderTop: '1px solid #f1f3f5', backgroundColor: '#fdfdfd' };
const pageInfoStyle = { fontSize: '14px', fontWeight: '700', color: '#495057', minWidth: '50px', textAlign: 'center' };
const pageBtnStyle = (disabled) => ({
  padding: '8px 18px', borderRadius: '8px', border: '1px solid #dee2e6',
  backgroundColor: disabled ? '#f8f9fa' : '#fff',
  color: disabled ? '#adb5bd' : '#339af0',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 'bold', fontSize: '13px', transition: '0.2s ease'
});

export default ProductAdmin;