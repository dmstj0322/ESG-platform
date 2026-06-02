import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';

const CommentSection = ({ postId, currentMemberId }) => {
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');

  const [replyingToId, setReplyingToId] = useState(null);
  const [replyContent, setReplyContent] = useState('');

  const { user, isLoggedIn } = useAuth();

  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';
  const targetCompanyId = isSystemAdmin ? 0 : (user?.companyId || localStorage.getItem('companyId'));

  const fetchComments = useCallback(async () => {
    try {
      const headers = { 'X-Company-Id': targetCompanyId };
      const response = await api.get(`/community/posts/${postId}/comments`, { headers });
      setComments(response.data.content);
    } catch (error) {
      console.error('댓글 조회 실패:', error);
    }
  }, [postId, targetCompanyId]);

  const handleAddComment = async () => {
    if (!content.trim()) return;
    try {
      await api.post(`/community/posts/${postId}/comments`, { content, nickname: user?.nickname });
      setContent('');
      toast.success("💬 댓글이 등록되었습니다!", { containerId: 'main-toast' });
      fetchComments();
    } catch (error) {
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
      toast.error('답글 작성에 실패했습니다.', { containerId: 'main-toast' });
    }
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      const headers = { 'X-Company-Id': targetCompanyId };
      await api.delete(`/community/posts/${postId}/comments/${commentId}`, { headers });
      toast.success("🗑️ 삭제되었습니다.", { containerId: 'main-toast' });
      fetchComments();
    } catch (error) {
      toast.error('삭제에 실패했습니다.', { containerId: 'main-toast' });
    }
  };

  const handleStartEdit = (comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async (commentId) => {
    try {
      await api.put(`/community/posts/${postId}/comments/${commentId}`, { content: editContent });
      setEditingId(null);
      setEditContent('');
      toast.success("✅ 댓글이 수정되었습니다.", { containerId: 'main-toast' });
      fetchComments();
    } catch (error) {
      toast.error('수정 실패: ' + (error.response?.data?.message || ''), { containerId: 'main-toast' });
    }
  };

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const renderComment = (comment, isReply = false) => (
    <div key={comment.id} style={{
      ...commentItemStyle,
      marginLeft: isReply ? '20px' : '0',
      borderLeft: isReply ? '2px solid #16A87A' : 'none',
      paddingLeft: isReply ? '10px' : '0',
      // 🌟 핵심 해결: 왼쪽 여백(margin)을 준 만큼 전체 너비(100%)에서 빼주어야 화면을 뚫고 나가지 않습니다!
      width: isReply ? 'calc(100% - 20px)' : '100%' 
    }}>
      <div style={commentContentWrapper}>
        
        {/* 🌟 수정 1: flexWrap과 gap을 주어 극단적으로 좁은 화면에서는 닉네임과 버튼이 겹치지 않게 방어 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', gap: '8px', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '13px', color: '#333' }}>
              {comment.nickname || `Member #${comment.memberId}`}
            </strong>
            <span style={{ fontSize: '11px', color: '#adb5bd' }}>
              {new Date(comment.createdDate).toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
            {!isReply && isLoggedIn && (
              <button style={textBtnStyle} onClick={() => setReplyingToId(comment.id)}>답글</button>
            )}
            {(String(comment.memberId) === String(user?.memberId) || isSystemAdmin) && (
              <>
                {String(comment.memberId) === String(user?.memberId) && (
                  <button style={textBtnStyle} onClick={() => handleStartEdit(comment)}>수정</button>
                )}
                <button style={{ ...textBtnStyle, color: '#fa5252' }} onClick={() => handleDelete(comment.id)}>삭제</button>
              </>
            )}
          </div>
        </div>

        {editingId === comment.id ? (
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <input
              style={{ flex: 1, minWidth: 0, padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
            <button style={editSaveBtnStyle} onClick={() => handleSaveEdit(comment.id)}>저장</button>
            <button style={editCancelBtnStyle} onClick={() => setEditingId(null)}>취소</button>
          </div>
        ) : (
          <div style={commentTextStyle}>
            {comment.content}
          </div>
        )}

        {replyingToId === comment.id && (
          <div style={{ marginTop: '10px', display: 'flex', gap: '6px', backgroundColor: '#f8f9fa', padding: '8px', borderRadius: '6px' }}>
            <input
              style={{ flex: 1, minWidth: 0, padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
              placeholder="답글을 입력하세요..."
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
            />
            <button style={activeBtnStyle} onClick={() => handleAddReply(comment.id)}>등록</button>
            <button style={cancelBtnStyle} onClick={() => setReplyingToId(null)}>취소</button>
          </div>
        )}

        <div style={{ marginTop: '5px' }}>
          {comment.replies && comment.replies.map(reply => renderComment(reply, true))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="comment-section" style={{
      ...containerStyle,
      padding: '16px',
      backgroundColor: '#fff',
      borderRadius: '10px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      textAlign: 'left'
    }}>
      <h3 style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        💬 댓글 <span style={{ color: '#16A87A' }}>{comments.length}</span>
      </h3>

      {isLoggedIn ? (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '8px' }}>
          <input
            style={{ flex: 1, minWidth: '0', padding: '10px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid #e9ecef', outline: 'none' }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="칭찬과 격려의 댓글은 큰 힘이 됩니다!"
          />
          <button style={{ padding: '0 14px', minWidth: '50px', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={handleAddComment}>등록</button>
        </div>
      ) : (
        <p style={{ color: '#adb5bd', fontSize: '13px', marginBottom: '15px' }}>로그인 후 소통에 참여해보세요.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {comments.length > 0 ? comments.map(comment => renderComment(comment)) : <p style={{ color: '#dee2e6', textAlign: 'center', padding: '15px', fontSize: '13px' }}>아직 댓글이 없습니다.</p>}
      </div>
    </div>
  );
};

const containerStyle = { display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' };
const commentItemStyle = { display: 'flex', padding: '10px 0', borderBottom: '1px solid #f1f3f5', boxSizing: 'border-box' };
const commentContentWrapper = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' };
const commentTextStyle = { fontSize: '13px', color: '#212529', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-wrap', width: '100%', marginTop: '2px'};

const textBtnStyle = { background: 'none', border: 'none', color: '#868e96', fontSize: '11px', cursor: 'pointer', padding: '0', fontWeight: '600', whiteSpace: 'nowrap' };
const activeBtnStyle = { padding: '6px 10px', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 };
const cancelBtnStyle = { padding: '6px 10px', backgroundColor: '#e9ecef', color: '#495057', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 };
const editSaveBtnStyle = { padding: '6px 10px', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0 };
const editCancelBtnStyle = { padding: '6px 10px', backgroundColor: '#e9ecef', color: '#495057', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 };

export default CommentSection;