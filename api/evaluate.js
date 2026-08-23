import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { images } = req.body; // Array dari string base64 gambar
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ message: "GEMINI_API_KEY tidak dikonfigurasi di Vercel." });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Anda adalah Sistem Validator DAO NFT Otomatis.
      Anda menerima 1 atau lebih screenshot dari aplikasi PiBox.

      Tugas Anda:
      1. Secara mandiri identifikasi mana gambar yang berisi Metadata (Title, Description, Price, Issuer) dan mana gambar yang berisi Visual Karya Resolusi Penuh (Modal Approve/Reject).
      2. Ekstrak teks metadata: Title, Description, Price, Issuer.
      3. Analisis kualitas visual gambar karya (detail, kejelasan, keunikan).
      4. Bandingkan apakah visual karya sesuai dengan isi deskripsi/lore.
      5. Berikan skor visual (0-100) dan skor lore (0-100). Jika rerata skor >= 80, tetapkan status APPROVED. Jika di bawah 80, tetapkan REJECTED.

      Respons WAJIB dalam format JSON murni tanpa teks tambahan:
      {
        "title": "...",
        "issuer": "...",
        "price": "...",
        "description": "...",
        "visualScore": 85,
        "loreScore": 90,
        "status": "APPROVED",
        "reason": "Penjelasan singkat pertimbangan audit"
      }
    `;

    // Menyusun payload prompt + semua gambar yang diunggah
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
    const responseText = await result.response.text();

    return res.status(200).json({ status: "success", data: responseText });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
