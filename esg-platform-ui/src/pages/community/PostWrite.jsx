import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const PostWrite = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [activityType, setActivityType] = useState('TUMBLER');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setSelectedFiles([...selectedFiles, ...files]);
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPreviews([...previews, ...newPreviews]);

    setIsAnalyzing(true);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await api.post('/community/posts/analyze-image', formData);
      setActivityType(response.data);
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
      alert("인증샷을 첨부해주세요!");
      return;
    }

    const nickname = user?.nickname || "익명회원";
    const formData = new FormData();
    const blob = new Blob([JSON.stringify({ title, content, activityType, nickname })], { type: 'application/json' });
    formData.append('dto', blob);
    selectedFiles.forEach((file) => formData.append("files", file));

    try {
      await api.post('/community/posts', formData);
      alert("성공적으로 등록되었습니다!");
      navigate('/');
    } catch (err) {
      alert("작성 실패: " + (err.response?.data?.message || "서버 오류"));
    }
  };

  return (
    <div style={containerStyle}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <h2 style={headerStyle}>🌱 활동 인증하기</h2>

        {/* 이미지 업로드 영역 */}
        <div style={uploadBoxStyle}>
          {previews.length > 0 ? (
            <div style={previewGridStyle}>
              {previews.map((url, i) => (
                <div key={i} style={previewItemStyle}>
                  <img src={url} alt="preview" style={imgStyle} />
                  <button type="button" onClick={() => removeImage(i)} style={removeBtnStyle}>✕</button>
                </div>
              ))}
              <label htmlFor="file-input" style={addMoreStyle}>+</label>
            </div>
          ) : (
            <label htmlFor="file-input" style={emptyUploadStyle}>
              📸 사진을 업로드하면 AI가 분석합니다
            </label>
          )}
          <input type="file" id="file-input" multiple accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>

        {/* AI 분석 결과 표시 */}
        <div style={aiStatusStyle}>
          {/* <span style={{ fontSize: '14px', color: '#666' }}>AI 분석 결과:</span>
          <div style={badgeStyle(isAnalyzing)}>
            {isAnalyzing ? "분석 중..." : `✨ ${activityType}`}
          </div> */}
          <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>분석 결과:</span>
          <div style={{
            ...activityBadgeStyle,
            // 분석 중일 때는 색상을 회색으로 변경
            backgroundColor: isAnalyzing ? '#f1f3f5' : '#ebfbee',
            color: isAnalyzing ? '#868e96' : '#2b8a3e',
            borderColor: isAnalyzing ? '#e9ecef' : '#d3f9d8'
          }}>
            {isAnalyzing ? "🔄 분석 중..." : `✨ ${activityType}`}
          </div>
        </div>

        {/* 입력 필드 */}
        <div style={inputGroupStyle}>
          <input
            style={titleInputStyle}
            type="text"
            placeholder="제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            style={textAreaStyle}
            placeholder="오늘의 ESG 활동 경험을 들려주세요..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        </div>

        <button type="submit" style={submitBtnStyle(isAnalyzing)} disabled={isAnalyzing}>
          {isAnalyzing ? "AI 분석 대기 중..." : "게시물 등록"}
        </button>
        <button type="button" onClick={() => navigate(-1)} style={cancelBtnStyle}>취소</button>
      </form>
    </div>
  );
};

// --- 스타일 정의 (Blue Hex: #339af0 적용) ---
const containerStyle = { maxWidth: '500px', margin: '40px auto', padding: '0 20px', textAlign: 'left' };
const formStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' };
const headerStyle = { fontSize: '24px', fontWeight: '800', marginBottom: '25px', color: '#2b8a3e' };

const uploadBoxStyle = { marginBottom: '20px' };
const emptyUploadStyle = { display: 'flex', height: '200px', border: '2px dashed #ddd', borderRadius: '10px', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888' };
const previewGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' };
const previewItemStyle = { position: 'relative', height: '100px', borderRadius: '8px', overflow: 'hidden' };
const imgStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const removeBtnStyle = { position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '10px' };
const addMoreStyle = { ...emptyUploadStyle, height: '100px', fontSize: '24px' };

const aiStatusStyle = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' };
const badgeStyle = (loading) => ({
  backgroundColor: loading ? '#e9ecef' : '#339af0',
  color: '#fff', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold'
});

const inputGroupStyle = { display: 'flex', flexDirection: 'column', gap: '15px' };
const titleInputStyle = { padding: '12px', fontSize: '16px', border: '1px solid #eee', borderRadius: '8px', outline: 'none', fontWeight: 'bold' };
const textAreaStyle = { padding: '12px', fontSize: '15px', border: '1px solid #eee', borderRadius: '8px', outline: 'none', minHeight: '150px', resize: 'none' };

const submitBtnStyle = (disabled) => ({
  width: '100%', padding: '15px', marginTop: '20px', backgroundColor: disabled ? '#adb5bd' : '#339af0', color: '#fff',
  border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: disabled ? 'not-allowed' : 'pointer'
});
const cancelBtnStyle = { width: '100%', padding: '10px', marginTop: '10px', background: 'none', border: 'none', color: '#888', cursor: 'pointer' };

const activityBadgeStyle = {
  backgroundColor: '#ebfbee', // 아주 연한 녹색 (배경)
  color: '#2b8a3e',           // 진한 녹색 (글자)
  padding: '4px 12px',
  borderRadius: '20px',       // 알약 모양
  fontSize: '12px',
  fontWeight: 'bold',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  border: '1px solid #d3f9d8' // 미세한 테두리 추가로 선명도 향상
};

export default PostWrite;