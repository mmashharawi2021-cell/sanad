---
name: multi-terminal
description: تنفيذ وتشخيص أوامر الطرفيات المتعددة (PowerShell, CMD, Python, Node, Git) في سند
---

# مهارة الطرفية الشاملة وتشخيص الأخطاء (Multi-Terminal Skill)

تُمكّن هذه المهارة من تشغيل أوامر النظام عبر بيئات متعددة مع معالجة ذكية للأخطاء الشائعة على نظام Windows.

## البيئات المدعومة (Supported Shells):
1. **PowerShell (`powershell`):** للأوامر الإدارية وفحص النظام وWMI/CIM.
2. **Command Prompt (`cmd`):** للتوافقية وتشغيل ملفات `.bat`.
3. **Python (`python`):** لتشغيل سكربتات بايثون وتقييم التعبيرات (`python -c "..."`).
4. **Node.js (`node`):** لتشغيل سكربتات جافاسكريبت والـ REPL.
5. **Git (`git`):** لإدارة المستودع وعمليات الـ Commit والـ Branches.

## محرك التشخيص الذاتي (Auto-Diagnosis):
عند فشل أي أمر، يفحص `src/universalTerminal.ts` نمط الخطأ ويقترح الحل:
- `No module named 'xyz'` ➔ يقترح: `pip install xyz`
- `Cannot find module 'xyz'` ➔ يقترح: `npm.cmd install xyz`
- `is not recognized as an internal or external command` ➔ يقترح مسار التثبيت أو إضافة المتغير لـ PATH.
- `EADDRINUSE: :::PORT` ➔ يقترح معرفة العملية وإنهاؤها عبر `src/processMaestro.ts`.

## الملف المسؤول:
- `src/universalTerminal.ts`
- الـ API: `POST /api/terminal/universal`
