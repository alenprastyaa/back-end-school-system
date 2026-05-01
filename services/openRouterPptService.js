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
  topic,
  materialTitle,
  slideCount,
  teacherSummary,
  learningGoals,
  additionalInstructions,
}) => [
  "Anda adalah asisten guru yang membuat outline presentasi PowerPoint untuk LMS sekolah.",
  "Gunakan Bahasa Indonesia yang formal, jelas, ringkas, dan cocok untuk siswa sekolah.",
  `Mata pelajaran: ${subjectName || "-"}.`,
  `Kelas: ${className || "-"}.`,
  `Judul presentasi: ${materialTitle}.`,
  `Topik utama: ${topic}.`,
  `Jumlah slide: ${slideCount}.`,
  teacherSummary ? `Ringkasan awal dari guru: ${teacherSummary}.` : null,
  learningGoals ? `Tujuan pembelajaran: ${learningGoals}.` : null,
  additionalInstructions ? `Instruksi tambahan: ${additionalInstructions}.` : null,
  "Setiap slide wajib memiliki judul singkat dan 3 sampai 5 poin bullet yang padat.",
  "Jangan gunakan markdown. Jangan gunakan tabel. Jangan gunakan penjelasan di luar JSON.",
  "Kembalikan JSON valid saja dengan struktur:",
  "{\"presentation_title\":\"...\",\"summary\":\"...\",\"slides\":[{\"title\":\"...\",\"bullets\":[\"...\",\"...\"],\"speaker_notes\":\"...\"}]}",
  "speaker_notes boleh singkat, maksimal 2 kalimat, dan opsional.",
].filter(Boolean).join("\n");

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

const normalizeSlides = (slides, fallbackTitle, slideCount) => {
  const normalizedSlides = (Array.isArray(slides) ? slides : [])
    .map((slide, index) => {
      const title = String(slide?.title || "").trim() || `${fallbackTitle} ${index + 1}`;
      const bullets = Array.isArray(slide?.bullets)
        ? slide.bullets.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
        : [];

      if (!bullets.length) {
        return null;
      }

      return {
        title,
        bullets,
        speaker_notes: String(slide?.speaker_notes || "").trim() || null,
      };
    })
    .filter(Boolean);

  return normalizedSlides.slice(0, slideCount);
};

const generatePowerPointOutlineWithOpenRouter = async ({
  subjectName,
  className,
  topic,
  materialTitle,
  slideCount,
  teacherSummary,
  learningGoals,
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
          content: "Anda adalah asisten guru yang membuat outline presentasi dan wajib mengembalikan JSON valid tanpa markdown.",
        },
        {
          role: "user",
          content: buildPrompt({
            subjectName,
            className,
            topic,
            materialTitle,
            slideCount,
            teacherSummary,
            learningGoals,
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
      throw new Error(`OpenRouter tidak mengembalikan outline presentasi. Model: ${DEFAULT_OPENROUTER_MODEL}`);
    }

    const parsed = JSON.parse(extractJsonFromText(rawText));
    const slides = normalizeSlides(parsed?.slides, materialTitle, slideCount);
    if (!slides.length) {
      throw new Error(`Hasil OpenRouter tidak valid untuk dijadikan presentasi. Model: ${DEFAULT_OPENROUTER_MODEL}`);
    }

    return {
      presentationTitle: String(parsed?.presentation_title || materialTitle || topic || "Materi Pembelajaran").trim(),
      summary: String(parsed?.summary || teacherSummary || topic || "").trim() || "Materi presentasi pembelajaran hasil generate AI.",
      slides,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

module.exports = {
  generatePowerPointOutlineWithOpenRouter,
};
