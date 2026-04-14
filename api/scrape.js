// AutoFlip AI — Serverless Scraper API
// Deploy na Vercel (besplatno)
// Ova funkcija prima URL oglasa, odlazi na sajt, izvlači podatke i vraća JSON

export default async function handler(req, res) {
  // CORS — dozvoli pristup sa bilo kog domena (tvoj app)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.method === "POST" ? req.body : req.query;

  if (!url) {
    return res.status(400).json({ error: "Nedostaje URL parametar", success: false });
  }

  try {
    // Detektuj platformu
    const platform = detectPlatform(url);

    // Fetch stranicu
    const response = await fetch(url, {
      headers: {
       "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "sr-RS,sr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Referer": url.includes("polovniautomobili") ? "https://www.polovniautomobili.com/" : url.includes("kupujemprodajem") ? "https://www.kupujemprodajem.com/" : url.includes("mobile.de") ? "https://www.mobile.de/" : "",
        "DNT": "1",
        "Connection": "keep-alive",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Sajt vratio grešku: ${response.status}`,
        success: false,
        platform,
      });
    }

    const html = await response.text();

    // Parsiraj stranicu prema platformi
    let data = {};

    if (platform.id === "kp") {
      data = parseKupujemProdajem(html, url);
    } else if (platform.id === "pa") {
      data = parsePolovniAutomobili(html, url);
    } else if (platform.id === "mobile") {
      data = parseMobileDe(html, url);
    } else if (platform.id === "autoscout") {
      data = parseAutoScout24(html, url);
    } else {
      data = parseGeneric(html, url);
    }

    // Dopuni sa URL parsiranjem
    const urlData = parseUrlForCarData(url);
    data = { ...urlData, ...data }; // data iz HTML-a ima prioritet

    return res.status(200).json({
      success: true,
      platform,
      data,
      scrapedAt: new Date().toISOString(),
    });

  } catch (error) {
    return res.status(500).json({
      error: `Greška pri pristupu sajtu: ${error.message}`,
      success: false,
    });
  }
}


// ============================================================
// PLATFORM DETECTION
// ============================================================
function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes("kupujemprodajem.com") || u.includes("kp.rs"))
    return { id: "kp", name: "KupujemProdajem", icon: "🇷🇸" };
  if (u.includes("polovniautomobili.com") || u.includes("polovniautomobili.rs"))
    return { id: "pa", name: "Polovni Automobili", icon: "🇷🇸" };
  if (u.includes("mobile.de"))
    return { id: "mobile", name: "mobile.de", icon: "🇩🇪" };
  if (u.includes("autoscout24"))
    return { id: "autoscout", name: "AutoScout24", icon: "🇪🇺" };
  if (u.includes("facebook.com") || u.includes("fb.com"))
    return { id: "fb", name: "Facebook Marketplace", icon: "📘" };
  return { id: "unknown", name: "Nepoznat sajt", icon: "🌐" };
}


// ============================================================
// KUPUJEMPRODAJEM PARSER
// ============================================================
function parseKupujemProdajem(html, url) {
  const data = {};

  // Naslov oglasa
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (titleMatch) data.title = cleanText(titleMatch[1]);

  // Cena
  const pricePatterns = [
    /class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\//i,
    /(\d{1,3}[.,]\d{3})\s*€/,
    /€\s*(\d{1,3}[.,]\d{3})/,
    /(\d{4,6})\s*€/,
    /data-price="(\d+)"/i,
  ];
  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match) {
      const priceStr = match[1].replace(/[^0-9]/g, "");
      const price = parseInt(priceStr);
      if (price > 500 && price < 500000) { data.price = price; break; }
    }
  }

  // Izvuci detalje iz tabele karakteristika
  const detailPatterns = {
    year: [/godi[šs]te[^>]*>[\s\S]*?(\d{4})/i, /(\d{4})\.\s*god/i],
    km: [/kilometra[žz]a[^>]*>[\s\S]*?([\d.,]+)/i, /([\d.,]+)\s*km/i],
    fuel: [/gorivo[^>]*>[\s\S]*?<[^>]*>([^<]+)/i],
    engine: [/motor[^>]*>[\s\S]*?<[^>]*>([^<]+)/i, /kubika[žz]a[^>]*>[\s\S]*?<[^>]*>([^<]+)/i],
    power: [/snaga[^>]*>[\s\S]*?<[^>]*>([^<]+)/i, /(\d+)\s*k[sSwW]/i],
    transmission: [/menja[čc][^>]*>[\s\S]*?<[^>]*>([^<]+)/i],
    color: [/boja[^>]*>[\s\S]*?<[^>]*>([^<]+)/i],
    doors: [/vrata[^>]*>[\s\S]*?<[^>]*>([^<]+)/i],
    registration: [/registrovan\s+do[^>]*>[\s\S]*?<[^>]*>([^<]+)/i],
  };

  for (const [key, patterns] of Object.entries(detailPatterns)) {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        let value = cleanText(match[1]);
        if (key === "km") {
          value = parseInt(value.replace(/[^0-9]/g, ""));
          if (value > 0 && value < 1000000) data.km = value;
        } else if (key === "year") {
          const y = parseInt(value);
          if (y > 1990 && y < 2027) data.year = y;
        } else if (key === "power") {
          data.power = value;
        } else {
          data[key] = value;
        }
        break;
      }
    }
  }

  // Opis oglasa
  const descPatterns = [
    /class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /class="[^"]*oglas-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /id="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const pattern of descPatterns) {
    const match = html.match(pattern);
    if (match) {
      data.description = cleanText(match[1]).substring(0, 2000);
      break;
    }
  }

  // Lokacija
  const locPatterns = [
    /class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\//i,
    /lokacija[^>]*>[\s\S]*?<[^>]*>([^<]+)/i,
  ];
  for (const pattern of locPatterns) {
    const match = html.match(pattern);
    if (match) { data.location = cleanText(match[1]); break; }
  }

  // Slike
  const images = [];
  const imgPattern = /src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
  let imgMatch;
  while ((imgMatch = imgPattern.exec(html)) !== null && images.length < 10) {
    if (imgMatch[1].includes("thumb") || imgMatch[1].includes("photo") || imgMatch[1].includes("image") || imgMatch[1].includes("img")) {
      images.push(imgMatch[1]);
    }
  }
  if (images.length > 0) data.images = images;

  // Marka/Model iz naslova
  if (data.title) {
    const carBrands = ["volkswagen", "vw", "audi", "bmw", "mercedes", "opel", "škoda", "skoda", "renault", "peugeot", "citroen", "fiat", "ford", "toyota", "hyundai", "kia", "dacia", "seat", "mazda", "honda", "nissan", "volvo", "mini", "jeep", "land rover", "porsche", "alfa romeo"];
    const titleLower = data.title.toLowerCase();
    for (const brand of carBrands) {
      if (titleLower.includes(brand)) {
        data.make = brand === "vw" ? "Volkswagen" : brand.charAt(0).toUpperCase() + brand.slice(1);
        // Pokusaj da nadjes model posle marke
        const afterBrand = titleLower.split(brand)[1]?.trim();
        if (afterBrand) {
          const modelPart = afterBrand.split(/[\s,\-\/]/)[0];
          if (modelPart && modelPart.length > 1) data.model = modelPart.charAt(0).toUpperCase() + modelPart.slice(1);
        }
        break;
      }
    }
  }

  return data;
}


// ============================================================
// POLOVNI AUTOMOBILI PARSER
// ============================================================
function parsePolovniAutomobili(html, url) {
  const data = {};

  // Naslov
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/is) || html.match(/<title>(.*?)<\/title>/is);
  if (titleMatch) data.title = cleanText(titleMatch[1]);

  // Cena - PA specifični selektori
  const pricePatterns = [
    /class="[^"]*price[^"]*"[^>]*>\s*(?:<[^>]*>)?\s*([\d.,]+)\s*€/i,
    /class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\//i,
    /(\d{1,3}\.?\d{3})\s*€/,
    /cena[^>]*>\s*(?:<[^>]*>)*\s*([\d.,]+)/i,
  ];
  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match) {
      const priceStr = match[1].replace(/[^0-9]/g, "");
      const price = parseInt(priceStr);
      if (price > 500 && price < 500000) { data.price = price; break; }
    }
  }

  // PA detalji - obično u divovima sa klasama
  const detailMap = {
    year: [/godi[šs]te[\s\S]*?<(?:span|div|td)[^>]*>\s*(\d{4})/i, /first.?registration[\s\S]*?(\d{4})/i],
    km: [/kilometra[žz]a[\s\S]*?<(?:span|div|td)[^>]*>\s*([\d.,]+)/i, /mileage[\s\S]*?([\d.,]+)/i],
    fuel: [/gorivo[\s\S]*?<(?:span|div|td)[^>]*>\s*([^<]+)/i, /fuel[\s\S]*?<(?:span|div|td)[^>]*>\s*([^<]+)/i],
    engine: [/zapremina[\s\S]*?<(?:span|div|td)[^>]*>\s*([^<]+)/i, /kubika[žz]a[\s\S]*?<(?:span|div|td)[^>]*>\s*([^<]+)/i],
    power: [/snaga[\s\S]*?<(?:span|div|td)[^>]*>\s*([^<]+)/i, /(\d+)\s*k[sS]/i],
    transmission: [/menja[čc][\s\S]*?<(?:span|div|td)[^>]*>\s*([^<]+)/i],
    color: [/boja[\s\S]*?<(?:span|div|td)[^>]*>\s*([^<]+)/i],
    body: [/karoserija[\s\S]*?<(?:span|div|td)[^>]*>\s*([^<]+)/i],
  };

  for (const [key, patterns] of Object.entries(detailMap)) {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        let value = cleanText(match[1]);
        if (key === "km") {
          value = parseInt(value.replace(/[^0-9]/g, ""));
          if (value > 0 && value < 1000000) data.km = value;
        } else if (key === "year") {
          const y = parseInt(value);
          if (y > 1990 && y < 2027) data.year = y;
        } else {
          data[key] = value;
        }
        break;
      }
    }
  }

  // Opis
  const descMatch = html.match(/class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                     html.match(/class="[^"]*oglas[^"]*opis[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) data.description = cleanText(descMatch[1]).substring(0, 2000);

  // Lokacija
  const locMatch = html.match(/class="[^"]*location[^"]*"[^>]*>([^<]+)/i) ||
                   html.match(/lokacija[^>]*>[\s\S]*?([^<]+)/i);
  if (locMatch) data.location = cleanText(locMatch[1]);

  // Slike
  const images = [];
  const imgPattern = /src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
  let imgMatch;
  while ((imgMatch = imgPattern.exec(html)) !== null && images.length < 10) {
    if (!imgMatch[1].includes("logo") && !imgMatch[1].includes("icon") && !imgMatch[1].includes("banner")) {
      images.push(imgMatch[1]);
    }
  }
  if (images.length > 0) data.images = images;

  // Marka/Model iz URL-a (PA ima čist URL format)
  const urlParts = url.toLowerCase().split("/");
  const carBrands = { "volkswagen": "Volkswagen", "audi": "Audi", "bmw": "BMW", "mercedes-benz": "Mercedes-Benz", "opel": "Opel", "skoda": "Škoda", "renault": "Renault", "peugeot": "Peugeot", "fiat": "Fiat", "ford": "Ford", "toyota": "Toyota", "dacia": "Dacia", "hyundai": "Hyundai", "kia": "Kia" };
  for (const part of urlParts) {
    for (const [key, val] of Object.entries(carBrands)) {
      if (part.includes(key)) {
        data.make = val;
        // Model je obicno sledeci deo posle marke u URL-u
        const afterBrand = part.split(key)[1]?.replace(/^[-_]/, "");
        if (afterBrand) {
          const modelPart = afterBrand.split(/[-_]/)[0];
          if (modelPart) data.model = modelPart.charAt(0).toUpperCase() + modelPart.slice(1);
        }
      }
    }
  }

  return data;
}


// ============================================================
// MOBILE.DE PARSER
// ============================================================
function parseMobileDe(html, url) {
  const data = {};
  data.isImport = true;
  data.country = "DE";

  // Naslov
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/is) || html.match(/<title>(.*?)<\/title>/is);
  if (titleMatch) data.title = cleanText(titleMatch[1]);

  // Cena
  const pricePatterns = [
    /class="[^"]*price[^"]*"[^>]*>\s*(?:<[^>]*>)?\s*([\d.,]+)\s*€/i,
    /(\d{1,3}\.?\d{3})\s*€/,
    /data-testid="[^"]*price[^"]*"[^>]*>([\s\S]*?)</i,
  ];
  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match) {
      const priceStr = match[1].replace(/[^0-9]/g, "");
      const price = parseInt(priceStr);
      if (price > 500 && price < 500000) { data.price = price; break; }
    }
  }

  // Detalji
  const detailMap = {
    year: [/erstzulassung[\s\S]*?(\d{2})\/(\d{4})/i, /first.?registration[\s\S]*?(\d{4})/i],
    km: [/kilometerstand[\s\S]*?([\d.,]+)\s*km/i, /mileage[\s\S]*?([\d.,]+)/i],
    fuel: [/kraftstoff[\s\S]*?<[^>]*>([^<]+)/i, /fuel[\s\S]*?<[^>]*>([^<]+)/i],
    power: [/leistung[\s\S]*?(\d+)\s*kW\s*\((\d+)\s*PS\)/i, /(\d+)\s*PS/i, /(\d+)\s*kW/i],
    transmission: [/getriebe[\s\S]*?<[^>]*>([^<]+)/i],
    color: [/farbe[\s\S]*?<[^>]*>([^<]+)/i, /color[\s\S]*?<[^>]*>([^<]+)/i],
  };

  for (const [key, patterns] of Object.entries(detailMap)) {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        let value = cleanText(match[1]);
        if (key === "km") {
          value = parseInt(value.replace(/[^0-9]/g, ""));
          if (value > 0 && value < 1000000) data.km = value;
        } else if (key === "year") {
          const y = parseInt(match[2] || match[1]);
          if (y > 1990 && y < 2027) data.year = y;
        } else {
          data[key] = value;
        }
        break;
      }
    }
  }

  // Opis
  const descMatch = html.match(/class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) data.description = cleanText(descMatch[1]).substring(0, 2000);

  return data;
}


// ============================================================
// AUTOSCOUT24 PARSER
// ============================================================
function parseAutoScout24(html, url) {
  const data = {};
  data.isImport = true;

  // Detect country from URL
  if (url.includes(".de")) data.country = "DE";
  else if (url.includes(".at")) data.country = "AT";
  else if (url.includes(".be")) data.country = "BE";
  else if (url.includes(".nl")) data.country = "NL";
  else data.country = "EU";

  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (titleMatch) data.title = cleanText(titleMatch[1]);

  // AutoScout24 often has structured data (JSON-LD)
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      if (jsonData.name) data.title = jsonData.name;
      if (jsonData.offers?.price) data.price = parseInt(jsonData.offers.price);
      if (jsonData.brand?.name) data.make = jsonData.brand.name;
      if (jsonData.model) data.model = jsonData.model;
      if (jsonData.mileageFromOdometer?.value) data.km = parseInt(jsonData.mileageFromOdometer.value);
      if (jsonData.vehicleModelDate) data.year = parseInt(jsonData.vehicleModelDate);
      if (jsonData.fuelType) data.fuel = jsonData.fuelType;
    } catch (e) { /* JSON parse failed, continue with regex */ }
  }

  // Fallback regex parsing
  const priceMatch = html.match(/(\d{1,3}[.,]\d{3})\s*€/) || html.match(/€\s*([\d.,]+)/);
  if (priceMatch && !data.price) {
    const p = parseInt(priceMatch[1].replace(/[^0-9]/g, ""));
    if (p > 500 && p < 500000) data.price = p;
  }

  return data;
}


// ============================================================
// GENERIC PARSER (za nepoznate sajtove)
// ============================================================
function parseGeneric(html, url) {
  const data = {};

  // Naslov
  const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/is) || html.match(/<title>(.*?)<\/title>/is);
  if (titleMatch) data.title = cleanText(titleMatch[1]);

  // Cena
  const priceMatch = html.match(/(\d{1,3}[.,]\d{3})\s*€/) || html.match(/€\s*([\d.,]+)/);
  if (priceMatch) {
    const p = parseInt(priceMatch[1].replace(/[^0-9]/g, ""));
    if (p > 500 && p < 500000) data.price = p;
  }

  // Km
  const kmMatch = html.match(/([\d.,]+)\s*km/i);
  if (kmMatch) {
    const k = parseInt(kmMatch[1].replace(/[^0-9]/g, ""));
    if (k > 0 && k < 1000000) data.km = k;
  }

  // Year
  const yearMatch = html.match(/(20[0-2]\d)\.\s*god/i) || html.match(/godi[šs]te[^>]*>\s*(\d{4})/i);
  if (yearMatch) {
    const y = parseInt(yearMatch[1]);
    if (y > 1990 && y < 2027) data.year = y;
  }

  return data;
}


// ============================================================
// URL PARSER (izvlaci podatke iz samog URL-a)
// ============================================================
function parseUrlForCarData(url) {
  const u = url.toLowerCase();
  const data = {};

  const carBrands = {
    "volkswagen": "Volkswagen", "vw": "Volkswagen", "audi": "Audi", "bmw": "BMW",
    "mercedes": "Mercedes-Benz", "opel": "Opel", "skoda": "Škoda", "škoda": "Škoda",
    "renault": "Renault", "peugeot": "Peugeot", "citroen": "Citroen", "fiat": "Fiat",
    "ford": "Ford", "toyota": "Toyota", "hyundai": "Hyundai", "kia": "Kia",
    "dacia": "Dacia", "seat": "Seat", "mazda": "Mazda", "honda": "Honda",
    "nissan": "Nissan", "volvo": "Volvo", "mini": "Mini", "jeep": "Jeep",
    "porsche": "Porsche", "alfa-romeo": "Alfa Romeo",
  };

  for (const [key, val] of Object.entries(carBrands)) {
    if (u.includes(key)) { data.make = val; break; }
  }

  const modelKeywords = ["golf", "passat", "polo", "tiguan", "a3", "a4", "a6", "q5", "q7",
    "320d", "520d", "x3", "x5", "c220", "e220", "astra", "corsa", "insignia",
    "octavia", "fabia", "superb", "clio", "megane", "308", "3008", "508",
    "punto", "500", "focus", "fiesta", "mondeo", "corolla", "yaris", "tucson",
    "sportage", "duster", "logan", "leon", "ibiza"];

  for (const model of modelKeywords) {
    if (u.includes(model)) { data.model = model.charAt(0).toUpperCase() + model.slice(1); break; }
  }

  // Gorivo
  if (u.includes("tdi") || u.includes("cdi") || u.includes("cdti") || u.includes("dci") || u.includes("dizel") || u.includes("diesel")) data.fuel = "Dizel";
  else if (u.includes("tsi") || u.includes("tfsi") || u.includes("benzin")) data.fuel = "Benzin";
  else if (u.includes("hybrid")) data.fuel = "Hibrid";
  else if (u.includes("electr") || u.includes("ev")) data.fuel = "Električni";

  // Godiste iz URL-a
  const yearMatch = u.match(/(20[0-2]\d)/);
  if (yearMatch) data.year = parseInt(yearMatch[1]);

  return data;
}


// ============================================================
// HELPER
// ============================================================
function cleanText(str) {
  return str
    .replace(/<[^>]*>/g, "")        // Ukloni HTML tagove
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")           // Višestruki razmaci u jedan
    .trim();
}
