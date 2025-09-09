// V2 API 버전 (config 방식)
// ─────────────────────────────────────────────────────────
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const axios = require("axios");

initializeApp();

function getCfg() {
  // config는 루트에서 가져옵니다 (region과 무관)
  const cfg = require("firebase-functions").config();
  return {
    account:   cfg.biz?.account,
    password:  cfg.biz?.password,
    from:      cfg.biz?.from,
    senderkey: cfg.kakao?.senderkey,  // 없으면 알림톡 생략
    tplIn:     cfg.tpl?.checkin,      // 없으면 알림톡 생략
    tplOut:    cfg.tpl?.checkout      // 없으면 알림톡 생략
  };
}

async function getAccessToken() {
  const { account, password } = getCfg();
  const basic = Buffer.from(`${account}:${password}`).toString("base64");
  const r = await axios.post("https://api.bizppurio.com/v1/token", null, {
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json; charset=utf-8" }
  });
  return `${r.data.type} ${r.data.accesstoken}`;
}

exports.sendAttendanceNotifications = onCall(
  { region: "asia-northeast3", timeoutSeconds: 30 },
  async (req) => {
    try {
      const data = req.data || {};
      if (!["checkin","checkout"].includes(data.kind) ||
          !data.studentName || !data.parentPhone || !data.timeText) {
        throw new HttpsError("invalid-argument", "필수값 누락");
      }

      const { account, from, senderkey, tplIn, tplOut } = getCfg();
      const isIn = data.kind === "checkin";
      const templatecode = isIn ? tplIn : tplOut;
      const hasKakao = !!(senderkey && templatecode);

      const atMessage  = isIn
        ? `${data.studentName}님 ${data.timeText} 등원했습니다.`
        : `${data.studentName}님 ${data.timeText} 하원했습니다.`;
      const smsMessage = `[${isIn ? "등원" : "하원"}] ${data.studentName} ${data.timeText}`;
      const ref = `${Date.now()}_${data.parentPhone}_${data.kind}`;

      const token = await getAccessToken();
      const headers = { Authorization: token, "Content-Type": "application/json; charset=utf-8" };

      if (hasKakao && data.sendBoth) {
        // 알림톡 + 문자 동시
        await axios.post("https://api.bizppurio.com/v3/message", {
          account, refkey: `${ref}_AT`, type: "at", from, to: data.parentPhone,
          content: { at: { senderkey, templatecode, message: atMessage } }
        }, { headers });
        await axios.post("https://api.bizppurio.com/v3/message", {
          account, refkey: `${ref}_SMS`, type: "sms", from, to: data.parentPhone,
          content: { sms: { message: smsMessage } }
        }, { headers });
      } else if (hasKakao) {
        // 알림톡 우선 + 실패시 문자 대체
        await axios.post("https://api.bizppurio.com/v3/message", {
          account, refkey: `${ref}_AT`, type: "at", from, to: data.parentPhone,
          content: { at: { senderkey, templatecode, message: atMessage } },
          resend: "sms", recontent: { sms: { message: smsMessage } }
        }, { headers });
      } else {
        // ✅ 카카오 값이 없으면 SMS만
        await axios.post("https://api.bizppurio.com/v3/message", {
          account, refkey: `${ref}_SMS`, type: "sms", from, to: data.parentPhone,
          content: { sms: { message: smsMessage } }
        }, { headers });
      }

      return { ok: true };
    } catch (e) {
      logger.error("sendAttendanceNotifications failed", e?.response?.data || e);
      throw new HttpsError("internal", "bizppurio send failed");
    }
  }
);
