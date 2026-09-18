// ============================================================================
// ai-parse-product-query.mjs - Netlify Function
//
// 「AI 查價」功能的唯一後端呼叫：用 Gemini API（免費方案）把使用者輸入的自由文字
// （例如「皇家 幼貓飼料 2kg」）解析成結構化欄位 {brand, productName, specification, keywords}。
//
// 重要：這裡只負責「語意解析」，完全不知道、也絕對不負責任何價格資訊。
// 價格一律由前端（purchasing.js）用這裡解析出來的結果，去比對瀏覽器 localStorage
// 中既有的商品與歷史進貨紀錄（DB.state.products / DB.state.purchases）計算出來 ——
// 這個系統本身沒有伺服器端資料庫，所有商品/進貨資料都只存在使用者自己的瀏覽器裡，
// 所以歷史價格的比對與統計天生就只能在前端做，這支函式無法也不需要碰觸那些資料。
//
// 需要在 Netlify 網站設定中設定環境變數 GEMINI_API_KEY
// （到 https://aistudio.google.com/apikey 免費申請）。
// ============================================================================

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    brand: { type: 'string', description: '品牌名稱，找不到就填空字串' },
    productName: { type: 'string', description: '商品名稱本身，不含品牌與規格文字' },
    specification: { type: 'string', description: '規格／重量／容量，例如 2kg、80g，找不到就填空字串' },
    keywords: {
      type: 'array', items: { type: 'string' },
      description: '3~6 個可用於在商品資料庫中搜尋比對的關鍵字（可包含品牌中英文寫法、商品名稱同義詞）',
    },
  },
  required: ['brand', 'productName', 'specification', 'keywords'],
};

function extractText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  if (Array.isArray(data.steps)) {
    for (const step of data.steps) {
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        const textPart = step.content.find((c) => c.type === 'text');
        if (textPart && textPart.text) return textPart.text;
      }
    }
  }
  return null;
}

function extractJson(text) {
  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* 放棄 */ }
    }
    return null;
  }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY 未設定 - 請至 Netlify 網站設定新增環境變數');
    return new Response(JSON.stringify({ ok: false, error: 'server_misconfigured' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  let query = '';
  try {
    const body = await req.json();
    query = (body?.query ?? '').toString().trim();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_body' }), { status: 400 });
  }

  if (!query || query.length > 100) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_query' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = `你是寵物用品店進貨系統的商品名稱解析工具。使用者輸入了一段可能包含「品牌＋商品名稱＋規格」的文字，例如「皇家 幼貓飼料 2kg」。

請把以下輸入拆解成結構化欄位：
- brand：品牌名稱（例如「皇家」「Royal Canin」），找不到就填空字串
- productName：商品名稱本身，不含品牌與規格文字
- specification：規格／重量／容量（例如「2kg」「80g」），找不到就填空字串
- keywords：3~6 個用於在商品資料庫中搜尋比對的關鍵字

你只負責文字解析，絕對不要輸出任何價格資訊，你也不知道任何價格。

使用者輸入：「${query}」`;

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: prompt,
        response_format: { type: 'text', mime_type: 'application/json', schema: RESPONSE_SCHEMA },
      }),
    });

    if (geminiRes.status === 429) {
      return new Response(JSON.stringify({ ok: false, error: 'quota_exceeded' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      console.error('Gemini API 錯誤', geminiRes.status, errText.slice(0, 500));
      return new Response(JSON.stringify({ ok: false, error: 'gemini_error' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await geminiRes.json();
    const text = extractText(data);
    if (!text) {
      console.error('Gemini 回應找不到文字內容', JSON.stringify(data).slice(0, 500));
      return new Response(JSON.stringify({ ok: false, error: 'gemini_error' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsed = extractJson(text);
    if (!parsed || typeof parsed !== 'object') {
      return new Response(JSON.stringify({ ok: false, error: 'gemini_error' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      brand: (parsed.brand || '').toString(),
      productName: (parsed.productName || '').toString(),
      specification: (parsed.specification || '').toString(),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('ai-parse-product-query 未預期錯誤', err);
    return new Response(JSON.stringify({ ok: false, error: 'server_error' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
};
