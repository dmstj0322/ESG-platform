import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Barcode from 'react-barcode';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import html2canvas from 'html2canvas';

const VoucherDetail = () => {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [base64Image, setBase64Image] = useState("");

  const convertToBase64 = async (url) => {
    try {
      const cacheBusterUrl = `${url}?t=${new Date().getTime()}`;
      const response = await fetch(cacheBusterUrl, { mode: 'cors' });
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("이미지 변환 실패:", e);
      return url; 
    }
  };

  useEffect(() => {
    const fetchVoucher = async () => {
      const token = localStorage.getItem('accessToken');
      if (!user && !token) {
        alert("로그인이 필요한 서비스입니다.");
        navigate('/login');
        return;
      }
      try {
        const res = await api.get(`/market/orders/${orderId}/view`, {
          headers: {
            'X-Member-Id': user?.memberId || localStorage.getItem('memberId'),
            'X-Company-Id': user?.companyId || localStorage.getItem('companyId')
          }
        });
        setData(res.data);
        if (res.data.voucherUrl) {
          const b64 = await convertToBase64(res.data.voucherUrl);
          setBase64Image(b64);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          navigate('/login');
        } else {
          alert("접근 권한이 없거나 존재하지 않는 바우처입니다.");
          navigate(-1);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchVoucher();
  }, [orderId, user, navigate]);

  // 📸 이미지 저장 로직
  const handleDownloadImage = async () => {
    const element = document.querySelector(".ticket-card");
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 3, 
        useCORS: true,
        backgroundColor: "#f1f3f5", 
        onclone: (clonedDoc) => {
          const clonedCard = clonedDoc.querySelector(".ticket-card");
          // 캡처 시 강제 고정 수치 (찌그러짐 방지 핵심)
          clonedCard.style.width = "400px";
          clonedCard.style.boxShadow = "none";
          
          const imgContainer = clonedDoc.querySelector(".img-container");
          if (imgContainer) {
            imgContainer.style.height = "250px"; // 👈 저장 시 사진 높이 고정
          }
        }
      });

      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `GreenTrace_${data.productName}.png`;
      link.click();
    } catch (error) {
      alert("이미지 저장에 실패했습니다.");
    }
  };

  if (loading) return <div style={centerStyle}>바우처를 로딩 중입니다...</div>;
  if (!data) return <div style={centerStyle}>정보를 찾을 수 없습니다.</div>;

  const isDonation = data.category === 'DONATION';

  return (
    <div style={containerStyle}>
      <style>{printStyles}</style>

      <div className="no-print" style={topNavStyle}>
        <button onClick={() => navigate(-1)} style={backBtnStyle}>〈 뒤로가기</button>
      </div>

      <div className="ticket-card" style={isDonation ? certCardStyle : voucherCardStyle}>
        {isDonation ? (
          <div className="cert-inner" style={certInnerStyle}>
            <div style={certBadgeStyle}>CERTIFICATE OF DONATION</div>
            <h1 style={certTitleStyle}>기부 인증서</h1>
            <div style={dividerStyle} />
            <p style={certDescStyle}>
              위 사람은 <strong>Green-Trace</strong>를 통해<br />
              나누어 주신 따뜻한 마음,<br />
              <span style={{ color: '#b8860b', fontWeight: 'bold' }}>[{data.productName}]</span>에 참여하였기에<br />
              이 인증서를 수여합니다.
            </p>
            <p style={certDateStyle}>{new Date(data.orderDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <h3 style={brandNameStyle}>Green-Trace ESG Platform</h3>
          </div>
        ) : (
          <div style={{ textAlign: 'left' }}>
            <div style={voucherHeaderStyle}>
              <h2 style={{ margin: 0, color: '#333', fontSize: '20px' }}>Mobile Voucher</h2>
              <span style={categoryBadgeStyle}>GIFTICON</span>
            </div>

            {/* 📸 이미지 컨테이너 (고정 높이 부여) */}
            <div className="img-container" style={imageContainerStyle}>
              <img
                src={base64Image || 'https://via.placeholder.com/400x300?text=Green-Trace'}
                alt="product"
                style={productImgStyle}
              />
            </div>

            <div style={productInfoBox}>
              <div style={productLabelStyle}>상품명</div>
              <div style={productNameStyle}>{data.productName}</div>
            </div>

            <div style={barcodeAreaStyle}>
              <div style={{ display: 'inline-block', width: '100%', maxWidth: '280px' }}>
                <Barcode
                  value={data.serialNumber}
                  width={1.2}
                  height={60}
                  fontSize={14}
                  margin={0}
                  displayValue={false}
                />
              </div>
              <div style={serialNumberText}>{data.serialNumber}</div>
            </div>

            <div style={guideBoxStyle}>
              <p>• 사용처: {data.productName} 전국 제휴 매장</p>
              <p>• 유효기간: 발행일로부터 90일 이내</p>
              <p style={{ color: '#fa5252' }}>• 결제 시 바코드를 보여주세요.</p>
            </div>
          </div>
        )}
      </div>

      <div className="no-print" style={buttonGroupStyle}>
        <button onClick={handleDownloadImage} style={primaryBtnStyle}>📸 이미지로 저장</button>
        <button onClick={() => window.print()} style={secondaryBtnStyle}>🖨️ PDF / 인쇄</button>
      </div>
    </div>
  );
};

// --- 스타일링 (고정 수치 적용) ---
const centerStyle = { textAlign: 'center', padding: '100px', color: '#888' };
const containerStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', backgroundColor: '#f1f3f5', minHeight: '100vh' };
const topNavStyle = { width: '100%', maxWidth: '400px', marginBottom: '20px' };
const backBtnStyle = { background: 'none', border: 'none', color: '#868e96', cursor: 'pointer', fontSize: '14px' };

const voucherCardStyle = { 
  backgroundColor: '#fff', 
  width: '100%', 
  maxWidth: '400px', // 👈 웹 화면에서도 너무 크지 않게 제한
  padding: '30px', 
  borderRadius: '24px', 
  boxShadow: '0 15px 35px rgba(0,0,0,0.08)', 
  boxSizing: 'border-box' 
};

const certCardStyle = { ...voucherCardStyle, border: '10px double #d4af37', backgroundColor: '#fffcf5', padding: '10px' };
const certInnerStyle = { border: '1px solid #d4af37', padding: '40px 20px', textAlign: 'center' };
const certBadgeStyle = { color: '#b8860b', fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px', marginBottom: '20px' };
const certTitleStyle = { fontFamily: 'serif', fontSize: '30px', color: '#5c4033', marginBottom: '20px' };
const dividerStyle = { borderTop: '2px solid #d4af37', width: '50px', margin: '0 auto 25px' };
const certDescStyle = { fontSize: '16px', lineHeight: '1.8', color: '#444', marginBottom: '30px' };
const certDateStyle = { color: '#999', fontSize: '14px' };
const brandNameStyle = { marginTop: '20px', fontWeight: '900', color: '#1a1a1a' };

const voucherHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' };
const categoryBadgeStyle = { backgroundColor: '#e7f5ff', color: '#339af0', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 'bold' };

const imageContainerStyle = { 
  width: '100%', 
  height: '250px', // 👈 웹페이지 이미지 크기 고정
  borderRadius: '16px', 
  overflow: 'hidden', 
  marginBottom: '20px',
  backgroundColor: '#f8f9fa'
};

const productImgStyle = { 
  width: '100%', 
  height: '100%', 
  objectFit: 'cover' // 👈 찌그러짐 방지
};

const productInfoBox = { marginBottom: '25px' };
const productLabelStyle = { fontSize: '12px', color: '#adb5bd', marginBottom: '4px' };
const productNameStyle = { fontSize: '20px', fontWeight: '800', color: '#212529' };

const barcodeAreaStyle = { 
  textAlign: 'center', 
  backgroundColor: '#fff', 
  padding: '20px 10px', 
  border: '1px solid #e9ecef', 
  borderRadius: '16px', 
  marginBottom: '20px', 
  overflow: 'hidden' 
};

const serialNumberText = { marginTop: '10px', fontSize: '17px', fontWeight: 'bold', letterSpacing: '3px', color: '#495057' };
const guideBoxStyle = { backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', fontSize: '13px', color: '#868e96', lineHeight: '1.6' };

const buttonGroupStyle = { display: 'flex', gap: '10px', width: '100%', maxWidth: '400px', marginTop: '25px' };
const primaryBtnStyle = { flex: 1, padding: '14px', backgroundColor: '#339af0', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' };
const secondaryBtnStyle = { ...primaryBtnStyle, backgroundColor: '#495057' };

const printStyles = `
  @media print {
    @page { margin: 10mm; } /* 인쇄 시 최소 여백 */
    body { background: white !important; margin: 0 !important; }
    .no-print { display: none !important; }
    .ticket-card { 
      width: 400px !important; /* 👈 PDF에서 잘리지 않도록 너비 고정 */
      margin: 0 auto !important; 
      box-shadow: none !important; 
      border: 1px solid #eee !important;
      position: static !important; /* absolute 해제 */
    }
  }
`;

export default VoucherDetail;