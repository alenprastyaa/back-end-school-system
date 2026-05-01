const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const FALLBACK_MIME_TYPES = {
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

const LOCAL_UPLOAD_SUBDIR = path.join("uploads", "public");

const sanitizeFileName = (value) =>
  String(value || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";

const resolveLocalPublicBaseUrl = () => {
  const explicitBaseUrl =
    process.env.FILE_PUBLIC_BASE_URL
    || process.env.PUBLIC_FILE_BASE_URL
    || process.env.PUBLIC_BASE_URL
    || process.env.BACKEND_PUBLIC_URL;

  if (explicitBaseUrl) {
    return String(explicitBaseUrl).replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return "https://alentest.my.id";
  }

  return `http://localhost:${process.env.PORT || 7777}`;
};

const resolveUploadedFileUrl = (payload) => {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload.url === "string") {
    return payload.url;
  }

  if (typeof payload.path === "string") {
    return payload.path;
  }

  if (payload.data) {
    return resolveUploadedFileUrl(payload.data);
  }

  if (payload.result) {
    return resolveUploadedFileUrl(payload.result);
  }

  return null;
};

const uploadToStorage = async (file, { filename, contentType }) => {
  const form = new FormData();

  form.append("file", fs.createReadStream(file.path), {
    filename,
    contentType,
  });

  const response = await axios.post(
    "https://alentest.my.id/file/api/upload-file",
    form,
    {
      headers: {
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    },
  );

  const uploadedUrl = resolveUploadedFileUrl(response.data);
  if (!uploadedUrl) {
    throw new Error("Upload response did not contain a file URL");
  }

  return uploadedUrl;
};

const saveFileLocally = (file, { filename }) => {
  if (!file?.path) {
    throw new Error("File path is required for local upload fallback");
  }

  fs.mkdirSync(LOCAL_UPLOAD_SUBDIR, { recursive: true });
  const safeName = sanitizeFileName(filename || path.basename(file.path));
  const uniqueName = `${Date.now()}-${safeName}`;
  const destinationPath = path.join(LOCAL_UPLOAD_SUBDIR, uniqueName);

  fs.copyFileSync(file.path, destinationPath);

  const publicBaseUrl = resolveLocalPublicBaseUrl();
  return `${publicBaseUrl}/uploads/public/${encodeURIComponent(uniqueName)}`;
};

const uploadImage = async (file) => {
  try {
    if (!file?.path) {
      throw new Error("File path is required for upload");
    }

    const safeFilename = file.originalname || path.basename(file.path);

    try {
      return await uploadToStorage(file, {
        filename: safeFilename,
        contentType: file.mimetype || "application/octet-stream",
      });
    } catch (primaryError) {
      const fallbackContentType =
        FALLBACK_MIME_TYPES[path.extname(safeFilename).toLowerCase()] || "application/octet-stream";

      if (
        primaryError?.response?.status === 400 &&
        fallbackContentType !== (file.mimetype || "application/octet-stream")
      ) {
        try {
          return await uploadToStorage(file, {
            filename: safeFilename,
            contentType: fallbackContentType,
          });
        } catch (fallbackError) {
          return saveFileLocally(file, { filename: safeFilename });
        }
      }

      return saveFileLocally(file, { filename: safeFilename });
    }
  } catch (error) {
    console.log("UPLOAD ERROR:", error.response?.data || error.message);
    throw error;
  }
};

module.exports = { uploadImage };
