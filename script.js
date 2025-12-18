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

/** @type {{ cz: string; en: string; vi: string; section?: string; czPron?: string; viPron?: string; czAudio?: string | string[]; viAudio?: string | string[] }[]} */
const PHRASES = [
  {
    cz: "Dobrý den / Dobrý večer",
    en: "Good day / Good evening",
    vi: "Xin chào",
    czPron: "DO-bri den / DO-bri VE-čer",
    viPron: "sin čao",
    // Audio variants for greeting
    czAudio: ["speech/cz/dobry-den.mp3", "speech/cz/dobry-vecer.mp3"],
  },
  {
    cz: "Děkuji 🙏",
    en: "Thank you",
    vi: "Cảm ơn",
    czPron: "DĚ-ku-ji",
    viPron: "kam ən",
    czAudio: "speech/cz/dekuji.mp3",
  },
  {
    cz: "Prosím 🙏",
    en: "Please",
    vi: "Làm ơn",
    czPron: "PRO-sím",
    viPron: "lam ən",
    czAudio: "speech/cz/prosim.mp3",
  },
  {
    cz: "Jak se máte? 🙂",
    en: "How are you?",
    vi: "Bạn khỏe không?",
    czPron: "JAK se MÁ-te?",
    viPron: "ban kchue khong",
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
    czAudio: "speech/cz/boli-to.mp3",
    viAudio: "speech/vi/co-djau-khong.mp3",
  },
  {
    cz: "Tady? 👉",
    en: "Here?",
    vi: "Ở đây hả?",
    czPron: "TA-di?",
    viPron: "a daj ha",
    czAudio: "speech/cz/tady.mp3",
    viAudio: "speech/vi/o-djay.mp3",
  },
  {
    cz: "Nashle / Na shledanou 👋",
    en: "Goodbye",
    vi: "Tạm biệt",
    czPron: "NA-shle / NA skhle-da-no",
    viPron: "tam biet",
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
    czAudio: "speech/cz/jakou-barvu.mp3",
  },

  {
    cz: "Tvar (nehtu)",
    en: "(Nail) shape",
    vi: "Hình dạng (móng)",
    czPron: "TVAR (NE-tu)",
    viPron: "hin jang mong",
    czAudio: "speech/cz/tvar-nehtu.mp3",
  },
  { cz: "Kulatý ⭕", en: "Round", vi: "Tròn", czPron: "KU-la-tý", viPron: "tron", czAudio: "speech/cz/kulaty.mp3" },
  { cz: "Hranatý ⬛", en: "Square", vi: "Vuông", czPron: "HRA-na-tý", viPron: "vuong", czAudio: "speech/cz/hranaty.mp3" },
  { cz: "Lak", en: "Nail polish", vi: "Sơn móng", czPron: "LAK", viPron: "son mong", czAudio: "speech/cz/lak.mp3" },
  { cz: "Manikúra 💅", en: "Manicure", vi: "Làm móng tay", czPron: "MA-ni-kú-ra", viPron: "lam mong taj", czAudio: "speech/cz/manikura.mp3", viAudio: "speech/vi/lam-mong-tay.mp3" },
  { cz: "Pedikúra 🦶", en: "Pedicure", vi: "Chăm sóc chân", czPron: "PE-di-kú-ra", viPron: "čam sok čan", czAudio: "speech/cz/pedikura.mp3", viAudio: "speech/vi/lam-mong-chan.mp3" },
  { cz: "Gelové nehty ✨", en: "Gel nails", vi: "Móng gel", czPron: "GE-lo-vé NE-ty", viPron: "mong gel", czAudio: "speech/cz/gelove-nehty.mp3", viAudio: "speech/vi/mong-gel.mp3" },
  { cz: "Hotovo ✅", en: "Finished / Done", vi: "Xong rồi", czPron: "HO-to-vo", viPron: "xong zoj", czAudio: "speech/cz/hotovo.mp3", viAudio: "speech/vi/xong-roi.mp3" },
  { cz: "Ruka / Ruce", en: "Hand / Hands", vi: "Tay / Hai tay", czPron: "RU-ka / RU-ce", viPron: "taj / haj taj", czAudio: ["speech/cz/ruka.mp3", "speech/cz/ruce.mp3"], viAudio: ["speech/vi/tay.mp3", "speech/vi/hai-tay.mp3"] },
  { cz: "Noha / Nohy", en: "Foot / Feet", vi: "Chân / Hai chân", czPron: "NO-ha / NO-hy", viPron: "čan / haj čan", czAudio: ["speech/cz/noha.mp3", "speech/cz/nohy.mp3"], viAudio: ["speech/vi/chan.mp3", "speech/vi/hai-chan.mp3"] },
  { cz: "Nehet / Nehty", en: "Nail / Nails", vi: "Móng tay / Móng", czPron: "NE-het / NE-ty", viPron: "mong taj / mong", czAudio: ["speech/cz/nehet.mp3", "speech/cz/nehty.mp3"], viAudio: "speech/vi/mong-tay.mp3" },
  { cz: "Pilník", en: "Nail file", vi: "Cây dũa móng", czPron: "PIL-ník", viPron: "kaj zua mong", czAudio: "speech/cz/pilnik.mp3", viAudio: "speech/vi/dua.mp3" },
  { cz: "Nůžky ✂️", en: "Scissors", vi: "Cái kéo", czPron: "NŮŠ-ky", viPron: "kaj keo", czAudio: "speech/cz/nuzky.mp3", viAudio: "speech/vi/keo.mp3" },
  { cz: "Suché", en: "Dry", vi: "Khô", czPron: "SU-ché", viPron: "kho", czAudio: "speech/cz/suche.mp3", viAudio: "speech/vi/kho.mp3" },
  { cz: "Mokré", en: "Wet", vi: "Ướt", czPron: "MO-kré", viPron: "uot", czAudio: "speech/cz/mokre.mp3", viAudio: "speech/vi/uot.mp3" },
  { cz: "Voda 💧", en: "Water", vi: "Nước", czPron: "VO-da", viPron: "nuok", czAudio: "speech/cz/voda.mp3", viAudio: "speech/vi/nuoc.mp3" },

  {
    section: "🎨 BARVY A ČAS",
    cz: "Barva",
    en: "Color",
    vi: "Màu sắc",
    czPron: "BAR-va",
    viPron: "mau sak",
    czAudio: "speech/cz/barva.mp3",
    viAudio: "speech/vi/mau-sac.mp3",
  },
  { cz: "Červená 🔴", en: "Red", vi: "Đỏ", czPron: "ČER-ve-ná", viPron: "do", czAudio: "speech/cz/cervena.mp3", viAudio: "speech/vi/djo.mp3" },
  { cz: "Růžová 🌸", en: "Pink", vi: "Hồng", czPron: "RŮ-žo-vá", viPron: "hong", czAudio: "speech/cz/ruzova.mp3", viAudio: "speech/vi/hong.mp3" },
  { cz: "Černá ⚫", en: "Black", vi: "Đen", czPron: "ČER-ná", viPron: "den", czAudio: "speech/cz/cerna.mp3", viAudio: "speech/vi/djen.mp3" },
  { cz: "Bílá ⚪", en: "White", vi: "Trắng", czPron: "BÍ-lá", viPron: "čang", czAudio: "speech/cz/bila.mp3", viAudio: "speech/vi/trang.mp3" },
  { cz: "Dnes 📅", en: "Today", vi: "Hôm nay", czPron: "DNES", viPron: "hom naj", viAudio: "speech/vi/hom-nay.mp3" },
  { cz: "Zítra ⏭️", en: "Tomorrow", vi: "Ngày mai", czPron: "ZÍ-tra", viPron: "ngaj maj", czAudio: "speech/cz/zitra.mp3", viAudio: "speech/vi/ngay-mai.mp3" },

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
  { cz: "Hotově 💶", en: "Cash", vi: "Tiền mặt", czPron: "HO-to-vě", viPron: "tjen mat", czAudio: "speech/cz/hotove.mp3", viAudio: "speech/vi/tien-mat.mp3" },
  { cz: "Kartou 💳", en: "By card", vi: "Bằng thẻ", czPron: "KAR-tou", viPron: "bang te", czAudio: "speech/cz/kartou.mp3", viAudio: "speech/vi/the.mp3" },
  { cz: "Perfektní ✨", en: "Perfect", vi: "Hoàn hảo", czPron: "PER-fek-tní", viPron: "hoan hao", czAudio: "speech/cz/perfektni.mp3", viAudio: "speech/vi/hoan-hao.mp3" },
  { cz: "Moment ⏱️", en: "Moment", vi: "Khoảnh khắc", czPron: "MO-ment", viPron: "khoanh khak", czAudio: "speech/cz/moment.mp3", viAudio: "speech/vi/mot-chut.mp3" },
  { cz: "Kafe ☕", en: "Coffee", vi: "Cà phê", czPron: "KA-fe", viPron: "ka fe", czAudio: "speech/cz/kafe.mp3", viAudio: "speech/vi/ca-phe.mp3" },
  { cz: "Klient (muž) / Klientka (žena)", en: "Client", vi: "Khách hàng", czPron: "KLI-ent / KLI-ent-ka", viPron: "khak hang", czAudio: ["speech/cz/klient.mp3", "speech/cz/klientka.mp3"], viAudio: ["speech/vi/khach-hang.mp3", "speech/vi/khach-hang-nu.mp3"] },
  { cz: "Salon", en: "Salon", vi: "Tiệm / Thẩm mỹ viện", czPron: "SA-lon", viPron: "tiem", czAudio: "speech/cz/salon.mp3", viAudio: "speech/vi/tiem.mp3" },
  { cz: "Design 🎨", en: "Design", vi: "Thiết kế", czPron: "DE-zajn", viPron: "thjet ke", czAudio: "speech/cz/design.mp3", viAudio: "speech/vi/thiet-ke.mp3" },
  { cz: "Problém ⚠️", en: "Problem", vi: "Vấn đề", czPron: "PRO-blém", viPron: "van de", czAudio: "speech/cz/problem.mp3", viAudio: "speech/vi/van-dje.mp3" },
  { cz: "Detail 🔍", en: "Detail", vi: "Chi tiết", czPron: "DE-tajl", viPron: "či tiet", viAudio: "speech/vi/chi-tiet.mp3" },
  { cz: "Materiál", en: "Material", vi: "Vật liệu", czPron: "MA-te-ri-ál", viPron: "vat lijeu", czAudio: "speech/cz/material.mp3", viAudio: "speech/vi/vat-lieu.mp3" },
  { cz: "Informace ℹ️", en: "Information", vi: "Thông tin", czPron: "IN-for-ma-ce", viPron: "thong tin", czAudio: "speech/cz/informace.mp3", viAudio: "speech/vi/thong-tin.mp3" },
  { cz: "Super 😄", en: "Super", vi: "Tuyệt vời", czPron: "SU-per", viPron: "tujet voj", czAudio: "speech/cz/super.mp3", viAudio: "speech/vi/tuyet-voi.mp3" },
  { cz: "Akryl", en: "Acrylic", vi: "Acrylic", czPron: "A-kryl", viPron: "ak-ril", czAudio: "speech/cz/akryl.mp3", viAudio: "speech/vi/acrylic.mp3" },
  { cz: "Gel", en: "Gel", vi: "Gel", czPron: "GEL", viPron: "zel", czAudio: "speech/cz/gel.mp3", viAudio: "speech/vi/gel.mp3" },
  {
    cz: "Jak se jmenujete?",
    en: "What is your name?",
    vi: "Bạn tên là gì?",
    czPron: "Jak se JE-me-nu-je-te",
    viPron: "ban ten la zi",
    hint: "jméno ≈ name / tên"
  },
  {
    cz: "Jmenuji se…",
    en: "My name is…",
    vi: "Tôi tên là…",
    czPron: "JE-me-nu-ji se",
    viPron: "toj ten la",
    hint: "jmenuji = name action"
  },
  {
    cz: "Odkud jste?",
    en: "Where are you from?",
    vi: "Bạn đến từ đâu?",
    czPron: "OD-kud jste",
    viPron: "ban den tů dau",
    hint: "odkud = from where / đâu"
  },
  {
    cz: "Jsem z Česka",
    en: "I am from Czechia",
    vi: "Tôi đến từ Séc",
    czPron: "Jsem z ČES-ka",
    viPron: "toj den tů sek",
    hint: "z = from"
  },
  {
    cz: "Kolik je hodin?",
    en: "What time is it?",
    vi: "Mấy giờ rồi?",
    czPron: "KO-lik je HO-din",
    viPron: "me zo zui",
    hint: "hodiny = hours / giờ"
  },
  {
    cz: "Počkejte prosím",
    en: "Please wait",
    vi: "Vui lòng đợi",
    czPron: "PO-čkej-te PRO-sím",
    viPron: "vuj long doj",
    hint: "čekat = wait"
  },
  {
    cz: "Pojďte sem",
    en: "Come here",
    vi: "Lại đây",
    czPron: "POJ-te sem",
    viPron: "laj dej",
    hint: "sem = here"
  },
  {
    cz: "Pojďme",
    en: "Let’s go",
    vi: "Đi thôi",
    czPron: "POJď-me",
    viPron: "di thoj",
    hint: "pojď = move / đi"
  },
  {
    cz: "Kam jdete?",
    en: "Where are you going?",
    vi: "Bạn đi đâu?",
    czPron: "Kam JDE-te",
    viPron: "ban di dau",
    hint: "kam = where to"
  },
  {
    cz: "Jdu domů",
    en: "I’m going home",
    vi: "Tôi về nhà",
    czPron: "Jdu DO-mů",
    viPron: "toj ve nja",
    hint: "domů = home"
  },
  {
    cz: "Mám hlad",
    en: "I’m hungry",
    vi: "Tôi đói",
    czPron: "Mám hlad",
    viPron: "toj doj",
    hint: "hlad = hunger"
  },
  {
    cz: "Mám žízeň",
    en: "I’m thirsty",
    vi: "Tôi khát",
    czPron: "Mám ŽÍ-zeň",
    viPron: "toj kat",
    hint: "žízeň = thirst"
  },
  {
    cz: "Chci jíst",
    en: "I want to eat",
    vi: "Tôi muốn ăn",
    czPron: "Chci jíst",
    viPron: "toj muon an",
    hint: "jíst = eat / ăn"
  },
  {
    cz: "Chci pít",
    en: "I want to drink",
    vi: "Tôi muốn uống",
    czPron: "Chci pít",
    viPron: "toj muon uong",
    hint: "pít = drink"
  },
  {
    cz: "Je to daleko?",
    en: "Is it far?",
    vi: "Có xa không?",
    czPron: "Je to DA-le-ko",
    viPron: "ko sa kong",
    hint: "daleko = far"
  },
  {
    cz: "Je to blízko",
    en: "It’s close",
    vi: "Gần",
    czPron: "Je to BLÍZ-ko",
    viPron: "gan",
    hint: "blízko = near"
  },
  {
    cz: "Líbí se mi to",
    en: "I like it",
    vi: "Tôi thích cái này",
    czPron: "LÍ-bí se mi to",
    viPron: "toj tik kaj naj",
    hint: "líbit se = like"
  },
  {
    cz: "Nelíbí se mi to",
    en: "I don’t like it",
    vi: "Tôi không thích",
    czPron: "NE-lí-bí se mi to",
    viPron: "toj kong tik",
    hint: "ne = not"
  },
  {
    cz: "Je to v pořádku",
    en: "It’s okay",
    vi: "Ổn",
    czPron: "Je to v PO-řád-ku",
    viPron: "on",
    hint: "pořádek = order / OK"
  },
  {
    cz: "Není problém",
    en: "No problem",
    vi: "Không vấn đề",
    czPron: "NE-ní PRO-blém",
    viPron: "kong van de",
    hint: "problém = same word"
  },
  {
    cz: "Možná",
    en: "Maybe",
    vi: "Có lẽ",
    czPron: "MOŽ-ná",
    viPron: "ko le",
    hint: "nejistota = maybe"
  },
  {
    cz: "Určitě",
    en: "Definitely",
    vi: "Chắc chắn",
    czPron: "UR-či-tě",
    viPron: "čak čan",
    hint: "určit = sure"
  },
  {
    cz: "Teď nemůžu",
    en: "I can’t now",
    vi: "Bây giờ không được",
    czPron: "Teď NE-mů-žu",
    viPron: "bej zo kong duk",
    hint: "můžu = can"
  },
  {
    cz: "Můžu?",
    en: "May I?",
    vi: "Tôi có thể không?",
    czPron: "MŮ-žu",
    viPron: "toj ko te kong",
    hint: "můžu = ability"
  },
  {
    cz: "Potřebuji pomoc",
    en: "I need help",
    vi: "Tôi cần giúp đỡ",
    czPron: "PO-tře-bu-ji PO-moc",
    viPron: "toj kan zup do",
    hint: "potřeba = need"
  },
  {
    cz: "Ztratil jsem se",
    en: "I am lost",
    vi: "Tôi bị lạc",
    czPron: "ZTRA-ti-l jsem se",
    viPron: "toj bi lak",
    hint: "ztratit = lose"
  },
  {
    cz: "Mluvím trochu česky",
    en: "I speak a little Czech",
    vi: "Tôi nói tiếng Séc một chút",
    czPron: "MLU-vím TRO-chu ČES-ky",
    viPron: "toj noj tiéng sek mot čut",
    hint: "trochu = a little"
  },
  {
    cz: "Mluvte pomalu",
    en: "Speak slowly",
    vi: "Nói chậm thôi",
    czPron: "MLUV-te PO-ma-lu",
    viPron: "noj čam thoj",
    hint: "pomalu = slow"
  },
  {
    cz: "Ještě jednou",
    en: "Once again",
    vi: "Lặp lại",
    czPron: "JEŠ-tě JED-nou",
    viPron: "lap laj",
    hint: "jednou = one time"
  },
  {
    cz: "Rozumíte?",
    en: "Do you understand?",
    vi: "Bạn hiểu không?",
    czPron: "RO-zu-mí-te",
    viPron: "ban hieu kong",
    hint: "rozumět = understand"
  },
  {
    cz: "Chvíli",
    en: "A moment",
    vi: "Một lát",
    czPron: "CHVÍ-li",
    viPron: "mot lat",
    hint: "chvíle = short time"
  },
  {
    cz: "Hned",
    en: "Immediately",
    vi: "Ngay",
    czPron: "Hned",
    viPron: "ngaj",
    hint: "hned = now-now"
  },
  {
    cz: "Brát",
    en: "To take",
    vi: "Lấy",
    czPron: "Brát",
    viPron: "lej",
    hint: "brát = take"
  },
  {
    cz: "Dát",
    en: "To give",
    vi: "Đưa",
    czPron: "Dát",
    viPron: "dưa",
    hint: "dát = give"
  },
  {
    cz: "Vidím",
    en: "I see",
    vi: "Tôi thấy",
    czPron: "VI-dím",
    viPron: "toj tej",
    hint: "vidět = see"
  },
  {
    cz: "Slyším",
    en: "I hear",
    vi: "Tôi nghe",
    czPron: "SLY-ším",
    viPron: "toj nge",
    hint: "sluch = hearing"
  },
  {
    cz: "Drahé",
    en: "Expensive",
    vi: "Đắt",
    czPron: "DRA-hé",
    viPron: "dat",
    hint: "drahý = expensive"
  },
  {
    cz: "Levné",
    en: "Cheap",
    vi: "Rẻ",
    czPron: "LEV-né",
    viPron: "ze",
    hint: "levný = cheap"
  },
  {
    cz: "Otevřete",
    en: "Open (imperative)",
    vi: "Mở ra",
    czPron: "O-te-vře-te",
    viPron: "mo ra",
    hint: "otevřít = open"
  },
  {
    cz: "Zavřete",
    en: "Close (imperative)",
    vi: "Đóng lại",
    czPron: "ZA-vře-te",
    viPron: "dong laj",
    hint: "zavřít = close"
  },
  {
    cz: "Pozor! ⚠️",
    en: "Attention!",
    vi: "Cẩn thận!",
    czPron: "PO-zor",
    viPron: "kan than",
    hint: "pozor = watch out"
  },
  {
    cz: "Vítejte 🤝",
    en: "Welcome",
    vi: "Chào mừng",
    czPron: "VÍ-tej-te",
    viPron: "čao mung",
    hint: "vítat = welcome"
  }
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
 * Render all phrase cards.
 */
function renderPhrases() {
  const root = document.getElementById("phrases");
  if (!root) return;

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
      memoryHookText.textContent = hookValue || "💭 Add memory hook...";
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
    text.textContent = "💭 Add memory hook...";
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
  const switchBtn = document.getElementById("switch-btn");
  const panel = document.getElementById("settings-panel");
  const showAllBtn = document.getElementById("show-all-btn");
  const bottomButtons = document.querySelectorAll(".bottom-nav-btn");

  if (settingsBtn && panel) {
    settingsBtn.addEventListener("click", () => {
      panel.classList.toggle("is-open");
    });

    const radios = panel.querySelectorAll('input[name="learner-role"]');
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


