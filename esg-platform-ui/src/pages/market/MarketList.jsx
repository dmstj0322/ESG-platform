import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const MarketList = () => {
  const [products, setProducts] = useState([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const isAdmin = isSystemAdmin || isCompanyAdmin;

  const companyId = isSystemAdmin ? 0 : (user?.companyId || localStorage.getItem('companyId'));

  useEffect(() => {
    if (companyId) fetchProducts();
  }, [companyId]);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/market/products', { headers: { 'X-Company-Id': companyId } });
      const visibleProducts = res.data.content.filter(p => p.status !== 'HIDDEN');
      setProducts(visibleProducts);
    } catch (err) {
      alert("상품 목록을 불러오지 못했습니다.");
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#1a1a1a', margin: 0 }}>🌱 ESG Market</h2>
        {isAdmin && (
          <button onClick={() => navigate('/admin/products')} style={adminLinkBtnStyle}>
            ⚙️ 상품 관리
          </button>
        )}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '30px' }}>
        {products.map(p => {
          const isSoldOut = p.status === 'SOLD_OUT' || (p.category === 'GIFTICON' && p.stock <= 0);
          const statusText = p.category === 'DONATION' ? '참여 종료' : '품절';
          
          // ✅ 기부 진행률 계산 추가
          const progress = Math.min(100, Math.round((p.currentAmount / p.targetAmount) * 100) || 0);

          return (
            <div key={p.id} style={cardStyle} onClick={() => navigate(`/products/${p.id}`)}>
              <div style={{ position: 'relative', height: '220px', overflow: 'hidden' }}>
                <img src={p.voucherUrl} alt={p.name} style={imageStyle} />
                <span style={categoryTagStyle(p.category)}>
                  {p.category === 'DONATION' ? '기부' : '기프티콘'}
                </span>
                {isSoldOut && (
                  <div style={soldOutOverlayStyle}>{statusText}</div>
                )}
              </div>

              <div style={{ padding: '20px' }}>
                <h3 style={productTitleStyle}>{p.name}</h3>
                
                {/* ✅ 기부 카테고리일 때 진행률 바 렌더링, 아니면 가격 렌더링 */}
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
                  <span style={{ color: isSoldOut ? '#adb5bd' : '#339af0', fontWeight: 'bold' }}>
                    {isSoldOut ? '종료됨' : '상세보기 →'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- 원본 스타일 객체 ---
const adminLinkBtnStyle = { backgroundColor: '#343a40', color: '#fff', padding: '10px 22px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' };
const cardStyle = { borderRadius: '20px', overflow: 'hidden', backgroundColor: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'transform 0.2s ease, boxShadow 0.2s ease', border: '1px solid #f1f3f5' };
const imageStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const categoryTagStyle = (category) => ({ position: 'absolute', top: '15px', left: '15px', backgroundColor: category === 'DONATION' ? 'rgba(132, 94, 247, 0.9)' : 'rgba(51, 154, 240, 0.9)', color: '#fff', padding: '5px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' });
const soldOutOverlayStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '22px', fontWeight: '800', backdropFilter: 'blur(2px)' };
const productTitleStyle = { fontSize: '19px', margin: '0 0 8px 0', color: '#333', fontWeight: '700' };
const priceStyle = { color: '#22b8cf', fontWeight: '900', fontSize: '24px', margin: '0 0 15px 0' };
// 추가된 프로그레스 바 스타일
const progressBarBg = { height: '6px', backgroundColor: '#f1f3f5', borderRadius: '3px', overflow: 'hidden' };
const progressBarFill = (pct, color) => ({ width: `${pct}%`, height: '100%', backgroundColor: color, transition: 'width 0.5s' });

export default MarketList;