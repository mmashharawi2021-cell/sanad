// Pre-render Sanad's frequent phrases with the natural voices (needs internet once), so they
// play in the same natural voice offline. Usage: npm.cmd run voice:warm
import { warmVoiceCache, stopVoiceWorker } from "../src/localVoice";
import { stopSidecar } from "../src/voiceSidecar";
import { getVoiceSettings } from "../src/voiceSettings";

const PHRASES = [
  // fixed replies already used in public/index.html
  "أهلاً بك! أنا سند، مساعدك الشخصي المستقل. كيف يمكنني خدمتك اليوم؟",
  "أهلاً بك! وضع الحوار الصوتي المباشر مفعّل. أنا استمع إليك دائماً، نادني بـ «يا سند» أو تحدث بحرية وسأنفذ فوراً.",
  "بيئة التطوير جاهزة على لابتوبك، نود وبايثون وجيت وفيجوال ستوديو كود تعمل بنجاح.",
  "تم إيقاف البث المباشر.",
  "تم تشغيل البث المباشر للشاشة، سند معك ويشاهد ما تراه.",
  "تم حفظ المعلومة في الذاكرة الدائمة بنجاح، وسأتذكرها دائماً.",
  "تمت كتابة النص في الحقل النشط.",
  "حاضر، تم قفل شاشة اللابتوب لحماية خصوصيتك.",
  "مع السلامة يا صديقي! سأكون في انتظارك دائماً كلما احتجتني.",
  "نعم، سند معك وفي خدمتك! كيف أساعدك؟",
  "أمرك، أنا استمع إليك باهتمام، تفضل.",
  "معك يا صديقي، بماذا أخدمك اليوم؟",
  // common confirmations
  "تم.",
  "حاضر.",
  "تم بنجاح.",
  "لحظة من فضلك.",
  "تفضل، أنا أسمعك.",
  "لم أفهم، هل يمكنك الإعادة؟",
  "لا يوجد اتصال بالإنترنت، سأكمل بالعقل المحلي.",
  "عاد الاتصال بالإنترنت.",
  "البحث في الويب يحتاج اتصالاً بالإنترنت.",
  "تم الإلغاء.",
  "تعذر تحرير المنفذ.",
  "رقم المنفذ غير صالح.",
  "لا يوجد اتصال بالإنترنت.",
  "لا توجد منافذ تطوير مفتوحة الآن.",
  "تعذر تنفيذ الأمر.",
  "تم تحرير الذاكرة العشوائية.",
  "تم تنظيف الملفات المؤقتة.",
  "تم فتح البرنامج.",
  "تم إغلاق البرنامج.",
  "تم تحرير المنفذ بنجاح.",
  "المنفذ متاح وغير محجوز.",
  "سرعة الاتصال ممتازة.",
  "تم ترتيب سطح المكتب.",
  "صباح الخير! بدأنا روتين العمل.",
  "تم تفعيل وضع التركيز.",
  "انتهى يوم العمل، أراك غداً.",
];

const s = await getVoiceSettings();
const voices = [...new Set([s.maleVoice, s.femaleVoice])];
const started = Date.now();
const r = await warmVoiceCache(PHRASES, voices);
console.log(`voices: ${voices.join(", ")}`);
console.log(`created ${r.created}, already cached ${r.skipped}, failed ${r.failed} — ${((Date.now() - started) / 1000).toFixed(1)}s`);
stopVoiceWorker();
stopSidecar();
