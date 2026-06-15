import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Barcode from 'react-barcode';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
// 🌟 html2canvas 대신 html-to-image 사용
import { toPng } from 'html-to-image'; 

const VoucherDetail = () => {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [base64Image, setBase64Image] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  
  const responsiveFont = (mobile, desktop) => (windowWidth < 500 ? mobile : desktop);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const handleDownloadImage = async () => {
    if (isDownloading) return;

    const element = document.querySelector(".ticket-card");
    if (!element) return;

    try {
      setIsDownloading(true);
      await document.fonts.ready; 
      await new Promise(resolve => setTimeout(resolve, 200)); 

      // 🌟 html-to-image 변환 로직 (브라우저 렌더링 100% 일치)
      const dataUrl = await toPng(element, {
        cacheBust: true,
        pixelRatio: 2, 
        backgroundColor: "#fcfcfc",
        style: {
          width: '400px', // 이미지 가로폭 고정
          margin: '0',
          boxShadow: 'none',
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `GreenTrace_${data.productName}.png`;
      link.click();
    } catch (error) {
      console.error("이미지 저장 에러:", error);
      alert("이미지 저장에 실패했습니다.");
    } finally {
      setIsDownloading(false);
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
          <div className="cert-inner" style={{
            ...certInnerStyle,
            padding: windowWidth < 500 ? '2.5rem 10%' : '4rem 2rem'
          }}>
            <div style={{ width: '100%' }}>
              <div style={{ ...certBadgeStyle, fontSize: responsiveFont('10px', '11px') }}>CERTIFICATE OF DONATION</div>
              <h1 style={{ ...certTitleStyle, fontSize: responsiveFont('20px', '30px') }}>기부 인증서</h1>
              <p style={{ color: '#888', fontSize: responsiveFont('10px', '11px'), marginBottom: '15px' }}>No. {data.certificateNumber}</p>
              <div style={dividerStyle} />
            </div>
            
            <div style={certMiddleWrapper}>
              <p style={{ ...certDescStyle, margin: 0, fontSize: responsiveFont('13px', '16px'), lineHeight: '1.6' }}>
                위 사람은 <strong>Green-Trace</strong>를 통해<br />
                나누어 주신 따뜻한 마음,<br />
                <span style={{ color: '#b8860b', fontWeight: 'bold' }}>[{data.productName}]</span>에 참여하였기에<br />
                이 인증서를 수여합니다.
              </p>
            </div>
            
            <div>
              <p style={{ ...certDateStyle, margin: '0 0 8px 0', fontSize: responsiveFont('12px', '14px') }}>
                {new Date(data.orderDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <h3 style={{ ...brandNameStyle, margin: 0, fontSize: responsiveFont('14px', '18px') }}>Green-Trace ESG Platform</h3>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'left' }}>
            <div style={voucherHeaderStyle}>
              <h2 style={{ margin: 0, color: '#333', fontSize: responsiveFont('18px', '20px') }}>Mobile Voucher</h2>
              <span style={categoryBadgeStyle}>GIFTICON</span>
            </div>

            <div className="img-container" style={imageContainerStyle}>
              <img src={base64Image} alt="product" style={productImgStyle} />
            </div>

            <div style={productInfoBox}>
              <div style={productLabelStyle}>상품명</div>
              <div style={{ ...productNameStyle, fontSize: responsiveFont('16px', '20px') }}>{data.productName}</div>
            </div>

            <div style={barcodeAreaStyle}>
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <Barcode 
                  value={data.serialNumber} 
                  width={windowWidth < 500 ? 1.0 : 1.2} 
                  height={windowWidth < 500 ? 50 : 60} 
                  fontSize={14} 
                  margin={0} 
                  displayValue={false} 
                />
              </div>
              <div style={{ ...serialNumberText, fontSize: responsiveFont('14px', '17px') }}>
                {data.serialNumber}
              </div>
            </div>

            <div style={guideBoxStyle}>
              <p style={{ fontSize: responsiveFont('11px', '13px'), margin: '0 0 5px 0' }}>• 사용처: {data.productName} 전국 제휴 매장</p>
              <p style={{ fontSize: responsiveFont('11px', '13px'), margin: '0 0 5px 0' }}>• 유효기간: 발행일로부터 90일 이내</p>
              <p style={{ fontSize: responsiveFont('11px', '13px'), color: '#fa5252', margin: 0 }}>• 결제 시 바코드를 보여주세요.</p>
            </div>
          </div>
        )}
      </div>

      <div className="no-print" style={buttonGroupStyle}>
        <button 
          onClick={handleDownloadImage} 
          style={{ ...primaryBtnStyle, opacity: isDownloading ? 0.7 : 1, cursor: isDownloading ? 'wait' : 'pointer' }}
          disabled={isDownloading}
        >
          {isDownloading ? '⏳ 저장 중...' : '📸 이미지로 저장'}
        </button>
        <button onClick={() => window.print()} style={secondaryBtnStyle}>🖨️ PDF / 인쇄</button>
      </div>
    </div>
  );
};

// --- 스타일 객체 ---

const containerStyle = { 
  display: 'flex', 
  flexDirection: 'column', 
  alignItems: 'center', 
  padding: '2.5rem 1.25rem', 
  backgroundColor: '#f1f3f5', 
  minHeight: '100vh',
  width: '100%',
  boxSizing: 'border-box'
};

const voucherCardStyle = {
  backgroundColor: '#fff',
  width: '100%',
  maxWidth: '25rem',
  padding: '1.5rem',
  borderRadius: '0.75rem',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  boxSizing: 'border-box',
  margin: '0 auto'
};

const certCardStyle = {
  ...voucherCardStyle,
  border: '0.625rem double #d4af37',
  backgroundColor: '#fffcf5',
  padding: '0.75rem',
  minHeight: '37rem',
  display: 'flex',
  flexDirection: 'column'
};

const certInnerStyle = {
  border: '1px solid #d4af37',
  backgroundColor: '#fff', 
  textAlign: 'center',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  boxSizing: 'border-box'
};

const imageContainerStyle = { width: '100%', height: '250px', borderRadius: '1rem', overflow: 'hidden', marginBottom: '1.25rem', backgroundColor: '#f8f9fa' };
const buttonGroupStyle = { display: 'flex', gap: '0.625rem', width: '100%', maxWidth: '25rem', marginTop: '1.5rem' };

const topNavStyle = { width: '100%', maxWidth: '25rem', marginBottom: '1.25rem' };
const backBtnStyle = { background: 'none', border: 'none', color: '#868e96', cursor: 'pointer', fontSize: '14px', padding: 0 };
const centerStyle = { textAlign: 'center', padding: '100px', color: '#888' };

const certMiddleWrapper = { margin: '50px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' };
const certBadgeStyle = { color: '#b8860b', fontWeight: 'bold', letterSpacing: '2px', marginBottom: '10px' };
const certTitleStyle = { fontFamily: 'serif', color: '#5c4033', margin: '0' };
const dividerStyle = { borderTop: '2px solid #d4af37', width: '50px', margin: '0 auto 25px' };
const certDescStyle = { color: '#444', marginBottom: '30px' };
const certDateStyle = { color: '#999' };
const brandNameStyle = { marginTop: '20px', fontWeight: '900', color: '#1a1a1a' };

const voucherHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' };
const categoryBadgeStyle = { backgroundColor: '#E6F7F1', color: '#0D7A58', padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 'bold' };

const productImgStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const productInfoBox = { marginBottom: '25px' };
const productLabelStyle = { fontSize: '12px', color: '#adb5bd', marginBottom: '4px' };
const productNameStyle = { fontWeight: '800', color: '#212529' };

const barcodeAreaStyle = { textAlign: 'center', backgroundColor: '#fff', padding: '20px 10px', border: '1px solid #e9ecef', borderRadius: '16px', marginBottom: '20px', overflow: 'hidden' };
const serialNumberText = { marginTop: '10px', fontWeight: 'bold', letterSpacing: '3px', color: '#495057' };
const guideBoxStyle = { backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', color: '#868e96', lineHeight: '1.6' };

const primaryBtnStyle = { flex: 1, padding: '14px', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', whiteSpace: 'nowrap' };
const secondaryBtnStyle = { ...primaryBtnStyle, backgroundColor: '#495057' };

const printStyles = `
  @media print {
    @page { margin: 0; }
    body * { visibility: hidden !important; }
    .ticket-card, .ticket-card * { visibility: visible !important; }
    .ticket-card {
      position: absolute !important; left: 50% !important; top: 15mm !important;
      transform: translateX(-50%) !important; width: 400px !important; height: !important;
      margin: 0 !important; border: 1px solid #dee2e6 !important; box-shadow: none !important;
    }
    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

export default VoucherDetail;