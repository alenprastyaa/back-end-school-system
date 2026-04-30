require("../config/loadEnv");

const pool = require("../config/database");
const { ensureAcademicPeriodSchema } = require("../models/AcademicPeriodModel");
const { ensureLearningSchema } = require("../models/LearningModel");
const { ensureUserProfileColumn } = require("../utils/ensureUserProfileColumn");
const { ensurePaymentReceiptPaymentDateColumn } = require("../utils/ensurePaymentReceiptPaymentDateColumn");

const ensureCoreSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schools (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role VARCHAR(20) NOT NULL,
      school_id INT REFERENCES schools(id) ON DELETE CASCADE,
      class_id INT,
      parent_email VARCHAR(255),
      phone_number VARCHAR(50),
      profile_image TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT users_role_check
        CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'GURU', 'SISWA'))
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS class (
      id SERIAL PRIMARY KEY,
      class_name VARCHAR(100) NOT NULL,
      school_id INT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      wali_guru_id INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT class_school_name_unique UNIQUE (school_id, class_name)
    )
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS class_id INT
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_class_id_fkey'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_class_id_fkey
        FOREIGN KEY (class_id)
        REFERENCES class(id)
        ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
      image TEXT,
      clock_in TIMESTAMP,
      clock_out TIMESTAMP,
      status VARCHAR(30) NOT NULL DEFAULT 'hadir',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT attendance_user_date_unique UNIQUE (user_id, attendance_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_receipt (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_path TEXT NOT NULL,
      periode VARCHAR(20),
      payment_date DATE,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_school_role
    ON users (school_id, role)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_class_id
    ON users (class_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_class_school_id
    ON class (school_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attendance_user_date
    ON attendance (user_id, attendance_date DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_receipt_user_payment_date
    ON payment_receipt (user_id, payment_date DESC, created_at DESC)
  `);
};

const bootstrapDatabase = async () => {
  await ensureCoreSchema();
  await ensureUserProfileColumn();
  await ensurePaymentReceiptPaymentDateColumn();
  await ensureAcademicPeriodSchema();
  await ensureLearningSchema();
};

if (require.main === module) {
  bootstrapDatabase()
    .then(async () => {
      console.log("Database schema bootstrap completed.");
      await pool.end();
    })
    .catch(async (error) => {
      console.error("Database schema bootstrap failed.", error);
      await pool.end();
      process.exit(1);
    });
}

module.exports = {
  ensureCoreSchema,
  bootstrapDatabase,
};
