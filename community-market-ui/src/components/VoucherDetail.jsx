// import React, { useEffect, useState } from 'react';
// import { useParams } from 'react-router-dom';
// import Barcode from 'react-barcode'; 
// import api from '../api';
// import { useAuth } from '../context/AuthContext';

// const VoucherDetail = () => {
//   const { orderId } = useParams();
//   const { user } = useAuth();
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     const fetchVoucher = async () => {
//       try {
//         // OrderController의 getOrderDetailsForView 호출
//         const res = await api.get(`/market/orders/${orderId}/view`);
//         setData(res.data);
//         console.log(res.data);
//       } catch (err) {
//         alert("바우처 정보를 불러올 수 없거나 권한이 없습니다.");
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchVoucher();
//   }, [orderId]);

//   if (loading) return <div style={{ textAlign: 'center', padding: '100px' }}>Loading...</div>;
//   if (!data) return <div style={{ textAlign: 'center', padding: '100px' }}>정보를 찾을 수 없습니다.</div>;

//   const isDonation = data.category === 'DONATION';

//   return (
//     <div style={containerStyle}>
//       <div style={ticketCardStyle}>
//         {isDonation ? (
//           /* --- 기부 인증서 UI --- */
//           <div style={certDecorStyle}>
//             <h1 style={{ fontFamily: 'serif', color: '#b8860b' }}>Donation Certificate</h1>
//             <p style={{ fontSize: '18px', margin: '30px 0', lineHeight: '1.6' }}>
//               따뜻한 마음을 나누어 주셔서 감사합니다. <br />
//               <strong>{data.productName}</strong> 캠페인에 소중한 기부가 전달되었습니다.
//             </p>
//             <div style={{ borderTop: '1px solid #d4af37', width: '60%', margin: '0 auto 20px' }} />
//             <p style={{ color: '#888' }}>{data.orderDate.split('T')[0]}</p>
//             <p style={{ fontWeight: 'bold', fontSize: '18px', marginTop: '10px' }}>Green Trace ESG Market</p>
//           </div>
//         ) : (
//           /* --- 기프티콘 바코드 UI --- */
//           <div>
//             <h2 style={{ color: '#20c997', margin: 0 }}>Mobile Voucher</h2>
//             <hr style={{ border: '0.5px solid #eee', margin: '20px 0' }} />
//             <img src={data.voucherUrl} alt="상품" style={{ width: '100%', borderRadius: '8px', marginBottom: '20px' }} />
//             <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{data.productName}</p>
            
//             <div style={{ margin: '30px 0', display: 'flex', justifyContent: 'center' }}>
//               <Barcode value={data.serialNumber} width={2} height={80} />
//             </div>
            
//             <div style={infoBoxStyle}>
//               <p>📍 사용처: {data.productName} 제휴 매장</p>
//               <p>🎫 핀번호: {data.serialNumber}</p>
//             </div>
//           </div>
//         )}
        
//         <button onClick={() => window.print()} style={printBtnStyle}>
//           {isDonation ? "인증서 PDF 저장" : "바코드 이미지 저장"}
//         </button>
//       </div>
//     </div>
//   );
// };

// // --- 스타일 ---
// const containerStyle = { display: 'flex', justifyContent: 'center', padding: '50px 20px', backgroundColor: '#f4f4f4', minHeight: '80vh' };
// const ticketCardStyle = { backgroundColor: '#fff', width: '100%', maxWidth: '450px', padding: '40px', borderRadius: '15px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' };
// const certDecorStyle = { border: '5px double #d4af37', padding: '30px 20px', backgroundColor: '#fffcf5' };
// const infoBoxStyle = { textAlign: 'left', fontSize: '14px', color: '#666', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', lineHeight: '1.6' };
// const printBtnStyle = { marginTop: '30px', width: '100%', padding: '15px', backgroundColor: '#339af0', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };

// export default VoucherDetail;

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // useNavigate 추가
import Barcode from 'react-barcode'; 
import api from '../api';
import { useAuth } from '../context/AuthContext';

const VoucherDetail = () => {
  const { orderId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate(); // 페이지 이동을 위해 추가
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVoucher = async () => {
      // 1. 방어 로직: 유저 정보가 없으면(로그인 안 됨) 백엔드에 요청하기 전에 로그인 페이지로 보냅니다.
      const token = localStorage.getItem('accessToken'); // 또는 프로젝트의 토큰 저장 방식
      if (!user && !token) {
        alert("로그인이 필요한 서비스입니다. 로그인 후 다시 링크를 클릭해 주세요.");
        navigate('/login');
        return;
      }

      try {
        // 2. 혹시 MSA 환경에서 헤더를 요구할 수 있으므로, 내 정보를 같이 실어서 보냅니다.
        const res = await api.get(`/market/orders/${orderId}/view`, {
          headers: { 
            'X-Member-Id': user?.memberId || localStorage.getItem('memberId'),
            'X-Company-Id': user?.companyId || localStorage.getItem('companyId')
          }
        });
        setData(res.data);
      } catch (err) {
        // 3. 401 에러(인증 실패)를 명시적으로 잡아서 처리합니다.
        if (err.response?.status === 401) {
          alert("로그인이 만료되었습니다. 다시 로그인해 주세요.");
          navigate('/login');
        } else {
          alert("바우처 정보를 불러올 수 없거나 내 주문 내역이 아닙니다.");
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchVoucher();
  }, [orderId, user, navigate]);

  if (loading) return <div style={{ textAlign: 'center', padding: '100px' }}>Loading...</div>;
  if (!data) return <div style={{ textAlign: 'center', padding: '100px' }}>정보를 찾을 수 없습니다.</div>;

  const isDonation = data.category === 'DONATION';

  console.log(data);

  return (
    <div style={containerStyle}>
      <style>{printStyles}</style>
      <div>
        {isDonation ? (
          /* --- 기부 인증서 UI --- */
          <div style={certDecorStyle}>
            <h1 style={{ fontFamily: 'serif', color: '#b8860b' }}>Donation Certificate</h1>
            <p style={{ fontSize: '18px', margin: '30px 0', lineHeight: '1.6' }}>
              따뜻한 마음을 나누어 주셔서 감사합니다. <br />
              <strong>{data.productName}</strong> 캠페인에 소중한 기부가 전달되었습니다.
            </p>
            <div style={{ borderTop: '1px solid #d4af37', width: '60%', margin: '0 auto 20px' }} />
            <p style={{ color: '#888' }}>{new Date(data.orderDate).toLocaleDateString()}</p>
            <p style={{ fontWeight: 'bold', fontSize: '18px', marginTop: '10px' }}>Green Trace ESG Market</p>
          </div>
        ) : (
          /* --- 기프티콘 바코드 UI --- */
          <div style={ticketCardStyle}>
            <h2 style={{ color: '#20c997', margin: 0 }}>Mobile Voucher</h2>
            <hr style={{ border: '0.5px solid #eee', margin: '20px 0' }} />
            {/* 이미지가 없을 경우를 대비한 안전장치 추가 */}
            <img 
              src={data.voucherUrl || 'https://via.placeholder.com/300x200?text=No+Image'} 
              alt="상품" 
              style={{ width: '100%', borderRadius: '8px', marginBottom: '20px' }} 
            />
            <p style={{ fontSize: '18px', fontWeight: 'bold' }}>{data.productName}</p>
            
            <div style={{ margin: '30px 0', display: 'flex', justifyContent: 'center' }}>
              <Barcode value={data.serialNumber} width={2} height={80} />
            </div>
            
            <div style={infoBoxStyle}>
              <p>📍 사용처: {data.productName} 제휴 매장</p>
              <p>🎫 핀번호: {data.serialNumber}</p>
            </div>
          </div>
        )}
        
        <button onClick={() => window.print()} style={printBtnStyle}>
          {isDonation ? "인증서 PDF 저장" : "기프티콘 PDF 저장"}
        </button>
      </div>
    </div>
  );
};

// --- 스타일 ---
// const containerStyle = { display: 'flex', justifyContent: 'center', padding: '50px 20px', backgroundColor: '#f4f4f4', minHeight: '80vh' };
// const ticketCardStyle = { backgroundColor: '#fff', width: '100%', maxWidth: '500px', padding: '40px', borderRadius: '15px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' };
// const certDecorStyle = { border: '5px double #d4af37', padding: '20px', backgroundColor: '#fffcf5' };
const infoBoxStyle = { textAlign: 'left', fontSize: '14px', color: '#666', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', lineHeight: '1.6' };
// const printBtnStyle = { marginTop: '30px', width: '100%', padding: '15px', backgroundColor: '#339af0', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };

const containerStyle = { 
  display: 'flex', 
  flexDirection: 'column',
  alignItems: 'center', 
  padding: '40px 20px', // 좌우 여백 확보
  backgroundColor: '#f8f9fa', 
  minHeight: '100vh' 
};

const ticketCardStyle = { 
  backgroundColor: '#fff', 
  width: '100%', 
  maxWidth: '450px', // 가로 폭을 살짝 줄이거나 반응형으로 설정
  padding: '30px', 
  borderRadius: '24px', 
  textAlign: 'center', 
  boxShadow: '0 20px 40px rgba(0,0,0,0.08)',
  boxSizing: 'border-box' // 패딩이 너비를 넘지 않게 함
};

// 기부 인증서용 클래식 스타일 (금색 테두리)
const certDecorStyle = { 
  border: '10px double #d4af37', 
  padding: '40px', 
  backgroundColor: '#fffcf5',
  backgroundImage: 'radial-gradient(#f1f5f9 1px, transparent 1px)', // 배경에 미세한 도트 패턴
  backgroundSize: '20px 20px'
};

const printBtnStyle = { 
  marginTop: '30px',
  backgroundColor: '#1a1a1a', 
  color: '#fff', 
  border: 'none', 
  padding: '14px 28px', 
  borderRadius: '12px', 
  cursor: 'pointer', 
  fontWeight: 'bold',
  width: '100%',
  maxWidth: '600px'
};

const printStyles = `
  @media print {
    body { background: none !important; padding: 0 !important; }
    .no-print { display: none !important; }
    
    /* 인쇄 시 카드를 페이지 중앙에 배치 */
    .ticket-card {
      margin: 20mm auto !important;
      box-shadow: none !important;
      border: 1px solid #eee !important;
      width: 100% !important;
      max-width: 450px !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

export default VoucherDetail;