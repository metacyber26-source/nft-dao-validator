import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { imageBase64 } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ message: "GEMINI_API_KEY belum dikonfigurasi di Vercel." });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Prompt instruksi OCR & Evaluasi DAO
    const prompt = `
      Analisis gambar screenshot detail NFT berikut:
      1. Ekstrak data teks dari gambar: Title, Description, Price, dan Issuer.
      2. Evaluasi kesesuaian antara gambar karya NFT dan teks Description/Lore.
      3. Berikan nilai/skor kelayakan standar DAO (Skor minimal 80 untuk Lolos).
      
      Keluarkan respons dalam format JSON:
      {
        "title": "...",
        "issuer": "...",
        "price": "...",
        "description": "...",
        "status": "APPROVED / REJECTED",
        "visualScore": 85,
        "loreMatchPercent": "90%"
      }
    `;

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: "image/png"
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = await result.response.text();

    return res.status(200).json({ status: "success", data: responseText });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
