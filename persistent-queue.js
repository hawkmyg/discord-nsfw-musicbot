import fs from "fs";
import path from "path";

// Where to store the persistence file (adjust as needed)
const QUEUE_STATE_FILE = path.resolve(process.cwd(), "queue-state.json");

// Save the entire state: { [guildId]: { queue: [...], volumes, pausedStates, lastVoiceChannelId } }
export function saveQueueState(state) {
  fs.writeFileSync(QUEUE_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// Load state at startup
export function loadQueueState() {
  if (fs.existsSync(QUEUE_STATE_FILE)) {
    try {
      const data = fs.readFileSync(QUEUE_STATE_FILE, "utf-8");
      if (!data.trim()) {
        // If file is empty, delete it and return empty object
        fs.unlinkSync(QUEUE_STATE_FILE);
        return {};
      }
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to load queue state:", e);
    }
  }
  return {};
}