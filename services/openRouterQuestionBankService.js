const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1/chat/completions";

const normalizeProviderError = (message) => {
  const normalizedMessage = String(message || "").trim();
  if (!normalizedMessage) {
    return "Request OpenRouter gagal";
  }

  const lowered = normalizedMessage.toLowerCase();
  if (lowered.includes("user not found")) {
    return "OPENROUTER_API_KEY tidak valid atau akun OpenRouter untuk API key ini tidak ditemukan";
  }

  if (lowered.includes("invalid api key") || lowered.includes("unauthorized")) {
    return "OPENROUTER_API_KEY tidak valid atau akses OpenRouter ditolak";
  }

  return normalizedMessage;
};

const buildPrompt = ({
  subjectName,
  className,
  gradeLabel,
  phaseName,
  curriculumName,
  topic,
  questionType,
  questionCount,
  difficulty,
  additionalInstructions,
}) => {
  const normalizedType = questionType === "ESSAY" ? "ESSAY" : "MCQ";

  return [
    "Anda adalah penyusun bank soal untuk LMS sekolah.",
    "Buat soal dalam Bahasa Indonesia yang jelas, natural, dan sesuai konteks sekolah.",
    `Mapel: ${subjectName || "-"}.`,
    `Kelas: ${className || "-"}.`,
    gradeLabel ? `Jenjang/kelas target tambahan: ${gradeLabel}.` : null,
    phaseName ? `Fase belajar: ${phaseName}.` : null,
    curriculumName ? `Kurikulum: ${curriculumName}.` : null,
    `Topik: ${topic}.`,
    `Tipe soal: ${normalizedType}.`,
    `Jumlah soal: ${questionCount}.`,
    `Tingkat kesulitan: ${difficulty}.`,
    additionalInstructions ? `Instruksi tambahan: ${additionalInstructions}.` : null,
    normalizedType === "MCQ"
      ? "Setiap soal MCQ harus punya tepat 5 opsi jawaban dari A sampai E dan satu correct_option berbasis indeks 0 sampai 4."
      : "Setiap soal essay harus memiliki rubric singkat untuk membantu penilaian guru.",
    "Kembalikan JSON saja tanpa markdown, tanpa penjelasan tambahan.",
    "Struktur JSON wajib:",
    `{"items":[{"question_type":"${normalizedType}","question_text":"...","options":["..."],"correct_option":0,"rubric":null}]}`,
    "Untuk ESSAY, isi options dengan null dan correct_option dengan null.",
  ].filter(Boolean).join("\n");
};

const extractResponseText = (payload) => {
  const choice = payload?.choices?.[0] || {};
  const messageContent = choice?.message?.content;
  if (typeof messageContent === "string") {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
  }

  if (typeof choice?.message?.reasoning === "string" && choice.message.reasoning.trim()) {
    return choice.message.reasoning.trim();
  }

  if (typeof choice?.text === "string" && choice.text.trim()) {
    return choice.text.trim();
  }

  return "";
};

const extractJsonFromText = (rawText) => {
  const direct = String(rawText || "").trim();
  if (!direct) {
    return "";
  }

  if (direct.startsWith("{") && direct.endsWith("}")) {
    return direct;
  }

  const fencedMatch = direct.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const startIndex = direct.indexOf("{");
  const endIndex = direct.lastIndexOf("}");
  if (startIndex >= 0 && endIndex > startIndex) {
    return direct.slice(startIndex, endIndex + 1).trim();
  }

  return direct;
};

const normalizeGeneratedItems = (items, questionType) => {
  const normalizedType = questionType === "ESSAY" ? "ESSAY" : "MCQ";

  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const questionText = String(item?.question_text || "").trim();
      if (!questionText) {
        return null;
      }

      if (normalizedType === "MCQ") {
        const options = Array.isArray(item?.options)
          ? item.options.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 5)
          : [];
        const correctOption = Number(item?.correct_option);

        if (options.length !== 5 || !Number.isInteger(correctOption) || correctOption < 0 || correctOption > 4) {
          return null;
        }

        return {
          question_type: "MCQ",
          question_text: questionText,
          options,
          correct_option: correctOption,
          rubric: null,
        };
      }

      return {
        question_type: "ESSAY",
        question_text: questionText,
        options: null,
        correct_option: null,
        rubric: String(item?.rubric || "").trim() || "Jawaban dinilai berdasarkan ketepatan konsep, kelengkapan penjelasan, dan kejelasan alasan.",
      };
    })
    .filter(Boolean);
};

const generateQuestionBankItemsWithOpenRouter = async ({
  subjectName,
  className,
  gradeLabel,
  phaseName,
  curriculumName,
  topic,
  questionType,
  questionCount,
  difficulty,
  additionalInstructions,
}) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY belum diatur di server");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const basePayload = {
      model: DEFAULT_OPENROUTER_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: "Anda adalah penyusun bank soal sekolah yang harus mengembalikan JSON valid tanpa markdown.",
        },
        {
          role: "user",
          content: buildPrompt({
            subjectName,
            className,
            gradeLabel,
            phaseName,
            curriculumName,
            topic,
            questionType,
            questionCount,
            difficulty,
            additionalInstructions,
          }),
        },
      ],
    };

    const callProvider = async (payload) => {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:8080",
          "X-Title": process.env.OPENROUTER_APP_NAME || "School System",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(normalizeProviderError(result?.error?.message || result?.message || "Request OpenRouter gagal"));
      }

      return result;
    };

    let payload;
    try {
      payload = await callProvider({
        ...basePayload,
        response_format: {
          type: "json_object",
        },
      });
    } catch (error) {
      payload = await callProvider(basePayload);
    }

    const rawText = extractResponseText(payload);
    if (!rawText) {
      throw new Error(`OpenRouter tidak mengembalikan isi soal. Model: ${DEFAULT_OPENROUTER_MODEL}`);
    }

    const parsed = JSON.parse(extractJsonFromText(rawText));
    const items = normalizeGeneratedItems(parsed?.items, questionType);
    if (!items.length) {
      throw new Error(`Hasil OpenRouter tidak valid untuk dijadikan bank soal. Model: ${DEFAULT_OPENROUTER_MODEL}`);
    }

    return items;
  } finally {
    clearTimeout(timeoutId);
  }
};

module.exports = {
  generateQuestionBankItemsWithOpenRouter,
};
