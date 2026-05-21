import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import api from '../api/api';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { useNavigate } from 'react-router-dom';

export const useNotification = (memberId, onMessageReceived) => {
  const [hasUnread, setHasUnread] = useState(false);
  const navigate = useNavigate();

  // 🌟 핵심 해결책: 콜백 함수가 매번 바뀌어도 SSE 연결이 끊기지 않도록 ref에 저장
  const callbackRef = useRef(onMessageReceived);

  useEffect(() => {
    callbackRef.current = onMessageReceived;
  }, [onMessageReceived]);

  useEffect(() => {
    if (!memberId) return;

    // 초기 안 읽음 상태 체크
    const checkUnread = async () => {
      try {
        const res = await api.get('/notification/unread-exists', {
          headers: { 'X-Member-Id': memberId }
        });
        setHasUnread(res.data);
      } catch (err) {
        console.error("알림 상태 체크 실패", err);
      }
    };
    checkUnread();

    const token = localStorage.getItem('accessToken');

    // SSE 연결 시작
    const eventSource = new EventSourcePolyfill(
      `http://localhost:9000/notification/subscribe/${memberId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        heartbeatTimeout: 86400000,
      }
    );

    // 알림 수신 시 이벤트
    eventSource.addEventListener('notification', (event) => {
      const data = JSON.parse(event.data);

      // 토스트 팝업 띄우기 및 클릭 시 이동 로직
      toast.info(`🔔 ${data.message}`, {
        position: "top-right",
        autoClose: 4000,
        style: { cursor: 'pointer' },
        onClick: () => {
          const isMarketOrPoint =
            data.type?.includes('USE') ||
            data.message.includes('사용') ||
            data.message.includes('구매') ||
            data.message.includes('취소') ||
            data.message.includes('환불');

          if (isMarketOrPoint) {
            navigate('/mypage'); // 포인트 관련은 마이페이지로
          } else if (data.targetId) {
            navigate(`/posts/${data.targetId}`);
          } else {
            navigate('/mypage');
          }
        }
      });

      setHasUnread(true);

      // ref에 저장된 최신 콜백 실행
      if (callbackRef.current) {
        callbackRef.current(data);
      }
    });

    // 🌟 컴포넌트 언마운트 시에만 연결 종료
    return () => {
      eventSource.close();
      console.log("SSE 연결 정상 종료 (Cleanup)");
    };

    // 의존성 배열에서 onMessageReceived 제거 (불필요한 재연결 방지)
  }, [memberId, navigate]);

  return { hasUnread, setHasUnread };
};