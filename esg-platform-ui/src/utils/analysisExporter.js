import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { marked } from "marked";

export const exportToPdf = async (data) => {
  const exportContainer = document.createElement("div");
  exportContainer.style.position = "absolute";
  exportContainer.style.left = "-9999px";
  exportContainer.style.width = "800px";
  exportContainer.style.padding = "60px";
  exportContainer.style.backgroundColor = "#ffffff";
  // 한글 폰트 안정성 확보
  exportContainer.style.fontFamily = "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

  exportContainer.innerHTML = `
    <div style="text-align: center; margin-bottom: 40px;">
        <h1 style="color: #1a237e; font-size: 32px; margin-bottom: 10px;">K-ESG 심층 분석 결과 보고서</h1>
        <p style="font-size: 16px; color: #666;">리포트 일련번호: ${data.analysisId} | 생성일시: ${new Date().toLocaleDateString()}</p>
        <div style="margin: 20px auto; width: 100px; height: 4px; background-color: #1a237e;"></div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; background-color: #f8f9fa; padding: 30px; border-radius: 15px; margin-bottom: 40px;">
        <div>
            <h2 style="margin: 0; color: #333; font-size: 20px;">종합 평가 등급</h2>
            <p style="margin: 5px 0 0 0; color: #666;">자체 ESG 평가 알고리즘 기반</p>
        </div>
        <div style="font-size: 64px; font-weight: 900; color: #1a237e;">${data.finalGrade}</div>
    </div>

    <div style="margin-bottom: 40px;">
        <h3 style="border-left: 6px solid #1a237e; padding-left: 15px; font-size: 20px; color: #1a237e; margin-bottom: 20px;">1. 전문가 총평</h3>
        <div style="line-height: 1.8; color: #444; font-size: 15px; text-align: justify;">
            ${marked.parse(data.fullReport || "")}
        </div>
    </div>

    <div style="margin-bottom: 40px; text-align: center; padding: 40px; border: 2px dashed #e0e0e0; border-radius: 15px; background-color: #fafafa;">
        <p style="color: #999; font-size: 14px;">[ ESG 영역별 성과 비교 차트 데이터 시각화 영역 ]</p>
    </div>

    <div style="page-break-before: always; margin-top: 50px;">
        <h3 style="border-left: 6px solid #1a237e; padding-left: 15px; font-size: 20px; color: #1a237e; margin-bottom: 20px;">2. 지표별 상세 분석 근거</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; border-top: 2px solid #1a237e;">
            <thead>
                <tr style="background-color: #f8f9fa;">
                    <th style="border-bottom: 1px solid #dee2e6; padding: 15px; text-align: left; width: 25%;">평가 항목</th>
                    <th style="border-bottom: 1px solid #dee2e6; padding: 15px; text-align: left;">세부 근거 및 제언</th>
                </tr>
            </thead>
            <tbody>
                ${data.evidence?.map(e => `
                    <tr>
                        <td style="border-bottom: 1px solid #eee; padding: 20px; font-weight: bold; color: #333; background-color: #fafafa;">${e.indicator}</td>
                        <td style="border-bottom: 1px solid #eee; padding: 20px; color: #555; line-height: 1.6;">
                            ${e.content}
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>

    <div style="margin-top: 60px; text-align: center; color: #bbb; font-size: 12px;">
        본 리포트는 ESG 감사 분석 시스템을 통해 작성되었으며, 실제 공시 자료와 차이가 있을 수 있습니다.
    </div>
  `;

  document.body.appendChild(exportContainer);

  const canvas = await html2canvas(exportContainer, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff"
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const imgWidth = 210;
  const pageHeight = 295;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(`ESG_Analysis_Report_${data.analysisId}.pdf`);
  document.body.removeChild(exportContainer);
};