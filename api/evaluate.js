// File: api/evaluate.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: "GEMINI_API_KEY belum dikonfigurasi di Vercel." });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Jalankan logika evaluasi AI
    const result = await model.generateContent(req.body.lore || "Evaluasi NFT ini");
    const responseText = await result.response.text();

    return res.status(200).json({ status: "success", data: responseText });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
