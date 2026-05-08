package com.esg.marketservice.service;

public class EmailTemplates {
  public static final String VOUCHER_TEMPLATE = """
        <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 500px; margin: 20px auto; border: 1px solid #eee; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
            <div style="background-color: #20c997; padding: 40px 20px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 28px; letter-spacing: -1px;">Gifticon Arrived!</h1>
                <p style="opacity: 0.9; margin-top: 10px;">그린 트레이스가 보낸 선물이 도착했습니다.</p>
            </div>
            <div style="padding: 40px 30px; line-height: 1.7; color: #333;">
                <p style="font-size: 16px; margin-bottom: 25px;">안녕하세요. <strong>Green-Trace</strong> 팀입니다.</p>
                <p style="margin-bottom: 5px;">요청하신 <strong>[%s]</strong> 바코드가 발급되었습니다.</p>
                <p style="color: #888; font-size: 14px; margin-bottom: 30px;">관리자(%s)님이 전송한 메일입니다.</p>
                <div style="text-align: center; margin: 40px 0;">
                    <a href="%s" style="background-color: #339af0; color: white; padding: 18px 35px; text-decoration: none; border-radius: 14px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 5px 15px rgba(51, 154, 240, 0.3);">바코드 확인하기</a>
                </div>
                <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #999;">
                    <p style="margin: 0;">* 본 메일은 시스템에 의해 자동으로 발송된 발신 전용 메일입니다.</p>
                </div>
            </div>
        </div>
        """;

  public static final String DONATION_TEMPLATE = """
        <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 500px; margin: 20px auto; border: 1px solid #eee; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
            <div style="background-color: #339af0; padding: 40px 20px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 28px; letter-spacing: -1px;">Thank You!</h1>
                <p style="opacity: 0.9; margin-top: 10px;">따뜻한 나눔에 진심으로 감사드립니다.</p>
            </div>
            <div style="padding: 40px 30px; line-height: 1.7; color: #333;">
                <p style="font-size: 16px; margin-bottom: 25px;">안녕하세요. <strong>Green-Trace</strong> 팀입니다.</p>
                <p style="margin-bottom: 30px;">참여해 주신 <strong>[%s]</strong> 활동에 대한 기부 인증서가 발행되었습니다. 고객님의 소중한 기여를 잊지 않겠습니다.</p>
                <div style="text-align: center; margin: 40px 0;">
                    <a href="%s" style="background-color: #20c997; color: white; padding: 18px 35px; text-decoration: none; border-radius: 14px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 5px 15px rgba(32, 201, 151, 0.3);">기부 인증서 확인</a>
                </div>
                <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #999;">
                    <p style="margin: 0;">Green-Trace는 지속 가능한 미래를 위해 함께합니다.</p>
                </div>
            </div>
        </div>
        """;
}
