const mongoose = require("mongoose");
async function connectDb() {
  if (process.env.NODE_ENV === "test" && process.env.SKIP_DB === "true") return mongoose;
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri, { maxPoolSize: Number(process.env.MONGO_POOL_SIZE || 20), serverSelectionTimeoutMS: 10000 });
  return mongoose;
}
module.exports = { connectDb };
