package com.esg.marketservice.service;

public class EmailTemplates {
  public static final String VOUCHER_TEMPLATE = """
        <div style="background-color: #f1f3f5; padding: 60px 20px; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;">
            <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.08);">
                <div style="background: linear-gradient(135deg, #20c997 0%%, #12b886 100%%); padding: 50px 30px; text-align: center; color: white;">
                    <div style="font-size: 40px; margin-bottom: 15px;">🎁</div>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px;">Gifticon Arrived!</h1>
                    <p style="opacity: 0.9; margin-top: 10px; font-size: 16px;">당신의 친환경 활동이 선물로 돌아왔습니다.</p>
                </div>
                <div style="padding: 50px 40px; line-height: 1.8; color: #495057;">
                    <p style="font-size: 18px; color: #212529; margin-bottom: 30px;">안녕하세요, <strong>Green-Trace</strong> 팀입니다.</p>
                    <p style="margin-bottom: 10px;">회원님이 요청하신 <strong>[%s]</strong> 바코드가 정상 발급되었습니다.</p>
                    <p style="color: #adb5bd; font-size: 14px; margin-bottom: 40px;">담당 관리자(%s)님이 안전하게 전달하였습니다.</p>
                    <div style="text-align: center; margin: 40px 0;">
                        <a href="%s" style="background-color: #339af0; color: #ffffff; padding: 20px 45px; text-decoration: none; border-radius: 16px; font-weight: bold; font-size: 17px; display: inline-block; box-shadow: 0 10px 25px rgba(51, 154, 240, 0.4);">바코드 확인하러 가기</a>
                    </div>
                    <div style="border-top: 1px solid #f1f3f5; padding-top: 30px; font-size: 13px; color: #adb5bd; text-align: center;">
                        <p style="margin: 0;">본 메일은 발신 전용이며 문의사항은 고객센터를 이용해 주세요.</p>
                        <p style="margin: 5px 0 0;">© 2026 Green-Trace. All rights reserved.</p>
                    </div>
                </div>
            </div>
        </div>
        """;

  // 📜 기부 인증서 템플릿
  public static final String DONATION_TEMPLATE = """
        <div style="background-color: #f1f3f5; padding: 60px 20px; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;">
            <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.08);">
                <div style="background: linear-gradient(135deg, #339af0 0%%, #1c7ed6 100%%); padding: 50px 30px; text-align: center; color: white;">
                    <div style="font-size: 40px; margin-bottom: 15px;">📜</div>
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px;">Thank You!</h1>
                    <p style="opacity: 0.9; margin-top: 10px; font-size: 16px;">세상을 바꾸는 따뜻한 나눔에 진심으로 감사드립니다.</p>
                </div>
                <div style="padding: 50px 40px; line-height: 1.8; color: #495057;">
                    <p style="font-size: 18px; color: #212529; margin-bottom: 30px;">안녕하세요, <strong>Green-Trace</strong> 팀입니다.</p>
                    <p style="margin-bottom: 40px;">참여해 주신 <strong>[%s]</strong> 캠페인에 대한 소중한 기부 인증서가 발행되었습니다. 회원님의 소중한 기여를 잊지 않겠습니다.</p>
                    <div style="text-align: center; margin: 40px 0;">
                        <a href="%s" style="background-color: #20c997; color: #ffffff; padding: 20px 45px; text-decoration: none; border-radius: 16px; font-weight: bold; font-size: 17px; display: inline-block; box-shadow: 0 10px 25px rgba(32, 201, 151, 0.4);">인증서 확인하기</a>
                    </div>
                    <div style="border-top: 1px solid #f1f3f5; padding-top: 30px; font-size: 13px; color: #adb5bd; text-align: center;">
                        <p style="margin: 0;">Green-Trace는 지속 가능한 미래를 위해 함께합니다.</p>
                        <p style="margin: 5px 0 0;">© 2026 Green-Trace. All rights reserved.</p>
                    </div>
                </div>
            </div>
        </div>
        """;
//  public static final String VOUCHER_TEMPLATE = """
//        <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 500px; margin: 20px auto; border: 1px solid #eee; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
//            <div style="background-color: #20c997; padding: 40px 20px; text-align: center; color: white;">
//                <h1 style="margin: 0; font-size: 28px; letter-spacing: -1px;">Gifticon Arrived!</h1>
//                <p style="opacity: 0.9; margin-top: 10px;">그린 트레이스가 보낸 선물이 도착했습니다.</p>
//            </div>
//            <div style="padding: 40px 30px; line-height: 1.7; color: #333;">
//                <p style="font-size: 16px; margin-bottom: 25px;">안녕하세요. <strong>Green-Trace</strong> 팀입니다.</p>
//                <p style="margin-bottom: 5px;">요청하신 <strong>[%s]</strong> 바코드가 발급되었습니다.</p>
//                <p style="color: #888; font-size: 14px; margin-bottom: 30px;">관리자(%s)님이 전송한 메일입니다.</p>
//                <div style="text-align: center; margin: 40px 0;">
//                    <a href="%s" style="background-color: #339af0; color: white; padding: 18px 35px; text-decoration: none; border-radius: 14px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 5px 15px rgba(51, 154, 240, 0.3);">바코드 확인하기</a>
//                </div>
//                <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #999;">
//                    <p style="margin: 0;">* 본 메일은 시스템에 의해 자동으로 발송된 발신 전용 메일입니다.</p>
//                </div>
//            </div>
//        </div>
//        """;
//
//  public static final String DONATION_TEMPLATE = """
//        <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 500px; margin: 20px auto; border: 1px solid #eee; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
//            <div style="background-color: #339af0; padding: 40px 20px; text-align: center; color: white;">
//                <h1 style="margin: 0; font-size: 28px; letter-spacing: -1px;">Thank You!</h1>
//                <p style="opacity: 0.9; margin-top: 10px;">따뜻한 나눔에 진심으로 감사드립니다.</p>
//            </div>
//            <div style="padding: 40px 30px; line-height: 1.7; color: #333;">
//                <p style="font-size: 16px; margin-bottom: 25px;">안녕하세요. <strong>Green-Trace</strong> 팀입니다.</p>
//                <p style="margin-bottom: 30px;">참여해 주신 <strong>[%s]</strong> 활동에 대한 기부 인증서가 발행되었습니다. 고객님의 소중한 기여를 잊지 않겠습니다.</p>
//                <div style="text-align: center; margin: 40px 0;">
//                    <a href="%s" style="background-color: #20c997; color: white; padding: 18px 35px; text-decoration: none; border-radius: 14px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 5px 15px rgba(32, 201, 151, 0.3);">기부 인증서 확인</a>
//                </div>
//                <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #999;">
//                    <p style="margin: 0;">Green-Trace는 지속 가능한 미래를 위해 함께합니다.</p>
//                </div>
//            </div>
//        </div>
//        """;
}
