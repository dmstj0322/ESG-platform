import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import ImagePlaceholder from '../../components/market/ImagePlaceholder';
import { toast } from 'react-toastify';

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
      // alert("로그인이 필요합니다.");
      toast.info("로그인이 필요합니다.", { containerId: 'main-toast' });
      return navigate('/login');
    }

    const confirmMsg = product.category === 'GIFTICON'
      ? "구매하시겠습니까? 결제 완료 후 등록된 이메일로 바코드가 발송됩니다."
      : "기부에 참여하시겠습니까? 포인트가 차감됩니다.";

    if (!window.confirm(confirmMsg)) return;

    try {
      await api.post('/market/orders', { productId: product.id, count: 1 }, {
        headers: { 'X-Member-Id': user.memberId, 'X-Company-Id': user.companyId }
      });
      // alert('주문이 완료되었습니다! 마이페이지에서 확인하세요.');
      const successMsg = product.category === 'GIFTICON' ? "🎁 구매가 완료되었습니다!" : "🤝 기부가 완료되었습니다! 감사합니다.";
      toast.success(successMsg, { containerId: 'main-toast' });
      navigate('/mypage');
    } catch (error) {
      // alert(error.response?.data?.message || "포인트가 부족하거나 처리 중 오류가 발생했습니다.");
      toast.error(err.response?.data?.message || "결제에 실패했습니다.", { containerId: 'main-toast' });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '50px' }}>상품 정보를 불러오는 중...</div>;
  if (!product) return <div style={{ textAlign: 'center', padding: '50px' }}>상품을 찾을 수 없습니다.</div>;

  const isSoldOut = product.status === 'SOLD_OUT' || (product.category === 'GIFTICON' && product.stock <= 0);
  const buttonText = isSoldOut
    ? (product.category === 'DONATION' ? "참여 종료" : "품절된 상품")
    : (product.category === 'DONATION' ? "지금 기부하기" : "지금 구매하기");

  // ✅ 상세 진행률 계산
  const progress = Math.min(100, Math.round((product.currentAmount / product.targetAmount) * 100) || 0);

  return (
    <div style={containerStyle}>
      <div style={imageContainerStyle}>
        {/* <img src={product.voucherUrl} alt={product.name} style={imageStyle} /> */}
        <ImagePlaceholder
          src={product.voucherUrl}
          alt={product.name}
          category={product.category}
          style={imageStyle}
          size="large"
        />
        {isSoldOut && <div style={soldOutBadge}>{product.category === 'DONATION' ? "종료" : "품절"}</div>}
      </div>

      <div style={infoContainerStyle}>
        <span style={categoryStyle}>{product.category}</span>
        <h1 style={titleStyle}>{product.name}</h1>
        <p style={descriptionStyle}>{product.content}</p>

        {/* ✅ 기부 상품일 경우 진행률 현황판 표시 */}
        {product.category === 'DONATION' && (
          <div style={donationProgressBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '15px' }}>
              <span style={{ fontWeight: 'bold', color: '#845ef7' }}>현재 달성률 {progress}%</span>
              <span style={{ color: '#868e96' }}>목표 {product.targetAmount?.toLocaleString()} P</span>
            </div>
            <div style={{ height: '12px', backgroundColor: '#e9ecef', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#845ef7', transition: 'width 0.5s' }} />
            </div>
            <div style={{ textAlign: 'right', marginTop: '10px', fontWeight: 'bold', color: '#333' }}>
              모인 금액: {product.currentAmount?.toLocaleString()} P
            </div>
          </div>
        )}

        <div style={priceCardStyle}>
          <div style={priceRowStyle}>
            <span>{product.category === 'DONATION' ? '기부 참여 금액' : '판매 가격'}</span>
            <span style={priceStyle}>{product.price.toLocaleString()} P</span>
          </div>
          <div style={priceRowStyle}>
            <span>남은 수량</span>
            <span>{product.category === 'DONATION' ? (isSoldOut ? '참여 종료' : '무제한') : `${product.stock}개`}</span>
          </div>
        </div>

        <div style={noticeBoxStyle}>
          <p style={noticeTitle}>📢 구매 전 확인하세요!</p>
          <ul>
            <li>본 상품은 디지털 바우처이며, 구매 즉시 이메일로 발송되고 마이페이지에 등록됩니다.</li>
            <li>기부 상품은 별도의 바우처가 발급되지 않으며 인증서가 제공됩니다.</li>
            <li>디지털 상품 특성상 처리 후에는 취소가 불가할 수 있습니다.</li>
          </ul>
        </div>

        <button
          onClick={handleOrder}
          disabled={isSoldOut}
          style={isSoldOut ? disabledBtnStyle : activeBtnStyle}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};

// --- 원본 Styles 유지 ---
const containerStyle = { display: 'flex', flexWrap: 'wrap', gap: '50px', padding: '30px 20px', maxWidth: '1200px', margin: '0 auto' };
const imageContainerStyle = { flex: 1, minWidth: '280px', position: 'relative' };
const imageStyle = { width: '100%', maxWidth: '500px', height: 'auto', borderRadius: '12px', border: '1px solid #e9ecef', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', margin: '0 auto', display: 'block' };
const infoContainerStyle = { flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column' };
const categoryStyle = { color: '#16A87A', fontWeight: 'bold', fontSize: '18px' };
const titleStyle = { fontSize: '26px', margin: '10px 0 20px 0' };
const descriptionStyle = { color: '#666', lineHeight: '1.6', marginBottom: '30px' };
const priceCardStyle = { backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', marginBottom: '30px' };
const priceRowStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '18px' };
const priceStyle = { fontSize: '24px', fontWeight: 'bold', color: '#16A87A' };
const noticeBoxStyle = { backgroundColor: '#fff4f2', padding: '20px', borderRadius: '10px', marginBottom: '30px', fontSize: '14px' };
const noticeTitle = { fontWeight: 'bold', color: '#fa5252', marginBottom: '10px' };
const activeBtnStyle = { padding: '20px', fontSize: '20px', fontWeight: 'bold', color: '#fff', backgroundColor: '#16A87A', border: 'none', borderRadius: '10px', cursor: 'pointer' };
const disabledBtnStyle = { ...activeBtnStyle, backgroundColor: '#adb5bd', cursor: 'not-allowed' };
const soldOutBadge = { position: 'absolute', top: '20px', left: '20px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold' };
const donationProgressBox = { backgroundColor: '#f3f0ff', padding: '20px', borderRadius: '12px', marginBottom: '20px' };

export default ProductDetail;