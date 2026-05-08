import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import './Write.css';

const PostWrite = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [activityType, setActivityType] = useState('TUMBLER');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const navigate = useNavigate();

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const combinedFiles = [...selectedFiles, ...files];
    setSelectedFiles(combinedFiles);

    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPreviews([...previews, ...newPreviews]);

    setIsAnalyzing(true);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await api.post('/community/posts/analyze-image', formData);
      setActivityType(response.data);
      alert(`AI 분석 완료: '${response.data}'로 분류되었습니다.`);
    } catch (err) {
      console.error("AI 분석 실패:", err);
    } finally {
      setIsAnalyzing(false);
    }

  };

  const removeImage = (index) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedFiles.length === 0) {
      alert("ESG 활동 인증샷을 꼭 첨부해주세요!");
      return;
    }

    const formData = new FormData();
    const blob = new Blob([JSON.stringify({ title, content, activityType })], { type: 'application/json' });
    formData.append('dto', blob);

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await api.post('/community/posts', formData);
      alert("글이 등록되었습니다.");
      setTitle('');
      setContent('');
      setSelectedFiles([]);
      setPreviews([])
      navigate('/');
    } catch (err) {
      const errorMessage = err.response?.data?.message || "서버 오류가 발생했습니다.";
      alert("작성 실패: " + errorMessage);
    }
  };

  return (
    <div className="write-container">
      {isAnalyzing && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>AI가 이미지를 분석하고 있습니다...</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="write-form">
        <h1>ESG 활동 인증하기</h1>
        <input type="text" placeholder="제목" onChange={(e) => setTitle(e.target.value)} /><br />
        <div className="activity-select-group">
          <label>분류 결과: </label>
          <select value={activityType} onChange={(e) => setActivityType(e.target.value)} disabled={isAnalyzing}>
            <option value="TUMBLER">텀블러 사용</option>
            <option value="TRANSPORT">대중교통/자전거</option>
            <option value="RECYCLE">분리배출</option>
          </select>
        </div>
        <textarea placeholder="내용" onChange={(e) => setContent(e.target.value)} /><br />
        <div className="image-upload-section">
          <input type="file" id="file-input" multiple accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          <label htmlFor="file-input" className="file-label">
            📸 사진 추가하기
          </label>

          <div className="preview-list">
            {previews.map((url, index) => (
              <div key={index} className="preview-item">
                <img src={url} alt={`preview-${index}`} />
                <button type="button" className="remove-btn" onClick={() => removeImage(index)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className="submit-btn" disabled={isAnalyzing}>
          게시물 등록
        </button>
      </form>
    </div>
  );
};

export default PostWrite;