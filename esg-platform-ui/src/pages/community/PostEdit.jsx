import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const PostEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrls, setImageUrls] = useState([]);
  const [aiResult, setAiResult] = useState('');
  const [activityType, setActivityType] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 관리자 권한 확인 (System Admin일 경우 전체 수정을 위해 헤더 처리 필요 시 사용)
  const isSystemAdmin = user?.role === 'ROLE_SYSTEM_ADMIN' || user?.role === 'SYSTEM_ADMIN';
  const targetCompanyId = isSystemAdmin ? 0 : (user?.companyId || localStorage.getItem('companyId'));

  const getActivityName = (type) => {
    const map = {
      TUMBLER: '텀블러 사용',
      TRANSPORT: '대중교통 이용',
      RECYCLE: '분리배출',
      FAIL: '인증 실패'
    };
    return map[type] || 'ESG 활동';
  };

  const fetchPost = useCallback(async () => {
    try {
      const headers = targetCompanyId ? { 'X-Company-Id': targetCompanyId } : {};
      const res = await api.get(`/community/posts/${id}`, { headers });
      setTitle(res.data.title);
      setContent(res.data.content);
      setImageUrls(res.data.imageUrls || []);
      setAiResult(res.data.aiResult);
      setActivityType(res.data.activityType);
    } catch (err) {
      alert("글을 불러오지 못했습니다.");
      navigate(-1);
    } finally {
      setIsLoading(false);
    }
  }, [id, targetCompanyId, navigate]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  const handleUpdate = async () => {
    if (!title.trim() || !content.trim()) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }

    try {
      const headers = targetCompanyId ? { 'X-Company-Id': targetCompanyId } : {};
      await api.put(`/community/posts/${id}`, { title, content }, { headers });
      alert("수정이 완료되었습니다!");
      navigate(`/posts/${id}`);
    } catch (err) {
      alert("수정 실패: " + (err.response?.data?.message || "권한이 없습니다."));
    }
  };

  if (isLoading) return <div style={{ padding: '50px', textAlign: 'center' }}>데이터를 불러오는 중...</div>;

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={headerStyle}>📝 게시글 수정</h2>

        {/* 1. 인증 정보 (수정 불가 강조) */}
        <div style={infoBoxStyle}>
          <div style={labelStyle}>활동 분류</div>
          <div style={activityBadgeStyle}>
            {getActivityName(activityType || aiResult)}
          </div>
          <div style={{ marginBottom: '20px' }} />
          {/* 4. 이미지 미리보기 (수정 불가 상태로 노출) */}
          <div style={imageSectionStyle}>
            <label style={labelStyle}>인증 사진</label>
            <div style={imageGridStyle}>
              {imageUrls.map((url, index) => (
                <img key={index} src={url} alt="post-img" style={imgStyle} />
              ))}
            </div>
          </div>
          <p style={helperTextStyle}>※ 인증된 활동 종류와 사진은 수정할 수 없습니다.</p>
        </div>

        {/* 2. 제목 입력 */}
        <div style={inputGroupStyle}>
          <label style={labelStyle}>제목</label>
          <input
            style={titleInputStyle}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
          />
        </div>

        {/* 3. 본문 입력 */}
        <div style={inputGroupStyle}>
          <label style={labelStyle}>내용</label>
          <textarea
            style={textAreaStyle}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="활동 내용을 상세히 적어주세요"
          />
        </div>

        {/* 5. 버튼 영역 */}
        <div style={buttonGroupStyle}>
          <button onClick={handleUpdate} style={submitBtnStyle}>수정 완료</button>
          <button onClick={() => navigate(-1)} style={cancelBtnStyle}>취소</button>
        </div>
      </div>
    </div>
  );
};

// --- 스타일 정의 ---
const containerStyle = { maxWidth: '600px', margin: '40px auto', padding: '0 20px', textAlign: 'left' };
const cardStyle = { backgroundColor: '#fff', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' };
const headerStyle = { fontSize: '24px', fontWeight: '800', marginBottom: '25px', color: '#333' };

const infoBoxStyle = { marginBottom: '25px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '10px' };
const labelStyle = { display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#666', marginBottom: '8px' };
const activityBadgeStyle = { backgroundColor: '#ebfbee', color: '#2b8a3e', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'inline-block', border: '1px solid #d3f9d8' };
const helperTextStyle = { fontSize: '12px', color: '#adb5bd', marginTop: '10px' };

const inputGroupStyle = { marginBottom: '20px' };
const titleInputStyle = { width: '100%', padding: '12px', border: '1px solid #eee', borderRadius: '8px', outline: 'none', fontSize: '16px', boxSizing: 'border-box' };
const textAreaStyle = { width: '100%', padding: '12px', border: '1px solid #eee', borderRadius: '8px', outline: 'none', fontSize: '15px', minHeight: '150px', resize: 'vertical', boxSizing: 'border-box' };

const imageSectionStyle = { marginBottom: '30px' };
const imageGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' };
const imgStyle = { width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px', opacity: 0.7 }; // 수정 불가하므로 약간 흐리게 처리

const buttonGroupStyle = { display: 'flex', gap: '10px' };
const submitBtnStyle = { flex: 1, padding: '15px', backgroundColor: '#339af0', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' };
const cancelBtnStyle = { flex: 1, padding: '15px', backgroundColor: '#f1f3f5', color: '#495057', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' };

export default PostEdit;