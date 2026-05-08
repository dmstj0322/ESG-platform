package com.esg.marketservice.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {
  private final JavaMailSender mailSender;

//  public void sendMail(String from, String to, String subject, String text) {
//    SimpleMailMessage message = new SimpleMailMessage();
//    message.setFrom(from);
//    message.setTo(to);
//    message.setSubject(subject);
//    message.setText(text);
//    mailSender.send(message);
//  }
//
//  public void sendVoucherEmail(String from, String to, String productName, String link) {
//    String subject = String.format("[Green-Trace] %s 기프티콘이 도착했습니다.", productName);
//    String text = String.format(
//      "안녕하세요. 사내 담당 관리자(%s)입니다.\n\n요청하신 [%s]의 바코드가 발급되었습니다.\n아래 링크에서 확인 후 매장에서 사용하세요.\n\n바코드 확인하기: %s",
//      from, productName, link);
//    sendMail(from, to, subject, text);
//  }
//
//  public void sendDonationCertEmail(String from, String to, String productName, String link) {
//    String subject = String.format("[Green-Trace] %s 기부 참여에 대한 감사 인증서", productName);
//    String text = String.format(
//      "안녕하세요. 사내 담당 관리자(%s)입니다.\n\n[%s] 참여를 통한따뜻한 나눔에 진심으로 감사드립니다.\n고객님의 성함으로 발행된 기부 인증서를 아래 링크에서 확인하실 수 있습니다.\n\n인증서 보기: %s",
//      from, productName, link);
//    sendMail(from, to, subject, text);
//  }

  private void sendHtmlMail(String to, String subject, String htmlContent) {
    MimeMessage message = mailSender.createMimeMessage();
    try {
      MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
      helper.setTo(to);
      helper.setSubject(subject);
      helper.setText(htmlContent, true); // true 설정 시 HTML로 발송됨
      mailSender.send(message);
      log.info("이메일 발송 성공: {}", to);
    } catch (MessagingException e) {
      log.error("이메일 발송 실패: {}", e.getMessage());
      throw new RuntimeException("이메일 발송 중 오류가 발생했습니다.");
    }
  }

  public void sendVoucherEmail(String from, String to, String productName, String link) {
    String subject = String.format("[Green-Trace] %s 기프티콘이 도착했습니다.", productName);
    // EmailTemplates의 템플릿에 변수 주입
    String htmlContent = String.format(EmailTemplates.VOUCHER_TEMPLATE, productName, from, link);

    sendHtmlMail(to, subject, htmlContent);
  }

  public void sendDonationCertEmail(String from, String to, String productName, String link) {
    String subject = String.format("[Green-Trace] %s 기부 참여 감사 인증서", productName);
    // EmailTemplates의 템플릿에 변수 주입
    String htmlContent = String.format(EmailTemplates.DONATION_TEMPLATE, productName, link);

    sendHtmlMail(to, subject, htmlContent);
  }
}
