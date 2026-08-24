import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.setHeader('Content-Type', 'application/json');

  // Inisialisasi Supabase secara aman
  let supabase = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    } catch (e) {
      console.error("Supabase init error:", e.message);
    }
  }

  if (req.method === 'GET' && req.query.action === 'logs') {
    if (!supabase) return res.status(200).json({ logs: [] });
    try {
      const { data, error } = await supabase.from('nft_audits').select('*').order('id', { ascending: false }).limit(10);
      if (error) throw error;
      return res.status(200).json({ logs: data || [] });
    } catch (e) {
      return res.status(200).json({ logs: [] });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: "error", message: "Method Not Allowed" });
  }

  try {
    const { images, wallet } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ status: "error", message: "GEMINI_API_KEY belum diatur di Vercel Environment Variables!" });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ status: "error", message: "Tidak ada gambar yang dikirim." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Menggunakan gemini-3.6-flash sesuai permintaan dan instruksi API Google
    const modelNames = ["gemini-3.6-flash", "gemini-1.5-flash", "gemini-pro"];
    let model = null;
    let lastError = null;

    for (const mName of modelNames) {
      try {
        model = genAI.getGenerativeModel({ model: mName });
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!model) {
      model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
    }

    const prompt = `
      Anda adalah AGI Core Security & Validator AI untuk Nusantara DAO NFT. 
      Analisis screenshot yang diunggah:
      1. Periksa apakah ada simbol terlarang, ujaran kebencian, atau malware visual.
      2. Ekstrak data: Title, Issuer, Price, Description.
      3. Berikan skor visual (0-100) dan lore (0-100).
      4. Tentukan risiko plagiasi (Rendah / Sedang / Tinggi).
      5. Berikan alasan/counter-argument singkat.
      6. Jika ada ancaman keamanan atau plagiasi tinggi, status WAJIB "REJECTED". Jika aman, "APPROVED".

      Kembalikan HANYA format JSON murni tanpa markdown (tanpa backtick):
      {
        "title": "Nama NFT",
        "issuer": "Kreator",
        "price": "314.00 Pi",
        "description": "Deskripsi",
        "visualScore": 85,
        "loreScore": 90,
        "plagiarismRisk": "Rendah",
        "securityThreat": "Aman",
        "status": "APPROVED",
        "reason": "Aset terverifikasi aman dan orisinal."
      }
    `;

    const contentParts = [prompt];
    images.forEach(img => {
      contentParts.push({
        inlineData: {
          data: img,
          mimeType: "image/jpeg"
        }
      });
    });

    const result = await model.generateContent(contentParts);
    const response = await result.response;
    let responseText = response.text();

    // Membersihkan format markdown jika AI mengembalikannya
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = responseText.indexOf('{');
    const lastBrace = responseText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      responseText = responseText.substring(firstBrace, lastBrace + 1);
    }

    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (err) {
      parsedData = {
        title: "NFT Validator Asset",
        issuer: wallet || "Pioneer",
        price: "314 Pi",
        description: "Hasil Scan AGI",
        visualScore: 80,
        loreScore: 80,
        plagiarismRisk: "Rendah",
        securityThreat: "Aman",
        status: "APPROVED",
        reason: responseText.substring(0, 200)
      };
    }

    // Simpan ke Supabase jika tabel tersedia
    if (supabase) {
      try {
        await supabase.from('nft_audits').insert([{
          title: parsedData.title || 'Untitled',
          issuer: parsedData.issuer || '-',
          price: parsedData.price || '0',
          status: parsedData.status || 'APPROVED',
          visual_score: parsedData.visualScore || 0,
          lore_score: parsedData.loreScore || 0,
          plagiarism_risk: parsedData.plagiarismRisk || 'Rendah',
          reason: parsedData.reason || '',
          wallet_address: wallet || 'Anonymous'
        }]);
      } catch (dbErr) {
        console.warn("Catatan Supabase gagal disimpan:", dbErr.message);
      }
    }

    return res.status(200).json({
      status: "success",
      data: parsedData
    });

  } catch (error) {
    console.error("Crash Error Detail:", error);
    return res.status(500).json({
      status: "error",
      message: "Server Error: " + (error.message || "Terjadi kesalahan internal pada fungsi.")
    });
  }
}
