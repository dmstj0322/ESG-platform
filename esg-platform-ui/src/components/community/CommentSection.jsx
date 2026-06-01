import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';

const CommentSection = ({ postId, currentMemberId }) => {
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');

  const [editingId, setEditingId] = useState(null); // 수정 중인 댓글 ID
  const [editContent, setEditContent] = useState('');

  const [replyingToId, setReplyingToId] = useState(null); // 답글 입력 중인 부모 댓글 ID
  const [replyContent, setReplyContent] = useState('');

  const { user, isLoggedIn } = useAuth();

  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const targetCompanyId = isSystemAdmin ? 0 : (user?.companyId || localStorage.getItem('companyId'));

  // 1. 댓글 목록 불러오기 (GET)
  const fetchComments = useCallback(async () => {
    try {
      const headers = { 'X-Company-Id': targetCompanyId };
      const response = await api.get(`/community/posts/${postId}/comments`, { headers });
      console.log("댓글 API 응답 데이터:", response.data);
      setComments(response.data.content);
    } catch (error) {
      console.error('댓글 조회 실패:', error);
    }
  }, [postId, targetCompanyId]);

  // 2. 댓글 작성 (POST)
  const handleAddComment = async () => {
    if (!content.trim()) return;
    try {
      await api.post(`/community/posts/${postId}/comments`, { content, nickname: user?.nickname });
      setContent(''); // 입력창 초기화
      // alert("댓글 작성 완료!");
      toast.success("💬 댓글이 등록되었습니다!", { containerId: 'main-toast' });
      fetchComments(); // 목록 새로고침
    } catch (error) {
      // alert('댓글 작성 실패: ' + error.response?.data?.message || '권한이 없습니다.');
      toast.error('댓글 작성 실패: ' + (error.response?.data?.message || '권한이 없습니다.'), { containerId: 'main-toast' });
    }
  };

  const handleAddReply = async (parentId) => {
    if (!replyContent.trim()) return;
    try {
      await api.post(`/community/posts/${postId}/comments/${parentId}/replies`, {
        content: replyContent,
        nickname: user?.nickname
      });
      setReplyContent('');
      setReplyingToId(null);
      toast.success("💬 답글이 등록되었습니다!", { containerId: 'main-toast' });
      fetchComments();
    } catch (error) {
      // alert('답글 작성 실패');
      toast.error('답글 작성에 실패했습니다.', { containerId: 'main-toast' });
    }
  };

  // 3. 댓글 삭제 (DELETE)
  const handleDelete = async (commentId) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      const headers = { 'X-Company-Id': targetCompanyId };
      await api.delete(`/community/posts/${postId}/comments/${commentId}`, { headers });
      toast.success("🗑️ 삭제되었습니다.", { containerId: 'main-toast' });
      fetchComments(); // 목록 새로고침
    } catch (error) {
      // alert('삭제 실패');
      toast.error('삭제에 실패했습니다.', { containerId: 'main-toast' });
    }
  };

  // 1. 수정 시작 (수정 모드 진입)
  const handleStartEdit = (comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  // 2. 수정 저장 (PUT 요청)
  const handleSaveEdit = async (commentId) => {
    try {
      await api.put(`/community/posts/${postId}/comments/${commentId}`, { content: editContent });
      setEditingId(null); // 수정 모드 해제
      setEditContent('');
      toast.success("✅ 댓글이 수정되었습니다.", { containerId: 'main-toast' });
      fetchComments(); // 새로고침
    } catch (error) {
      // alert('수정 실패: ' + error.response?.data?.message);
      toast.error('수정 실패: ' + (error.response?.data?.message || ''), { containerId: 'main-toast' });
    }
  };

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const renderComment = (comment, isReply = false) => (
    <div key={comment.id} style={{
      marginLeft: isReply ? '40px' : '0',
      borderLeft: isReply ? '2px solid #16A87A' : 'none',
      paddingLeft: isReply ? '15px' : '0',
      marginBottom: '20px',
      textAlign: 'left' // 👈 전체 텍스트 왼쪽 정렬 강제
    }}>
      {/* 닉네임 및 날짜 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <strong style={{ fontSize: '14px', color: '#333' }}>
          {comment.nickname || `Member #${comment.memberId}`}
        </strong>
        <span style={{ fontSize: '11px', color: '#adb5bd' }}>
          {new Date(comment.createdDate).toLocaleString()}
        </span>
      </div>

      {/* 댓글 본문 및 수정 모드 */}
      {editingId === comment.id ? (
        <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
          <input
            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
          <button style={editSaveBtnStyle} onClick={() => handleSaveEdit(comment.id)}>저장</button>
          <button style={editCancelBtnStyle} onClick={() => setEditingId(null)}>취소</button>
        </div>
      ) : (
        <div style={{ fontSize: '15px', color: '#444', lineHeight: '1.5' }}>
          {comment.content}

          {/* 버튼 영역 (왼쪽 정렬) */}
          <div style={{ marginTop: '8px', display: 'flex', gap: '12px' }}>
            {!isReply && isLoggedIn && (
              <button style={textBtnStyle} onClick={() => setReplyingToId(comment.id)}>답글</button>
            )}
            {(String(comment.memberId) === String(user?.memberId) || isSystemAdmin) && (
              <>
                {String(comment.memberId) === String(user?.memberId) && (
                  <button style={textBtnStyle} onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }}>수정</button>
                )}
                <button style={{ ...textBtnStyle, color: '#fa5252' }} onClick={() => handleDelete(comment.id)}>삭제</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 답글 입력창 (왼쪽 정렬) */}
      {replyingToId === comment.id && (
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px' }}>
          <input
            style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            placeholder="답글 내용을 입력하세요..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
          />
          <button style={activeBtnStyle} onClick={() => handleAddReply(comment.id)}>등록</button>
          <button style={cancelBtnStyle} onClick={() => setReplyingToId(null)}>취소</button>
        </div>
      )}

      {/* 답글 리스트 (재귀 호출) */}
      <div style={{ marginTop: '15px' }}>
        {comment.replies && comment.replies.map(reply => renderComment(reply, true))}
      </div>
    </div>
  );

  return (
    <div className="comment-section" style={{
      padding: '20px',
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      textAlign: 'left' // 👈 전체 컨테이너 왼쪽 정렬
    }}>
      <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        💬 댓글 <span style={{ color: '#16A87A' }}>{comments.length}</span>
      </h3>

      {/* 댓글 입력창 */}
      {isLoggedIn ? (
        <div style={{ marginBottom: '30px', display: 'flex', gap: '10px' }}>
          <input
            style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #e9ecef', outline: 'none' }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="칭찬과 격려의 댓글은 큰 힘이 됩니다!"
          />
          <button style={{ padding: '0 20px', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }} onClick={handleAddComment}>등록</button>
        </div>
      ) : (
        <p style={{ color: '#adb5bd', fontSize: '14px', marginBottom: '20px' }}>로그인 후 소통에 참여해보세요.</p>
      )}

      {/* 댓글 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {comments.length > 0 ? comments.map(comment => renderComment(comment)) : <p style={{ color: '#dee2e6', textAlign: 'center', padding: '20px' }}>아직 댓글이 없습니다.</p>}
      </div>
    </div>
  );
};

// 버튼 스타일들
const textBtnStyle = { background: 'none', border: 'none', color: '#868e96', fontSize: '12px', cursor: 'pointer', padding: 0, fontWeight: '500' };
const activeBtnStyle = { padding: '5px 12px', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' };
const cancelBtnStyle = { padding: '5px 12px', backgroundColor: '#e9ecef', color: '#495057', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' };
const editSaveBtnStyle = { padding: '8px 14px', minHeight: '44px', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' };
const editCancelBtnStyle = { padding: '8px 14px', minHeight: '44px', backgroundColor: '#e9ecef', color: '#495057', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' };

export default CommentSection;