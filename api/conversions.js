import { Redis } from "@upstash/redis";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  try {
    const redis = Redis.fromEnv();
    const conversions = req.method === "POST"
      ? await redis.incr("conversions")
      : Number(await redis.get("conversions") || 0);
    return res.status(200).json({ conversions });
  } catch {
    return res.status(503).json({ error: "Conversion count unavailable." });
  }
}
