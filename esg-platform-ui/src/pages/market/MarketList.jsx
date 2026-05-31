import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import ImagePlaceholder from '../../components/market/ImagePlaceholder';

const MarketList = () => {
  const [products, setProducts] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const isAdmin = isSystemAdmin || isCompanyAdmin;

  const companyId = isSystemAdmin ? 0 : (user?.companyId || localStorage.getItem('companyId'));

  const [page, setPage] = useState(0); // 0페이지부터 시작
  const [totalPages, setTotalPages] = useState(1);
  const [filterCategory, setFilterCategory] = useState("ALL");
  const PAGE_SIZE = 10;

  const fetchProducts = useCallback(async () => {
    try {
      let url = `/market/products?page=${page}&size=${PAGE_SIZE}&sort=id,desc`;

      if (filterCategory !== "ALL") {
        url += `&category=${filterCategory}`;
      }

      const res = await api.get(url, { headers: { 'X-Company-Id': companyId } });
      const visibleProducts = (res.data.content || []).filter(p => p.status !== 'HIDDEN');

      setProducts(visibleProducts);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      alert("상품 목록을 불러오지 못했습니다.");
    }
  }, [companyId, page, filterCategory]);

  useEffect(() => {
    if (companyId) fetchProducts();
  }, [companyId, fetchProducts]);

  // 🌟 카테고리 탭 변경 시 페이지 번호를 1페이지(0)로 리셋
  const handleCategoryChange = (category) => {
    setFilterCategory(category);
    setPage(0);
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '35px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#1a1a1a', margin: 0 }}>🌱 ESG Market</h2>
          {/* <p style={{ margin: '5px 0 0 0', color: '#868e96', fontSize: '14px' }}>친환경 ESG 활동으로 모은 포인트로 가치 있는 소비를 실천하세요.</p> */}
        </div>
        {isAdmin && (
          <button onClick={() => navigate('/admin/products')} style={adminLinkBtnStyle}>
            ⚙️ 상품 관리
          </button>
        )}
      </header>

      {/* 🌟 상단 카테고리 필터 탭 바 디자인 추가 */}
      <div style={tabContainerStyle}>
        <button onClick={() => handleCategoryChange("ALL")} style={tabButtonStyle(filterCategory === "ALL")}>전체 상품</button>
        <button onClick={() => handleCategoryChange("GIFTICON")} style={tabButtonStyle(filterCategory === "GIFTICON")}>🎁 기프티콘</button>
        <button onClick={() => handleCategoryChange("DONATION")} style={tabButtonStyle(filterCategory === "DONATION")}>🤝 기부 캠페인</button>
      </div>

      {/* --- 상품 리스트 그리드 --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '30px', marginBottom: '40px' }}>
        {products.map(p => {
          const isSoldOut = p.status === 'SOLD_OUT' || (p.category === 'GIFTICON' && p.stock <= 0);
          const statusText = p.category === 'DONATION' ? '참여 종료' : '품절';

          const progress = Math.min(100, Math.round((p.currentAmount / p.targetAmount) * 100) || 0);

          return (
            <div key={p.id} style={cardStyle} onClick={() => navigate(`/products/${p.id}`)}>
              <div style={{ position: 'relative', height: '220px', overflow: 'hidden' }}>
                {/* <img src={p.voucherUrl} alt={p.name} style={imageStyle} /> */}
                <ImagePlaceholder
                  src={p.voucherUrl}
                  alt={p.name}
                  category={p.category}
                  style={imageStyle}
                />
                <span style={categoryTagStyle(p.category)}>
                  {p.category === 'DONATION' ? '기부' : '기프티콘'}
                </span>
                {isSoldOut && (
                  <div style={soldOutOverlayStyle}>{statusText}</div>
                )}
              </div>

              <div style={{ padding: '20px' }}>
                <h3 style={productTitleStyle}>{p.name}</h3>

                {p.category === 'DONATION' ? (
                  <div style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ color: '#845ef7', fontWeight: 'bold' }}>{progress}% 달성</span>
                      <span style={{ color: '#adb5bd' }}>목표 {p.targetAmount?.toLocaleString()}P</span>
                    </div>
                    <div style={progressBarBg}>
                      <div style={progressBarFill(progress, '#845ef7')} />
                    </div>
                  </div>
                ) : (
                  <p style={priceStyle}>{p.price.toLocaleString()} <span style={{ fontSize: '14px' }}>P</span></p>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '13px', alignItems: 'center' }}>
                  <span>
                    {p.category === 'DONATION'
                      ? (isSoldOut ? '캠페인 종료' : '참여 무제한')
                      : `재고: ${p.stock}개`}
                  </span>
                  <span style={{ color: isSoldOut ? '#adb5bd' : '#16A87A', fontWeight: 'bold' }}>
                    {isSoldOut
                      ? (p.category === 'DONATION' ? '종료' : '품절')
                      : '상세보기 →'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {products.length === 0 && (
        <div style={{ padding: '80px 0', textAlign: 'center', color: '#adb5bd', fontSize: '16px', fontWeight: '500' }}>
          현재 마켓에 등록된 상품이 없습니다.
        </div>
      )}

      {/* 🌟 하단 정석 실시간 페이지네이션 컨트롤러 추가 */}
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
  );
};

// --- 스타일 객체 ---
const adminLinkBtnStyle = { backgroundColor: '#16A87A', color: '#fff', padding: '10px 22px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(22,168,122,0.2)' };
const cardStyle = { borderRadius: '12px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'transform 0.2s ease, boxShadow 0.2s ease', border: '1px solid #f1f3f5' };
const imageStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const categoryTagStyle = (category) => ({ position: 'absolute', top: '15px', left: '15px', backgroundColor: category === 'DONATION' ? 'rgba(132, 94, 247, 0.9)' : 'rgba(22, 168, 122, 0.9)', color: '#fff', padding: '5px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' });
const soldOutOverlayStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '22px', fontWeight: '800', backdropFilter: 'blur(2px)' };
const productTitleStyle = { fontSize: '19px', margin: '0 0 8px 0', color: '#333', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const priceStyle = { color: '#16A87A', fontWeight: '700', fontSize: '24px', margin: '0 0 15px 0' };
const progressBarBg = { height: '6px', backgroundColor: '#f1f3f5', borderRadius: '3px', overflow: 'hidden' };
const progressBarFill = (pct, color) => ({ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width 0.5s' });

// 🌟 카테고리 탭 메뉴 스타일 추가
const tabContainerStyle = { display: 'flex', gap: '10px', marginBottom: '30px', borderBottom: '1px solid #e9ecef', paddingBottom: '12px' };
const tabButtonStyle = (isActive) => ({
  padding: '10px 20px', borderRadius: '8px', border: 'none',
  backgroundColor: isActive ? '#E6F7F1' : 'transparent',
  color: isActive ? '#0D7A58' : '#495057',
  fontWeight: 'bold', fontSize: '14px', cursor: 'pointer',
  transition: '0.2s ease'
});

// 🌟 하단 페이지네이션 컴포넌트 스킨 스타일
const paginationWrapper = { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0', gap: '15px', marginTop: '20px' };
const pageInfoStyle = { fontSize: '14px', fontWeight: '700', color: '#495057', minWidth: '40px', textAlign: 'center' };
const pageBtnStyle = (disabled) => ({
  padding: '8px 18px', borderRadius: '10px', border: '1px solid #dee2e6',
  backgroundColor: disabled ? '#f8f9fa' : '#fff',
  color: disabled ? '#adb5bd' : '#16A87A',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 'bold', fontSize: '13px', transition: '0.2s ease'
});

export default MarketList;