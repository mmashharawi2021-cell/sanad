/* سند — نافذة الشبكة والمنافذ
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= Network & Ports Maestro ======================= */

      const networkModalBackdrop = document.getElementById("networkModalBackdrop");
      const netAlert = document.getElementById("netAlert");
      const netInfoSummary = document.getElementById("netInfoSummary");
      const netInfoKv = document.getElementById("netInfoKv");
      const netPingHost = document.getElementById("netPingHost");
      const netPingBtn = document.getElementById("netPingBtn");
      const netPingValue = document.getElementById("netPingValue");
      const netPingQuality = document.getElementById("netPingQuality");
      const netPingDetails = document.getElementById("netPingDetails");
      const netFreePortForm = document.getElementById("netFreePortForm");
      const netFreePortInput = document.getElementById("netFreePortInput");
      const netPortsBody = document.getElementById("netPortsBody");
      const netPortsCount = document.getElementById("netPortsCount");
      const netPortsSearch = document.getElementById("netPortsSearch");
      const netDevOnly = document.getElementById("netDevOnly");
      const netShowUdp = document.getElementById("netShowUdp");
      const islandLatencyBadge = document.getElementById("islandLatencyBadge");

      let netPortsCache = [];
      let netPublicIpRevealed = false;
      let netLastInfo = null;

      const NET_QUALITY_CLASS = { "ممتاز": "net-q-excellent", "جيد": "net-q-good", "متوسط": "net-q-medium", "ضعيف": "net-q-poor", "منقطع": "net-q-down" };
      const NET_QUALITY_COLOR = { "ممتاز": "#3fb950", "جيد": "var(--accent)", "متوسط": "#d29922", "ضعيف": "var(--danger)", "منقطع": "var(--danger)" };

      function showNetAlert(message, ok = true) {
        sanadNotify({ type: ok ? "success" : "error", title: "الشبكة والمنافذ", body: message });
      }

      function netSpeak(message) {
        if (typeof updateIslandLatest === "function") updateIslandLatest(escapeHtml(message));
      }

      function maskIp(ip) {
        if (!ip) return "غير متاح";
        if (netPublicIpRevealed) return ip;
        const parts = ip.split(".");
        return parts.length === 4 ? `${parts[0]}.•••.•••.${parts[3]}` : "•••• (اضغط للإظهار)";
      }

      function renderNetInfo() {
        if (!netInfoKv || !netLastInfo) return;
        const info = netLastInfo;
        const primary = info.adapters.find((a) => a.ipv4.includes(info.primaryLocalIp)) || info.adapters[0];
        if (netInfoSummary) netInfoSummary.textContent = primary ? `${primary.type === "Wi-Fi" ? "📶" : "🔗"} ${primary.networkName || primary.name}` : info.message;
        const rows = [];
        if (primary) {
          rows.push(["البطاقة", primary.description || primary.name]);
          rows.push(["النوع / السرعة", `${primary.type} — ${primary.linkSpeed}`]);
          rows.push(["IP المحلي", info.primaryLocalIp || "—"]);
        }
        rows.push(["IP العام", `<span id="netPublicIpToggle" style="cursor: pointer; text-decoration: underline dotted;" title="اضغط للإظهار / الإخفاء">${escapeHtml(maskIp(info.publicIp))}</span>`, true]);
        if (primary) {
          rows.push(["البوابة (Gateway)", primary.gateway || "—"]);
          rows.push(["DNS", primary.dns.join("، ") || "—"]);
          rows.push(["MAC", primary.macAddress || "—"]);
        }
        rows.push(["اسم الجهاز", info.hostname || "—"]);
        netInfoKv.innerHTML = rows.map(([k, v, raw]) => `<dt>${escapeHtml(k)}</dt><dd>${raw ? v : escapeHtml(String(v))}</dd>`).join("");
        const toggle = document.getElementById("netPublicIpToggle");
        if (toggle) toggle.addEventListener("click", () => { netPublicIpRevealed = !netPublicIpRevealed; renderNetInfo(); });
      }

      async function loadNetInfo() {
        if (netInfoSummary) netInfoSummary.textContent = "جاري فحص بطاقة الشبكة...";
        try {
          const res = await fetch("/api/network/info");
          netLastInfo = await res.json();
          renderNetInfo();
          return netLastInfo;
        } catch (e) {
          if (netInfoSummary) netInfoSummary.textContent = "تعذر قراءة معلومات الشبكة: " + e.message;
          return null;
        }
      }

      function setIslandLatency(result) {
        if (!islandLatencyBadge) return;
        if (!result || result.avgMs === null) {
          islandLatencyBadge.textContent = "✕";
          islandLatencyBadge.style.color = "var(--danger)";
        } else {
          islandLatencyBadge.textContent = `${result.avgMs}ms`;
          islandLatencyBadge.style.color = NET_QUALITY_COLOR[result.quality] || "var(--muted)";
        }
      }

      async function runNetPing(host) {
        const target = (host || (netPingHost && netPingHost.value) || "8.8.8.8").trim();
        if (netPingHost) netPingHost.value = target;
        if (netPingBtn) { netPingBtn.disabled = true; netPingBtn.textContent = "⏳"; }
        if (netPingValue) netPingValue.textContent = "…";
        if (netPingDetails) netPingDetails.textContent = `جاري قياس زمن الاستجابة إلى ${target}...`;
        if (typeof setIslandStatus === "function") setIslandStatus("يفحص الشبكة...", true);
        try {
          const res = await fetch("/api/network/ping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ host: target }),
          });
          const data = await res.json();
          if (netPingValue) netPingValue.textContent = data.avgMs !== null ? `${data.avgMs} ms` : "—";
          if (netPingQuality) {
            netPingQuality.className = "net-quality " + (NET_QUALITY_CLASS[data.quality] || "");
            netPingQuality.textContent = data.quality;
          }
          if (netPingDetails) {
            netPingDetails.textContent = data.avgMs !== null
              ? `أدنى ${data.minMs}ms · أقصى ${data.maxMs}ms · فقدان ${data.lossPercent}% (${data.received}/${data.sent})`
              : data.message;
          }
          setIslandLatency(data);
          playSciFiSound(data.success ? "done" : "confirm");
          return data;
        } catch (e) {
          if (netPingDetails) netPingDetails.textContent = "تعذر الفحص: " + e.message;
          setIslandLatency(null);
          return null;
        } finally {
          if (netPingBtn) { netPingBtn.disabled = false; netPingBtn.textContent = "فحص"; }
          if (typeof setIslandStatus === "function") setIslandStatus("جاهز");
        }
      }

      function renderNetPorts() {
        if (!netPortsBody) return;
        const q = ((netPortsSearch && netPortsSearch.value) || "").trim().toLowerCase();
        const devOnly = !!(netDevOnly && netDevOnly.checked);
        const list = netPortsCache.filter((p) => {
          if (devOnly && !p.isDevPort) return false;
          if (!q) return true;
          return String(p.port).includes(q) || String(p.pid).includes(q) || p.processName.toLowerCase().includes(q) || (p.label || "").toLowerCase().includes(q);
        });
        if (netPortsCount) netPortsCount.textContent = `(${list.length} من ${netPortsCache.length})`;
        if (list.length === 0) {
          netPortsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 16px;">لا توجد منافذ مطابقة.</td></tr>`;
          return;
        }
        netPortsBody.innerHTML = list.map((p) => {
          const action = p.isProtected
            ? `<span class="net-lock" title="عملية نظام محمية أو خادم سند نفسه">🔒 محمي</span>`
            : `<button class="net-kill-btn" type="button" data-kill-port="${p.port}">🛑 إنهاء</button>`;
          const label = p.label ? `<div class="net-label">${escapeHtml(p.label)}</div>` : "";
          return `<tr class="${p.isDevPort ? "net-dev" : ""}">
            <td class="mono"><strong>${p.port}</strong>${label}</td>
            <td>${p.protocol}</td>
            <td title="${escapeHtml(p.processPath || "")}">${escapeHtml(p.processName)}</td>
            <td class="mono">${p.pid}</td>
            <td class="mono">${escapeHtml(p.localAddress)}</td>
            <td>${action}</td>
          </tr>`;
        }).join("");
      }

      async function loadNetPorts() {
        if (netPortsBody && netPortsCache.length === 0) {
          netPortsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 16px;">جاري فحص المنافذ...</td></tr>`;
        }
        try {
          const udp = netShowUdp && netShowUdp.checked ? "1" : "0";
          const res = await fetch(`/api/network/ports?udp=${udp}`);
          const data = await res.json();
          netPortsCache = Array.isArray(data.ports) ? data.ports : [];
          renderNetPorts();
          return netPortsCache;
        } catch (e) {
          if (netPortsBody) netPortsBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 16px;">تعذر فحص المنافذ: ${escapeHtml(e.message)}</td></tr>`;
          return [];
        }
      }

      async function checkNetPort(port) {
        const n = Number(port);
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
          showNetAlert("رقم المنفذ غير صالح (1 – 65535).", false);
          return null;
        }
        try {
          const res = await fetch(`/api/network/port/check?port=${n}`);
          const data = await res.json();
          showNetAlert(data.message, !data.inUse);
          return data;
        } catch (e) {
          showNetAlert("تعذر فحص المنفذ: " + e.message, false);
          return null;
        }
      }

      /**
       * Free a port by terminating its holder. `skipConfirm` is used by chat commands.
       */
      async function killNetPort(port, skipConfirm = false) {
        const n = Number(port);
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
          showNetAlert("رقم المنفذ غير صالح (1 – 65535).", false);
          return null;
        }
        if (!skipConfirm) {
          const holders = netPortsCache.filter((p) => p.port === n);
          const who = holders.length ? [...new Set(holders.map((h) => `${h.processName} (PID ${h.pid})`))].join("، ") : "العملية المحتجزة";
          if (!(await sanadConfirm({ title: `تحرير المنفذ ${n}؟`, message: `سيتم إنهاء ${who}. قد تفقد أي عمل غير محفوظ فيه.`, confirmText: "إنهاء", destructive: true }))) return null;
        }
        if (typeof setIslandStatus === "function") setIslandStatus(`يحرر المنفذ ${n}...`, true);
        try {
          const res = await fetch("/api/network/kill-port", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ port: n }),
          });
          const data = await res.json();
          showNetAlert(data.message, data.success);
          playSciFiSound(data.success ? "done" : "confirm");
          netSpeak(data.message);
          await loadNetPorts();
          return data;
        } catch (e) {
          showNetAlert("تعذر تحرير المنفذ: " + e.message, false);
          return null;
        } finally {
          if (typeof setIslandStatus === "function") setIslandStatus("جاهز");
        }
      }

      function openNetworkModal() {
        if (!networkModalBackdrop) return;
        networkModalBackdrop.classList.add("open");
        loadNetInfo();
        loadNetPorts();
      }

      function closeNetworkModal() {
        if (!networkModalBackdrop) return;
        networkModalBackdrop.classList.remove("open");
        if (netAlert) netAlert.className = "net-alert";
      }

      window.openNetworkModal = openNetworkModal;
      window.runNetPing = runNetPing;
      window.killNetPort = killNetPort;
      window.checkNetPort = checkNetPort;
      window.loadNetInfo = loadNetInfo;

      const netMaestroBtn = document.getElementById("netMaestroBtn");
      if (netMaestroBtn) netMaestroBtn.addEventListener("click", openNetworkModal);
      const netCloseBtn = document.getElementById("netCloseBtn");
      if (netCloseBtn) netCloseBtn.addEventListener("click", closeNetworkModal);
      if (networkModalBackdrop) {
        networkModalBackdrop.addEventListener("click", (e) => { if (e.target === networkModalBackdrop) closeNetworkModal(); });
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && networkModalBackdrop && networkModalBackdrop.classList.contains("open")) closeNetworkModal();
      });

      const netInfoRefreshBtn = document.getElementById("netInfoRefreshBtn");
      if (netInfoRefreshBtn) netInfoRefreshBtn.addEventListener("click", loadNetInfo);
      if (netPingBtn) netPingBtn.addEventListener("click", () => runNetPing());
      if (netPingHost) netPingHost.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runNetPing(); } });
      document.querySelectorAll("[data-ping-host]").forEach((btn) => {
        btn.addEventListener("click", () => runNetPing(btn.getAttribute("data-ping-host")));
      });

      if (netFreePortForm) {
        netFreePortForm.addEventListener("submit", (e) => {
          e.preventDefault();
          killNetPort(netFreePortInput && netFreePortInput.value);
        });
      }
      const netCheckPortBtn = document.getElementById("netCheckPortBtn");
      if (netCheckPortBtn) netCheckPortBtn.addEventListener("click", () => checkNetPort(netFreePortInput && netFreePortInput.value));

      if (netPortsBody) {
        netPortsBody.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-kill-port]");
          if (!btn) return;
          btn.disabled = true;
          killNetPort(btn.getAttribute("data-kill-port")).finally(() => { btn.disabled = false; });
        });
      }
      if (netPortsSearch) netPortsSearch.addEventListener("input", renderNetPorts);
      if (netDevOnly) netDevOnly.addEventListener("change", renderNetPorts);
      if (netShowUdp) netShowUdp.addEventListener("change", loadNetPorts);
      const netPortsRefreshBtn = document.getElementById("netPortsRefreshBtn");
      if (netPortsRefreshBtn) netPortsRefreshBtn.addEventListener("click", loadNetPorts);

      const islandNetBtn = document.getElementById("islandNetBtn");
      if (islandNetBtn) islandNetBtn.addEventListener("click", openNetworkModal);
      const islandPortsBtn = document.getElementById("islandPortsBtn");
      if (islandPortsBtn) islandPortsBtn.addEventListener("click", () => {
        openNetworkModal();
        if (netDevOnly) { netDevOnly.checked = true; renderNetPorts(); }
      });
      const islandPingBtn = document.getElementById("islandPingBtn");
      if (islandPingBtn) islandPingBtn.addEventListener("click", async () => {
        const data = await runNetPing("8.8.8.8");
        if (data) netSpeak(data.message);
      });
