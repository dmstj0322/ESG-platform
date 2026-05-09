import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/api';

function PostEdit() {
  const { id } = useParams();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrls, setImageUrls] = useState([]);
  const navigate = useNavigate();

  // 1. 기존 데이터 불러오기 (마운트 될 때)
  useEffect(() => {
    api.get(`/community/posts/${id}`).then(res => {
      setTitle(res.data.title);
      setContent(res.data.content);
      setImageUrls(res.data.imageUrls || []);
    });
  }, [id]);

  // 2. 수정 요청 보내기
  const handleUpdate = () => {
    api.put(`/community/posts/${id}`, { title, content })
      .then(() => {
        alert("수정 완료!");
        navigate(`/posts/${id}`); // 상세 페이지로 이동
      })
      .catch(err => alert("수정 실패: " + err.response.data.message));
  };

  return (
    <div>
      <h1>글 수정</h1>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} />

      <div className="image-preview">
        <p>인증된 사진 (수정 불가)</p>
        {imageUrls.map((url, index) => (
          <img key={index} src={url} alt={`post-img-${index}`} style={{ width: '200px', margin: '5px' }} />
        ))}
      </div>
      <button onClick={handleUpdate}>수정 완료</button>
    </div>
  );
}
export default PostEdit;