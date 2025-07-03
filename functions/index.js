const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const axios     = require('axios');

admin.initializeApp();

// 환경 변수로부터 읽어오기
const KAKAO_API_KEY = functions.config().kakao.rest_api_key;
const TEMPLATE_CODE = functions.config().kakao.template_code;

// attendance/{date} 문서가 생성될 때마다 실행
exports.sendAttendanceAlerts = functions.firestore
  .document('attendance/{date}')
  .onCreate(async (snap, context) => {
    const attendanceData = snap.data();  
    const dateLabel = context.params.date; // ex. "2025-06-18"

    // attendanceData 구조 예시:
    // {
    //   "김가린": { status: "onTime", time: "오후 02:21", parentPhone: "01012345678" },
    //   "김보민": { status: "late",   time: "오후 02:51", parentPhone: "01098765432" },
    //    …
    // }

    // 학생별로 카카오 알림톡 전송
    const promises = Object.entries(attendanceData).map(async ([studentName, info]) => {
      // info.status, info.time 외에 parentPhone 필드를 미리 컬렉션에 저장했다면 사용
      const parentPhone = info.parentPhone;  
      if (!parentPhone) return;

      // 보낼 메시지 변수 매핑
      const variables = {
        학생명: studentName,
        날짜: dateLabel,
        상태: info.status === 'onTime' ? '출석' : info.status === 'late' ? '지각' : info.status,
        출석시간: info.time
      };

      try {
        await axios.post('https://api.bizmessage.kakao.com/v1/message/send', {
          template_code: TEMPLATE_CODE,
          message: {
            to: parentPhone,
            variables
          }
        }, {
          headers: {
            'Authorization': `KakaoAK ${KAKAO_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        console.log(`✅ ${studentName} 알림톡 전송 성공`);
      } catch (err) {
        console.error(`❌ ${studentName} 전송 실패`, err.response?.data || err.message);
      }
    });

    // 모든 전송이 끝날 때까지 대기
    await Promise.all(promises);
  });
