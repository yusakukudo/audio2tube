import { Redis } from "@upstash/redis";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  try {
    const redis = process.env.COUNTER_KV_REST_API_URL
      ? new Redis({ url: process.env.COUNTER_KV_REST_API_URL, token: process.env.COUNTER_KV_REST_API_TOKEN })
      : Redis.fromEnv();
    let conversions;
    if (req.method === "GET") {
      conversions = Number(await redis.get("conversions") || 0);
    } else if (req.body?.id === undefined) {
      // Older open tabs submit an empty POST.
      conversions = await redis.incr("conversions");
    } else {
      const id = req.body.id;
      if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({ error: "Invalid conversion ID." });
      }
      conversions = Number(await redis.eval(`
        if redis.call("SET", KEYS[2], "1", "NX", "EX", 172800) then
          return redis.call("INCR", KEYS[1])
        end
        return redis.call("GET", KEYS[1])
      `, ["conversions", "conversion:" + id], []));
    }
    return res.status(200).json({ conversions });
  } catch {
    return res.status(503).json({ error: "Conversion count unavailable." });
  }
}
