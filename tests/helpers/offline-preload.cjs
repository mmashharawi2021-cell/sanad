// محاكاة انقطاع الإنترنت لعملية Node (يُحمَّل بـ --require): يفشل أي حل أسماء لعنوان خارج الجهاز،
// كما يحدث عند انقطاع الواي فاي. العناوين المحلية (Ollama، الخادم نفسه) تعمل طبيعياً.
const dns = require("node:dns");
const orig = dns.lookup;
const local = (h) => h === "localhost" || h === "127.0.0.1" || h === "::1";
const fail = (host) => Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND", hostname: host });
dns.lookup = function (host, opts, cb) {
  if (typeof opts === "function") { cb = opts; opts = {}; }
  if (local(host)) return orig.call(dns, host, opts, cb);
  process.nextTick(() => cb(fail(host)));
};
const p = dns.promises.lookup;
dns.promises.lookup = (host, opts) => (local(host) ? p(host, opts) : Promise.reject(fail(host)));
