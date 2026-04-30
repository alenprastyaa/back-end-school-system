const { Pool } = require("pg");
const { loadedEnvPath, candidatePaths } = require("./loadEnv");

const requiredEnvVars = ["DB_USER", "DB_HOST", "DB_NAME", "DB_PASSWORD", "DB_PORT"];
const missingEnvVars = requiredEnvVars.filter((key) => {
  const value = process.env[key];
  return typeof value !== "string" || value.trim() === "";
});

if (missingEnvVars.length > 0) {
  const envLocation = loadedEnvPath || `not found. Checked: ${candidatePaths.join(", ")}`;
  throw new Error(
    `Missing database environment variables: ${missingEnvVars.join(", ")}. Loaded .env from: ${envLocation}`
  );
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
});

module.exports = pool;
