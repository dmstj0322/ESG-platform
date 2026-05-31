import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import imageCompression from 'browser-image-compression';
import { toast } from 'react-toastify';

const PostWrite = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [activityType, setActivityType] = useState('TUMBLER');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);

  const ACTIVITY_NAME_MAP = {
    'TUMBLER': '텀블러/다회용기 사용',
    'TRANSPORT': '대중교통 이용',
    'RECYCLE': '분리배출',
    'FAIL': '인증 실패 (다시 시도해주세요)'
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (previews.length + files.length > 3) {
      toast.warning("이미지는 최대 3장까지만 업로드 가능합니다.", { containerId: 'main-toast' });
      setIsAnalyzing(false);
      return;
    }

    setIsAnalyzing(true);

    try {
      // 🌟 이미지 압축 설정
      const options = {
        maxSizeMB: 1,            // 1MB 이하로 압축
        maxWidthOrHeight: 1280,  // 긴 쪽을 1280px로 리사이징
        useWebWorker: true,
      };

      const compressedFiles = [];
      const newPreviews = [];

      // 파일들을 하나씩 압축 처리
      for (let file of files) {
        const compressedFile = await imageCompression(file, options);
        compressedFiles.push(compressedFile);
        newPreviews.push(URL.createObjectURL(compressedFile));
      }

      setSelectedFiles(prev => [...prev, ...compressedFiles]);
      setPreviews(prev => [...prev, ...newPreviews]);

      // AI 분석을 위한 FormData 생성 (압축된 파일 사용)
      const formData = new FormData();
      compressedFiles.forEach((file) => formData.append("files", file));

      const response = await api.post('/community/posts/analyze-image', formData);
      setActivityType(response.data);
    } catch (err) {
      console.error("AI 분석 실패:", err);
      alert("이미지 처리 및 분석 중 오류가 발생했습니다.");
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

    // if (selectedFiles.length === 0) {
    //   alert("인증샷을 첨부해주세요!");
    //   return;
    // }

    if (!title || !content || selectedFiles.length === 0) {
      toast.warning("제목, 내용, 이미지를 모두 입력해주세요.", { containerId: 'main-toast' });
      return;
    }

    const nickname = user?.nickname || "익명회원";
    const formData = new FormData();

    // JSON 데이터 전송을 위한 Blob 객체 생성
    const dto = { title, content, activityType, nickname };
    const blob = new Blob([JSON.stringify(dto)], { type: 'application/json' });
    formData.append('dto', blob);

    // 이미 압축된 selectedFiles를 사용하여 전송
    selectedFiles.forEach((file) => formData.append("files", file));

    try {
      await api.post('/community/posts', formData);
      // alert("성공적으로 등록되었습니다!");
      toast.success("🌱 게시글이 성공적으로 등록되었습니다!", { containerId: 'main-toast' });
      navigate('/community');
    } catch (err) {
      // alert("작성 실패: " + (err.response?.data?.message || "서버 오류"));
      toast.error("게시글 등록에 실패했습니다.", { containerId: 'main-toast' });
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
          <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>분석 결과:</span>
          <div style={{
            ...activityBadgeStyle,
            backgroundColor: isAnalyzing ? '#f1f3f5' : '#ebfbee',
            color: isAnalyzing ? '#868e96' : '#2b8a3e',
            borderColor: isAnalyzing ? '#e9ecef' : '#d3f9d8'
          }}>
            {isAnalyzing ? "🔄 분석 중..." : `✨ ${ACTIVITY_NAME_MAP[activityType] || 'ESG 활동'}`}
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
          {isAnalyzing ? "분석 대기 중..." : "게시물 등록"}
        </button>
        <button type="button" onClick={() => navigate(-1)} style={cancelBtnStyle}>취소</button>
      </form>
    </div>
  );
};

// --- 스타일 정의 ---
const containerStyle = { maxWidth: '500px', margin: '40px auto', padding: '0 20px', textAlign: 'left' };
const formStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)' };
const headerStyle = { fontSize: '24px', fontWeight: '800', marginBottom: '25px', color: '#2b8a3e' };

const uploadBoxStyle = { marginBottom: '20px' };
const emptyUploadStyle = { display: 'flex', height: '200px', border: '2px dashed #ddd', borderRadius: '10px', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888' };
const previewGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' };
const previewItemStyle = { position: 'relative', height: '100px', borderRadius: '8px', overflow: 'hidden' };
const imgStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const removeBtnStyle = { position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '10px' };
const addMoreStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', border: '2px dashed #ddd', borderRadius: '8px', fontSize: '24px', color: '#888', cursor: 'pointer' };

const aiStatusStyle = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '8px' };
const activityBadgeStyle = { padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid' };

const inputGroupStyle = { display: 'flex', flexDirection: 'column', gap: '15px' };
const titleInputStyle = { padding: '12px', fontSize: '16px', border: '1px solid #eee', borderRadius: '8px', outline: 'none', fontWeight: 'bold' };
const textAreaStyle = { padding: '12px', fontSize: '15px', border: '1px solid #eee', borderRadius: '8px', outline: 'none', minHeight: '150px', resize: 'none' };

const submitBtnStyle = (disabled) => ({
  width: '100%', padding: '15px', marginTop: '20px', backgroundColor: disabled ? '#adb5bd' : '#16A87A', color: '#fff',
  border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', cursor: disabled ? 'not-allowed' : 'pointer'
});
const cancelBtnStyle = { width: '100%', padding: '10px', marginTop: '10px', background: 'none', border: 'none', color: '#888', cursor: 'pointer' };

export default PostWrite;