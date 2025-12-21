/**
 * wordlink – minimal client-side app
 *
 * Modes:
 * - hide-cz: hides Czech, shows EN + VI
 * - hide-envi: hides EN + VI, shows Czech
 * - hide-vi: hides Vietnamese, shows CZ + EN
 * - show-all: shows everything
 *
 * In hidden modes, the covered fields reveal while press / long-press is held.
 */

const STORAGE_KEY = "wordlink_progress_v1";
const ROLE_KEY = "wordlink_role_v1";
const MEMORY_HOOK_KEY = "wordlink_memory_hooks_v1";

// Spaced-repetition stages (0 = new/forgotten, then growing intervals)
const STAGES = [
  { id: 0, name: "New / forgotten", intervalMs: 0 }, // learn now
  { id: 1, name: "1 minute", intervalMs: 1 * 60 * 1000 },
  { id: 2, name: "10 minutes", intervalMs: 10 * 60 * 1000 },
  { id: 3, name: "1 hour", intervalMs: 60 * 60 * 1000 },
  { id: 4, name: "8 hours", intervalMs: 8 * 60 * 60 * 1000 },
  { id: 5, name: "1 day", intervalMs: 24 * 60 * 60 * 1000 },
  
  { id: 6, name: "3 days", intervalMs: 3 * 24 * 60 * 60 * 1000 },
  { id: 7, name: "7 days", intervalMs: 7 * 24 * 60 * 60 * 1000 },
  { id: 8, name: "14 days", intervalMs: 14 * 24 * 60 * 60 * 1000 },

  { id: 9, name: "30 days", intervalMs: 30 * 24 * 60 * 60 * 1000 },
  { id: 10, name: "60 days", intervalMs: 60 * 24 * 60 * 60 * 1000 },
];

/** @type {{ cz: string; en: string; vi: string; section?: string; czPron?: string; viPron?: string; czAudio?: string | string[]; viAudio?: string | string[]; czHint?: string; viHint?: string }[]} */
const PHRASES = [
  {
    cz: "Dobrý den",
    en: "Good day",
    vi: "Xin chào",
    czPron: "DO-bri den",
    viPron: "sin čao",
    // Audio variants for greeting
    czAudio: "speech/cz/dobry-den.mp3",
  },
  {
    cz: "Děkuji 🙏",
    en: "Thank you",
    vi: "Cảm ơn",
    czPron: "DĚ-ku-ji",
    viPron: "kam ən",
    viHint: "(dê) (cú) (gì): goat bows head.",
    czAudio: "speech/cz/dekuji.mp3",
  },
  {
    cz: "Prosím 🙏",
    en: "Please",
    vi: "Làm ơn",
    czPron: "PRO-sím",
    viPron: "lam ən",
    czHint: "Lám on: lampa bliká.",
    czAudio: "speech/cz/prosim.mp3",
  },
  {
    cz: "Jak se máte? 🙂",
    en: "How are you?",
    vi: "Bạn khỏe không?",
    czPron: "JAK se MÁ-te?",
    viPron: "ban kchue khong",
    czHint: "Banán křupe, Kong zívá.",
    czAudio: "speech/cz/jak-se-mate.mp3",
    viAudio: "speech/vi/ban-khoe-khong.mp3",
  },
  {
    cz: "Posaďte se, prosím. 💺",
    en: "Please sit down.",
    vi: "Mời bạn ngồi.",
    czPron: "PO-sať-te se PRO-sím",
    viPron: "moi ban ngoi",
    czAudio: "speech/cz/posadte-se-prosim.mp3",
    viAudio: "speech/vi/xin-moi-ngoi.mp3",
  },
  {
    cz: "Bolí to? 😬",
    en: "Does it hurt?",
    vi: "Có đau không?",
    czPron: "BO-lí to?",
    viPron: "ko dau khong",
    viHint: "(Boli)via country with injured knee",
    czAudio: "speech/cz/boli-to.mp3",
    viAudio: "speech/vi/co-djau-khong.mp3",
  },
  {
    cz: "Tady? 👉",
    en: "Here?",
    vi: "Ở đây hả?",
    czPron: "TA-di?",
    viPron: "a daj ha",
    viHint: "Ta đi? finger points at map.",
    czHint: "A dej hák; někdo po mně chce hák",
    czAudio: "speech/cz/tady.mp3",
    viAudio: "speech/vi/o-djay.mp3",
  },
  {
    cz: "Nashle / Na shledanou 👋",
    en: "Goodbye",
    vi: "Tạm biệt",
    czPron: "NA-shle / NA skhle-da-no",
    viPron: "tam biet",
    czHint: "Tam běž; pusa a mávnutí.",
    czAudio: "speech/cz/na-shledanou.mp3",
    viAudio: "speech/vi/tam-biet.mp3",
  },
  {
    cz: "Máte představu? 💡",
    en: "Do you have an idea?",
    vi: "Bạn có ý tưởng gì không?",
    czPron: "MÁ-te PŘED-sta-vu?",
    viPron: "ban ko i tuong zi khong",
    czAudio: "speech/cz/mate-predstavu.mp3",
    viAudio: "speech/vi/ban-co-y-tuong-gi-khong.mp3",
  },
  {
    cz: "Jakou barvu? 🎨",
    en: "What colour?",
    vi: "Màu nào?",
    czPron: "JA-kou BAR-vu?",
    viPron: "mau nao",
    czHint: "Mňau! Nao! kočka kouše pastelku.",
    czAudio: "speech/cz/jakou-barvu.mp3",
  },

  {
    cz: "Tvar (nehtu)",
    en: "(Nail) shape",
    vi: "Hình dạng (móng)",
    czPron: "TVAR (NE-tu)",
    viPron: "hin jang mong",
    viHint: "(TV) b(ar)",
    czAudio: "speech/cz/tvar-nehtu.mp3",
  },
  {
    cz: "Kulatý ⭕",
    en: "Round",
    vi: "Tròn",
    czPron: "KU-la-tý",
    viPron: "tron",
    czAudio: "speech/cz/kulaty.mp3",
  },
  {
    cz: "Hranatý ⬛",
    en: "Square",
    vi: "Vuông",
    czPron: "HRA-na-tý",
    viPron: "vuong",
    viHint: "Hạt nát",
    czHint: "Vůně písmena g",
    czAudio: "speech/cz/hranaty.mp3",
  },
  {
    cz: "Lak",
    en: "Nail polish",
    vi: "Sơn móng",
    czPron: "LAK",
    viPron: "son mong",
    viHint: "Lắc! shaking with hand",
    czHint: "Syn mongola",
    czAudio: "speech/cz/lak.mp3",
  },
  {
    cz: "Manikúra 💅",
    en: "Manicure",
    vi: "Làm móng tay",
    czPron: "MA-ni-kú-ra",
    viPron: "lam mong taj",
    viHint: "Ma-ni cưa",
    czAudio: "speech/cz/manikura.mp3",
    viAudio: "speech/vi/lam-mong-tay.mp3",
  },
  {
    cz: "Pedikúra 🦶",
    en: "Pedicure",
    vi: "Chăm sóc chân",
    czPron: "PE-di-kú-ra",
    viPron: "čam sok čan",
    czAudio: "speech/cz/pedikura.mp3",
    viAudio: "speech/vi/lam-mong-chan.mp3",
  },
  {
    cz: "Gelové nehty ✨",
    en: "Gel nails",
    vi: "Móng gel",
    czPron: "GE-lo-vé NE-ty",
    viPron: "mong gel",
    czAudio: "speech/cz/gelove-nehty.mp3",
    viAudio: "speech/vi/mong-gel.mp3",
  },
  {
    cz: "Hotovo ✅",
    en: "Finished / Done",
    vi: "Xong rồi",
    czPron: "HO-to-vo",
    viPron: "xong zoj",
    czAudio: "speech/cz/hotovo.mp3",
    viAudio: "speech/vi/xong-roi.mp3",
  },
  {
    cz: "Ruka / Ruce",
    en: "Hand / Hands",
    vi: "Tay / Hai tay",
    czPron: "RU-ka / RU-ce",
    viPron: "taj / haj taj",
    czAudio: ["speech/cz/ruka.mp3", "speech/cz/ruce.mp3"],
    viAudio: ["speech/vi/tay.mp3", "speech/vi/hai-tay.mp3"],
  },
  {
    cz: "Noha / Nohy",
    en: "Foot / Feet",
    vi: "Chân / Hai chân",
    czPron: "NO-ha / NO-hy",
    viPron: "čan / haj čan",
    czAudio: ["speech/cz/noha.mp3", "speech/cz/nohy.mp3"],
    viAudio: ["speech/vi/chan.mp3", "speech/vi/hai-chan.mp3"],
  },
  {
    cz: "Nehet / Nehty",
    en: "Nail / Nails",
    vi: "Móng tay / Móng",
    czPron: "NE-het / NE-ty",
    viPron: "mong taj / mong",
    czAudio: ["speech/cz/nehet.mp3", "speech/cz/nehty.mp3"],
    viAudio: "speech/vi/mong-tay.mp3",
  },
  {
    cz: "Pilník",
    en: "Nail file",
    vi: "Cây dũa móng",
    czPron: "PIL-ník",
    viPron: "kaj zua mong",
    czAudio: "speech/cz/pilnik.mp3",
    viAudio: "speech/vi/dua.mp3",
  },
  {
    cz: "Nůžky ✂️",
    en: "Scissors",
    vi: "Cái kéo",
    czPron: "NŮŠ-ky",
    viPron: "kaj keo",
    czAudio: "speech/cz/nuzky.mp3",
    viAudio: "speech/vi/keo.mp3",
  },
  {
    cz: "Suché",
    en: "Dry",
    vi: "Khô",
    czPron: "SU-ché",
    viPron: "kho",
    czAudio: "speech/cz/suche.mp3",
    viAudio: "speech/vi/kho.mp3",
  },
  {
    cz: "Mokré",
    en: "Wet",
    vi: "Ướt",
    czPron: "MO-kré",
    viPron: "uot",
    czAudio: "speech/cz/mokre.mp3",
    viAudio: "speech/vi/uot.mp3",
  },
  {
    cz: "Voda 💧",
    en: "Water",
    vi: "Nước",
    czPron: "VO-da",
    viPron: "nuok",
    czAudio: "speech/cz/voda.mp3",
    viAudio: "speech/vi/nuoc.mp3",
  },

  {
    section: "🎨 BARVY A ČAS",
    cz: "Barva",
    en: "Color",
    vi: "Màu sắc",
    czPron: "BAR-va",
    viPron: "mau sak",
    viHint: "Bar va; on the bar and my friend",
    czHint: "Mňau sáček; pastelky se rozsypou.",
    czAudio: "speech/cz/barva.mp3",
    viAudio: "speech/vi/mau-sac.mp3",
  },
  {
    cz: "Červená 🔴",
    en: "Red",
    vi: "Đỏ",
    czPron: "ČER-ve-ná",
    viPron: "do",
    czAudio: "speech/cz/cervena.mp3",
    viAudio: "speech/vi/djo.mp3",
  },
  {
    cz: "Růžová 🌸",
    en: "Pink",
    vi: "Hồng",
    czPron: "RŮ-žo-vá",
    viPron: "hong",
    czAudio: "speech/cz/ruzova.mp3",
    viAudio: "speech/vi/hong.mp3",
  },
  {
    cz: "Černá ⚫",
    en: "Black",
    vi: "Đen",
    czPron: "ČER-ná",
    viPron: "den",
    czAudio: "speech/cz/cerna.mp3",
    viAudio: "speech/vi/djen.mp3",
  },
  {
    cz: "Bílá ⚪",
    en: "White",
    vi: "Trắng",
    czPron: "BÍ-lá",
    viPron: "čang",
    czAudio: "speech/cz/bila.mp3",
    viAudio: "speech/vi/trang.mp3",
  },
  {
    cz: "Dnes 📅",
    en: "Today",
    vi: "Hôm nay",
    czPron: "DNES",
    viPron: "hom naj",
    viAudio: "speech/vi/hom-nay.mp3",
  },
  {
    cz: "Zítra ⏭️",
    en: "Tomorrow",
    vi: "Ngày mai",
    czPron: "ZÍ-tra",
    viPron: "ngaj maj",
    czAudio: "speech/cz/zitra.mp3",
    viAudio: "speech/vi/ngay-mai.mp3",
  },

  {
    section: "PENÍZE A PLATBA",
    cz: "Cena / Kolik to stojí? 💵",
    en: "Price / How much does it cost?",
    vi: "Giá bao nhiêu?",
    czPron: "CE-na / KO-lik to STO-jí?",
    viPron: "za bao nju",
    czAudio: ["speech/cz/cena.mp3", "speech/cz/kolik-to-stoji.mp3"],
    viAudio: ["speech/vi/gia.mp3", "speech/vi/bao-nhieu-tien.mp3"],
  },
  {
    cz: "Můžete platit.",
    en: "You can pay.",
    vi: "Bạn có thể thanh toán.",
    czPron: "MŮ-že-te PLA-tit",
    viPron: "ban ko tche tan toan",
    czAudio: "speech/cz/muzete-platit.mp3",
    viAudio: "speech/vi/ban-co-the-thanh-toan.mp3",
  },
  {
    cz: "Hotově 💶",
    en: "Cash",
    vi: "Tiền mặt",
    czPron: "HO-to-vě",
    viPron: "tjen mat",
    czAudio: "speech/cz/hotove.mp3",
    viAudio: "speech/vi/tien-mat.mp3",
  },
  {
    cz: "Kartou 💳",
    en: "By card",
    vi: "Bằng thẻ",
    czPron: "KAR-tou",
    viPron: "bang te",
    czAudio: "speech/cz/kartou.mp3",
    viAudio: "speech/vi/the.mp3",
  },
  {
    cz: "Perfektní ✨",
    en: "Perfect",
    vi: "Hoàn hảo",
    czPron: "PER-fek-tní",
    viPron: "hoan hao",
    czAudio: "speech/cz/perfektni.mp3",
    viAudio: "speech/vi/hoan-hao.mp3",
  },
  {
    cz: "Moment ⏱️",
    en: "Moment",
    vi: "Khoảnh khắc",
    czPron: "MO-ment",
    viPron: "khoanh khak",
    czAudio: "speech/cz/moment.mp3",
    viAudio: "speech/vi/mot-chut.mp3",
  },
  {
    cz: "Kafe ☕",
    en: "Coffee",
    vi: "Cà phê",
    czPron: "KA-fe",
    viPron: "ka fe",
    czAudio: "speech/cz/kafe.mp3",
    viAudio: "speech/vi/ca-phe.mp3",
  },
  {
    cz: "Klient (muž) / Klientka (žena)",
    en: "Client",
    vi: "Khách hàng",
    czPron: "KLI-ent / KLI-ent-ka",
    viPron: "khak hang",
    czAudio: ["speech/cz/klient.mp3", "speech/cz/klientka.mp3"],
    viAudio: ["speech/vi/khach-hang.mp3", "speech/vi/khach-hang-nu.mp3"],
  },
  {
    cz: "Salon",
    en: "Salon",
    vi: "Tiệm / Thẩm mỹ viện",
    czPron: "SA-lon",
    viPron: "tiem",
    czAudio: "speech/cz/salon.mp3",
    viAudio: "speech/vi/tiem.mp3",
  },
  {
    cz: "Design 🎨",
    en: "Design",
    vi: "Thiết kế",
    czPron: "DE-zajn",
    viPron: "thjet ke",
    czAudio: "speech/cz/design.mp3",
    viAudio: "speech/vi/thiet-ke.mp3",
  },
  {
    cz: "Problém ⚠️",
    en: "Problem",
    vi: "Vấn đề",
    czPron: "PRO-blém",
    viPron: "van de",
    czAudio: "speech/cz/problem.mp3",
    viAudio: "speech/vi/van-dje.mp3",
  },
  {
    cz: "Detail 🔍",
    en: "Detail",
    vi: "Chi tiết",
    czPron: "DE-tajl",
    viPron: "či tiet",
    viAudio: "speech/vi/chi-tiet.mp3",
  },
  {
    cz: "Materiál",
    en: "Material",
    vi: "Vật liệu",
    czPron: "MA-te-ri-ál",
    viPron: "vat lijeu",
    czAudio: "speech/cz/material.mp3",
    viAudio: "speech/vi/vat-lieu.mp3",
  },
  {
    cz: "Informace ℹ️",
    en: "Information",
    vi: "Thông tin",
    czPron: "IN-for-ma-ce",
    viPron: "thong tin",
    czAudio: "speech/cz/informace.mp3",
    viAudio: "speech/vi/thong-tin.mp3",
  },
  {
    cz: "Super 😄",
    en: "Super",
    vi: "Tuyệt vời",
    czPron: "SU-per",
    viPron: "tujet voj",
    czAudio: "speech/cz/super.mp3",
    viAudio: "speech/vi/tuyet-voi.mp3",
  },
  {
    cz: "Akryl",
    en: "Acrylic",
    vi: "Acrylic",
    czPron: "A-kryl",
    viPron: "ak-ril",
    czAudio: "speech/cz/akryl.mp3",
    viAudio: "speech/vi/acrylic.mp3",
  },
  {
    cz: "Gel",
    en: "Gel",
    vi: "Gel",
    czPron: "GEL",
    viPron: "zel",
    czAudio: "speech/cz/gel.mp3",
    viAudio: "speech/vi/gel.mp3",
  },

  {
    section: "ZÁKLADNÍ SLOVESA A ZÁJMENA",
    cz: "já",
    en: "I",
    vi: "tôi",
    czPron: "JÁ",
    viPron: "toj",
    czAudio: "speech/cz/ja.mp3",
    viAudio: "speech/vi/toi.mp3",
  },
  {
    cz: "ty",
    en: "you (singular)",
    vi: "bạn",
    czPron: "TI",
    viPron: "ban",
    czAudio: "speech/cz/ty.mp3",
  },
  {
    cz: "on",
    en: "he",
    vi: "anh ấy / ông ấy",
    czPron: "ON",
    viPron: "anh ej / ong ej",
    czAudio: "speech/cz/on.mp3",
    viAudio: ["speech/vi/anh-ay.mp3", "speech/vi/ong-ay.mp3"],
  },
  {
    cz: "ona",
    en: "she",
    vi: "cô ấy / bà ấy",
    czPron: "O-na",
    viPron: "ko ej / ba ej",
    czAudio: "speech/cz/ona.mp3",
    viAudio: ["speech/vi/co-ay.mp3", "speech/vi/ba-ay.mp3"],
  },
  {
    cz: "my",
    en: "we",
    vi: "chúng tôi",
    czPron: "MI",
    viPron: "čung toj",
    czAudio: "speech/cz/my.mp3",
    viAudio: "speech/vi/chung-toi.mp3",
  },
  {
    cz: "vy",
    en: "you (plural)",
    vi: "các bạn",
    czPron: "VI",
    viPron: "kak ban",
    czAudio: "speech/cz/vy.mp3",
    viAudio: "speech/vi/cac-ban.mp3",
  },
  {
    cz: "ano",
    en: "yes",
    vi: "vâng / có",
    czPron: "A-no",
    viPron: "vang / ko",
    czAudio: "speech/cz/ano.mp3",
    viAudio: ["speech/vi/vang.mp3", "speech/vi/co.mp3"],
  },
  {
    cz: "ne",
    en: "no",
    vi: "không",
    czPron: "NE",
    viPron: "kong",
    czAudio: "speech/cz/ne.mp3",
  },
  {
    cz: "špatný",
    en: "bad",
    vi: "xấu",
    czPron: "ŠPAT-ný",
    viPron: "sau",
    czAudio: "speech/cz/spatny.mp3",
    viAudio: "speech/vi/xau.mp3",
  },
  {
    cz: "mít",
    en: "to have",
    vi: "có",
    czPron: "MÍT",
    viPron: "ko",
    czAudio: "speech/cz/mit.mp3",
    viAudio: "speech/vi/co.mp3",
  },
  {
    cz: "být",
    en: "to be",
    vi: "là",
    czPron: "BÍT",
    viPron: "la",
    czAudio: "speech/cz/byt.mp3",
    viAudio: "speech/vi/la.mp3",
  },
  {
    cz: "dělat",
    en: "to do",
    vi: "làm",
    czPron: "DĚ-lat",
    viPron: "lam",
    czAudio: "speech/cz/delat.mp3",
  },
  {
    cz: "jít",
    en: "to go",
    vi: "đi",
    czPron: "JÍT",
    viPron: "dji",
    czAudio: "speech/cz/jit.mp3",
    viAudio: "speech/vi/dji.mp3",
  },
  {
    cz: "chtít",
    en: "to want",
    vi: "muốn",
    czPron: "CHTÍT",
    viPron: "muon",
    czAudio: "speech/cz/chtit.mp3",
    viAudio: "speech/vi/muon.mp3",
  },
  {
    cz: "moci",
    en: "can / to be able",
    vi: "có thể",
    czPron: "MO-ci",
    viPron: "ko te",
    czAudio: "speech/cz/moci.mp3",
  },
  {
    cz: "potřebovat",
    en: "to need",
    vi: "cần",
    czPron: "PO-tře-bo-vat",
    viPron: "kan",
    czAudio: "speech/cz/potrebovat.mp3",
    viAudio: "speech/vi/can.mp3",
  },
  {
    cz: "tam",
    en: "there",
    vi: "ở đó",
    czPron: "TAM",
    viPron: "o djo",
    czAudio: "speech/cz/tam.mp3",
    viAudio: "speech/vi/o-djo.mp3",
  },
  {
    cz: "teď",
    en: "now",
    vi: "bây giờ",
    czPron: "TEĎ",
    viPron: "bej zo",
    czAudio: "speech/cz/ted.mp3",
    viAudio: "speech/vi/bay-gio.mp3",
  },
  {
    cz: "čas",
    en: "time",
    vi: "thời gian",
    czPron: "ČAS",
    viPron: "toj zan",
    czAudio: "speech/cz/cas.mp3",
    viAudio: "speech/vi/thoi-gian.mp3",
  },
  {
    cz: "peníze",
    en: "money",
    vi: "tiền",
    czPron: "PE-ní-ze",
    viPron: "tien",
    czAudio: "speech/cz/penize.mp3",
  },
  {
    cz: "práce",
    en: "work",
    vi: "công việc",
    czPron: "PRÁ-ce",
    viPron: "kong viek",
    czAudio: "speech/cz/prace.mp3",
    viAudio: "speech/vi/cong-viec.mp3",
  },
  {
    cz: "dobře",
    en: "well / good",
    vi: "tốt",
    czPron: "DO-bře",
    viPron: "tot",
    czAudio: "speech/cz/dobre.mp3",
    viAudio: "speech/vi/tot.mp3",
  },
  {
    cz: "špatně",
    en: "badly",
    vi: "không tốt",
    czPron: "ŠPAT-ňe",
    viPron: "kong tot",
    czAudio: "speech/cz/spatne.mp3",
  },

  {
    section: "NEHTOVÉ STUDIO - DODATEČNÁ SLOVÍČKA",
    cz: "prsty",
    en: "fingers",
    vi: "ngón tay",
    czPron: "PRS-ty",
    viPron: "ngon taj",
    czAudio: "speech/cz/prsty.mp3",
    viAudio: "speech/vi/ngon-tay.mp3",
  },
  {
    cz: "kůžička",
    en: "cuticle",
    vi: "da quanh móng",
    czPron: "KŮ-žič-ka",
    viPron: "za kuanh mong",
    czAudio: "speech/cz/kuzicka.mp3",
  },
  {
    cz: "délka",
    en: "length",
    vi: "độ dài",
    czPron: "DÉL-ka",
    viPron: "do zaj",
    czAudio: "speech/cz/delka.mp3",
    viAudio: "speech/vi/djo-dai.mp3",
  },
  {
    cz: "krátké",
    en: "short",
    vi: "ngắn",
    czPron: "KRÁT-ké",
    viPron: "ngan",
    czAudio: "speech/cz/kratke.mp3",
    viAudio: "speech/vi/ngan.mp3",
  },
  {
    cz: "dlouhé",
    en: "long",
    vi: "dài",
    czPron: "DLOU-hé",
    viPron: "zaj",
    czAudio: "speech/cz/dlouhe.mp3",
    viAudio: "speech/vi/dai.mp3",
  },
  {
    cz: "lampa",
    en: "lamp",
    vi: "đèn",
    czPron: "LAM-pa",
    viPron: "djen",
    czAudio: "speech/cz/lampa.mp3",
    viAudio: "speech/vi/djen.mp3",
  },
  {
    cz: "chvilku",
    en: "a moment",
    vi: "một chút",
    czPron: "CHVIL-ku",
    viPron: "mot čut",
    czAudio: "speech/cz/chvilku.mp3",
    viAudio: "speech/vi/mot-chut.mp3",
  },
  {
    cz: "opravit",
    en: "to fix",
    vi: "sửa",
    czPron: "O-pra-vit",
    viPron: "sua",
    czAudio: "speech/cz/opravit.mp3",
    viAudio: "speech/vi/sua.mp3",
  },
  {
    cz: "zkrátit",
    en: "to shorten",
    vi: "cắt ngắn",
    czPron: "ZKRÁ-tit",
    viPron: "kat ngan",
    czAudio: "speech/cz/zkratit.mp3",
    viAudio: "speech/vi/cat-ngan.mp3",
  },
  {
    cz: "prodloužit",
    en: "to lengthen",
    vi: "làm dài",
    czPron: "PRO-dlou-žit",
    viPron: "lam zaj",
    czAudio: "speech/cz/prodlouzit.mp3",
    viAudio: "speech/vi/lam-dai.mp3",
  },
  {
    cz: "změna",
    en: "change",
    vi: "thay đổi",
    czPron: "ZMĚ-na",
    viPron: "thaj doj",
    czAudio: "speech/cz/zmena.mp3",
    viAudio: "speech/vi/thay-djoi.mp3",
  },
  {
    cz: "líbí se",
    en: "to like",
    vi: "thích",
    czPron: "LÍ-bí se",
    viPron: "thik",
    czAudio: "speech/cz/libi-se.mp3",
    viAudio: "speech/vi/thich.mp3",
  },
  {
    cz: "nelíbí se",
    en: "to not like",
    vi: "không thích",
    czPron: "NE-lí-bí se",
    viPron: "kong thik",
    czAudio: "speech/cz/nelibi-se.mp3",
  },
  {
    cz: "levné",
    en: "cheap",
    vi: "rẻ",
    czPron: "LEV-né",
    viPron: "ze",
    czAudio: "speech/cz/levne.mp3",
    viAudio: "speech/vi/re.mp3",
  },
  {
    cz: "drahé",
    en: "expensive",
    vi: "đắt",
    czPron: "DRA-hé",
    viPron: "dat",
    czAudio: "speech/cz/drahe.mp3",
    viAudio: "speech/vi/djat.mp3",
  },
  {
    cz: "čisté",
    en: "clean",
    vi: "sạch",
    czPron: "ČIS-té",
    viPron: "sach",
    czAudio: "speech/cz/ciste.mp3",
    viAudio: "speech/vi/sach.mp3",
  },
  {
    cz: "dezinfekce",
    en: "disinfection",
    vi: "khử trùng",
    czPron: "DE-zin-fek-ce",
    viPron: "khu čung",
    czAudio: "speech/cz/dezinfekce.mp3",
    viAudio: "speech/vi/khu-trung.mp3",
  },
  {
    cz: "zákaznice",
    en: "customer (female)",
    vi: "khách hàng",
    czPron: "ZÁ-kaz-ni-ce",
    viPron: "kach hang",
    czAudio: "speech/cz/zakaznice.mp3",
    viAudio: "speech/vi/khach-hang.mp3",
  },

  // Basic Phrases
  {
    cz: "Je to v pořádku",
    en: "It's okay",
    vi: "Không sao",
    czPron: "JE to v po-ŘÁD-ku",
    viPron: "chom sao",
    czAudio: "speech/cz/je-to-v-poradku.mp3",
    viAudio: "speech/vi/khong-sao.mp3",
  },
  {
    cz: "Ano, rozumím",
    en: "Yes, I understand",
    vi: "Vâng, tôi hiểu",
    czPron: "A-no ro-ZU-mím",
    viPron: "vang toj hieu",
    czAudio: "speech/cz/ano-rozumim.mp3",
    viAudio: "speech/vi/vang-toi-hieu.mp3",
  },
  {
    cz: "Ne, nerozumím",
    en: "No, I don't understand",
    vi: "Không, tôi không hiểu",
    czPron: "NE ne-ro-ZU-mím",
    viPron: "chom toj chom hieu",
    czAudio: "speech/cz/ne-nerozumim.mp3",
    viAudio: "speech/vi/khong-toi-khong-hieu.mp3",
  },
  {
    cz: "Můžete to zopakovat?",
    en: "Can you repeat it?",
    vi: "Bạn có thể nhắc lại không?",
    czPron: "MŮ-že-te to zo-pa-KO-vat",
    viPron: "ban ko tche ňak laj chom",
    czAudio: "speech/cz/muzete-to-zopakovat.mp3",
    viAudio: "speech/vi/ban-co-the-nhac-lai-khong.mp3",
  },
  {
    cz: "Mluvte prosím pomalu",
    en: "Please speak slowly",
    vi: "Làm ơn nói chậm",
    czPron: "MLUV-te PRO-sím po-MA-lu",
    viPron: "lam ən noj čam",
    czAudio: "speech/cz/mluvte-prosim-pomalu.mp3",
    viAudio: "speech/vi/lam-on-noi-cham.mp3",
  },
  {
    cz: "Počkejte prosím chvilku",
    en: "Please wait a moment",
    vi: "Làm ơn chờ một chút",
    czPron: "POČ-kej-te chvil-ku",
    viPron: "lam ən čo mot čut",
    czAudio: "speech/cz/pockejte-prosim-chvilku.mp3",
    viAudio: "speech/vi/lam-on-cho-mot-chut.mp3",
  },
  {
    cz: "Teď nemám čas",
    en: "I don't have time now",
    vi: "Bây giờ tôi không có thời gian",
    czPron: "TEĎ ne-mám čas",
    viPron: "baj zə toj chom ko thoj zan",
    czAudio: "speech/cz/ted-nemam-cas.mp3",
    viAudio: "speech/vi/bay-gio-toi-khong-co-thoi-gian.mp3",
  },
  {
    cz: "Teď je to možné",
    en: "It's possible now",
    vi: "Bây giờ được",
    czPron: "TEĎ je to MOŽ-né",
    viPron: "baj zə duk",
    czAudio: "speech/cz/ted-je-to-mozne.mp3",
    viAudio: "speech/vi/bay-gio-djuoc.mp3",
  },
  {
    cz: "Chci se zeptat",
    en: "I want to ask",
    vi: "Tôi muốn hỏi",
    czPron: "CHCI se ZEP-tat",
    viPron: "toj muon hoj",
    czAudio: "speech/cz/chci-se-zeptat.mp3",
    viAudio: "speech/vi/toi-muon-hoi.mp3",
  },
  {
    cz: "Kolik to stojí?",
    en: "How much is it?",
    vi: "Bao nhiêu tiền?",
    czPron: "KO-lik to STO-jí",
    viPron: "bao ňjeu tien",
    czAudio: "speech/cz/kolik-to-stoji.mp3",
    viAudio: "speech/vi/bao-nhieu-tien.mp3",
  },
  {
    cz: "Kde to je?",
    en: "Where is it?",
    vi: "Ở đâu?",
    czPron: "GDE to je",
    viPron: "ə dau",
    czAudio: "speech/cz/kde-to-je.mp3",
    viAudio: "speech/vi/o-djau.mp3",
  },
  {
    cz: "Kdy to bude?",
    en: "When will it be?",
    vi: "Khi nào?",
    czPron: "GDI to BU-de",
    viPron: "chi nao",
    czAudio: "speech/cz/kdy-to-bude.mp3",
    viAudio: "speech/vi/khi-nao.mp3",
  },
  {
    cz: "Dnes to stačí",
    en: "That's enough for today",
    vi: "Hôm nay như vậy đủ rồi",
    czPron: "DNES to STA-čí",
    viPron: "hom naj ňu vaj du zoj",
    czAudio: "speech/cz/dnes-to-staci.mp3",
    viAudio: "speech/vi/hom-nay-nhu-vay-dju-roi.mp3",
  },
  {
    cz: "Zítra to bude lepší",
    en: "Tomorrow will be better",
    vi: "Ngày mai sẽ tốt hơn",
    czPron: "ZÍT-ra to BU-de LEP-ší",
    viPron: "ngaj maj se tot hon",
    czAudio: "speech/cz/zitra-to-bude-lepsi.mp3",
    viAudio: "speech/vi/ngay-mai-se-tot-hon.mp3",
  },
  {
    cz: "To je dobré",
    en: "That's good",
    vi: "Như vậy tốt",
    czPron: "TO je DO-bré",
    viPron: "ňu vaj tot",
    czAudio: "speech/cz/to-je-dobre.mp3",
    viAudio: "speech/vi/nhu-vay-tot.mp3",
  },
  {
    cz: "To není dobré",
    en: "That's not good",
    vi: "Không tốt",
    czPron: "TO NE-ní DO-bré",
    viPron: "chom tot",
    czAudio: "speech/cz/to-neni-dobre.mp3",
    viAudio: "speech/vi/khong-tot.mp3",
  },

  // Basic Phrases Nails
  {
    cz: "Můžete se posadit",
    en: "You can sit down",
    vi: "Bạn có thể ngồi",
    czPron: "MŮ-že-te se po-SA-dit",
    viPron: "ban ko tche ngoj",
    czAudio: "speech/cz/muzete-se-posadit.mp3",
    viAudio: "speech/vi/ban-co-the-ngoi.mp3",
  },
  {
    cz: "Začneme teď",
    en: "We will start now",
    vi: "Bắt đầu bây giờ",
    czPron: "ZAČ-ne-me teď",
    viPron: "bat dau baj zə",
    czAudio: "speech/cz/zacneme-ted.mp3",
    viAudio: "speech/vi/bat-djau-bay-gio.mp3",
  },
  {
    cz: "Už je to hotové",
    en: "It's finished",
    vi: "Xong rồi",
    czPron: "UŽ je to HO-to-vé",
    viPron: "song zoj",
    czAudio: "speech/cz/uz-je-to-hotove.mp3",
    viAudio: "speech/vi/xong-roi.mp3",
  },
  {
    cz: "Počkejte prosím chvilku",
    en: "Please wait a moment",
    vi: "Làm ơn chờ một chút",
    czPron: "POČ-kej-te chvil-ku",
    viPron: "lam ən čo mot čut",
    czAudio: "speech/cz/pockejte-prosim-chvilku.mp3",
    viAudio: "speech/vi/lam-on-cho-mot-chut.mp3",
  },
  {
    cz: "Nebude to bolet",
    en: "It won't hurt",
    vi: "Không đau đâu",
    czPron: "NE-bu-de to BO-let",
    viPron: "chom zau dau",
    czAudio: "speech/cz/nebude-to-bolet.mp3",
    viAudio: "speech/vi/khong-djau-djau.mp3",
  },
  {
    cz: "Líbí se vám to?",
    en: "Do you like it?",
    vi: "Bạn có thích không?",
    czPron: "LÍ-bí se vám to",
    viPron: "ban ko thik chom",
    czAudio: "speech/cz/libi-se-vam-to.mp3",
    viAudio: "speech/vi/ban-co-thich-khong.mp3",
  },
  {
    cz: "Je to hezké?",
    en: "Is it nice?",
    vi: "Đẹp không?",
    czPron: "JE to HEZ-ké",
    viPron: "dep chom",
    czAudio: "speech/cz/je-to-hezke.mp3",
    viAudio: "speech/vi/djep-khong.mp3",
  },
  {
    cz: "Chcete jinou barvu?",
    en: "Do you want another color?",
    vi: "Bạn muốn màu khác không?",
    czPron: "CHCE-te JI-nou BAR-vu",
    viPron: "ban muon mau chac chom",
    czAudio: "speech/cz/chcete-jinou-barvu.mp3",
    viAudio: "speech/vi/ban-muon-mau-khac-khong.mp3",
  },
  {
    cz: "Krátké nebo dlouhé?",
    en: "Shorter or longer?",
    vi: "Ngắn hay dài?",
    czPron: "KRÁT-ké ne-bo DLOU-hé?",
    viPron: "ngan haj zaj",
    czAudio: "speech/cz/kratke-nebo-dlouhe.mp3",
    viAudio: "speech/vi/ngan-hay-dai.mp3",
  },
  {
    cz: "Uděláme to kratší",
    en: "We will make it shorter",
    vi: "Làm ngắn lại",
    czPron: "U-DĚ-lá-me to KRAT-ší",
    viPron: "lam ngan laj",
    czAudio: "speech/cz/udelame-to-kratsi.mp3",
    viAudio: "speech/vi/lam-ngan-lai.mp3",
  },
  {
    cz: "Uděláme to delší",
    en: "We will make it longer",
    vi: "Làm dài hơn",
    czPron: "U-DĚ-lá-me to DEL-ší",
    viPron: "lam zaj hon",
    czAudio: "speech/cz/udelame-to-delsi.mp3",
    viAudio: "speech/vi/lam-dai-hon.mp3",
  },
  {
    cz: "Necháme to takto",
    en: "We'll leave it like this",
    vi: "Giữ như vậy",
    czPron: "NE-CHÁ-me to TAK-to",
    viPron: "zu ňu vaj",
    czAudio: "speech/cz/nechame-to-takto.mp3",
    viAudio: "speech/vi/giu-nhu-vay.mp3",
  },
  {
    cz: "Trochu to upravím",
    en: "I'll adjust it a bit",
    vi: "Sửa một chút",
    czPron: "TRO-chu to U-PRA-vím",
    viPron: "sua mot čut",
    czAudio: "speech/cz/trochu-to-upravim.mp3",
    viAudio: "speech/vi/sua-mot-chut.mp3",
  },
  {
    cz: "Musíme to opravit",
    en: "We need to fix it",
    vi: "Cần sửa lại",
    czPron: "MU-sí-me to O-PRA-vit",
    viPron: "kan sua laj",
    czAudio: "speech/cz/musime-to-opravit.mp3",
    viAudio: "speech/vi/can-sua-lai.mp3",
  },
  {
    cz: "Cena je tady",
    en: "The price is here",
    vi: "Giá là thế này",
    czPron: "CE-na je TA-dy",
    viPron: "za la the naj",
    czAudio: "speech/cz/cena-je-tady.mp3",
    viAudio: "speech/vi/gia-la-the-nay.mp3",
  },
  {
    cz: "Je to trochu drahé",
    en: "It's a bit expensive",
    vi: "Hơi đắt",
    czPron: "JE to TRO-chu DRA-hé",
    viPron: "hoj dat",
    czAudio: "speech/cz/je-to-trochu-drahe.mp3",
    viAudio: "speech/vi/hoi-djat.mp3",
  },
  {
    cz: "Je to levnější",
    en: "It's cheaper",
    vi: "Rẻ hơn",
    czPron: "JE to LEV-něj-ší",
    viPron: "re hon",
    czAudio: "speech/cz/je-to-levnejsi.mp3",
    viAudio: "speech/vi/re-hon.mp3",
  },
  {
    cz: "Bude to trvat chvíli",
    en: "It will take a while",
    vi: "Sẽ mất một chút thời gian",
    czPron: "BU-de to TR-vat CHVÍ-li",
    viPron: "se mat mot čut thoj zan",
    czAudio: "speech/cz/bude-to-trvat-chvili.mp3",
    viAudio: "speech/vi/se-mat-mot-chut-thoi-gian.mp3",
  },
  {
    cz: "Děkuji, nashledanou",
    en: "Thank you, goodbye",
    vi: "Cảm ơn, hẹn gặp lại",
    czPron: "DĚ-ku-ji na-SCHLE-da-nou",
    viPron: "kam ən hen gap laj",
    czAudio: "speech/cz/dekuji-nashledanou.mp3",
    viAudio: "speech/vi/cam-on-hen-gap-lai.mp3",
  },
];

let currentMode = null; // legacy, no direct button binding now
let lastMovedIndex = null;
let currentRole = loadRole(); // "cz" or "vi"
let modeIndex = 0; // 0 or 1 depending on role
let showAll = false; // when true, always show everything

// Single shared audio element for playback
let currentAudio = null;

function playAudio(src) {
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    currentAudio = new Audio(src);
    currentAudio.play().catch(() => {
      // ignore playback errors (e.g., user gesture requirements)
    });
  } catch {
    // ignore
  }
}

/**
 * Load progress map from localStorage.
 * Shape: { [index: string]: { categoryIndex: number; lastKnownAt?: number; lastUnknownAt?: number; knownCount: number; unknownCount: number } }
 */
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveProgress(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

const progressMap = loadProgress();
let currentTab = "all"; // "all" | "ready"

/**
 * Load memory hooks from localStorage.
 * Shape: { [index: string]: string }
 */
function loadMemoryHooks() {
  try {
    const raw = localStorage.getItem(MEMORY_HOOK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMemoryHooks(map) {
  try {
    localStorage.setItem(MEMORY_HOOK_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

const memoryHooksMap = loadMemoryHooks();

function getMemoryHook(index) {
  return memoryHooksMap[String(index)] || "";
}

/**
 * Get a suggested (built-in) sound mnemonic for the current learner role.
 * This is only meant as a fallback when the user hasn't written their own hook.
 */
function getSuggestedMemoryHook(index) {
  const phrase = PHRASES[index];
  if (!phrase) return "";
  if (currentRole === "vi") return phrase.viHint || "";
  if (currentRole === "cz") return phrase.czHint || "";
  return "";
}

function setMemoryHook(index, value) {
  const key = String(index);
  if (value && value.trim()) {
    memoryHooksMap[key] = value.trim();
  } else {
    delete memoryHooksMap[key];
  }
  saveMemoryHooks(memoryHooksMap);
}

function getProgress(index) {
  const key = String(index);
  const data = progressMap[key];
  if (data && typeof data.stageIndex === "number") {
    return data;
  }
  // migrate old shape with categoryIndex
  if (data && typeof data.categoryIndex === "number") {
    const migrated = {
      stageIndex: Math.max(0, Math.min(data.categoryIndex, STAGES.length - 1)),
      knownCount: data.knownCount || 0,
      unknownCount: data.unknownCount || 0,
      lastKnownAt: data.lastKnownAt,
      lastUnknownAt: data.lastUnknownAt,
      nextDueAt: data.nextDueAt,
    };
    progressMap[String(index)] = migrated;
    return migrated;
  }
  return {
    stageIndex: 0,
    knownCount: 0,
    unknownCount: 0,
  };
}

function isDue(progress) {
  if (!progress || progress.stageIndex === 0) return false;
  if (!progress.nextDueAt) return false;
  return Date.now() >= progress.nextDueAt;
}

function loadRole() {
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    if (raw === "cz" || raw === "vi") return raw;
  } catch {
    // ignore
  }
  return "vi";
}

function saveRole(role) {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // ignore
  }
}

/**
 * Create a language row (Czech / English / Vietnamese).
 * @param {string} label
 * @param {string} value
 * @param {"cz" | "en" | "vi"} langKey
 * @param {string | undefined} pron
 * @returns {HTMLElement}
 */
function createLangRow(label, value, langKey, pron) {
  const row = document.createElement("div");
  row.className = "phrase-row";

  const labelEl = document.createElement("div");
  labelEl.className = "lang-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "lang-value";

  const coverTarget = document.createElement("div");
  coverTarget.className = "cover-target";
  coverTarget.dataset.lang = langKey;

  const textWrapper = document.createElement("span");
  textWrapper.className = "lang-text";

  const mainSpan = document.createElement("span");
  mainSpan.textContent = value;
  textWrapper.appendChild(mainSpan);

  const shouldShowPron =
    (langKey === "cz" && currentRole === "vi") ||
    (langKey === "vi" && currentRole === "cz");

  if (pron && shouldShowPron) {
    const pronEl = document.createElement("span");
    pronEl.className = "pron-hint";
    pronEl.textContent = pron;
    textWrapper.appendChild(pronEl);
  }

  coverTarget.appendChild(textWrapper);
  valueEl.appendChild(coverTarget);

  row.appendChild(labelEl);
  row.appendChild(valueEl);

  return row;
}

/**
 * Attach press-and-hold behavior to a cover target.
 * In hidden modes, press reveals the text and release hides again.
 * @param {HTMLElement} el
 */
function attachPressHandlers(el) {
  let pressed = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isScrolling = false;
  let pressTimeout = null;
  let hasMoved = false;
  const SCROLL_THRESHOLD = 5; // pixels - reduced threshold for better scroll detection
  const PRESS_DELAY = 150; // ms - increased delay to better distinguish scrolls

  const setPressed = (value) => {
    pressed = value;
    if (pressed) {
      el.classList.add("is-pressed");
    } else {
      el.classList.remove("is-pressed");
    }
  };

  const onDown = (event) => {
    // For touch events, track initial position and time
    if (event.type === "touchstart" && event.touches.length > 0) {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchStartTime = Date.now();
      isScrolling = false;
      pressed = false;
      hasMoved = false;
      
      // Set a timeout to activate press if no movement (to handle press without movement)
      pressTimeout = setTimeout(() => {
        if (!isScrolling && !hasMoved && touchStartX !== 0) {
          setPressed(true);
        }
      }, PRESS_DELAY);
      
      // Don't preventDefault yet - wait to see if it's a scroll
      return;
    }
    
    // For mouse events, prevent default immediately
    event.preventDefault();
    setPressed(true);
  };

  const onMove = (event) => {
    if (event.type === "touchmove" && event.touches.length > 0 && touchStartX !== 0) {
      const deltaX = Math.abs(event.touches[0].clientX - touchStartX);
      const deltaY = Math.abs(event.touches[0].clientY - touchStartY);
      const totalDelta = Math.max(deltaX, deltaY);
      
      hasMoved = true;
      
      // If user moved at all, they might be scrolling - be more permissive
      if (totalDelta > SCROLL_THRESHOLD) {
        isScrolling = true;
        setPressed(false);
        if (pressTimeout) {
          clearTimeout(pressTimeout);
          pressTimeout = null;
        }
        // Don't preventDefault - allow scrolling
        return;
      }
      
      // Small movement detected - cancel press timeout and allow scroll
      // Only activate press if user holds still for the full delay
      if (pressTimeout && totalDelta > 2) {
        clearTimeout(pressTimeout);
        pressTimeout = null;
      }
      
      // Only prevent default if we're already in pressed state (user held still)
      if (!isScrolling && pressed) {
        // Already pressed, keep preventing default
        event.preventDefault();
      }
    }
  };

  const onUp = () => {
    if (pressTimeout) {
      clearTimeout(pressTimeout);
      pressTimeout = null;
    }
    setPressed(false);
    touchStartX = 0;
    touchStartY = 0;
    touchStartTime = 0;
    isScrolling = false;
    hasMoved = false;
  };

  el.addEventListener("mousedown", onDown);
  el.addEventListener("touchstart", onDown, { passive: true });
  el.addEventListener("touchmove", onMove, { passive: false });

  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);
  window.addEventListener("touchcancel", onUp);
}

/**
 * Calculate progress statistics.
 * @returns {Object} Statistics object
 */
function calculateProgressStats() {
  const stats = {
    total: PHRASES.length,
    byStage: STAGES.map(() => 0),
    totalKnown: 0,
    totalUnknown: 0,
    readyCount: 0,
    fresh: 0, // stages 1-5 (1min to 1 day)
    learning: 0, // stages 6-8 (3 days to 14 days)
    done: 0, // stages 9-10 (30 days to 60 days)
    new: 0, // stage 0
  };

  PHRASES.forEach((phrase, index) => {
    const prog = getProgress(index);
    const stageIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));
    
    stats.byStage[stageIdx] += 1;
    stats.totalKnown += prog.knownCount || 0;
    stats.totalUnknown += prog.unknownCount || 0;
    
    if (isDue(prog)) {
      stats.readyCount += 1;
    }
    
    if (stageIdx === 0) {
      stats.new += 1;
    } else if (stageIdx >= 1 && stageIdx <= 5) {
      stats.fresh += 1;
    } else if (stageIdx >= 6 && stageIdx <= 8) {
      stats.learning += 1;
    } else if (stageIdx >= 9) {
      stats.done += 1;
    }
  });

  return stats;
}

/**
 * Render simplified progress summary for main page.
 */
function renderProgressSummary() {
  const summaryEl = document.getElementById("progress-summary");
  if (!summaryEl) return;

  const stats = calculateProgressStats();
  
  summaryEl.innerHTML = `
    <span class="progress-summary-item fresh">
      <span class="progress-summary-label">fresh</span>
      <span class="progress-summary-value">(${stats.fresh})</span>
    </span>
    <span class="progress-summary-item learning">
      <span class="progress-summary-label">learning</span>
      <span class="progress-summary-value">(${stats.learning})</span>
    </span>
    <span class="progress-summary-item done">
      <span class="progress-summary-label">done</span>
      <span class="progress-summary-value">(${stats.done})</span>
    </span>
  `;
}

/**
 * Render progress overview in panel.
 */
function renderProgressOverview() {
  const panelContent = document.getElementById("progress-panel-content");
  if (!panelContent) return;

  panelContent.innerHTML = "";
  
  const stats = calculateProgressStats();
  const progressPercent = stats.total > 0 
    ? Math.round((stats.fresh + stats.learning + stats.done) / stats.total * 100) 
    : 0;

  const container = document.createElement("div");
  container.className = "progress-overview";

  // Header
  const header = document.createElement("div");
  header.className = "progress-header";
  const title = document.createElement("h1");
  title.textContent = "📊 Learning Progress";
  header.appendChild(title);
  container.appendChild(header);

  // Overall stats
  const overallStats = document.createElement("div");
  overallStats.className = "progress-stats-grid";
  
  const statCard = (label, value, subtitle = "") => {
    const card = document.createElement("div");
    card.className = "progress-stat-card";
    const valueEl = document.createElement("div");
    valueEl.className = "progress-stat-value";
    valueEl.textContent = value;
    const labelEl = document.createElement("div");
    labelEl.className = "progress-stat-label";
    labelEl.textContent = label;
    card.appendChild(valueEl);
    card.appendChild(labelEl);
    if (subtitle) {
      const subEl = document.createElement("div");
      subEl.className = "progress-stat-subtitle";
      subEl.textContent = subtitle;
      card.appendChild(subEl);
    }
    return card;
  };

  overallStats.appendChild(statCard("Total Words", stats.total));
  overallStats.appendChild(statCard("Progress", `${progressPercent}%`, `${stats.fresh + stats.learning + stats.done} / ${stats.total}`));
  overallStats.appendChild(statCard("Ready Now", stats.readyCount));
  overallStats.appendChild(statCard("Done", stats.done, `Stage 9-10`));
  
  container.appendChild(overallStats);

  // Learning status breakdown
  const statusSection = document.createElement("div");
  statusSection.className = "progress-section";
  const statusTitle = document.createElement("h2");
  statusTitle.textContent = "Learning Status";
  statusSection.appendChild(statusTitle);

  const statusGrid = document.createElement("div");
  statusGrid.className = "progress-status-grid";
  
  const newCard = document.createElement("div");
  newCard.className = "progress-status-card new";
  newCard.innerHTML = `
    <div class="progress-status-value">${stats.new}</div>
    <div class="progress-status-label">New / Not Started</div>
  `;
  
  const freshCard = document.createElement("div");
  freshCard.className = "progress-status-card fresh";
  freshCard.innerHTML = `
    <div class="progress-status-value">${stats.fresh}</div>
    <div class="progress-status-label">Fresh</div>
  `;
  
  const learningCard = document.createElement("div");
  learningCard.className = "progress-status-card learning";
  learningCard.innerHTML = `
    <div class="progress-status-value">${stats.learning}</div>
    <div class="progress-status-label">Learning</div>
  `;
  
  const doneCard = document.createElement("div");
  doneCard.className = "progress-status-card done";
  doneCard.innerHTML = `
    <div class="progress-status-value">${stats.done}</div>
    <div class="progress-status-label">Done</div>
  `;
  
  statusGrid.appendChild(newCard);
  statusGrid.appendChild(freshCard);
  statusGrid.appendChild(learningCard);
  statusGrid.appendChild(doneCard);
  statusSection.appendChild(statusGrid);
  container.appendChild(statusSection);

  // Stage breakdown
  const stageSection = document.createElement("div");
  stageSection.className = "progress-section";
  const stageTitle = document.createElement("h2");
  stageTitle.textContent = "Words by Stage";
  stageSection.appendChild(stageTitle);

  const stageList = document.createElement("div");
  stageList.className = "progress-stage-list";
  
  STAGES.forEach((stage, index) => {
    const count = stats.byStage[index];
    if (count === 0 && index > 0) return; // Skip empty stages except stage 0
    
    const stageItem = document.createElement("div");
    stageItem.className = "progress-stage-item";
    if (index === 0) stageItem.classList.add("stage-new");
    if (index >= 7) stageItem.classList.add("stage-mastered");
    
    const stageName = document.createElement("div");
    stageName.className = "progress-stage-name";
    stageName.textContent = stage.name;
    
    const stageCount = document.createElement("div");
    stageCount.className = "progress-stage-count";
    stageCount.textContent = count;
    
    const stageBar = document.createElement("div");
    stageBar.className = "progress-stage-bar";
    const barFill = document.createElement("div");
    barFill.className = "progress-stage-bar-fill";
    const barPercent = stats.total > 0 ? (count / stats.total * 100) : 0;
    barFill.style.width = `${barPercent}%`;
    stageBar.appendChild(barFill);
    
    stageItem.appendChild(stageName);
    stageItem.appendChild(stageCount);
    stageItem.appendChild(stageBar);
    stageList.appendChild(stageItem);
  });
  
  stageSection.appendChild(stageList);
  container.appendChild(stageSection);

  // Answer statistics
  const answerSection = document.createElement("div");
  answerSection.className = "progress-section";
  const answerTitle = document.createElement("h2");
  answerTitle.textContent = "Answer Statistics";
  answerSection.appendChild(answerTitle);

  const answerStats = document.createElement("div");
  answerStats.className = "progress-answer-stats";
  
  const totalAnswers = stats.totalKnown + stats.totalUnknown;
  const accuracy = totalAnswers > 0 
    ? Math.round((stats.totalKnown / totalAnswers) * 100) 
    : 0;
  
  answerStats.innerHTML = `
    <div class="progress-answer-item">
      <div class="progress-answer-label">Correct</div>
      <div class="progress-answer-value correct">${stats.totalKnown}</div>
    </div>
    <div class="progress-answer-item">
      <div class="progress-answer-label">Incorrect</div>
      <div class="progress-answer-value incorrect">${stats.totalUnknown}</div>
    </div>
    <div class="progress-answer-item">
      <div class="progress-answer-label">Accuracy</div>
      <div class="progress-answer-value">${accuracy}%</div>
    </div>
  `;
  
  answerSection.appendChild(answerStats);
  container.appendChild(answerSection);

  panelContent.appendChild(container);
}

/**
 * Render all phrase cards.
 */
function renderPhrases() {
  const root = document.getElementById("phrases");
  if (!root) return;

  // Show progress overview if progress tab is selected
  if (currentTab === "progress") {
    renderProgressOverview();
    return;
  }

  root.innerHTML = "";

  // Group phrases by stage
  const grouped = STAGES.map(() => []);
  let readyCount = 0;

  PHRASES.forEach((phrase, index) => {
    const prog = getProgress(index);
    const due = isDue(prog);
    if (due) readyCount += 1;
    if (currentTab === "ready" && !due) return;
    const sIdx = Math.max(0, Math.min(prog.stageIndex || 0, STAGES.length - 1));
    grouped[sIdx].push({ phrase, index });
  });

  STAGES.forEach((stage, stageIndex) => {
    const items = grouped[stageIndex];
    if (!items.length) return;

    const zone = document.createElement("section");
    zone.className = "category-zone";

    const title = document.createElement("h2");
    title.className = "category-zone-title";
    title.textContent = stage.name;
    zone.appendChild(title);

    items.forEach(({ phrase, index }) => {
      const card = document.createElement("article");
      card.className = "phrase-card";
      card.dataset.index = String(index);

      if (lastMovedIndex !== null && index === lastMovedIndex) {
        card.classList.add("card-moved");
      }

      if (phrase.section) {
        const secLabel = document.createElement("div");
        secLabel.className = "section-label";
        secLabel.textContent = phrase.section;
        card.appendChild(secLabel);
      }

      const langWrap = document.createElement("div");
      langWrap.className = "phrase-languages";

      const rowCz = createLangRow("CZ", phrase.cz, "cz", phrase.czPron);
      const rowEn = createLangRow("EN", phrase.en, "en", undefined);
      const rowVi = createLangRow("VI", phrase.vi, "vi", phrase.viPron);

      langWrap.appendChild(rowCz);
      langWrap.appendChild(rowEn);
      langWrap.appendChild(rowVi);

      // Memory hook element
      const memoryHookContainer = document.createElement("div");
      memoryHookContainer.className = "memory-hook-container";
      
      const memoryHookDisplay = document.createElement("div");
      memoryHookDisplay.className = "memory-hook-display cover-target";
      memoryHookDisplay.dataset.lang = "memory-hook";
      
      const memoryHookText = document.createElement("span");
      memoryHookText.className = "memory-hook-text";
      const hookValue = getMemoryHook(index);
      const suggestedHook = !hookValue ? getSuggestedMemoryHook(index) : "";
      if (hookValue) {
        memoryHookText.textContent = hookValue;
      } else if (suggestedHook) {
        memoryHookText.textContent = `💡 ${suggestedHook}`;
      } else {
        memoryHookText.textContent = "💭 Add memory hook...";
      }
      memoryHookText.dataset.index = String(index);
      if (!hookValue) {
        memoryHookText.classList.add("placeholder");
      }
      
      memoryHookDisplay.appendChild(memoryHookText);
      memoryHookContainer.appendChild(memoryHookDisplay);
      
      const memoryHookInput = document.createElement("input");
      memoryHookInput.type = "text";
      memoryHookInput.className = "memory-hook-input";
      memoryHookInput.placeholder = "Enter memory hook...";
      memoryHookInput.value = hookValue;
      memoryHookInput.style.display = "none";
      memoryHookInput.dataset.index = String(index);
      memoryHookContainer.appendChild(memoryHookInput);

      const actions = document.createElement("div");
      actions.className = "progress-actions";

      const unknownBtn = document.createElement("button");
      unknownBtn.type = "button";
      unknownBtn.className = "progress-btn unknown";
      unknownBtn.innerHTML = "✖ <span class=\"count\"></span>";

      const knownBtn = document.createElement("button");
      knownBtn.type = "button";
      knownBtn.className = "progress-btn known";
      knownBtn.innerHTML = "✔ <span class=\"count\"></span>";

      actions.appendChild(unknownBtn);
      actions.appendChild(knownBtn);

      // Audio button: play Czech for Vietnamese learner, Vietnamese for Czech learner
      let audioSrcForRole = null;
      if (currentRole === "vi" && phrase.czAudio) {
        audioSrcForRole = Array.isArray(phrase.czAudio)
          ? phrase.czAudio[0]
          : phrase.czAudio;
      } else if (currentRole === "cz" && phrase.viAudio) {
        audioSrcForRole = Array.isArray(phrase.viAudio)
          ? phrase.viAudio[0]
          : phrase.viAudio;
      }

      if (audioSrcForRole) {
        const audioBtn = document.createElement("button");
        audioBtn.type = "button";
        audioBtn.className = "audio-btn";
        audioBtn.title =
          currentRole === "vi" ? "Play Czech audio" : "Play Vietnamese audio";
        audioBtn.textContent = "🔊";

        let touchStartTime = 0;
        let touchStartPos = null;

        // Handle touch events for mobile
        audioBtn.addEventListener("touchstart", (event) => {
          event.stopPropagation();
          touchStartTime = Date.now();
          if (event.touches.length > 0) {
            touchStartPos = {
              x: event.touches[0].clientX,
              y: event.touches[0].clientY
            };
          }
          audioBtn.classList.add("audio-btn-pressed");
        }, { passive: true });

        audioBtn.addEventListener("touchend", (event) => {
          event.stopPropagation();
          event.preventDefault();
          
          const touchEnd = event.changedTouches[0];
          const touchDuration = Date.now() - touchStartTime;
          let moved = false;
          
          if (touchStartPos && touchEnd) {
            const deltaX = Math.abs(touchEnd.clientX - touchStartPos.x);
            const deltaY = Math.abs(touchEnd.clientY - touchStartPos.y);
            moved = deltaX > 10 || deltaY > 10;
          }
          
          audioBtn.classList.remove("audio-btn-pressed");
          
          // Only play if it was a quick tap without movement
          if (!moved && touchDuration < 500) {
            audioBtn.classList.add("audio-btn-playing");
            playAudio(audioSrcForRole);
            
            // Remove playing state after a short delay
            setTimeout(() => {
              audioBtn.classList.remove("audio-btn-playing");
            }, 300);
          }
          
          touchStartTime = 0;
          touchStartPos = null;
        }, { passive: false });

        // Handle mouse/desktop events
        audioBtn.addEventListener("mousedown", (event) => {
          event.stopPropagation();
          audioBtn.classList.add("audio-btn-pressed");
        });

        audioBtn.addEventListener("mouseup", (event) => {
          event.stopPropagation();
          audioBtn.classList.remove("audio-btn-pressed");
        });

        audioBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          event.preventDefault();
          audioBtn.classList.add("audio-btn-playing");
          playAudio(audioSrcForRole);
          
          // Remove playing state after a short delay
          setTimeout(() => {
            audioBtn.classList.remove("audio-btn-playing");
          }, 300);
        });

        // Also handle mouseleave to remove pressed state if user drags away
        audioBtn.addEventListener("mouseleave", () => {
          audioBtn.classList.remove("audio-btn-pressed");
        });

        actions.appendChild(audioBtn);
      }

      card.appendChild(langWrap);
      card.appendChild(memoryHookContainer);
      // countdown for waiting items (only in "all" tab)
      const prog = getProgress(index);
      const due = isDue(prog);
      if (currentTab === "all" && prog.stageIndex > 0 && prog.nextDueAt && !due) {
        const countdown = document.createElement("div");
        countdown.className = "countdown";
        countdown.dataset.nextDueAt = String(prog.nextDueAt);
        const dot = document.createElement("span");
        dot.className = "countdown-dot";
        const label = document.createElement("span");
        label.className = "countdown-label";
        label.textContent = formatRemaining(prog.nextDueAt - Date.now());
        countdown.appendChild(dot);
        countdown.appendChild(label);
        card.appendChild(countdown);
      }
      card.appendChild(actions);

      zone.appendChild(card);

      knownBtn.addEventListener("click", () => {
        handleMark(index, "known", card);
      });
      unknownBtn.addEventListener("click", () => {
        handleMark(index, "unknown", card);
      });

      // Memory hook event handlers
      // Track touch state for mobile tap detection
      let memoryHookTouchStart = null;
      let memoryHookEditTimeout = null;
      
      // Use double-click to edit on desktop
      memoryHookDisplay.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!memoryHookContainer.classList.contains("editing")) {
          startEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
        }
      });
      
      // For mobile: detect tap vs press
      // Store touch start info before press handlers run
      memoryHookDisplay.addEventListener("touchstart", (e) => {
        if (e.touches.length > 0) {
          memoryHookTouchStart = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            time: Date.now()
          };
          
          // Set a timeout to trigger edit if it's a quick tap
          // This will be cancelled if user moves (scrolls) or presses long (reveals)
          memoryHookEditTimeout = setTimeout(() => {
            // Only edit if it was a very quick tap and element is not covered
            if (memoryHookTouchStart && !memoryHookDisplay.classList.contains("is-covered")) {
              if (!memoryHookContainer.classList.contains("editing")) {
                startEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
              }
            }
            memoryHookTouchStart = null;
          }, 250); // 250ms threshold for quick tap
        }
      }, { passive: true, capture: true });
      
      // Track movement - if moved, cancel edit timeout (user is scrolling)
      memoryHookDisplay.addEventListener("touchmove", (e) => {
        if (memoryHookTouchStart && e.touches.length > 0) {
          const deltaX = Math.abs(e.touches[0].clientX - memoryHookTouchStart.x);
          const deltaY = Math.abs(e.touches[0].clientY - memoryHookTouchStart.y);
          // If moved significantly, cancel edit timeout (user is scrolling)
          if (deltaX > 10 || deltaY > 10) {
            if (memoryHookEditTimeout) {
              clearTimeout(memoryHookEditTimeout);
              memoryHookEditTimeout = null;
            }
            memoryHookTouchStart = null;
          }
        }
      }, { passive: true });
      
      memoryHookDisplay.addEventListener("touchend", (e) => {
        if (memoryHookEditTimeout) {
          clearTimeout(memoryHookEditTimeout);
          memoryHookEditTimeout = null;
        }
        
        if (memoryHookTouchStart) {
          const touch = e.changedTouches[0];
          const deltaX = Math.abs(touch.clientX - memoryHookTouchStart.x);
          const deltaY = Math.abs(touch.clientY - memoryHookTouchStart.y);
          const deltaTime = Date.now() - memoryHookTouchStart.time;
          const isCovered = memoryHookDisplay.classList.contains("is-covered");
          const wasPressed = memoryHookDisplay.classList.contains("is-pressed");
          
          // If it's a quick tap without movement:
          // - If covered: let press handlers reveal (don't edit)
          // - If not covered: edit
          if (deltaX < 10 && deltaY < 10 && deltaTime < 300) {
            if (!isCovered && !wasPressed) {
              e.preventDefault();
              e.stopPropagation();
              if (!memoryHookContainer.classList.contains("editing")) {
                startEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
              }
            }
          }
          memoryHookTouchStart = null;
        }
      }, { passive: false });
      
      // Also allow click on empty placeholder to edit (desktop fallback)
      if (!hookValue) {
        memoryHookDisplay.addEventListener("click", (e) => {
          // Only trigger if not currently pressed (revealed) and not covered
          if (!memoryHookDisplay.classList.contains("is-pressed") && 
              !memoryHookDisplay.classList.contains("is-covered")) {
            e.stopPropagation();
            if (!memoryHookContainer.classList.contains("editing")) {
              startEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
            }
          }
        });
      }

      memoryHookInput.addEventListener("blur", () => {
        finishEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
      });

      memoryHookInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finishEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelEditingMemoryHook(index, memoryHookContainer, memoryHookDisplay, memoryHookInput, memoryHookText);
        }
      });

      updateCardProgress(index, card);
    });

    root.appendChild(zone);
  });


  // Attach press behavior to all cover targets (including memory hooks for reveal functionality)
  const coverTargets = root.querySelectorAll(".cover-target");
  coverTargets.forEach((el) => attachPressHandlers(/** @type {HTMLElement} */ (el)));

  applyVisibilityMode();

  // update ready-count badge
  const readyBtn = document.querySelector('.bottom-nav-btn[data-tab="ready"]');
  if (readyBtn) {
    readyBtn.setAttribute("data-count", readyCount ? String(readyCount) : "");
  }
}

function formatRemaining(ms) {
  if (ms <= 0) return "ready now";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Start editing a memory hook.
 */
function startEditingMemoryHook(index, container, display, input, text) {
  container.classList.add("editing");
  display.style.display = "none";
  input.style.display = "block";
  input.focus();
  input.select();
}

/**
 * Finish editing a memory hook and save it.
 */
function finishEditingMemoryHook(index, container, display, input, text) {
  const value = input.value.trim();
  setMemoryHook(index, value);
  
  container.classList.remove("editing");
  display.style.display = "block";
  input.style.display = "none";
  
  if (value) {
    text.textContent = value;
    text.classList.remove("placeholder");
  } else {
    const suggestedHook = getSuggestedMemoryHook(index);
    text.textContent = suggestedHook ? `💡 ${suggestedHook}` : "💭 Add memory hook...";
    text.classList.add("placeholder");
  }
  
  // Re-apply visibility mode after editing
  applyVisibilityMode();
}

/**
 * Cancel editing a memory hook without saving.
 */
function cancelEditingMemoryHook(index, container, display, input, text) {
  const hookValue = getMemoryHook(index);
  input.value = hookValue;
  
  container.classList.remove("editing");
  display.style.display = "block";
  input.style.display = "none";
}

/**
 * Apply current mode to all elements.
 */
function applyVisibilityMode() {
  const root = document.getElementById("phrases");
  if (!root) return;

  const targets = root.querySelectorAll(".cover-target");
  // If "show everything" is enabled, nothing is covered
  if (showAll) {
    targets.forEach((el) => {
      el.classList.remove("is-covered", "is-pressed");
    });
    return;
  }

  targets.forEach((el) => {
    const lang = el.dataset.lang;
    if (!lang) return;
    
    // Skip if editing (memory hooks stay visible when editing)
    if (el.closest(".memory-hook-container")?.classList.contains("editing")) {
      return;
    }

    el.classList.remove("is-covered", "is-pressed");

    // modeIndex: 0 or 1 – meaning depends on learner role
    if (currentRole === "cz") {
      if (modeIndex === 0) {
        // hide Vietnamese only
        if (lang === "vi" || lang === "memory-hook") el.classList.add("is-covered");
      } else {
        // hide Czech + English
        if (lang === "cz" || lang === "en") el.classList.add("is-covered");
      }
    } else {
      if (modeIndex === 0) {
        // hide Czech only
        if (lang === "cz") el.classList.add("is-covered");
      } else {
        // hide Vietnamese + English
        if (lang === "vi" || lang === "en" || lang === "memory-hook") el.classList.add("is-covered");
      }
    }
  });
}

/**
 * Update DOM for a single card with progress info.
 * @param {number} index
 * @param {HTMLElement} card
 */
function updateCardProgress(index, card) {
  const data = getProgress(index);

  const knownCountEl = card.querySelector(".progress-btn.known .count");
  const unknownCountEl = card.querySelector(".progress-btn.unknown .count");

  if (knownCountEl) {
    knownCountEl.textContent = data.knownCount ? `(${data.knownCount})` : "";
  }
  if (unknownCountEl) {
    unknownCountEl.textContent = data.unknownCount ? `(${data.unknownCount})` : "";
  }
}

/**
 * Handle marking a card as known / unknown and update its category.
 * @param {number} index
 * @param {"known" | "unknown"} kind
 * @param {HTMLElement} card
 */
function handleMark(index, kind, card) {
  const key = String(index);
  const now = Date.now();
  const existing = getProgress(index);

  if (kind === "known") {
    existing.knownCount += 1;
    existing.lastKnownAt = now;
    // Move to a "later" stage (longer interval) but never beyond the last
    const nextStage = Math.min((existing.stageIndex || 0) + 1, STAGES.length - 1);
    existing.stageIndex = nextStage;
    const interval = STAGES[nextStage].intervalMs;
    existing.nextDueAt = interval ? now + interval : null;
  } else {
    existing.unknownCount += 1;
    existing.lastUnknownAt = now;
    // Move back towards more frequent review
    const prevStage = Math.max((existing.stageIndex || 0) - 1, 0);
    existing.stageIndex = prevStage;
    const interval = STAGES[prevStage].intervalMs;
    existing.nextDueAt = interval ? now + interval : null;
  }

  progressMap[key] = existing;
  saveProgress(progressMap);
  
  // Remember which card moved and re-render so the word moves to its new category zone
  lastMovedIndex = index;
  renderPhrases();
  // Update progress summary in real-time
  renderProgressSummary();
}

/**
 * Initialize mode switch buttons.
 */
function updateSwitchButtonLabel() {
  const btn = document.getElementById("switch-btn");
  if (!btn) return;

  // Use a reload-style icon for the mode switch button
  btn.textContent = "🔄";
}

function updateShowAllButtonLabel() {
  const btn = document.getElementById("show-all-btn");
  if (!btn) return;

  // Use monkey emojis for the "show everything" toggle
  btn.textContent = showAll ? "🙉" : "🙈";
}

function setupTopControls() {
  const settingsBtn = document.getElementById("settings-btn");
  const progressBtn = document.getElementById("progress-btn");
  const memoryHooksBtn = document.getElementById("memory-hooks-btn");
  const switchBtn = document.getElementById("switch-btn");
  const settingsPanel = document.getElementById("settings-panel");
  const progressPanel = document.getElementById("progress-panel");
  const memoryHooksPanel = document.getElementById("memory-hooks-panel");
  const showAllBtn = document.getElementById("show-all-btn");
  const bottomButtons = document.querySelectorAll(".bottom-nav-btn");

  // Function to close all panels
  function closeAllPanels() {
    if (settingsPanel) settingsPanel.classList.remove("is-open");
    if (progressPanel) progressPanel.classList.remove("is-open");
    if (memoryHooksPanel) memoryHooksPanel.classList.remove("is-open");
  }

  // Handle clicks outside panels to close them
  document.addEventListener("click", (event) => {
    // Check if any panel is currently open
    const settingsOpen = settingsPanel && settingsPanel.classList.contains("is-open");
    const progressOpen = progressPanel && progressPanel.classList.contains("is-open");
    const memoryHooksOpen = memoryHooksPanel && memoryHooksPanel.classList.contains("is-open");
    
    if (!settingsOpen && !progressOpen && !memoryHooksOpen) {
      return; // No panels open, nothing to close
    }

    // Check if click is outside any panel and its button
    const clickedInsideSettings = settingsPanel && (
      settingsPanel.contains(event.target) || 
      settingsBtn && settingsBtn.contains(event.target)
    );
    const clickedInsideProgress = progressPanel && (
      progressPanel.contains(event.target) || 
      progressBtn && progressBtn.contains(event.target)
    );
    const clickedInsideMemoryHooks = memoryHooksPanel && (
      memoryHooksPanel.contains(event.target) || 
      memoryHooksBtn && memoryHooksBtn.contains(event.target)
    );

    // If click is outside all panels and their buttons, close all panels
    if (!clickedInsideSettings && !clickedInsideProgress && !clickedInsideMemoryHooks) {
      closeAllPanels();
    }
  });

  // Prevent clicks inside panels from closing them
  if (settingsPanel) {
    settingsPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (progressPanel) {
    progressPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (memoryHooksPanel) {
    memoryHooksPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = settingsPanel.classList.contains("is-open");
      closeAllPanels();
      // Toggle settings panel
      if (!wasOpen) {
        settingsPanel.classList.add("is-open");
      }
    });

    const radios = settingsPanel.querySelectorAll('input[name="learner-role"]');
    radios.forEach((radio) => {
      if (radio.value === currentRole) {
        radio.checked = true;
      }
      radio.addEventListener("change", () => {
        const value = radio.value;
        if (value !== "cz" && value !== "vi") return;
        currentRole = value;
        saveRole(currentRole);
        // Reset mode index for new role
        modeIndex = 0;
        updateSwitchButtonLabel();
        // keep showAll state as-is when switching role
        renderPhrases();
      });
    });
  }

  if (progressBtn && progressPanel) {
    progressBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = progressPanel.classList.contains("is-open");
      closeAllPanels();
      // Toggle progress panel
      if (!wasOpen) {
        progressPanel.classList.add("is-open");
        // Render progress overview when opening
        renderProgressOverview();
      }
    });
  }

  if (memoryHooksBtn && memoryHooksPanel) {
    memoryHooksBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = memoryHooksPanel.classList.contains("is-open");
      closeAllPanels();
      // Toggle memory hooks panel
      if (!wasOpen) {
        memoryHooksPanel.classList.add("is-open");
      }
    });
  }

  if (switchBtn) {
    switchBtn.addEventListener("click", () => {
      modeIndex = modeIndex === 0 ? 1 : 0;
      updateSwitchButtonLabel();
      applyVisibilityMode();
    });
  }

  if (showAllBtn) {
    showAllBtn.addEventListener("click", () => {
      showAll = !showAll;
      updateShowAllButtonLabel();
      applyVisibilityMode();
    });
  }

  updateSwitchButtonLabel();
  updateShowAllButtonLabel();

  // bottom nav tabs
  bottomButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      if (!tab || tab === currentTab) return;
      currentTab = tab;
      bottomButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      renderPhrases();
    });
  });
  
  // Initial render of progress summary
  renderProgressSummary();
}

/**
 * Update countdown labels for countdowns less than 1 minute.
 */
function updateShortCountdowns() {
  if (document.hidden) return;
  if (isEditingMemoryHook()) return;
  const countdowns = document.querySelectorAll(".countdown[data-next-due-at]");
  countdowns.forEach((countdown) => {
    const nextDueAt = Number(countdown.dataset.nextDueAt);
    if (!nextDueAt) return;
    const remaining = nextDueAt - Date.now();
    const minutes = Math.floor(remaining / 60000);
    
    // Only update if less than 1 minute
    if (minutes < 1 && remaining > 0) {
      const label = countdown.querySelector(".countdown-label");
      if (label) {
        label.textContent = formatRemaining(remaining);
      }
    } else if (remaining <= 0) {
      // If countdown expired, trigger a full refresh (unless user is editing a hook)
      if (!isEditingMemoryHook()) {
        renderPhrases();
      }
    }
  });
}

/**
 * Whether any memory hook input is currently being edited.
 */
function isEditingMemoryHook() {
  return !!document.querySelector(".memory-hook-container.editing");
}

document.addEventListener("DOMContentLoaded", () => {
  setupTopControls();
  renderPhrases();
  
  // Update countdowns less than 1 minute every second
  setInterval(() => {
    updateShortCountdowns();
  }, 1000);
  
  // refresh countdowns roughly every 30 seconds (for longer countdowns and full refresh)
  setInterval(() => {
    if (document.hidden) return;
    if (isEditingMemoryHook()) return;
    renderPhrases();
  }, 30000);
});


