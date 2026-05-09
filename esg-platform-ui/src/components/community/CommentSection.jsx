import React, { useState, useEffect } from 'react';
import api from '../../api/api';

const CommentSection = ({ postId, currentMemberId }) => {
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState('');

  const [editingId, setEditingId] = useState(null); // 수정 중인 댓글 ID
  const [editContent, setEditContent] = useState('');

  // 1. 댓글 목록 불러오기 (GET)
  const fetchComments = async () => {
    try {
      const response = await api.get(`/community/posts/${postId}/comments`);
      console.log("댓글 API 응답 데이터:", response.data);
      setComments(response.data.content);
    } catch (error) {
      console.error('댓글 조회 실패:', error);
    }
  };

  // 2. 댓글 작성 (POST)
  const handleAddComment = async () => {
    if (!content.trim()) return;
    try {
      await api.post(`/community/posts/${postId}/comments`, { content });
      setContent(''); // 입력창 초기화
      alert("댓글 작성 완료!");
      fetchComments(); // 목록 새로고침
    } catch (error) {
      alert('댓글 작성 실패: ' + error.response?.data?.message || '권한이 없습니다.');
    }
  };

  // 3. 댓글 삭제 (DELETE)
  const handleDelete = async (commentId) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/community/posts/${postId}/comments/${commentId}`);
      fetchComments(); // 목록 새로고침
    } catch (error) {
      alert('삭제 실패');
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
      fetchComments(); // 새로고침
    } catch (error) {
      alert('수정 실패: ' + error.response?.data?.message);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [postId]);

  return (
    <div className="comment-section">
      <h3>댓글</h3>
      {/* 댓글 입력창 */}
      <div>
        <input 
          value={content} 
          onChange={(e) => setContent(e.target.value)} 
          placeholder="댓글을 입력하세요..." 
        />
        <button onClick={handleAddComment}>등록</button>
      </div>

      {/* 댓글 리스트 */}
      <ul>
        {comments.map((comment) => (
          <li key={comment.id}>
            {/* 수정 모드일 때와 아닐 때 분기 처리 */}
            {editingId === comment.id ? (
              <>
                <input value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                <button onClick={() => handleSaveEdit(comment.id)}>저장</button>
                <button onClick={() => setEditingId(null)}>취소</button>
              </>
            ) : (
              <>
                {comment.content}
                {String(comment.memberId) === String(currentMemberId) && (
                <>
                  <button onClick={() => handleStartEdit(comment)}>수정</button>
                  <button onClick={() => handleDelete(comment.id)}>삭제</button>
                </>
              )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CommentSection;