import dotenv from "dotenv";
import fs from "fs";

let cachedConfig = null;

export function getConfig() {
  if (!cachedConfig) {
    cachedConfig = { ...process.env };
  }
  return cachedConfig;
}

// Call this on /reload command
export function reloadConfig() {
  // Re-parse the .env file and override process.env
  if (fs.existsSync(".env")) {
    dotenv.config({ override: true });
    cachedConfig = { ...process.env };
    console.log("Config reloaded from .env");
  } else {
    throw new Error(".env file not found");
  }
}