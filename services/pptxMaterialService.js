const fs = require("fs/promises");
const path = require("path");
const PptxGenJS = require("pptxgenjs");

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const sanitizeFileName = (value) =>
  String(value || "materi-pembelajaran")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "materi-pembelajaran";

const buildBulletText = (bullets = []) =>
  bullets
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => `• ${item}`)
    .join("\n");

const buildPowerPointMaterialFile = async ({
  presentationTitle,
  subtitle,
  subjectName,
  className,
  slides,
  outputDir,
}) => {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "School System";
  pptx.company = "School System";
  pptx.subject = subjectName || "Materi Pembelajaran";
  pptx.title = presentationTitle;
  pptx.lang = "id-ID";

  slides.forEach((item, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: index % 2 === 0 ? "F8FAFC" : "EFF6FF" };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.8,
      line: { color: "0EA5E9", transparency: 100 },
      fill: { color: index % 2 === 0 ? "0F172A" : "0EA5E9" },
    });

    slide.addText(presentationTitle, {
      x: 0.6,
      y: 0.18,
      w: 9.5,
      h: 0.28,
      fontSize: 24,
      bold: true,
      color: "FFFFFF",
      margin: 0,
      fit: "shrink",
    });

    slide.addText(item.title, {
      x: 0.75,
      y: 1.1,
      w: 9.8,
      h: 0.55,
      fontSize: 22,
      bold: true,
      color: "0F172A",
      margin: 0,
      fit: "shrink",
    });

    slide.addText(buildBulletText(item.bullets), {
      x: 0.9,
      y: 1.95,
      w: 8.6,
      h: 4.3,
      fontSize: 17,
      color: "1E293B",
      margin: 0.05,
      valign: "top",
      fit: "shrink",
    });

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 9.9,
      y: 1.65,
      w: 2.55,
      h: 3.7,
      line: { color: "BAE6FD", pt: 1 },
      fill: { color: index % 2 === 0 ? "E0F2FE" : "FFFFFF" },
    });

    slide.addText(`Mapel\n${subjectName || "-"}`, {
      x: 10.2,
      y: 2.05,
      w: 1.95,
      h: 0.9,
      fontSize: 14,
      bold: true,
      color: "0369A1",
      align: "center",
      valign: "mid",
    });

    slide.addText(`Kelas\n${className || "-"}`, {
      x: 10.2,
      y: 3.2,
      w: 1.95,
      h: 0.9,
      fontSize: 14,
      bold: true,
      color: "0369A1",
      align: "center",
      valign: "mid",
    });

    if (item.speaker_notes) {
      slide.addText(`Catatan Guru:\n${item.speaker_notes}`, {
        x: 0.9,
        y: 6.0,
        w: 11.2,
        h: 0.6,
        fontSize: 10,
        italic: true,
        color: "475569",
        margin: 0,
        fit: "shrink",
      });
    }

    slide.addText(subtitle || "", {
      x: 0.75,
      y: 6.75,
      w: 7,
      h: 0.2,
      fontSize: 10,
      color: "64748B",
      margin: 0,
      fit: "shrink",
    });

    slide.addText(`${index + 1}/${slides.length}`, {
      x: 11.95,
      y: 6.72,
      w: 0.7,
      h: 0.2,
      fontSize: 10,
      bold: true,
      color: "0F172A",
      align: "right",
      margin: 0,
    });
  });

  await fs.mkdir(outputDir, { recursive: true });

  const fileName = `${sanitizeFileName(presentationTitle)}-${Date.now()}.pptx`;
  const outputPath = path.join(outputDir, fileName);
  await pptx.writeFile({ fileName: outputPath });

  return {
    outputPath,
    fileName,
    mimeType: PPTX_MIME_TYPE,
  };
};

module.exports = {
  PPTX_MIME_TYPE,
  buildPowerPointMaterialFile,
};
