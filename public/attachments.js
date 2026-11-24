/* سند — مرفقات صندوق الكتابة وقراءة الملفات المسحوبة
   نُقل حرفياً من السكربت المضمّن في index.html (المرحلة 3). سكربت عادي (لا module):
   يشارك المتغيرات والدوال العامة مع بقية سكربتات الصفحة، ويُحمَّل بترتيبه بعد السكربت المضمّن. */
      /* ======================= file inspector (sanad) ======================= */

      function renderAttachments() {
        if (!attachmentBar) return;
        attachmentBar.innerHTML = "";
        if (!currentAttachments.length) {
          attachmentBar.classList.add("hidden");
          return;
        }

        attachmentBar.classList.remove("hidden");
        currentAttachments.forEach((att, index) => {
          const pill = document.createElement("div");
          pill.className = "attachment-pill";

          const icon = att.filename.toLowerCase().endsWith(".pdf") ? "📄" : "📝";
          const size = att.sizeBytes ? `${(att.sizeBytes / 1024).toFixed(0)} KB` : "";
          const pages = att.pages ? ` · ${att.pages} صفحة` : "";
          pill.innerHTML = `<span>${icon} <b>${escapeHtml(att.filename)}</b> ${size ? `<small>(${size}${pages})</small>` : ""}</span>`;

          const del = document.createElement("button");
          del.type = "button";
          del.className = "del-attach";
          del.title = "إزالة الملف";
          del.textContent = "✕";
          del.addEventListener("click", () => {
            currentAttachments.splice(index, 1);
            renderAttachments();
          });

          pill.appendChild(del);
          attachmentBar.appendChild(pill);
        });
      }

      async function handleFiles(files) {
        if (!files || !files.length) return;

        for (const file of Array.from(files)) {
          const tempPill = document.createElement("div");
          tempPill.className = "attachment-pill";
          tempPill.innerHTML = `<span>⏳ جارٍ استخراج <b>${escapeHtml(file.name)}</b>...</span>`;
          attachmentBar.classList.remove("hidden");
          attachmentBar.appendChild(tempPill);

          try {
            const base64 = await readFileAsBase64(file);
            const res = await fetch("/api/files/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: file.name, contentBase64: base64 }),
            });

            tempPill.remove();

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              sanadNotify.error(err.error || "فشل استخراج المحتوى", `تعذّرت قراءة ${file.name}`);
              continue;
            }

            const data = await res.json();
            if (data.file) {
              currentAttachments.push(data.file);
            }
          } catch (err) {
            tempPill.remove();
            console.warn(err);
            sanadNotify.error("تأكد أن الملف غير تالف ثم أعد المحاولة.", `تعذّرت قراءة ${file.name}`);
          }
        }

        renderAttachments();
      }

      function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || "");
            const base64 = result.includes(",") ? result.split(",")[1] : result;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      if (attachBtn && fileInput) {
        attachBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", (e) => {
          handleFiles(e.target.files);
          fileInput.value = "";
        });
      }

      let dragCounter = 0;
      window.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dragCounter++;
        if (dropOverlay) dropOverlay.classList.remove("hidden");
      });

      window.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0 && dropOverlay) {
          dragCounter = 0;
          dropOverlay.classList.add("hidden");
        }
      });

      window.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      window.addEventListener("drop", (e) => {
        e.preventDefault();
        dragCounter = 0;
        if (dropOverlay) dropOverlay.classList.add("hidden");
        if (e.dataTransfer?.files?.length) {
          handleFiles(e.dataTransfer.files);
        }
      });
