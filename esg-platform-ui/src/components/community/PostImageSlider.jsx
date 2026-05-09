import React, { useState } from 'react';

const PostImageSlider = ({ imageUrls }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!imageUrls || imageUrls.length === 0) {
    return <div className="no-image-placeholder">No Image</div>;
  }

  const handlePrev = (e) => {
    e.preventDefault(); // 링크 이동 방지
    e.stopPropagation();
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = (e) => {
    e.preventDefault(); // 링크 이동 방지
    e.stopPropagation();
    if (currentIndex < imageUrls.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  return (
    <div className="post-image-container">
      <img src={imageUrls[currentIndex]} alt="Post" className="post-image" />

      {imageUrls.length > 1 && (
        <>
          {currentIndex > 0 && (<button className="slider-btn prev" onClick={handlePrev}>❮</button>)}
          {currentIndex < imageUrls.length - 1 && (<button className="slider-btn next" onClick={handleNext}>❯</button>)}
          <span className="image-count-badge">
            {currentIndex + 1} / {imageUrls.length}
          </span>
        </>
      )}
    </div>
  );
};

export default PostImageSlider;