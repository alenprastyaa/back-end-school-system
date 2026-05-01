const pool = require("../config/database");
const { ensureAcademicPeriodSchema } = require("./AcademicPeriodModel");

let schemaReadyPromise = null;

const toJsonb = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.stringify(value);
};

const ensureLearningSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await ensureAcademicPeriodSchema();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS learning_subjects (
          id SERIAL PRIMARY KEY,
          school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
          class_id INT NOT NULL REFERENCES class(id) ON DELETE CASCADE,
          teacher_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          chat_icon_url TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE learning_subjects
        ADD COLUMN IF NOT EXISTS chat_icon_url TEXT
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS learning_materials (
          id SERIAL PRIMARY KEY,
          subject_id INT NOT NULL REFERENCES learning_subjects(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          content TEXT,
          attachment_url TEXT,
          created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS learning_question_bank (
          id SERIAL PRIMARY KEY,
          subject_id INT NOT NULL REFERENCES learning_subjects(id) ON DELETE CASCADE,
          question_type VARCHAR(20) NOT NULL,
          question_text TEXT NOT NULL,
          options JSONB,
          correct_option INT,
          rubric TEXT,
          created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS learning_assignments (
          id SERIAL PRIMARY KEY,
          subject_id INT NOT NULL REFERENCES learning_subjects(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          assignment_type VARCHAR(20) NOT NULL DEFAULT 'FILE',
          is_exam BOOLEAN NOT NULL DEFAULT false,
          exam_category VARCHAR(30),
          exam_code VARCHAR(50),
          exam_status VARCHAR(30),
          start_at TIMESTAMP,
          exam_requested_at TIMESTAMP,
          exam_submitted_at TIMESTAMP,
          exam_published_at TIMESTAMP,
          managed_by_admin BOOLEAN NOT NULL DEFAULT false,
          exam_target_question_count INT,
          academic_year_id INT REFERENCES academic_years(id) ON DELETE SET NULL,
          semester_id INT REFERENCES academic_semesters(id) ON DELETE SET NULL,
          shuffle_questions BOOLEAN NOT NULL DEFAULT false,
          question_duration_seconds INT,
          question_bank_ids JSONB,
          quiz_payload JSONB,
          attachment_url TEXT,
          due_date TIMESTAMP,
          created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS learning_chat_messages (
          id SERIAL PRIMARY KEY,
          subject_id INT NOT NULL REFERENCES learning_subjects(id) ON DELETE CASCADE,
          sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS learning_chat_reads (
          subject_id INT NOT NULL REFERENCES learning_subjects(id) ON DELETE CASCADE,
          user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          last_read_message_id INT REFERENCES learning_chat_messages(id) ON DELETE SET NULL,
          last_read_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (subject_id, user_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS learning_submissions (
          id SERIAL PRIMARY KEY,
          assignment_id INT NOT NULL REFERENCES learning_assignments(id) ON DELETE CASCADE,
          student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          started_at TIMESTAMP,
          submission_text TEXT,
          answer_payload JSONB,
          attachment_url TEXT,
          submitted_at TIMESTAMP,
          is_submitted BOOLEAN NOT NULL DEFAULT false,
          score NUMERIC(5,2),
          feedback TEXT,
          auto_graded BOOLEAN NOT NULL DEFAULT false,
          graded_at TIMESTAMP,
          graded_by INT REFERENCES users(id) ON DELETE SET NULL,
          UNIQUE (assignment_id, student_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS learning_quiz_violation_logs (
          id SERIAL PRIMARY KEY,
          submission_id INT NOT NULL REFERENCES learning_submissions(id) ON DELETE CASCADE,
          assignment_id INT NOT NULL REFERENCES learning_assignments(id) ON DELETE CASCADE,
          student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          violation_type VARCHAR(50) NOT NULL,
          violation_message TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) NOT NULL DEFAULT 'FILE'
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS is_exam BOOLEAN NOT NULL DEFAULT false
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS exam_category VARCHAR(30)
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS exam_code VARCHAR(50)
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS exam_status VARCHAR(30)
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS start_at TIMESTAMP
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS exam_requested_at TIMESTAMP
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS exam_submitted_at TIMESTAMP
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS exam_published_at TIMESTAMP
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS managed_by_admin BOOLEAN NOT NULL DEFAULT false
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS exam_target_question_count INT
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS academic_year_id INT
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS semester_id INT
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS question_bank_ids JSONB
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT false
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS question_duration_seconds INT
      `);

      await pool.query(`
        ALTER TABLE learning_assignments
        ADD COLUMN IF NOT EXISTS quiz_payload JSONB
      `);

      await pool.query(`
        ALTER TABLE learning_submissions
        ADD COLUMN IF NOT EXISTS answer_payload JSONB
      `);

      await pool.query(`
        ALTER TABLE learning_submissions
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMP
      `);

      await pool.query(`
        ALTER TABLE learning_submissions
        ADD COLUMN IF NOT EXISTS is_submitted BOOLEAN NOT NULL DEFAULT false
      `);

      await pool.query(`
        ALTER TABLE learning_submissions
        ADD COLUMN IF NOT EXISTS auto_graded BOOLEAN NOT NULL DEFAULT false
      `);

      await pool.query(`
        ALTER TABLE learning_submissions
        ALTER COLUMN submitted_at DROP NOT NULL
      `);

      await pool.query(`
        ALTER TABLE learning_chat_messages
        ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'TEXT'
      `);

      await pool.query(`
        ALTER TABLE learning_chat_messages
        ADD COLUMN IF NOT EXISTS attachment_url TEXT
      `);

      await pool.query(`
        ALTER TABLE learning_chat_messages
        ADD COLUMN IF NOT EXISTS attachment_name TEXT
      `);

      await pool.query(`
        ALTER TABLE learning_chat_messages
        ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT
      `);

      await pool.query(`
        ALTER TABLE learning_chat_messages
        ADD COLUMN IF NOT EXISTS attachment_size BIGINT
      `);
    })();
  }

  return schemaReadyPromise;
};

const createSubject = async (schoolId, classId, teacherId, name, description, chatIconUrl = null) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_subjects (school_id, class_id, teacher_id, name, description, chat_icon_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [schoolId, classId, teacherId, name, description || null, chatIconUrl || null],
  );
  return result.rows[0];
};

const updateSubject = async (id, schoolId, classId, teacherId, name, description, chatIconUrl) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      UPDATE learning_subjects
      SET class_id = $1,
          teacher_id = $2,
          name = $3,
          description = $4,
          chat_icon_url = $5,
          updated_at = NOW()
      WHERE id = $6 AND school_id = $7
      RETURNING *
    `,
    [classId, teacherId, name, description || null, chatIconUrl || null, id, schoolId],
  );
  return result.rows[0];
};

const deleteSubject = async (id, schoolId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      DELETE FROM learning_subjects
      WHERE id = $1 AND school_id = $2
      RETURNING *
    `,
    [id, schoolId],
  );
  return result.rows[0];
};

const getSubjectById = async (id) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        ls.*,
        c.class_name,
        u.username AS teacher_name,
        (
          SELECT COUNT(*)
          FROM users st
          WHERE st.class_id = ls.class_id
            AND st.school_id = ls.school_id
            AND st.role = 'SISWA'
        )::int AS student_count
      FROM learning_subjects ls
      INNER JOIN class c ON c.id = ls.class_id
      INNER JOIN users u ON u.id = ls.teacher_id
      WHERE ls.id = $1
    `,
    [id],
  );
  return result.rows[0];
};

const getSubjectsBySchool = async (schoolId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        ls.*,
        c.class_name,
        u.username AS teacher_name,
        (
          SELECT COUNT(*)
          FROM users st
          WHERE st.class_id = ls.class_id
            AND st.school_id = ls.school_id
            AND st.role = 'SISWA'
        )::int AS student_count
      FROM learning_subjects ls
      INNER JOIN class c ON c.id = ls.class_id
      INNER JOIN users u ON u.id = ls.teacher_id
      WHERE ls.school_id = $1
      ORDER BY c.class_name ASC, ls.name ASC
    `,
    [schoolId],
  );
  return result.rows;
};

const getSubjectsByTeacher = async (schoolId, teacherId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        ls.*,
        c.class_name,
        CASE WHEN c.wali_guru_id = $2 THEN true ELSE false END AS is_homeroom_subject,
        u.username AS teacher_name,
        (
          SELECT COUNT(*)
          FROM users st
          WHERE st.class_id = ls.class_id
            AND st.school_id = ls.school_id
            AND st.role = 'SISWA'
        )::int AS student_count
      FROM learning_subjects ls
      INNER JOIN class c ON c.id = ls.class_id
      INNER JOIN users u ON u.id = ls.teacher_id
      WHERE ls.school_id = $1 AND ls.teacher_id = $2
      ORDER BY c.class_name ASC, ls.name ASC
    `,
    [schoolId, teacherId],
  );
  return result.rows;
};

const getSubjectsByStudent = async (schoolId, classId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        ls.*,
        c.class_name,
        u.username AS teacher_name
      FROM learning_subjects ls
      INNER JOIN class c ON c.id = ls.class_id
      INNER JOIN users u ON u.id = ls.teacher_id
      WHERE ls.school_id = $1 AND ls.class_id = $2
      ORDER BY ls.name ASC
    `,
    [schoolId, classId],
  );
  return result.rows;
};

const createMaterial = async (subjectId, title, content, attachmentUrl, createdBy) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_materials (subject_id, title, content, attachment_url, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [subjectId, title, content || null, attachmentUrl || null, createdBy],
  );
  return result.rows[0];
};

const createQuestionBankItem = async (
  subjectId,
  questionType,
  questionText,
  options,
  correctOption,
  rubric,
  createdBy,
) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_question_bank (
        subject_id,
        question_type,
        question_text,
        options,
        correct_option,
        rubric,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      subjectId,
      questionType,
      questionText,
      toJsonb(options),
      correctOption,
      rubric || null,
      createdBy,
    ],
  );
  return result.rows[0];
};

const createQuestionBankItemsBulk = async (subjectId, items, createdBy) => {
  await ensureLearningSchema();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const createdItems = [];

    for (const item of items) {
      const result = await client.query(
        `
          INSERT INTO learning_question_bank (
            subject_id,
            question_type,
            question_text,
            options,
            correct_option,
            rubric,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [
          subjectId,
          item.question_type,
          item.question_text,
          toJsonb(item.options),
          item.correct_option,
          item.rubric || null,
          createdBy,
        ],
      );

      createdItems.push(result.rows[0]);
    }

    await client.query("COMMIT");
    return createdItems;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getQuestionBankItemById = async (id) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT *
      FROM learning_question_bank
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0];
};

const updateQuestionBankItem = async (
  id,
  questionText,
  options,
  correctOption,
  rubric,
) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      UPDATE learning_question_bank
      SET question_text = $1,
          options = $2,
          correct_option = $3,
          rubric = $4
      WHERE id = $5
      RETURNING *
    `,
    [
      questionText,
      toJsonb(options),
      correctOption,
      rubric || null,
      id,
    ],
  );
  return result.rows[0];
};

const deleteQuestionBankItem = async (id) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      DELETE FROM learning_question_bank
      WHERE id = $1
      RETURNING *
    `,
    [id],
  );
  return result.rows[0];
};

const deleteQuestionBankItemsBulk = async (subjectId, questionIds = []) => {
  await ensureLearningSchema();
  const normalizedIds = Array.isArray(questionIds)
    ? questionIds.map((item) => Number(item)).filter(Number.isInteger)
    : [];

  if (normalizedIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
      DELETE FROM learning_question_bank
      WHERE subject_id = $1
        AND id = ANY($2::int[])
      RETURNING *
    `,
    [subjectId, normalizedIds],
  );
  return result.rows;
};

const getQuestionBankBySubject = async (
  subjectId,
  {
    keyword = "",
    questionType = "",
    limit = 20,
    page = 1,
  } = {},
) => {
  await ensureLearningSchema();
  const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const normalizedPage = Math.max(1, Number(page) || 1);
  const offset = (normalizedPage - 1) * normalizedLimit;
  const values = [subjectId];
  let whereClause = `WHERE qb.subject_id = $1`;

  if (questionType && ["MCQ", "ESSAY"].includes(String(questionType).toUpperCase())) {
    values.push(String(questionType).toUpperCase());
    whereClause += ` AND qb.question_type = $${values.length}`;
  }

  if (keyword && String(keyword).trim()) {
    values.push(`%${String(keyword).trim().toLowerCase()}%`);
    whereClause += ` AND LOWER(qb.question_text) LIKE $${values.length}`;
  }

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM learning_question_bank qb
      ${whereClause}
    `,
    values,
  );

  values.push(normalizedLimit, offset);
  const result = await pool.query(
    `
      SELECT
        qb.*,
        (
          SELECT COUNT(*)
          FROM learning_assignments la
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(la.question_bank_ids, '[]'::jsonb)) AS selected_id
            WHERE (selected_id)::int = qb.id
          )
        )::int AS usage_count,
        u.username AS created_by_name
      FROM learning_question_bank qb
      INNER JOIN users u ON u.id = qb.created_by
      ${whereClause}
      ORDER BY qb.created_at DESC, qb.id DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values,
  );
  return {
    items: result.rows,
    total: countResult.rows[0]?.total || 0,
    page: normalizedPage,
    limit: normalizedLimit,
  };
};

const getQuestionBankItemsByIds = async (subjectId, ids) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT *
      FROM learning_question_bank
      WHERE subject_id = $1
        AND id = ANY($2::int[])
      ORDER BY id ASC
    `,
    [subjectId, ids],
  );
  return result.rows;
};

const getMaterialsBySubject = async (subjectId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        lm.*,
        u.username AS created_by_name
      FROM learning_materials lm
      INNER JOIN users u ON u.id = lm.created_by
      WHERE lm.subject_id = $1
      ORDER BY lm.created_at DESC
    `,
    [subjectId],
  );
  return result.rows;
};

const getChatMessagesBySubject = async (subjectId, currentUserId, limit = 100) => {
  await ensureLearningSchema();
  const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const result = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          lcm.*,
          u.username AS sender_name,
          u.role AS sender_role,
          u.profile_image AS sender_profile_image,
          COALESCE(subject_meta.student_count, 0)::int AS recipient_count,
          COALESCE((
            SELECT COUNT(*)::int
            FROM learning_chat_reads lcr
            WHERE lcr.subject_id = lcm.subject_id
              AND lcr.user_id <> lcm.sender_id
              AND lcr.last_read_message_id IS NOT NULL
              AND lcr.last_read_message_id >= lcm.id
          ), 0)::int AS read_count,
          CASE
            WHEN lcm.sender_id = $2 THEN false
            ELSE COALESCE(current_read.last_read_message_id, 0) >= lcm.id
          END AS is_read_by_current_user
        FROM learning_chat_messages lcm
        INNER JOIN users u ON u.id = lcm.sender_id
        INNER JOIN (
          SELECT id, (
            SELECT COUNT(*)
            FROM users st
            WHERE st.class_id = ls.class_id
              AND st.school_id = ls.school_id
              AND st.role = 'SISWA'
          )::int AS student_count
          FROM learning_subjects ls
          WHERE ls.id = $1
        ) AS subject_meta ON subject_meta.id = lcm.subject_id
        LEFT JOIN learning_chat_reads current_read
          ON current_read.subject_id = lcm.subject_id
         AND current_read.user_id = $2
        WHERE lcm.subject_id = $1
        ORDER BY lcm.created_at DESC, lcm.id DESC
        LIMIT $3
      ) AS recent_messages
      ORDER BY recent_messages.created_at ASC, recent_messages.id ASC
    `,
    [subjectId, currentUserId, normalizedLimit],
  );
  return result.rows;
};

const createChatMessage = async (
  subjectId,
  senderId,
  {
    message,
    messageType = "TEXT",
    attachmentUrl = null,
    attachmentName = null,
    attachmentMimeType = null,
    attachmentSize = null,
  },
) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_chat_messages (
        subject_id,
        sender_id,
        message,
        message_type,
        attachment_url,
        attachment_name,
        attachment_mime_type,
        attachment_size
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      subjectId,
      senderId,
      message || null,
      messageType || "TEXT",
      attachmentUrl || null,
      attachmentName || null,
      attachmentMimeType || null,
      attachmentSize || null,
    ],
  );

  const savedMessage = result.rows[0];
  const messageResult = await pool.query(
    `
      SELECT
        lcm.*,
        u.username AS sender_name,
        u.role AS sender_role,
        u.profile_image AS sender_profile_image
      FROM learning_chat_messages lcm
      INNER JOIN users u ON u.id = lcm.sender_id
      WHERE lcm.id = $1
      LIMIT 1
    `,
    [savedMessage.id],
  );

  return messageResult.rows[0];
};

const markChatSubjectAsRead = async (subjectId, userId, lastReadMessageId) => {
  await ensureLearningSchema();
  const normalizedLastReadMessageId = Number(lastReadMessageId) || null;

  const result = await pool.query(
    `
      INSERT INTO learning_chat_reads (subject_id, user_id, last_read_message_id, last_read_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (subject_id, user_id)
      DO UPDATE SET
        last_read_message_id = GREATEST(
          COALESCE(learning_chat_reads.last_read_message_id, 0),
          COALESCE(EXCLUDED.last_read_message_id, 0)
        ),
        last_read_at = NOW()
      RETURNING subject_id, user_id, COALESCE(last_read_message_id, 0)::int AS last_read_message_id, last_read_at
    `,
    [subjectId, userId, normalizedLastReadMessageId],
  );

  return result.rows[0];
};

const getChatUnreadSummaryBySubjectIds = async (subjectIds, userId) => {
  await ensureLearningSchema();
  const normalizedIds = Array.isArray(subjectIds)
    ? subjectIds.map((item) => Number(item)).filter(Number.isInteger)
    : [];

  if (normalizedIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT
        ls.id AS subject_id,
        COALESCE(lcr.last_read_message_id, 0)::int AS last_read_message_id,
        COUNT(lcm.id) FILTER (
          WHERE lcm.sender_id <> $1
            AND lcm.id > COALESCE(lcr.last_read_message_id, 0)
        )::int AS unread_count
      FROM learning_subjects ls
      LEFT JOIN learning_chat_reads lcr
        ON lcr.subject_id = ls.id
       AND lcr.user_id = $1
      LEFT JOIN learning_chat_messages lcm
        ON lcm.subject_id = ls.id
      WHERE ls.id = ANY($2::int[])
      GROUP BY ls.id, lcr.last_read_message_id
    `,
    [userId, normalizedIds],
  );

  return result.rows;
};

const createAssignment = async (
  subjectId,
  title,
  description,
  assignmentType,
  isExam,
  examCategory,
  examCode,
  examStatus,
  startAt,
  managedByAdmin,
  examTargetQuestionCount,
  academicYearId,
  semesterId,
  shuffleQuestions,
  questionDurationSeconds,
  questionBankIds,
  quizPayload,
  attachmentUrl,
  dueDate,
  createdBy,
) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_assignments (
        subject_id,
        title,
        description,
        assignment_type,
        is_exam,
        exam_category,
        exam_code,
        exam_status,
        start_at,
        exam_requested_at,
        managed_by_admin,
        exam_target_question_count,
        academic_year_id,
        semester_id,
        shuffle_questions,
        question_duration_seconds,
        question_bank_ids,
        quiz_payload,
        attachment_url,
        due_date,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `,
    [
      subjectId,
      title,
      description || null,
      assignmentType || "FILE",
      Boolean(isExam),
      examCategory || null,
      examCode || null,
      examStatus || null,
      startAt || null,
      Boolean(managedByAdmin),
      examTargetQuestionCount || null,
      academicYearId || null,
      semesterId || null,
      Boolean(shuffleQuestions),
      questionDurationSeconds || null,
      toJsonb(questionBankIds),
      toJsonb(quizPayload),
      attachmentUrl || null,
      dueDate || null,
      createdBy,
    ],
  );
  return result.rows[0];
};

const submitExamPackage = async (
  assignmentId,
  {
    questionBankIds,
    quizPayload,
    shuffleQuestions,
    questionDurationSeconds,
    examTargetQuestionCount,
  },
) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      UPDATE learning_assignments
      SET question_bank_ids = $1,
          quiz_payload = $2,
          shuffle_questions = $3,
          question_duration_seconds = $4,
          exam_target_question_count = COALESCE($5, exam_target_question_count),
          exam_status = 'SUBMITTED',
          exam_submitted_at = NOW()
      WHERE id = $6
      RETURNING *
    `,
    [
      toJsonb(questionBankIds),
      toJsonb(quizPayload),
      Boolean(shuffleQuestions),
      questionDurationSeconds || null,
      examTargetQuestionCount || null,
      assignmentId,
    ],
  );
  return result.rows[0];
};

const publishExamAssignment = async (assignmentId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      UPDATE learning_assignments
      SET exam_status = 'PUBLISHED',
          exam_published_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [assignmentId],
  );
  return result.rows[0];
};

const getExamAssignmentByCode = async (schoolId, examCode, excludeAssignmentId = null) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        la.*,
        ls.school_id
      FROM learning_assignments la
      INNER JOIN learning_subjects ls ON ls.id = la.subject_id
      WHERE ls.school_id = $1
        AND la.is_exam = true
        AND UPPER(COALESCE(la.exam_code, '')) = UPPER($2)
        AND ($3::int IS NULL OR la.id <> $3)
      LIMIT 1
    `,
    [schoolId, examCode, excludeAssignmentId ? Number(excludeAssignmentId) : null],
  );
  return result.rows[0];
};

const updateExamAssignmentByAdmin = async (
  assignmentId,
  {
    subjectId,
    title,
    description,
    assignmentType,
    examCategory,
    examCode,
    startAt,
    dueDate,
    questionDurationSeconds,
    examTargetQuestionCount,
  },
) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      UPDATE learning_assignments
      SET subject_id = $1::int,
          title = $2::varchar,
          description = $3::text,
          assignment_type = $4::varchar,
          exam_category = $5::varchar,
          exam_code = $6::varchar,
          start_at = $7::timestamp,
          due_date = $8::timestamp,
          question_duration_seconds = $9::int,
          exam_target_question_count = $10::int,
          exam_submitted_at = CASE
            WHEN subject_id <> $1::int OR assignment_type <> $4::varchar THEN NULL
            ELSE exam_submitted_at
          END,
          exam_published_at = NULL,
          question_bank_ids = CASE
            WHEN subject_id <> $1::int OR assignment_type <> $4::varchar THEN NULL
            ELSE question_bank_ids
          END,
          quiz_payload = CASE
            WHEN subject_id <> $1::int OR assignment_type <> $4::varchar THEN NULL
            ELSE quiz_payload
          END,
          exam_status = CASE
            WHEN subject_id <> $1::int OR assignment_type <> $4::varchar THEN 'REQUESTED'
            WHEN exam_status = 'PUBLISHED' THEN 'PUBLISHED'
            ELSE exam_status
          END
      WHERE id = $11::int
      RETURNING *
    `,
    [
      subjectId,
      title,
      description || null,
      assignmentType,
      examCategory,
      examCode,
      startAt || null,
      dueDate || null,
      questionDurationSeconds || null,
      examTargetQuestionCount || null,
      assignmentId,
    ],
  );
  return result.rows[0];
};

const countSubmittedOrStartedSubmissionsByAssignment = async (assignmentId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM learning_submissions
      WHERE assignment_id = $1
        AND (
          started_at IS NOT NULL
          OR submitted_at IS NOT NULL
          OR is_submitted = true
        )
    `,
    [assignmentId],
  );
  return Number(result.rows[0]?.total || 0);
};

const deleteExamAssignmentByAdmin = async (assignmentId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      DELETE FROM learning_assignments
      WHERE id = $1
      RETURNING *
    `,
    [assignmentId],
  );
  return result.rows[0];
};

const createManualSubmissions = async (assignmentId, studentIds = []) => {
  await ensureLearningSchema();
  const normalizedStudentIds = Array.isArray(studentIds)
    ? studentIds.map((item) => Number(item)).filter(Number.isInteger)
    : [];

  if (normalizedStudentIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
      INSERT INTO learning_submissions (
        assignment_id,
        student_id,
        is_submitted,
        auto_graded
      )
      SELECT $1, student_id, false, false
      FROM unnest($2::int[]) AS student_id
      ON CONFLICT (assignment_id, student_id) DO NOTHING
      RETURNING *
    `,
    [assignmentId, normalizedStudentIds],
  );

  return result.rows;
};

const getAssignmentById = async (id) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        la.*,
        ls.school_id,
        ls.class_id,
        ls.teacher_id,
        ls.name AS subject_name,
        ay.name AS academic_year_name,
        sem.name AS semester_name,
        sem.code AS semester_code
      FROM learning_assignments la
      INNER JOIN learning_subjects ls ON ls.id = la.subject_id
      LEFT JOIN academic_years ay ON ay.id = la.academic_year_id
      LEFT JOIN academic_semesters sem ON sem.id = la.semester_id
      WHERE la.id = $1
    `,
    [id],
  );
  return result.rows[0];
};

const getAssignmentsBySubjectForTeacher = async (subjectId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        la.*,
        ay.name AS academic_year_name,
        sem.name AS semester_name,
        sem.code AS semester_code,
        (
          SELECT COUNT(*)
          FROM learning_submissions ls
          WHERE ls.assignment_id = la.id
        )::int AS submission_count
      FROM learning_assignments la
      LEFT JOIN academic_years ay ON ay.id = la.academic_year_id
      LEFT JOIN academic_semesters sem ON sem.id = la.semester_id
      WHERE la.subject_id = $1
      ORDER BY la.created_at DESC
    `,
    [subjectId],
  );
  return result.rows;
};

const getAssignmentsBySubjectForStudent = async (subjectId, studentId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        la.*,
        ay.name AS academic_year_name,
        sem.name AS semester_name,
        sem.code AS semester_code,
        CASE WHEN ls.is_submitted THEN ls.id ELSE NULL END AS submission_id,
        ls.id AS attempt_id,
        ls.started_at AS attempt_started_at,
        ls.is_submitted,
        ls.submission_text,
        ls.answer_payload,
        ls.attachment_url AS submission_attachment_url,
        ls.submitted_at,
        ls.score,
        ls.feedback,
        ls.graded_at
      FROM learning_assignments la
      LEFT JOIN academic_years ay ON ay.id = la.academic_year_id
      LEFT JOIN academic_semesters sem ON sem.id = la.semester_id
      LEFT JOIN learning_submissions ls
        ON ls.assignment_id = la.id
       AND ls.student_id = $2
      WHERE la.subject_id = $1
        AND (
          la.is_exam = false
          OR la.exam_status = 'PUBLISHED'
        )
      ORDER BY la.created_at DESC
    `,
    [subjectId, studentId],
  );
  return result.rows;
};

const upsertSubmission = async (assignmentId, studentId, submissionText, attachmentUrl) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_submissions (
        assignment_id,
        student_id,
        submission_text,
        answer_payload,
        attachment_url,
        score,
        is_submitted,
        auto_graded,
        submitted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (assignment_id, student_id)
      DO UPDATE SET
        submission_text = EXCLUDED.submission_text,
        answer_payload = EXCLUDED.answer_payload,
        attachment_url = EXCLUDED.attachment_url,
        score = EXCLUDED.score,
        is_submitted = EXCLUDED.is_submitted,
        auto_graded = EXCLUDED.auto_graded,
        submitted_at = NOW()
      RETURNING *
    `,
    [
      assignmentId,
      studentId,
      submissionText || null,
      null,
      attachmentUrl || null,
      null,
      true,
      false,
    ],
  );
  return result.rows[0];
};

const startQuizSubmissionAttempt = async (assignmentId, studentId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_submissions (
        assignment_id,
        student_id,
        started_at,
        is_submitted,
        auto_graded
      )
      VALUES ($1, $2, NOW(), false, false)
      ON CONFLICT (assignment_id, student_id)
      DO UPDATE SET
        started_at = COALESCE(learning_submissions.started_at, EXCLUDED.started_at)
      RETURNING *
    `,
    [assignmentId, studentId],
  );
  return result.rows[0];
};

const upsertQuizSubmission = async (
  assignmentId,
  studentId,
  submissionText,
  answerPayload,
  score,
  autoGraded,
) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_submissions (
        assignment_id,
        student_id,
        submission_text,
        answer_payload,
        attachment_url,
        score,
        is_submitted,
        auto_graded,
        submitted_at
      )
      VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, NOW())
      ON CONFLICT (assignment_id, student_id)
      DO UPDATE SET
        submission_text = EXCLUDED.submission_text,
        answer_payload = EXCLUDED.answer_payload,
        attachment_url = NULL,
        score = EXCLUDED.score,
        is_submitted = EXCLUDED.is_submitted,
        auto_graded = EXCLUDED.auto_graded,
        submitted_at = NOW()
      RETURNING *
    `,
    [
      assignmentId,
      studentId,
      submissionText || null,
      toJsonb(answerPayload),
      score,
      true,
      Boolean(autoGraded),
    ],
  );
  return result.rows[0];
};

const getSubmissionsByAssignment = async (assignmentId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        ls.*,
        u.username AS student_name,
        u.parent_email,
        u.phone_number,
        la.assignment_type,
        la.quiz_payload,
        la.title AS assignment_title,
        COALESCE(violations.violation_count, 0)::int AS violation_count,
        COALESCE(violations.violation_logs, '[]'::jsonb) AS violation_logs
      FROM learning_submissions ls
      INNER JOIN users u ON u.id = ls.student_id
      INNER JOIN learning_assignments la ON la.id = ls.assignment_id
      LEFT JOIN (
        SELECT
          submission_id,
          COUNT(*)::int AS violation_count,
          JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'id', id,
              'submission_id', submission_id,
              'violation_type', violation_type,
              'violation_message', violation_message,
              'created_at', created_at
            )
            ORDER BY created_at DESC, id DESC
          ) AS violation_logs
        FROM learning_quiz_violation_logs
        GROUP BY submission_id
      ) violations ON violations.submission_id = ls.id
      WHERE ls.assignment_id = $1
        AND (
          ls.is_submitted = true
          OR la.assignment_type = 'MANUAL'
        )
      ORDER BY
        CASE WHEN ls.submitted_at IS NULL THEN 1 ELSE 0 END ASC,
        ls.submitted_at DESC,
        u.username ASC
    `,
    [assignmentId],
  );
  return result.rows;
};

const getSubmissionByAssignmentAndStudent = async (assignmentId, studentId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT *
      FROM learning_submissions
      WHERE assignment_id = $1 AND student_id = $2
      LIMIT 1
    `,
    [assignmentId, studentId],
  );
  return result.rows[0];
};

const createQuizViolationLog = async (submissionId, assignmentId, studentId, violationType, violationMessage) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      INSERT INTO learning_quiz_violation_logs (
        submission_id,
        assignment_id,
        student_id,
        violation_type,
        violation_message
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [
      submissionId,
      assignmentId,
      studentId,
      String(violationType || "OTHER").trim().toUpperCase(),
      violationMessage || null,
    ],
  );
  return result.rows[0];
};

const getQuizViolationSummaryByAssignment = async (assignmentId) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        student_id,
        COUNT(*)::int AS violation_count,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'id', id,
            'submission_id', submission_id,
            'violation_type', violation_type,
            'violation_message', violation_message,
            'created_at', created_at
          )
          ORDER BY created_at DESC, id DESC
        ) AS violation_logs
      FROM learning_quiz_violation_logs
      WHERE assignment_id = $1
      GROUP BY student_id
    `,
    [assignmentId],
  );
  return result.rows;
};

const gradeSubmission = async (submissionId, score, feedback, gradedBy) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      UPDATE learning_submissions
      SET score = $1,
          feedback = $2,
          graded_at = NOW(),
          graded_by = $3
      WHERE id = $4
      RETURNING *
    `,
    [score, feedback || null, gradedBy, submissionId],
  );
  return result.rows[0];
};

const getAssignmentsForFinalReport = async (subjectId, semesterId = null) => {
  await ensureLearningSchema();
  const values = [subjectId];
  let filter = "";

  if (semesterId) {
    values.push(Number(semesterId));
    filter = ` AND la.semester_id = $${values.length}`;
  }

  const result = await pool.query(
    `
      SELECT
        la.id,
        la.subject_id,
        la.title,
        la.assignment_type,
        la.is_exam,
        la.due_date,
        la.created_at,
        la.semester_id,
        la.academic_year_id,
        ay.name AS academic_year_name,
        sem.name AS semester_name,
        sem.code AS semester_code
      FROM learning_assignments la
      LEFT JOIN academic_years ay ON ay.id = la.academic_year_id
      LEFT JOIN academic_semesters sem ON sem.id = la.semester_id
      WHERE la.subject_id = $1
        ${filter}
      ORDER BY
        CASE WHEN la.is_exam THEN 1 ELSE 0 END ASC,
        la.created_at ASC,
        la.id ASC
    `,
    values,
  );

  return result.rows;
};

const getSubmissionsByAssignmentIds = async (assignmentIds = []) => {
  await ensureLearningSchema();
  const normalizedIds = Array.isArray(assignmentIds)
    ? assignmentIds.map((item) => Number(item)).filter(Number.isInteger)
    : [];

  if (normalizedIds.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT
        ls.assignment_id,
        ls.student_id,
        ls.score,
        ls.feedback,
        ls.submitted_at,
        ls.is_submitted
      FROM learning_submissions ls
      INNER JOIN learning_assignments la ON la.id = ls.assignment_id
      WHERE ls.assignment_id = ANY($1::int[])
        AND (
          ls.is_submitted = true
          OR la.assignment_type = 'MANUAL'
        )
    `,
    [normalizedIds],
  );

  return result.rows;
};

const getSubmissionById = async (id) => {
  await ensureLearningSchema();
  const result = await pool.query(
    `
      SELECT
        ls.*,
        la.subject_id,
        la.title AS assignment_title,
        subj.teacher_id,
        subj.school_id,
        subj.class_id
      FROM learning_submissions ls
      INNER JOIN learning_assignments la ON la.id = ls.assignment_id
      INNER JOIN learning_subjects subj ON subj.id = la.subject_id
      WHERE ls.id = $1
    `,
    [id],
  );
  return result.rows[0];
};

module.exports = {
  ensureLearningSchema,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectById,
  getSubjectsBySchool,
  getSubjectsByTeacher,
  getSubjectsByStudent,
  createMaterial,
  createQuestionBankItem,
  createQuestionBankItemsBulk,
  getQuestionBankItemById,
  updateQuestionBankItem,
  deleteQuestionBankItem,
  deleteQuestionBankItemsBulk,
  getQuestionBankBySubject,
  getQuestionBankItemsByIds,
  getMaterialsBySubject,
  getChatMessagesBySubject,
  createChatMessage,
  markChatSubjectAsRead,
  getChatUnreadSummaryBySubjectIds,
  createAssignment,
  getExamAssignmentByCode,
  updateExamAssignmentByAdmin,
  countSubmittedOrStartedSubmissionsByAssignment,
  deleteExamAssignmentByAdmin,
  createManualSubmissions,
  submitExamPackage,
  publishExamAssignment,
  getAssignmentById,
  getAssignmentsBySubjectForTeacher,
  getAssignmentsBySubjectForStudent,
  getAssignmentsForFinalReport,
  upsertSubmission,
  startQuizSubmissionAttempt,
  upsertQuizSubmission,
  getSubmissionsByAssignment,
  getSubmissionsByAssignmentIds,
  getSubmissionByAssignmentAndStudent,
  createQuizViolationLog,
  getQuizViolationSummaryByAssignment,
  gradeSubmission,
  getSubmissionById,
};
