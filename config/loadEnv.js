const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const candidatePaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];

let loadedEnvPath = null;

for (const envPath of candidatePaths) {
  if (!fs.existsSync(envPath)) {
    continue;
  }

  dotenv.config({ path: envPath });
  loadedEnvPath = envPath;
  break;
}

module.exports = {
  loadedEnvPath,
  candidatePaths,
};
