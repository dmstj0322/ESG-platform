import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/api';
import CommentSection from '../../components/community/CommentSection';
import { useAuth } from '../../context/AuthContext';
import PostImageSlider from '../../components/community/PostImageSlider'; // 일관성을 위해 슬라이더 사용

const PostDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();

  const [post, setPost] = useState(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  // 권한 판단 변수
  const isSystemAdmin = user?.role === 'ROLE_SYSTEM_ADMIN' || user?.role === 'SYSTEM_ADMIN';
  const targetCompanyId = isSystemAdmin ? 0 : (user?.companyId || localStorage.getItem('companyId'));

  // 게시글 상세 데이터 로드
  const fetchPost = useCallback(async () => {
    try {
      const headers = targetCompanyId ? { 'X-Company-Id': targetCompanyId } : {};
      const res = await api.get(`/community/posts/${id}`, { headers });
      setPost(res.data);
      setIsLiked(res.data.isLiked);
      setLikeCount(res.data.likeCount);
    } catch (err) {
      console.error("데이터 로드 실패:", err);
      alert("존재하지 않거나 접근 권한이 없는 게시글입니다.");
      navigate('/community');
    }
  }, [id, targetCompanyId, navigate]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  // 삭제 처리 (본인 또는 최종 관리자)
  const handleDelete = async () => {
    if (!window.confirm("정말 이 게시글을 삭제하시겠습니까?")) return;

    try {
      const headers = targetCompanyId ? { 'X-Company-Id': targetCompanyId } : {};
      await api.delete(`/community/posts/${id}`, { headers });
      alert("삭제되었습니다.");
      navigate('/community');
    } catch (err) {
      console.error("삭제 실패:", err);
      alert("삭제 권한이 없거나 오류가 발생했습니다.");
    }
  };

  // 좋아요 처리
  const handleLike = async () => {
    if (!isLoggedIn) {
      alert("로그인이 필요합니다.");
      return;
    }
    try {
      const res = await api.post(`/community/posts/${id}/likes`);
      setIsLiked(res.data.liked);
      setLikeCount(res.data.count);
    } catch (err) {
      alert("좋아요 처리에 실패했습니다.");
    }
  };

  if (!post) return <div style={{ padding: '50px', textAlign: 'center' }}>로딩중...</div>;

  // 수정/삭제 버튼 노출 조건 (작성자 본인 OR 최종 관리자)
  const canManage = isSystemAdmin || (user && String(post.memberId) === String(user.memberId));

  //   return (
  //     <div style={containerStyle}>
  //       {/* 1. 상단 헤더: 유저 정보 및 활동 태그 */}
  //       <div style={headerStyle}>
  //         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
  //           <div style={avatarStyle}>{post.nickname?.substring(0, 1) || 'U'}</div>
  //           <div style={{ textAlign: 'left' }}>
  //             <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{post.nickname || `Member #${post.memberId}`}</div>
  //             <div style={{ fontSize: '12px', color: '#999' }}>{new Date(post.createdDate).toLocaleString()}</div>
  //           </div>
  //         </div>
  //         <div style={activityBadgeStyle}>{post.aiResult || 'ESG 활동'}</div>
  //       </div>

  //       {/* 2. 이미지 섹션 */}
  //       <div style={imageSectionStyle}>
  //         <PostImageSlider imageUrls={post.imageUrls} />
  //       </div>

  //       {/* 3. 본문 영역 */}
  //       <div style={contentSectionStyle}>
  //         <h1 style={titleStyle}>{post.title}</h1>
  //         <div style={metaInfoStyle}>조회수 {post.viewCount} · 좋아요 {likeCount}</div>
  //         <p style={descriptionStyle}>{post.content}</p>
  //       </div>

  //       {/* 4. 액션 바: 좋아요 및 관리 버튼 */}
  //       <div style={actionBarStyle}>
  //         <button onClick={handleLike} style={isLiked ? activeLikeBtnStyle : likeBtnStyle}>
  //           {isLiked ? '❤️' : '🤍'} {likeCount}
  //         </button>

  //         <div style={{ display: 'flex', gap: '10px' }}>
  //           <button onClick={() => navigate('/')} style={outlineBtnStyle}>목록으로</button>
  //           {canManage && (
  //             <>
  //               {/* 수정은 본인만 (최종 관리자라도 타인의 글 수정은 보통 하지 않음) */}
  //               {String(post.memberId) === String(user?.memberId) && (
  //                 <button onClick={() => navigate(`/edit/${id}`)} style={outlineBtnStyle}>수정</button>
  //               )}
  //               <button onClick={handleDelete} style={deleteBtnStyle}>삭제</button>
  //             </>
  //           )}
  //         </div>
  //       </div>

  //       {/* 5. 댓글 섹션 */}
  //       <div style={{ marginTop: '40px' }}>
  //         <CommentSection postId={id} />
  //       </div>
  //     </div>
  //   );
  // };

  // --- 스타일 객체 (왼쪽 정렬 및 깔끔한 디자인) ---
  const containerStyle = {
    maxWidth: '700px',
    margin: '40px auto',
    padding: '0 20px',
    textAlign: 'left'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  };

  const avatarStyle = {
    width: '45px',
    height: '45px',
    backgroundColor: '#339af0',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '18px'
  };

  // const tagStyle = {
  //   backgroundColor: '#e7f5ff',
  //   color: '#1971c2',
  //   padding: '6px 12px',
  //   borderRadius: '20px',
  //   fontSize: '13px',
  //   fontWeight: 'bold'
  // };

  // const imageSectionStyle = {
  //   borderRadius: '12px',
  //   overflow: 'hidden',
  //   backgroundColor: '#f8f9fa',
  //   marginBottom: '25px',
  //   boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
  // };

  // const contentSectionStyle = {
  //   marginBottom: '30px'
  // };

  // const titleStyle = {
  //   fontSize: '28px',
  //   fontWeight: '800',
  //   color: '#212529',
  //   marginBottom: '10px',
  //   lineHeight: '1.3'
  // };

  // const metaInfoStyle = {
  //   fontSize: '14px',
  //   color: '#868e96',
  //   marginBottom: '20px'
  // };

  // const descriptionStyle = {
  //   fontSize: '17px',
  //   lineHeight: '1.8',
  //   color: '#495057',
  //   whiteSpace: 'pre-wrap' // 줄바꿈 유지
  // };

  // const actionBarStyle = {
  //   display: 'flex',
  //   justifyContent: 'space-between',
  //   alignItems: 'center',
  //   padding: '20px 0',
  //   borderTop: '1px solid #eee',
  //   borderBottom: '1px solid #eee'
  // };

  // const likeBtnStyle = {
  //   padding: '10px 20px',
  //   borderRadius: '25px',
  //   border: '1px solid #dee2e6',
  //   backgroundColor: '#fff',
  //   cursor: 'pointer',
  //   fontSize: '16px',
  //   transition: '0.2s'
  // };

  // const activeLikeBtnStyle = {
  //   ...likeBtnStyle,
  //   backgroundColor: '#fff0f0',
  //   borderColor: '#ffc9c9',
  //   color: '#fa5252'
  // };

  const outlineBtnStyle = {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid #dee2e6',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '14px'
  };

  const deleteBtnStyle = {
    ...outlineBtnStyle,
    color: '#fa5252',
    borderColor: '#ffc9c9'
  };

  // const activityBadgeStyle = {
  //   backgroundColor: '#ebfbee', // 아주 연한 녹색 (배경)
  //   color: '#2b8a3e',           // 진한 녹색 (글자)
  //   padding: '4px 12px',
  //   borderRadius: '20px',       // 알약 모양
  //   fontSize: '12px',
  //   fontWeight: 'bold',
  //   display: 'inline-flex',
  //   alignItems: 'center',
  //   gap: '4px',
  //   border: '1px solid #d3f9d8' // 미세한 테두리 추가로 선명도 향상
  // };

  return (
    <div style={containerStyle}>
      {/* 1. 상단 정보: 활동 배지를 더 강조 */}
      <div style={headerSectionStyle}>
        <div style={activityBadgeStyle}>
          {post.aiResult || '🌱 ESG 활동'}
        </div>
        <h1 style={mainTitleStyle}>{post.title}</h1>
        
        <div style={authorInfoStyle}>
          <div style={miniAvatarStyle}>{post.nickname?.substring(0, 1)}</div>
          <div style={{ textAlign: 'left' }}>
            <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{post.nickname}</span>
            <span style={{ margin: '0 8px', color: '#dee2e6' }}>|</span>
            <span style={{ color: '#adb5bd', fontSize: '13px' }}>{new Date(post.createdDate).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      {/* <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={avatarStyle}>{post.nickname?.substring(0, 1) || 'U'}</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{post.nickname || `Member #${post.memberId}`}</div>
            <div style={{ fontSize: '12px', color: '#999' }}>{new Date(post.createdDate).toLocaleString()}</div>
          </div>
        </div>
        <div style={activityBadgeStyle}>{post.aiResult || 'ESG 활동'}</div>
      </div> */}

      {/* 2. 이미지 섹션: 슬라이더 적용 */}
      <div style={detailSliderWrapper}>
        <PostImageSlider imageUrls={post.imageUrls} />
      </div>

      {/* 3. 본문 영역: 깔끔한 타이포그래피 */}
      <div style={bodyContentStyle}>
        <p style={paragraphStyle}>{post.content}</p>

        <div style={statsRowStyle}>
          <span>조회수 <b>{post.viewCount}</b></span>
          <span>좋아요 <b>{likeCount}</b></span>
        </div>
      </div>

      {/* 4. 액션 버튼 */}
      <div style={actionRowStyle}>
        <button onClick={handleLike} style={isLiked ? activeLikeBtnStyle : likeBtnStyle}>
          {isLiked ? '❤️ 좋아요 취소' : '🤍 좋아요'}
        </button>
        <button onClick={() => navigate('/community')} style={listBackBtnStyle}>목록으로</button>

        {/* 관리 권한 있을 때만 메뉴 노출 */}
        {canManage && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate(`/edit/${id}`)} style={outlineBtnStyle}>수정</button>
            <button onClick={handleDelete} style={deleteLinkStyle}>삭제</button>
          </div>
        )}
      </div>

      {/* 5. 댓글 영역 */}
      <CommentSection postId={id} />
    </div>
  );
};

// --- 고도화된 스타일 ---
const containerStyle = { maxWidth: '640px', margin: '60px auto', padding: '0 20px', textAlign: 'left' };
const headerSectionStyle = { marginBottom: '30px' };
const mainTitleStyle = { fontSize: '32px', fontWeight: '850', color: '#1a1a1a', margin: '15px 0', letterSpacing: '-0.5px' };
const authorInfoStyle = { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px' };
const miniAvatarStyle = { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f1f3f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', color: '#339af0' };

const detailSliderWrapper = { borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', marginBottom: '40px' };

const bodyContentStyle = { padding: '0 10px', marginBottom: '50px' };
const paragraphStyle = { fontSize: '18px', lineHeight: '1.8', color: '#343a40', whiteSpace: 'pre-wrap' };
const statsRowStyle = { marginTop: '30px', fontSize: '14px', color: '#adb5bd', display: 'flex', gap: '15px' };

const actionRowStyle = { display: 'flex', alignItems: 'center', gap: '12px', padding: '25px 0', borderTop: '1px solid #f1f3f5', borderBottom: '1px solid #f1f3f5' };
const likeBtnStyle = { padding: '12px 24px', borderRadius: '30px', border: '1px solid #dee2e6', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' };
const activeLikeBtnStyle = { ...likeBtnStyle, backgroundColor: '#fff0f0', borderColor: '#ffc9c9', color: '#fa5252' };
const listBackBtnStyle = { padding: '12px 24px', borderRadius: '30px', border: 'none', backgroundColor: '#f1f3f5', cursor: 'pointer', fontWeight: 'bold' };
const deleteLinkStyle = { background: 'none', border: 'none', color: '#fa5252', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline' };

const activityBadgeStyle = { backgroundColor: '#ebfbee', color: '#2b8a3e', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'inline-block', border: '1px solid #d3f9d8' };

export default PostDetails;