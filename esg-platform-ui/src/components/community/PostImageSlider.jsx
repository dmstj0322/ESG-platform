import React, { useState } from 'react';

const PostImageSlider = ({ imageUrls }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!imageUrls || imageUrls.length === 0) {
    return <div style={placeholderStyle}>No Image</div>;
  }

  const handlePrev = (e) => {
    e.preventDefault();
    e.stopPropagation(); // 링크 이동 방지
    setCurrentIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1));
  };

  const handleNext = (e) => {
    e.preventDefault();
    e.stopPropagation(); // 링크 이동 방지
    setCurrentIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1));
  };

  return (
    <div style={sliderWrapperStyle}>
      {/* 이미지 출력 */}
      <img src={imageUrls[currentIndex]} alt="post" style={imageStyle} />

      {/* 이미지가 여러 장일 때만 컨트롤 표시 */}
      {imageUrls.length > 1 && (
        <>
          {currentIndex > 0 && (<button onClick={handlePrev} style={{ ...navBtnStyle, left: '10px' }}>❮</button>)}
          {currentIndex < imageUrls.length - 1 && (<button onClick={handleNext} style={{ ...navBtnStyle, right: '10px' }}>❯</button>)}
          
          {/* 하단 인디케이터 */}
          <div style={indicatorWrapperStyle}>
            {imageUrls.map((_, i) => (
              <div key={i} style={indicatorDotStyle(i === currentIndex)} />
            ))}
          </div>

          {/* 우측 상단 숫자 배지 */}
          <div style={counterBadgeStyle}>
            {currentIndex + 1} / {imageUrls.length}
          </div>
        </>
      )}
    </div>
  );
};

// --- 스타일 ---
const sliderWrapperStyle = { position: 'relative', width: '100%', aspectRatio: '1 / 1', backgroundColor: '#f1f3f5', overflow: 'hidden' };
const imageStyle = { width: '100%', height: '100%', objectFit: 'cover', transition: 'all 0.3s ease' };
const placeholderStyle = { width: '100%', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#adb5bd', backgroundColor: '#f8f9fa' };

const navBtnStyle = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  backgroundColor: 'rgba(255, 255, 255, 0.7)', border: 'none', borderRadius: '50%',
  width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 'bold', fontSize: '16px', color: '#333', zIndex: 2
};

const indicatorWrapperStyle = { position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px', zIndex: 2 };
const indicatorDotStyle = (isActive) => ({
  width: '6px', height: '6px', borderRadius: '50%',
  backgroundColor: isActive ? '#339af0' : 'rgba(255, 255, 255, 0.5)',
  transition: 'background-color 0.2s'
});

const counterBadgeStyle = {
  position: 'absolute', top: '15px', right: '15px', backgroundColor: 'rgba(0, 0, 0, 0.5)',
  color: '#fff', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', zIndex: 2
};

export default PostImageSlider;