import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

// Safe Inisialisasi Supabase
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  } catch (e) {
    console.error("Gagal koneksi Supabase:", e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  // Route GET Log Audit Supabase
  if (req.method === 'GET' && req.query.action === 'logs') {
    if (!supabase) return res.status(200).json({ logs: [] });
    try {
      const { data } = await supabase.from('nft_audits').select('*').order('id', { ascending: false }).limit(10);
      return res.status(200).json({ logs: data || [] });
    } catch (e) {
      return res.status(200).json({ logs: [] });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: "error", message: "Method Method Not Allowed" });
  }

  try {
    const { images, wallet } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ status: "error", message: "GEMINI_API_KEY belum dikonfigurasi di Environment Variables Vercel!" });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ status: "error", message: "Gambar screenshot tidak ditemukan." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Menggunakan Gemini 3.6 Flash
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const prompt = `
      Anda adalah AGI Core Security & Validator AI untuk Nusantara DAO NFT. 
      Lakukan analisis & pemindaian tingkat lanjut (AGI Multi-modal Security Scan) pada screenshot PiBox yang diberikan:
      1. FILTER SIMBOL BERBAHAYA / TERLARANG: Periksa dengan sangat teliti apakah terdapat simbol terlarang, ujaran kebencian, konten terlarang, QR/barcode tersembunyi yang mencurigakan, atau visual berbahaya.
      2. Ekstrak data: Title, Issuer, Price, Description.
      3. Nilai kualitas visual (0-100) dan lore/deskripsi (0-100).
      4. Cek risiko plagiasi (Rendah / Sedang / Tinggi).
      5. Berikan Counter-Argument DAO / alasan singkat.
      6. ATURAN MUTLAK KECERDASAN AGI: 
         - Jika terdeteksi simbol berbahaya/terlarang ATAU ancaman keamanan ATAU risiko plagiasi tinggi, status WAJIB "REJECTED".
         - Status "APPROVED" HANYA diberikan jika gambar 100% aman, bersih, dan rata-rata skor >= 75.

      SANGAT PENTING: Kembalikan HANYA format JSON valid murni tanpa format Markdown block atau kata-kata tambahan.
      Format JSON:
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
      contentParts.push({
        inlineData: {
          data: img,
          mimeType: "image/png"
        }
      });
    });

    const result = await model.generateContent(contentParts);
    let responseText = await result.response.text();
    
    // Pembersihan ketat penulisan JSON dari Gemini
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonStartIndex = responseText.indexOf('{');
    const jsonEndIndex = responseText.lastIndexOf('}');
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      responseText = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
    }

    const parsedData = JSON.parse(responseText);

    // Simpan ke Supabase jika terkonfigurasi (tanpa memblokir respon jika terjadi error)
    if (supabase) {
      try {
        await supabase.from('nft_audits').insert([{
          title: parsedData.title || 'Untitled',
          issuer: parsedData.issuer || '-',
          price: parsedData.price || '0',
          status: parsedData.status || 'REJECTED',
          visual_score: parsedData.visualScore || 0,
          lore_score: parsedData.loreScore || 0,
          plagiarism_risk: parsedData.plagiarismRisk || 'Rendah',
          reason: `[Keamanan: ${parsedData.securityThreat || 'Aman'}] ${parsedData.reason || ''}`,
          wallet_address: wallet || 'Anonymous'
        }]);
      } catch (dbErr) {
        console.error("Gagal simpan ke Supabase:", dbErr);
      }
    }

    return res.status(200).json({
      status: "success",
      data: parsedData
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Gagal memproses AI: " + error.message
    });
  }
}
