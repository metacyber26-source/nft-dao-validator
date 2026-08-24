import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.query.action === 'logs') {
    if (!supabase) return res.status(200).json({ logs: [] });
    const { data } = await supabase.from('nft_audits').select('*').order('id', { ascending: false }).limit(10);
    return res.status(200).json({ logs: data || [] });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  try {
    const { images, wallet } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ status: "error", message: "GEMINI_API_KEY belum dikonfigurasi!" });
    if (!images || images.length === 0) return res.status(400).json({ status: "error", message: "Gambar tidak ditemukan." });

    const genAI = new GoogleGenerativeAI(apiKey);
    // Menggunakan model Gemini 3.6 Flash
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const prompt = `
      Anda adalah AGI Core Security & Validator AI untuk Nusantara DAO NFT. 
      Lakukan pemindaian tingkat lanjut (AGI Multi-modal Security Scan) pada screenshot PiBox yang diberikan:
      1. CEK KEAMANAN & SIMBOL BERBAHAYA: Periksa dengan sangat teliti apakah ada simbol terlarang, ujaran kebencian, atribut berbahaya, QR/barcode tersembunyi yang mencurigakan, atau malware visual.
      2. Ekstrak data: Title, Issuer, Price, Description.
      3. Nilai kualitas visual (0-100) dan lore/deskripsi (0-100).
      4. Cek risiko plagiasi (Rendah / Sedang / Tinggi).
      5. Berikan Counter-Argument DAO.
      6. ATURAN MUTLAK: Jika terdeteksi simbol berbahaya/terlarang ATAU ancaman keamanan ATAU risiko plagiasi tinggi, status WAJIB "REJECTED". Status "APPROVED" hanya diberikan jika gambar 100% aman, bersih, dan skor rata-rata >= 75.

      Kembalikan HANYA format JSON murni berikut tanpa teks pengantar:
      {
        "title": "Judul NFT",
        "issuer": "Nama Pembuat",
        "price": "314.00 Pi",
        "description": "Deskripsi singkat",
        "visualScore": 88,
        "loreScore": 92,
        "plagiarismRisk": "Rendah",
        "securityThreat": "Aman",
        "status": "APPROVED",
        "reason": "Aset bersih dari simbol berbahaya, visual dan lore sangat orisinal."
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

    // Simpan otomatis ke Supabase
    if (supabase) {
      await supabase.from('nft_audits').insert([{
        title: parsedData.title,
        issuer: parsedData.issuer,
        price: parsedData.price,
        status: parsedData.status,
        visual_score: parsedData.visualScore,
        lore_score: parsedData.loreScore,
        plagiarism_risk: parsedData.plagiarismRisk,
        reason: `[Keamanan: ${parsedData.securityThreat}] ${parsedData.reason}`,
        wallet_address: wallet || 'Anonymous'
      }]);
    }

    return res.status(200).json({ status: "success", data: responseText });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
}
