// import React, { useState } from 'react';
// import giftPlaceholder from '../../assets/placeholder/gift-placeholder.png';
// import donationPlaceholder from '../../assets/placeholder/donation-placeholder.png';

// const ImagePlaceholder = ({
//   src,
//   alt,
//   category = 'GIFTICON',
//   style = {},
//   size = 'medium',
// }) => {
//   const [imgError, setImgError] = useState(false);
//   const isDonation = category === 'DONATION';
  
//   // import한 기본 이미지 설정
//   const defaultImage = isDonation ? donationPlaceholder : giftPlaceholder;

//   // 정상 이미지 렌더링 (또는 에러 발생 시 기본 이미지로 대체)
//   return (
//     <img
//       src={imgError || !src ? defaultImage : src}
//       alt={alt || (isDonation ? '기부 캠페인' : '기프티콘')}
//       style={{
//         ...style,
//         objectFit: 'cover', // 이미지가 영역을 꽉 채우도록 설정
//         width: style.width || '100%',
//         height: style.height || '100%',
//       }}
//       onError={() => setImgError(true)}
//     />
//   );
// };

// export default ImagePlaceholder;

import React, { useState } from 'react';

const ImagePlaceholder = ({ src, alt, category = 'GIFTICON', style = {} }) => {
  const [imgError, setImgError] = useState(false);

  // 플레이스홀더 이미지 경로
  const placeholderImage = category === 'DONATION' 
    ? '/images/donation-placeholder.png'
    : '/images/gift-placeholder.png';

  // 이미지 로드 실패 시
  if (imgError || !src) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={placeholderImage}
          alt={category === 'DONATION' ? '기부 캠페인' : '기프티콘'}
          style={{
            ...style,
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
    );
  }

  // 정상 이미지 로드
  return (
    <img
      src={src}
      alt={alt}
      style={style}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
};

export default ImagePlaceholder;