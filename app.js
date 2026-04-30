const http = require("http");
const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const schoolRoutes = require("./routes/schoolRoutes");
const classRoutes = require("./routes/classRoutes");
const studentRoutes = require("./routes/studentRoutes");
const attendanceRoutes = require("./routes/attendance");
const receiptRoutes = require("./routes/receiptRoutes");
const learningRoutes = require("./routes/learningRoutes");
const publicRoutes = require("./routes/publicRoutes");
const adminSettingsRoutes = require("./routes/adminSettingsRoutes");
const academicPeriodRoutes = require("./routes/academicPeriodRoutes");
const { getStudentById } = require("./models/UserModel");
const { getSubjectById } = require("./models/LearningModel");
const { ensureUserProfileColumn } = require("./utils/ensureUserProfileColumn");
const { ensurePaymentReceiptPaymentDateColumn } = require("./utils/ensurePaymentReceiptPaymentDateColumn");
const { setIo, getLearningSubjectRoom, getUserNotificationRoom } = require("./utils/socket");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const resolveSocketToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (authToken) {
    return String(authToken).replace(/^Bearer\s+/i, "");
  }

  const headerToken = socket.handshake.headers?.authorization;
  if (headerToken) {
    return String(headerToken).replace(/^Bearer\s+/i, "");
  }

  return null;
};

const canAccessLearningSubject = async ({ subjectId, schoolId, userRole, userId }) => {
  const subject = await getSubjectById(subjectId);

  if (!subject || Number(subject.school_id) !== Number(schoolId)) {
    return false;
  }

  if (userRole === "GURU") {
    return Number(subject.teacher_id) === Number(userId);
  }

  if (userRole === "SISWA") {
    const student = await getStudentById(userId);
    return Boolean(student && Number(student.class_id) === Number(subject.class_id));
  }

  return userRole === "ADMIN" || userRole === "SUPER_ADMIN";
};

io.use((socket, next) => {
  const token = resolveSocketToken(socket);
  if (!token) {
    return next(new Error("Unauthorized"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = {
      id: decoded.id,
      role: decoded.role,
      schoolId: decoded.schoolId,
    };
    return next();
  } catch (error) {
    return next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.join(getUserNotificationRoom(socket.user.id));

  socket.on("learning-chat:join", async (subjectId) => {
    try {
      const normalizedSubjectId = Number(subjectId);
      if (!Number.isInteger(normalizedSubjectId) || normalizedSubjectId <= 0) {
        socket.emit("learning-chat:error", "Mapel tidak valid");
        return;
      }

      const allowed = await canAccessLearningSubject({
        subjectId: normalizedSubjectId,
        schoolId: socket.user.schoolId,
        userRole: socket.user.role,
        userId: socket.user.id,
      });

      if (!allowed) {
        socket.emit("learning-chat:error", "Akses chat mapel ditolak");
        return;
      }

      socket.join(getLearningSubjectRoom(normalizedSubjectId));
      socket.emit("learning-chat:joined", normalizedSubjectId);
    } catch (error) {
      socket.emit("learning-chat:error", "Gagal masuk room chat");
    }
  });

  socket.on("learning-chat:leave", (subjectId) => {
    const normalizedSubjectId = Number(subjectId);
    if (!Number.isInteger(normalizedSubjectId) || normalizedSubjectId <= 0) {
      return;
    }

    socket.leave(getLearningSubjectRoom(normalizedSubjectId));
  });
});

setIo(io);

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/class', classRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/receipt', receiptRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin-settings', adminSettingsRoutes);
app.use('/api/academic-periods', academicPeriodRoutes);

Promise.all([
  ensureUserProfileColumn(),
  ensurePaymentReceiptPaymentDateColumn(),
])
  .then(() => {
  })
  .catch((error) => {
    console.error("Failed to ensure runtime database columns", error);
  });

const PORT = 7777 ;
server.listen(7777, () => {
  console.log(`Server running on port ${PORT}`);
});
