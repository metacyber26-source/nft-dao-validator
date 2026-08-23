import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // Tetapkan Header JSON
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  try {
    const { images } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ status: "error", message: "GEMINI_API_KEY belum dikonfigurasi di Vercel!" });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ status: "error", message: "Tidak ada gambar yang diunggah." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Anda adalah Validator DAO NFT. Identifikasi screenshot PiBox ini.
      1. Ekstrak data: Title, Issuer, Price, Description.
      2. Nilai kualitas visual dan kesesuaian lore/deskripsi (0-100).
      3. Berikan status APPROVED jika rata-rata skor >= 80, jika kurang berikan REJECTED.

      Kembalikan HANYA JSON valid dengan format persis seperti ini:
      {
        "title": "Nama Title",
        "issuer": "Nama Issuer",
        "price": "314.00",
        "description": "Deskripsi singkat",
        "visualScore": 85,
        "loreScore": 90,
        "status": "APPROVED",
        "reason": "Alasan singkat"
      }
    `;

    const contentParts = [prompt];
    images.forEach(imgBase64 => {
      contentParts.push({
        inlineData: {
          data: imgBase64,
          mimeType: "image/png"
        }
      });
    });

    const result = await model.generateContent(contentParts);
    let responseText = await result.response.text();

    // Clean JSON response dari markdown ```json ... ```
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    return res.status(200).json({ 
      status: "success", 
      data: responseText 
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ 
      status: "error", 
      message: error.message || "Terjadi kesalahan internal server." 
    });
  }
}
