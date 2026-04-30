const fs = require("fs");
const os = require("os");
const path = require("path");

const escapePdfText = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const buildPageStream = (lines) => {
  const fontSize = 10;
  const lineHeight = 14;
  const startX = 40;
  let currentY = 800;

  const commands = ["BT", `/F1 ${fontSize} Tf`, `${startX} ${currentY} Td`];

  lines.forEach((line, index) => {
    if (index > 0) {
      commands.push(`0 -${lineHeight} Td`);
      currentY -= lineHeight;
    }
    commands.push(`(${escapePdfText(line)}) Tj`);
  });

  commands.push("ET");
  return commands.join("\n");
};

const buildPdfBuffer = (pages) => {
  const objects = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");

  const pageIds = pages.map((_, index) => 3 + index * 2);
  const contentIds = pages.map((_, index) => 4 + index * 2);
  objects.push(
    `2 0 obj << /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >> endobj`,
  );

  pages.forEach((stream, index) => {
    const pageId = pageIds[index];
    const contentId = contentIds[index];
    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentId} 0 R >> endobj`,
    );
    objects.push(
      `${contentId} 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >> stream\n${stream}\nendstream endobj`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
};

const createAttendancePdfReport = async ({
  filenamePrefix,
  title,
  subtitle,
  summaryLines = [],
  studentRows = [],
}) => {
  const bodyLines = [
    title,
    subtitle,
    "",
    ...summaryLines,
    "",
    "Daftar Siswa",
    "No | Nama Siswa                 | Status       | Masuk   | Pulang",
    "----------------------------------------------------------------",
    ...studentRows.map((item, index) => {
      const no = String(index + 1).padEnd(2, " ");
      const name = String(item.username || "-").slice(0, 25).padEnd(25, " ");
      const status = String(item.statusLabel || "-").slice(0, 12).padEnd(12, " ");
      const clockIn = String(item.clockIn || "-").padEnd(7, " ");
      const clockOut = String(item.clockOut || "-").padEnd(7, " ");
      return `${no} | ${name} | ${status} | ${clockIn} | ${clockOut}`;
    }),
  ];

  const linesPerPage = 45;
  const pages = [];
  for (let index = 0; index < bodyLines.length; index += linesPerPage) {
    pages.push(buildPageStream(bodyLines.slice(index, index + linesPerPage)));
  }

  const buffer = buildPdfBuffer(pages);
  const filePath = path.join(
    os.tmpdir(),
    `${filenamePrefix}-${Date.now()}.pdf`,
  );
  await fs.promises.writeFile(filePath, buffer);

  return filePath;
};

module.exports = {
  createAttendancePdfReport,
};
