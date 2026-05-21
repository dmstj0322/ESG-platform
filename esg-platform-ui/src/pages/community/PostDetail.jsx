import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/api';
import CommentSection from '../../components/community/CommentSection';
import { useAuth } from '../../context/AuthContext';
import PostImageSlider from '../../components/community/PostImageSlider';

const PostDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();

  const [post, setPost] = useState(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const isSystemAdmin = user?.role === 'ROLE_SYSTEM_ADMIN' || user?.role === 'SYSTEM_ADMIN';
  const targetCompanyId = isSystemAdmin ? 0 : (user?.companyId || localStorage.getItem('companyId'));

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

  const isAuthor = user && String(post.memberId) === String(user.memberId);
  const canManage = isSystemAdmin || isAuthor;

  // 🌟 배지 데이터 계산
  const getBadgeInfo = () => {
    if (post.adminStatus === 'APPROVED') return { text: '✅ 인증 완료', color: '#339af0', bgColor: '#e7f5ff' };
    if (post.adminStatus === 'REJECTED') return { text: '❌ 관리자 반려', color: '#fa5252', bgColor: '#fff5f5' };
    if (post.adminStatus === 'AUTO_REJECTED') return { text: '🤖❌ AI 자동 반려', color: '#fa5252', bgColor: '#fff5f5' };
    if (post.aiStatus === 'PROCESSING') return { text: '🤖 분석 중', color: '#adb5bd', bgColor: '#f8f9fa' };
    return { text: '⏳ 심사 대기', color: '#fd7e14', bgColor: '#fff4e6' };
  };
  const badge = getBadgeInfo();

  return (
    <div style={containerStyle}>
      <div style={headerSectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isAuthor ? (
            <div style={activityBadgeStyle}>{post.aiResult || '🌱 ESG 활동'}</div>
          ) : (
            <div style={{ height: '30px' }} />
          )}
          {/* 🌟 본인 글일 때 상단 배지 노출 */}
          {isAuthor && (
            <div style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold',
              color: badge.color, backgroundColor: badge.bgColor, border: `1px solid ${badge.color}50`
            }}>
              {badge.text}
            </div>
          )}
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

      <div style={detailSliderWrapper}>
        <PostImageSlider imageUrls={post.imageUrls} />
      </div>

      <div style={bodyContentStyle}>
        <p style={paragraphStyle}>{post.content}</p>

        {/* 🌟 반려 사유 (본인 + REJECTED 상태일 때) */}
        {isAuthor && ['REJECTED', 'AUTO_REJECTED'].includes(post.adminStatus) && (
          <div style={{
            marginTop: '30px', padding: '20px', backgroundColor: '#fff5f5',
            borderRadius: '12px', border: '1px solid #ffc9c9', color: '#fa5252'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🚫 포인트 적립 반려 사유</div>
            <div style={{ color: '#444', fontSize: '15px', lineHeight: '1.6' }}>{post.rejectionReason || "관리자의 승인을 기다리는 중입니다."}</div>
          </div>
        )}

        <div style={statsRowStyle}>
          <span>조회수 <b>{post.viewCount}</b></span>
          <span>좋아요 <b>{likeCount}</b></span>
        </div>
      </div>

      <div style={actionRowStyle}>
        <button onClick={handleLike} style={isLiked ? activeLikeBtnStyle : likeBtnStyle}>
          {isLiked ? '❤️ 좋아요 취소' : '🤍 좋아요'}
        </button>
        <button onClick={() => navigate('/community')} style={listBackBtnStyle}>목록으로</button>

        {canManage && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <button onClick={() => navigate(`/edit/${id}`)} style={outlineBtnStyle}>수정</button>
            <button onClick={handleDelete} style={deleteLinkStyle}>삭제</button>
          </div>
        )}
      </div>

      <CommentSection postId={id} />
    </div>
  );
};

// 스타일 가이드 (기존과 동일)
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
const outlineBtnStyle = { padding: '8px 16px', borderRadius: '6px', border: '1px solid #dee2e6', backgroundColor: '#fff', cursor: 'pointer', fontSize: '14px' };
const activityBadgeStyle = { backgroundColor: '#ebfbee', color: '#2b8a3e', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', display: 'inline-block', border: '1px solid #d3f9d8' };

export default PostDetails;