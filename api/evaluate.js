import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

// Inisialisasi Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  // Handle GET request untuk mengambil log Supabase
  if (req.method === 'GET' && req.query.action === 'logs') {
    if (!supabase) return res.status(200).json({ logs: [] });
    const { data, error } = await supabase.from('nft_audits').select('*').order('id', { ascending: false }).limit(10);
    return res.status(200).json({ logs: data || [] });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  try {
    const { images, wallet } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ status: "error", message: "GEMINI_API_KEY belum diatur!" });
    if (!images || images.length === 0) return res.status(400).json({ status: "error", message: "Gambar tidak ditemukan." });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const prompt = `
      Anda adalah Core Validator AI untuk Nusantara DAO NFT. 
      Analisis screenshot PiBox yang diberikan secara mendalam:
      1. Ekstrak data: Title, Issuer, Price, Description.
      2. Berikan nilai kualitas visual (0-100) dan lore/deskripsi (0-100).
      3. Lakukan cek plagiasi visual (Plagiarism Risk: Rendah / Sedang / Tinggi).
      4. Berikan Counter-Argument / Alasan mengapa NFT ini layak disetujui atau ditolak berdasarkan standar DAO.
      5. Status APPROVED jika rata-rata skor >= 75 dan risiko plagiasi rendah, selebihnya REJECTED.

      Kembalikan HANYA format JSON murni berikut (tanpa teks lain):
      {
        "title": "Judul NFT",
        "issuer": "Nama Pembuat",
        "price": "314.00 Pi",
        "description": "Deskripsi singkat",
        "visualScore": 88,
        "loreScore": 92,
        "plagiarismRisk": "Rendah",
        "status": "APPROVED",
        "reason": "Kualitas artistik tinggi dan orisinal, sangat cocok untuk ekosistem Nusantara."
      }
    `;

    const contentParts = [prompt];
    images.forEach(img => {
      contentParts.push({ inlineData: { data: img, mimeType: "image/png" } });
    });

    const result = await model.generateContent(contentParts);
    let responseText = await result.response.text();
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsedData = JSON.parse(responseText);

    // Simpan otomatis ke Supabase jika terhubung
    if (supabase) {
      await supabase.from('nft_audits').insert([{
        title: parsedData.title,
        issuer: parsedData.issuer,
        price: parsedData.price,
        status: parsedData.status,
        visual_score: parsedData.visualScore,
        lore_score: parsedData.loreScore,
        plagiarism_risk: parsedData.plagiarismRisk,
        reason: parsedData.reason,
        wallet_address: wallet || 'Anonymous'
      }]);
    }

    return res.status(200).json({ status: "success", data: responseText });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
}
