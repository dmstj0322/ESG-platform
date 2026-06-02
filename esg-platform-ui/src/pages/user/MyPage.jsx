import React, { useEffect, useState, useMemo } from 'react';
import api from '../../api/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';

const MyPage = () => {
  const [orders, setOrders] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [myComments, setMyComments] = useState([]);
  const [likedPosts, setLikedPosts] = useState([]);
  const [userPoints, setUserPoints] = useState(0);
  const [activeTab, setActiveTab] = useState('ORDERS');
  const [showCo2Modal, setShowCo2Modal] = useState(false);

  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalComments, setTotalComments] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);

  // 🌟 대시보드 전용 상태
  const [totalCo2Reduction, setTotalCo2Reduction] = useState(0);
  const [activityCounts, setActivityCounts] = useState({ TUMBLER: 0, TRANSPORT: 0, RECYCLE: 0 });
  const [earnedBadges, setEarnedBadges] = useState([]);

  // 🌟 대표 뱃지 상태 추가
  const [representativeBadgeId, setRepresentativeBadgeId] = useState(null);

  const { user } = useAuth();
  const navigate = useNavigate();

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 500;
  const fSize = (mobile, desktop) => isMobile ? mobile : desktop;

  const co2ApprovedPosts = useMemo(() =>
    myPosts.filter(post => post.adminStatus === 'APPROVED'),
    [myPosts]);

  useEffect(() => {
    if (user && user.memberId) {
      fetchMyOrders();
      fetchMyActivity();
      fetchEsgDashboardData();
    }
  }, [user]);

  // 🌟 통합 대시보드 조회 (포인트 + 뱃지/탄소량 + 대표 뱃지)
  const fetchEsgDashboardData = async () => {
    const memberId = user?.memberId || user?.id || localStorage.getItem('memberId');
    if (!memberId) return;

    try {
      const [pointRes, badgeRes] = await Promise.all([
        api.get(`/points/${memberId}/dashboard`),
        api.get(`/community/badges/${memberId}/dashboard`)
      ]);

      setUserPoints(pointRes.data.balance || 0);
      setTotalCo2Reduction(pointRes.data.totalCo2Reduction || 0);
      setActivityCounts(badgeRes.data.activityCounts || { TUMBLER: 0, TRANSPORT: 0, RECYCLE: 0 });
      setEarnedBadges(badgeRes.data.earnedBadges || []);
      setRepresentativeBadgeId(badgeRes.data.representativeBadgeId || null);
    } catch (err) {
      console.error("ESG 대시보드 조회 실패", err);
    }
  };

  // 🌟 대표 뱃지 변경 API 호출 핸들러 추가
  const handleSetRepresentative = async (badgeId) => {
    try {
      await api.put(`/community/badges/${user.memberId}/representative/${badgeId}`);
      setRepresentativeBadgeId(badgeId); // 로컬 상태 즉시 업데이트
      // alert("대표 뱃지가 변경되었습니다! 게시판에서 닉네임 옆에 표시됩니다.");
      toast.success("🏆 대표 뱃지가 변경되었습니다!", { containerId: 'main-toast' });
    } catch (err) {
      // alert("대표 뱃지 설정에 실패했습니다.");
      toast.error("대표 뱃지 설정에 실패했습니다.", { pcontainerId: 'main-toast' });
    }
  };

  const fetchMyOrders = async () => {
    try {
      const res = await api.get('/market/orders/my?sort=id,desc', { headers: { 'X-Member-Id': user.memberId } });
      setOrders(res.data.content || []);
      setTotalOrders(res.data.totalElements || 0);
    } catch (err) { console.error("주문 내역 조회 실패"); }
  };

  const fetchMyActivity = async () => {
    try {
      const config = {
        headers: {
          'X-Member-Id': user.memberId,
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      };
      const [postsRes, commentsRes, likesRes] = await Promise.all([
        api.get('/community/posts/my-posts?sort=id,desc', config),
        api.get('/community/posts/my-comments?sort=id,desc', config),
        api.get('/community/posts/my-likes?sort=id,desc', config)
      ]);
      setMyPosts(postsRes.data.content || []);
      setTotalPosts(postsRes.data.totalElements || 0);

      setMyComments(commentsRes.data.content || []);
      setTotalComments(commentsRes.data.totalElements || 0);

      setLikedPosts(likesRes.data.content || []);
      setTotalLikes(likesRes.data.totalElements || 0);
    } catch (err) { console.error("활동 내역 로드 실패"); }
  };

  const handleCancel = async (orderId, productName) => {
    if (!window.confirm(`[${productName}] 결제를 취소하시겠습니까?`)) return;
    try {
      await api.post(`/market/orders/${orderId}/cancel`, {}, { headers: { 'X-Member-Id': user.memberId } });
      // alert("취소 및 포인트 환불이 완료되었습니다.");
      toast.success("✅ 취소 및 포인트 환불이 완료되었습니다.", { containerId: 'main-toast' });
      fetchMyOrders();
      fetchEsgDashboardData();
    } catch (err) {
      // alert(err.response?.data?.message || "취소 불가"); 
      toast.error(err.response?.data?.message || "❌ 취소할 수 없는 주문입니다.", { containerId: 'main-toast' });
    }
  };

  const checkIsCancelable = (order) => {
    if (order.status === 'CANCELED') return { canCancel: false, reason: '취소 완료' };
    if (order.category === 'DONATION') return { canCancel: false, reason: '기부 취소 불가' };

    const orderDateStr = order.createdDate || order.orderDate;
    if (orderDateStr) {
      const orderDate = new Date(orderDateStr);
      const now = new Date();
      const diffDays = (now - orderDate) / (1000 * 60 * 60 * 24);
      if (diffDays > 7) return { canCancel: false, reason: '7일 경과' };
    }
    return { canCancel: true, reason: '' };
  };

  const renderVerifyBadge = (status) => {
    if (status === 'APPROVED') return <span style={verifyBadgeStyle('#ebfbee', '#2b8a3e')}>✅ 인증 완료</span>;
    if (status === 'REJECTED') return <span style={verifyBadgeStyle('#fff5f5', '#e03131')}>❌ 인증 반려</span>;
    return <span style={verifyBadgeStyle('#fff4e6', '#fd7e14')}>⏳ 심사 대기</span>;
  };

  const totalKg = (totalCo2Reduction / 1000).toFixed(1);
  const pineTrees = (totalCo2Reduction / 6600).toFixed(1);

  const co2ReductionMap = {
    TUMBLER: 300,
    TRANSPORT: 1500,
    RECYCLE: 500
  };

  const badgeTiers = {
    TUMBLER: [
      { level: 1, name: '텀블러 새싹', target: 5, defaultImg: '🌱' },
      { level: 2, name: '텀블러 프로', target: 20, defaultImg: '🌿' },
      { level: 3, name: '텀블러 마스터', target: 50, defaultImg: '🌳' }
    ],
    TRANSPORT: [
      { level: 1, name: '에코 뚜벅이', target: 5, defaultImg: '👟' },
      { level: 2, name: '에코 라이더', target: 20, defaultImg: '🚲' },
      { level: 3, name: '대중교통 마스터', target: 50, defaultImg: '🚇' }
    ],
    RECYCLE: [
      { level: 1, name: '분리배출 요정', target: 5, defaultImg: '♻️' },
      { level: 2, name: '지구 방위대', target: 20, defaultImg: '🌍' },
      { level: 3, name: '환경부 장관', target: 50, defaultImg: '👑' }
    ]
  };

  const getCurrentTierInfo = (type) => {
    const currentCount = activityCounts[type] || 0;
    const tiers = badgeTiers[type];

    let currentBadge = null;
    let nextBadge = tiers[0];

    for (let i = 0; i < tiers.length; i++) {
      const isUnlocked = currentCount >= tiers[i].target || earnedBadges.some(b => b.name === tiers[i].name);

      if (isUnlocked) {
        currentBadge = tiers[i];
        nextBadge = tiers[i + 1] || null;
      }
    }

    return { currentCount, currentBadge, nextBadge, baseTier: tiers[0] };
  };

  return (
    <div style={pageContainer}>
      <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '24px', color: '#1a1a1a' }}>My Page</h1>

      {showCo2Modal && (
        <div style={modalOverlayStyle} onClick={() => setShowCo2Modal(false)}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px 0' }}>탄소 절감 상세 내역</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {co2ApprovedPosts.length === 0 ? <p style={{ textAlign: 'center', padding: '20px' }}>아직 인증받은 활동이 없습니다.</p> : co2ApprovedPosts.map(post => (
                <div key={post.id} style={historyItemStyle}>
                  <div style={{ textAlign: 'left', flex: 1, marginRight: '10px' }}>
                    <div style={{ fontWeight: 'bold' }}>{post.title}</div>
                    <div style={{ fontSize: '12px', color: '#868e96' }}>{new Date(post.createdDate).toLocaleDateString()}</div>
                  </div>
                  <div style={{ fontWeight: 'bold', color: '#16A87A', flexShrink: 0 }}>
                    +{co2ReductionMap[post.aiResult] || 0}g
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowCo2Modal(false)} style={closeBtnStyle}>닫기</button>
          </div>
        </div>
      )}

      <div style={dashboardCardStyle}>
        <div style={profileSectionStyle}>
          <div style={avatarStyle}>👤</div>
          <div>
            <div style={nicknameStyle}>{user?.nickname || '사용자'} 님</div>
            <span style={roleBadgeStyle}>{user?.role}</span>
          </div>
        </div>
        <div style={verticalDividerStyle} />
        <div style={pointSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '6px' }}>
            <div style={pointLabelStyle}>🌱 나의 ESG 보유 포인트</div>
            <Link to="/my-points" style={pointHistoryLinkStyle}>내역 보기 〉</Link>
          </div>
          <div style={pointValueStyle}>{userPoints.toLocaleString()} P</div>
        </div>
      </div>

      <div style={esgDashboardWrapperStyle}>
        {/* 탄소 임팩트 보드 */}
        <div style={{ ...co2CardStyle, cursor: 'pointer' }} onClick={() => setShowCo2Modal(true)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: fSize('13px', '15px'), color: '#0D7A58' }}>나의 탄소 절감 이력</h3>
              <p style={{ margin: '0', fontSize: fSize('20px', '28px'), fontWeight: 'bold', color: '#16A87A' }}>
                {totalKg} <span style={{ fontSize: fSize('14px', '16px'), fontWeight: 'normal', color: '#495057' }}>kg CO₂</span>
              </p>
            </div>
            <div style={treeVisualStyle}>
              <span style={{ fontSize: fSize('20px', '28px') }}>🌲</span>
              <span style={{ fontSize: fSize('10px', '12px'), fontWeight: 'bold', color: '#0D7A58', marginTop: '4px' }}>
                소나무 {pineTrees}그루
              </span>
            </div>
          </div>
        </div>

        {/* 뱃지 컬렉션 보드 */}
        <div style={badgeCardStyle}>
          {/* <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#343a40', display: 'flex', justifyContent: 'space-between' }}>
            <span>나의 뱃지 진행도</span>
            <span style={{ fontSize: '11px', color: '#16A87A', fontWeight: 'normal', alignSelf: 'flex-end' }}>* 획득한 뱃지를 눌러 대표로 설정하세요</span>
          </h3> */}
          <h3 style={{ margin: '0 0 16px 0', fontSize: fSize('13px', '15px'), color: '#343a40', display: 'flex', justifyContent: 'space-between' }}>
            <span>나의 뱃지 진행도</span>
            <span style={{ fontSize: fSize('9px', '11px'), color: '#16A87A', fontWeight: 'normal', alignSelf: 'flex-end' }}>
              {/* * 획득한 뱃지 클릭 시 대표 설정 */}
              * 획득한 뱃지를 눌러 대표로 설정하세요
            </span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '12px' : '16px' }}>

            {Object.keys(badgeTiers).map((type) => {
              const { currentCount, currentBadge, nextBadge, baseTier } = getCurrentTierInfo(type);
              const displayBadge = currentBadge || baseTier;
              const isUnlocked = !!currentBadge;
              const targetCount = nextBadge ? nextBadge.target : displayBadge.target;
              const progressPercent = nextBadge ? Math.min((currentCount / targetCount) * 100, 100) : 100;

              const earnedMatchedBadge = earnedBadges.find(b => b.name === currentBadge?.name);
              const isRepresentative = earnedMatchedBadge && earnedMatchedBadge.id === representativeBadgeId;

              return (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '16px' }}>
                  {/* 뱃지 아이콘 */}
                  <div
                    onClick={() => isUnlocked && earnedMatchedBadge && handleSetRepresentative(earnedMatchedBadge.id)}
                    style={{
                      ...badgeIconCircleStyle(isUnlocked),
                      cursor: (isUnlocked && earnedMatchedBadge) ? 'pointer' : 'default',
                      border: isRepresentative ? '2px solid #16A87A' : (isUnlocked ? '1px solid #A8DFD0' : 'none'),
                      boxShadow: isRepresentative ? '0 0 6px rgba(22, 168, 122, 0.4)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span style={{ fontSize: fSize('18px', '22px'), filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(0.5)' }}>
                      {displayBadge.defaultImg}
                    </span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
                      <span style={{ fontSize: fSize('12px', '13px'), fontWeight: 'bold', color: isUnlocked ? '#0D7A58' : '#adb5bd' }}>
                        {displayBadge.name}
                        {isRepresentative && (
                          <span style={{ marginLeft: '6px', fontSize: '9px', color: '#0D7A58', backgroundColor: '#E6F7F1', padding: '1px 6px', borderRadius: '10px' }}>대표</span>
                        )}
                      </span>
                      <span style={{ fontSize: fSize('10px', '11px'), color: '#868e96', fontWeight: 'bold' }}>
                        {currentCount} <span style={{ fontWeight: 'normal' }}>/ {targetCount}회</span>
                      </span>
                    </div>

                    <div style={{ width: '100%', height: isMobile ? '6px' : '8px', backgroundColor: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        backgroundColor: '#16A87A',
                        borderRadius: '4px',
                        transition: 'width 0.5s ease-in-out'
                      }} />
                    </div>

                    {nextBadge ? (
                      <div style={{ fontSize: fSize('9px', '10px'), color: '#adb5bd', marginTop: '4px', textAlign: 'right' }}>
                        다음 단계: {nextBadge.defaultImg} {nextBadge.name}
                      </div>
                    ) : (
                      <div style={{ fontSize: fSize('9px', '10px'), color: '#16A87A', marginTop: '4px', textAlign: 'right', fontWeight: 'bold' }}>
                        🏆 최고 레벨 달성!
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={tabContainerStyle}>
        <button style={activeTab === 'ORDERS' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('ORDERS')}>
          마켓 주문 내역 ({totalOrders})
        </button>
        <button style={activeTab === 'POSTS' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('POSTS')}>
          내가 쓴 글 ({totalPosts})
        </button>
        <button style={activeTab === 'COMMENTS' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('COMMENTS')}>
          작성한 댓글 ({totalComments})
        </button>
        <button style={activeTab === 'LIKES' ? activeTabStyle : tabStyle} onClick={() => setActiveTab('LIKES')}>
          좋아요 한 글 ({totalLikes})
        </button>
      </div>

      <div style={contentContainerStyle}>
        {activeTab === 'ORDERS' && (
          <div style={listWrapper}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>최근 주문 내역</h3>
              <button onClick={() => navigate('/my-activity/orders')} style={viewAllBtnStyle}>전체보기 〉</button>
            </div>
            <div style={listWrapper}>
              {orders.length === 0 ? <div style={emptyTextStyle}>주문 내역이 없습니다.</div> : (
                orders.slice(0, 10).map(o => {
                  const { canCancel, reason } = checkIsCancelable(o);
                  return (
                    <div key={o.orderId || o.id} style={listCardStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: '1', minWidth: '150px', opacity: o.status === 'CANCELED' ? 0.5 : 1 }}>
                        {o.category === 'GIFTICON' ? (
                          <div style={iconCircleStyle('#E6F7F1', '#16A87A')}>🎁</div>
                        ) : (
                          <div style={iconCircleStyle('#f3f0ff', '#7048e8')}>🤝</div>
                        )}

                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#212529', whiteSpace: 'nowrap', overflow: 'visible' }}>
                            {o.status === 'CANCELED' ? <del>{o.productName}</del> : o.productName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#868e96', marginTop: '0.25rem', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#16A87A', fontWeight: '800' }}>{o.totalPrice?.toLocaleString()} P</span>
                            <span> | {new Date(o.orderDate || o.createdDate).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'center', marginLeft: 'auto' }}>
                        {o.status !== 'CANCELED' && (
                          <button onClick={() => navigate(`/my-page/${o.orderId}`)} style={viewVoucherBtnStyle}>
                            {o.category === 'DONATION' ? '인증서 확인' : '바우처 확인'}
                          </button>
                        )}
                        {canCancel ? (
                          <button onClick={() => handleCancel(o.orderId, o.productName)} style={cancelBtnStyle}>주문 취소</button>
                        ) : (
                          o.status !== 'CANCELED' && (
                            <button disabled style={disabledCancelBtnStyle}>{reason}</button>
                          )
                        )}
                        {o.status === 'CANCELED' && (
                          <span style={{ fontSize: '0.75rem', color: '#adb5bd', paddingRight: '0.3125rem' }}>취소 완료</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'POSTS' && (
          <div style={listWrapper}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>최근 작성한 글</h3>
              <button onClick={() => navigate('/my-activity/posts')} style={viewAllBtnStyle}>전체보기 〉</button>
            </div>
            <div style={listWrapper}>
              {myPosts.length === 0 ? <div style={emptyTextStyle}>작성한 글이 없습니다.</div> : myPosts.slice(0, 10).map(post => (
                <div key={post.id} style={listCardStyle} onClick={() => navigate(`/posts/${post.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, overflow: 'hidden', cursor: 'pointer' }}>
                    <div style={{ position: 'relative', width: '50px', height: '50px' }}>
                      {post.imageUrls?.[0] ? (
                        <>
                          <img src={post.imageUrls[0]} style={thumbnailImgStyle} alt="thumb" />
                          {/* 사진이 1장보다 많을 때만 표시 */}
                          {post.imageUrls.length > 1 && (
                            <div style={{
                              position: 'absolute',
                              top: 0, left: 0, width: '100%', height: '100%',
                              backgroundColor: 'rgba(0, 0, 0, 0.4)',
                              color: '#fff',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              borderRadius: '8px'
                            }}>
                              +{post.imageUrls.length - 1}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={iconCircleStyle('#E6F7F1', '#16A87A')}>📝</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'left', flex: 1, overflow: 'hidden' }}>
                      <div style={mainTitleStyle}>{post.title}</div>
                      <div style={subContentStyle}>{post.content}</div>
                    </div>
                  </div>

                  <div style={rightMetaStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                      {renderVerifyBadge(post.adminStatus)}
                      {post.adminStatus === 'REJECTED' && post.rejectionReason && (
                        <div style={{ fontSize: '11px', color: '#e03131', fontWeight: 'bold', marginTop: '4px', maxWidth: '120px', textAlign: 'right' }}>
                          <strong>반려 사유: </strong> {post.rejectionReason}
                        </div>
                      )}
                    </div>
                    <span>{new Date(post.createdDate || post.createdAt).toLocaleDateString()}</span>
                    <span style={arrowStyle}>〉</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'COMMENTS' && (
          <div style={listWrapper}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>최근 작성한 댓글</h3>
              <button onClick={() => navigate('/my-activity/comments')} style={viewAllBtnStyle}>전체보기 〉</button>
            </div>
            <div style={listWrapper}>
              {myComments.length === 0 ? <div style={emptyTextStyle}>작성한 댓글이 없습니다.</div> :
                myComments.slice(0, 5).map(comment => (
                  <div key={comment.id} style={listCardStyle} onClick={() => navigate(`/posts/${comment.postId}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={iconCircleStyle('#f3f0ff', '#845ef7')}>💬</div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={mainTitleStyle}>"{comment.content}"</div>
                        <div style={postTitleInCommentStyle}>
                          <span style={{ color: '#adb5bd', flexShrink: 0 }}>→</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {comment.postTitle || '원문 게시글'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={rightMetaStyle}>
                      <span>{new Date(comment.createdDate || comment.createdAt).toLocaleDateString()}</span>
                      <span style={arrowStyle}>〉</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === 'LIKES' && (
          <div style={listWrapper}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>좋아요 한 글</h3>
              <button onClick={() => navigate('/my-activity/likes')} style={viewAllBtnStyle}>전체보기 〉</button>
            </div>
            <div style={listWrapper}>
              {likedPosts.length === 0 ? <div style={emptyTextStyle}>좋아요 내역이 없습니다.</div> : likedPosts.slice(0, 5).map(post => (
                <div key={post.id} style={listCardStyle} onClick={() => navigate(`/posts/${post.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, cursor: 'pointer', overflow: 'hidden' }}>
                    <div style={iconCircleStyle('#fff5f5', '#fa5252')}>❤️</div>
                    <div style={mainTitleStyle}>{post.title}</div>
                  </div>
                  <div style={rightMetaStyle}>
                    <span>작성자: {post.nickname}</span>
                    <span>{new Date(post.createdDate || post.createdAt).toLocaleDateString()}</span>
                    <span style={arrowStyle}>〉</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 스타일 가이드
const pageContainer = { padding: '1.25rem 1rem', maxWidth: '56.25rem', margin: '0 auto', fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", backgroundColor: '#fdfdfd', minHeight: '100vh' };
const dashboardCardStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', padding: '1.875rem', marginBottom: '1.25rem', backgroundColor: '#fff', borderRadius: '0.75rem', border: '1px solid #e9ecef', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', gap: '1.25rem' };
const profileSectionStyle = { display: 'flex', alignItems: 'center', gap: '1.125rem', flex: 1, minWidth: '12.5rem' };
const avatarStyle = { width: '3.375rem', height: '3.375rem', borderRadius: '50%', backgroundColor: '#f1f3f5', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.5rem' };
const nicknameStyle = { fontSize: '1.25rem', fontWeight: '800', color: '#212529', marginBottom: '0.375rem' };
const roleBadgeStyle = { display: 'inline-block', backgroundColor: '#e7f5ff', color: '#0D7A5', padding: '0.1875rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.6875rem', fontWeight: 'bold' };

const verticalDividerStyle = { display: 'none' };

const pointSectionStyle = { flex: 1, minWidth: '12.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' };
const pointLabelStyle = { fontSize: '0.8125rem', color: '#868e96', fontWeight: '600' };
const pointValueStyle = { fontSize: '1.875rem', fontWeight: '800', color: '#16A87A', letterSpacing: '-0.5px' };
const pointHistoryLinkStyle = { fontSize: '0.75rem', color: '#adb5bd', textDecoration: 'none', fontWeight: '600', transition: 'color 0.2s' };

const tabContainerStyle = { display: 'flex', overflowX: 'auto', borderBottom: '1px solid #dee2e6', backgroundColor: '#fff', borderRadius: '1rem 1rem 0 0', border: '1px solid #e9ecef' };
const tabStyle = { padding: '1rem 1.25rem', backgroundColor: 'transparent', color: '#868e96', border: 'none', borderBottom: '3px solid transparent', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' };
const activeTabStyle = { ...tabStyle, color: '#0D7A58', borderBottom: '3px solid #16A87A' };
const contentContainerStyle = { padding: '1.5rem 0' };

const sectionHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.9375rem', marginBottom: '0.9375rem', borderBottom: '2px solid #f1f3f5' };
const sectionTitleStyle = { margin: 0, fontSize: '1.125rem', fontWeight: 'bold', color: '#343a40' };
const viewAllBtnStyle = { background: 'none', border: 'none', color: '#868e96', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', padding: '0' };

const listWrapper = { display: 'flex', flexDirection: 'column', gap: '0.75rem' };
const listCardStyle = { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', backgroundColor: '#fff', border: '1px solid #e9ecef', borderRadius: '0.75rem', width: '100%', boxSizing: 'border-box' };

const mainTitleStyle = { fontSize: '0.9375rem', fontWeight: '700', color: '#212529', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', width: '100%' };
const subContentStyle = { fontSize: '0.8125rem', color: '#868e96', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', width: '100%' };
const postTitleInCommentStyle = { fontSize: '0.8125rem', color: '#868e96', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' };

const rightMetaStyle = { display: 'flex', alignItems: 'center', gap: '0.625rem', color: '#adb5bd', fontSize: '0.8125rem', flexShrink: 0, marginLeft: 'auto' };
const arrowStyle = { fontWeight: 'bold', fontSize: '0.875rem', color: '#ced4da' };

const thumbnailImgStyle = { width: '3.125rem', height: '3.125rem', borderRadius: '0.5rem', objectFit: 'cover', flexShrink: 0 };
const verifyBadgeStyle = (bg, color) => ({ padding: '0.25rem 0.625rem', borderRadius: '0.375rem', fontSize: '0.6875rem', fontWeight: 'bold', backgroundColor: bg, color: color, display: 'inline-block' });
const iconCircleStyle = (bg, color) => ({ width: '2.5rem', height: '2.5rem', borderRadius: '50%', backgroundColor: bg, color: color, display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 });

const statusBadgeStyle = (status) => ({ padding: '0.25rem 0.625rem', borderRadius: '1.25rem', fontSize: '0.6875rem', fontWeight: 'bold', backgroundColor: status === 'CANCELED' ? '#fff5f5' : '#E6F7F1', color: status === 'CANCELED' ? '#fa5252' : '#0D7A58' });
const viewVoucherBtnStyle = { padding: '0.375rem 0.75rem', backgroundColor: '#16A87A', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8125rem' };
const cancelBtnStyle = { padding: '0.375rem 0.75rem', backgroundColor: '#fff', color: '#fa5252', border: '1px solid #fa5252', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8125rem' };
const disabledCancelBtnStyle = { padding: '0.375rem 0.75rem', backgroundColor: '#f8f9fa', color: '#adb5bd', border: '1px solid #dee2e6', borderRadius: '0.375rem', cursor: 'not-allowed', fontSize: '0.75rem', fontWeight: 'bold' };

const emptyTextStyle = { textAlign: 'center', padding: '3.75rem 0', color: '#adb5bd', fontSize: '0.9375rem', fontWeight: '500' };

const esgDashboardWrapperStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(17.5rem, 1fr))', gap: '1.25rem', marginBottom: '2.1875rem' };
const co2CardStyle = { backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #e9ecef', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const badgeCardStyle = { backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #e9ecef', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
const treeVisualStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#E6F7F1', padding: '0.75rem 1.125rem', borderRadius: '0.75rem', border: '1px solid #A8DFD0' };
const badgeIconCircleStyle = (unlocked) => ({ width: '2.75rem', height: '2.75rem', borderRadius: '50%', backgroundColor: unlocked ? '#E6F7F1' : '#e9ecef', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '0.375rem' });

const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContentStyle = { backgroundColor: '#fff', padding: '1.5rem', borderRadius: '1rem', width: '25rem', maxWidth: '90%' };
const historyItemStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #f1f3f5' };
const closeBtnStyle = { marginTop: '1.25rem', width: '100%', padding: '0.75rem', border: 'none', borderRadius: '0.5rem', backgroundColor: '#339af0', color: '#fff', cursor: 'pointer', fontWeight: 'bold' };

export default MyPage;