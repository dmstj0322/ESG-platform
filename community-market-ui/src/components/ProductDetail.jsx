import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const ProductDetail = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await api.get(`/market/products/${productId}`, {
          headers: { 'X-Company-Id': user?.companyId || localStorage.getItem('companyId') }
        });
        setProduct(res.data);
      } catch (err) {
        console.error("상세 정보 로드 실패");
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [productId, user?.companyId]);

  const handleOrder = async () => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return navigate('/login');
    }

    const confirmMsg = product.category === 'GIFTICON' 
      ? "구매하시겠습니까? 결제 완료 후 등록된 이메일로 바코드가 발송됩니다." 
      : "기부에 참여하시겠습니까? 포인트가 차감됩니다.";

    if (!window.confirm(confirmMsg)) return;

    try {
      await api.post('/market/orders', { 
        productId: product.id, 
        count: 1 
      }, {
        headers: { 
          'X-Member-Id': user.memberId, 
          'X-Company-Id': user.companyId 
        }
      });
      alert('주문이 완료되었습니다! 마이페이지에서 확인하세요.');
      //구매가 완료되었습니다! 이메일을 확인해주세요.
      // navigate('/mypage');
      navigate('/mypage');
    } catch (error) {
      alert(error.response?.data?.message || "포인트가 부족하거나 처리 중 오류가 발생했습니다.");
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>상품 정보를 불러오는 중...</div>;
  if (!product) return <div style={{ textAlign: 'center', padding: '50px' }}>상품을 찾을 수 없습니다.</div>;

//   return (
//     <div style={{ display: 'flex', gap: '50px', padding: '60px', maxWidth: '1100px', margin: '0 auto' }}>
//       {/* 왼쪽: 상품 이미지 구역 */}
//       <div style={{ flex: 1, backgroundColor: '#f8f9fa', borderRadius: '15px', height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #eee' }}>
//         <span style={{ fontSize: '100px' }}>{product.category === 'GIFTICON' ? '🎫' : '🎁'}</span>
//       </div>

//       {/* 오른쪽: 구매 정보 구역 */}
//       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
//         <span style={{ color: '#20c997', fontWeight: 'bold', fontSize: '18px' }}>{product.category}</span>
//         <h1 style={{ fontSize: '36px', margin: '15px 0' }}>{product.name}</h1>
//         <p style={{ color: '#666', lineHeight: '1.8', marginBottom: '30px', minHeight: '100px' }}>{product.content}</p>
        
//         <div style={{ borderTop: '2px solid #eee', paddingTop: '30px' }}>
//           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px' }}>
//             <span style={{ fontSize: '20px', color: '#888' }}>판매 가격</span>
//             <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#20c997' }}>{product.price.toLocaleString()} P</span>
//           </div>
          
//           <button 
//             onClick={handleOrder}
//             disabled={product.stock <= 0}
//             style={{
//               width: '100%',
//               padding: '20px',
//               fontSize: '20px',
//               fontWeight: 'bold',
//               color: '#fff',
//               backgroundColor: product.stock <= 0 ? '#dee2e6' : '#20c997',
//               border: 'none',
//               borderRadius: '8px',
//               cursor: product.stock <= 0 ? 'not-allowed' : 'pointer'
//             }}
//           >
//             {product.stock <= 0 ? "품절된 상품입니다" : "구매하기"}
//           </button>
//           <p style={{ textAlign: 'center', color: '#999', marginTop: '15px', fontSize: '14px' }}>
//             현재 잔여 재고: {product.stock}개
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// };

console.log("백엔드 데이터:", product);

  return (
    <div style={containerStyle}>
      {/* 1. 상품 홍보 이미지 (S3 URL) */}
      <div style={imageContainerStyle}>
        <img src={product.voucherUrl} alt={product.name} style={imageStyle} />
        {product.stock <= 0 && <div style={soldOutBadge}>품절</div>}
      </div>

      {/* 2. 상품 정보 섹션 */}
      <div style={infoContainerStyle}>
        <span style={categoryStyle}>{product.category}</span>
        <h1 style={titleStyle}>{product.name}</h1>
        <p style={descriptionStyle}>{product.content}</p>

        <div style={priceCardStyle}>
          <div style={priceRowStyle}>
            <span>판매 가격</span>
            <span style={priceStyle}>{product.price.toLocaleString()} P</span>
          </div>
          <div style={priceRowStyle}>
            <span>남은 수량</span>
            <span>{product.stock}개</span>
          </div>
        </div>

        {/* 3. 구매 안내 사항 */}
        <div style={noticeBoxStyle}>
          <p style={noticeTitle}>📢 구매 전 확인하세요!</p>
          <ul>
            <li>본 상품은 디지털 바우처이며, 구매 즉시 이메일로 발송됩니다.</li>
            <li>마이페이지 {'>'} 주문내역에서도 바코드를 확인하실 수 있습니다.</li>
            <li>디지털 상품 특성상 발송 후에는 환불이 불가합니다.</li>
          </ul>
        </div>

        <button 
          onClick={handleOrder}
          disabled={product.stock <= 0}
          style={product.stock <= 0 ? disabledBtnStyle : activeBtnStyle}
        >
          {product.stock <= 0 ? "재고 부족" : "지금 구매하기"}
        </button>
      </div>
    </div>
  );
};

// --- Styles ---
const containerStyle = { display: 'flex', gap: '50px', padding: '50px', maxWidth: '1200px', margin: '0 auto' };
const imageContainerStyle = { flex: 1, position: 'relative' };
const imageStyle = { width: '100%', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' };
const infoContainerStyle = { flex: 1, display: 'flex', flexDirection: 'column' };
const categoryStyle = { color: '#339af0', fontWeight: 'bold', fontSize: '18px' };
const titleStyle = { fontSize: '36px', margin: '10px 0 20px 0' };
const descriptionStyle = { color: '#666', lineHeight: '1.6', marginBottom: '30px' };
const priceCardStyle = { backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', marginBottom: '30px' };
const priceRowStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '18px' };
const priceStyle = { fontSize: '24px', fontWeight: 'bold', color: '#22b8cf' };
const noticeBoxStyle = { backgroundColor: '#fff4f2', padding: '20px', borderRadius: '10px', marginBottom: '30px', fontSize: '14px' };
const noticeTitle = { fontWeight: 'bold', color: '#fa5252', marginBottom: '10px' };
const activeBtnStyle = { padding: '20px', fontSize: '20px', fontWeight: 'bold', color: '#fff', backgroundColor: '#339af0', border: 'none', borderRadius: '10px', cursor: 'pointer' };
const disabledBtnStyle = { ...activeBtnStyle, backgroundColor: '#adb5bd', cursor: 'not-allowed' };
const soldOutBadge = { position: 'absolute', top: '20px', left: '20px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold' };
const centerStyle = { textAlign: 'center', padding: '100px', fontSize: '20px' };

export default ProductDetail;