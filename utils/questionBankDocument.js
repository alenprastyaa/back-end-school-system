const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SUPPORTED_IMPORT_EXTENSIONS = [".doc", ".docx", ".rtf", ".txt"];
const FIELD_PATTERN = /^(NO|TYPE|QUESTION|ANSWER|RUBRIC|A|B|C|D|E)\s*:\s*(.*)$/i;

const normalizeType = (value) => {
  const nextType = String(value || "MCQ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (["MCQ", "PILIHAN_GANDA", "PG"].includes(nextType)) {
    return "MCQ";
  }

  if (["ESSAY", "URAIAN", "ESAI"].includes(nextType)) {
    return "ESSAY";
  }

  return null;
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const buildQuestionBankTemplateText = (questionType = "MCQ") => {
  const nextType = normalizeType(questionType) || "MCQ";
  const header = [
    "TEMPLATE IMPORT BANK SOAL",
    "",
    "PETUNJUK:",
    "1. Buka file ini di Microsoft Word.",
    "2. Template ini sudah berisi 20 nomor soal. Anda dapat mengisi semuanya atau menambah blok baru jika perlu.",
    "3. Isi soal di antara tag [SOAL] dan [/SOAL].",
    "4. Jangan mengubah nama field seperti NO, TYPE, QUESTION, A, B, C, D, E, ANSWER, atau RUBRIC.",
    "5. Untuk soal pilihan ganda, isi ANSWER dengan huruf opsi yang benar, misalnya A atau C.",
    "6. Untuk soal uraian, RUBRIC boleh dikosongkan.",
    "",
  ];

  const buildMcqBlock = (number) => [
    "[SOAL]",
    `NO: ${number}`,
    "TYPE: Pilihan Ganda",
    `QUESTION: Tulis pertanyaan nomor ${number} di sini.`,
    "A: Opsi A",
    "B: Opsi B",
    "C: Opsi C",
    "D: Opsi D",
    "ANSWER: A",
    "[/SOAL]",
  ];

  const buildEssayBlock = (number) => [
    "[SOAL]",
    `NO: ${number}`,
    "TYPE: Uraian",
    `QUESTION: Tulis soal uraian nomor ${number} di sini.`,
    "RUBRIC: Tulis panduan penilaian jawaban di sini.",
    "[/SOAL]",
  ];

  const examples = Array.from({ length: 20 }, (_, index) =>
    nextType === "ESSAY" ? buildEssayBlock(index + 1) : buildMcqBlock(index + 1),
  ).flat();

  return `${header.join("\n")}\n${examples.join("\n")}\n`;
};

const buildQuestionBankTemplate = (questionType = "MCQ") => {
  const templateText = buildQuestionBankTemplateText(questionType);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Template Import Bank Soal</title>
  <style>
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.15;
      color: #000000;
      margin: 24pt;
    }
    pre {
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.15;
      white-space: pre-wrap;
      margin: 0;
    }
  </style>
</head>
<body>
  <pre>${escapeHtml(templateText)}</pre>
</body>
</html>`;
};

const normalizeExtractedText = (rawText) =>
  String(rawText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n");

const extractDocxXmlText = (xml) =>
  String(xml || "")
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");

const extractTextFromDocument = (filePath, originalName = "") => {
  const extension = path.extname(originalName || filePath).toLowerCase();
  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension)) {
    throw new Error("Format file tidak didukung. Gunakan .doc, .docx, .rtf, atau .txt");
  }

  try {
    return normalizeExtractedText(
      execFileSync("textutil", ["-convert", "txt", "-stdout", filePath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch (error) {
    if (extension === ".docx") {
      try {
        const xml = execFileSync("unzip", ["-p", filePath, "word/document.xml"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        return normalizeExtractedText(extractDocxXmlText(xml));
      } catch (docxError) {
        // Fallback handled below.
      }
    }
  }

  return normalizeExtractedText(fs.readFileSync(filePath, "utf8"));
};

const finalizeFieldValue = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

const parseQuestionBlock = (block, index) => {
  const lines = String(block || "").split("\n");
  const fields = {};
  let currentField = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const fieldMatch = line.trim().match(FIELD_PATTERN);

    if (fieldMatch) {
      currentField = fieldMatch[1].toUpperCase();
      fields[currentField] = fields[currentField]
        ? `${fields[currentField]}\n${fieldMatch[2].trim()}`
        : fieldMatch[2].trim();
      return;
    }

    if (!currentField) {
      return;
    }

    fields[currentField] = `${fields[currentField] || ""}\n${line.trim()}`.trim();
  });

  const questionType = normalizeType(fields.TYPE);
  if (!questionType) {
    throw new Error(`Soal ${index + 1}: TYPE harus Pilihan Ganda atau Uraian`);
  }

  const questionText = finalizeFieldValue(fields.QUESTION);
  if (!questionText) {
    throw new Error(`Soal ${index + 1}: QUESTION wajib diisi`);
  }

  if (questionType === "MCQ") {
    const optionMap = ["A", "B", "C", "D", "E"]
      .map((label) => ({
        label,
        text: finalizeFieldValue(fields[label]),
      }))
      .filter((item) => item.text);

    if (optionMap.length < 2) {
      throw new Error(`Soal ${index + 1}: pilihan ganda minimal memiliki 2 opsi`);
    }

    const answerLabel = String(fields.ANSWER || "").trim().toUpperCase();
    const correctOptionIndex = optionMap.findIndex((item) => item.label === answerLabel);

    if (correctOptionIndex < 0) {
      throw new Error(`Soal ${index + 1}: ANSWER harus mengacu ke opsi yang tersedia, misalnya A`);
    }

    return {
      question_type: "MCQ",
      question_text: questionText,
      options: optionMap.map((item) => item.text),
      correct_option: correctOptionIndex,
      rubric: null,
    };
  }

  return {
    question_type: "ESSAY",
    question_text: questionText,
    options: null,
    correct_option: null,
    rubric: finalizeFieldValue(fields.RUBRIC) || null,
  };
};

const parseQuestionBankDocument = (rawText) => {
  const text = normalizeExtractedText(rawText);
  const blocks = [];
  const pattern = /(?:^|\n)\[SOAL\]\s*\n([\s\S]*?)\n\[\/SOAL\](?=\n|$)/gi;
  let match = pattern.exec(text);

  while (match) {
    blocks.push(match[1].trim());
    match = pattern.exec(text);
  }

  if (blocks.length === 0) {
    throw new Error("Dokumen tidak memiliki blok [SOAL] ... [/SOAL]");
  }

  return blocks.map((block, index) => parseQuestionBlock(block, index));
};

module.exports = {
  SUPPORTED_IMPORT_EXTENSIONS,
  buildQuestionBankTemplate,
  buildQuestionBankTemplateText,
  extractTextFromDocument,
  parseQuestionBankDocument,
};
