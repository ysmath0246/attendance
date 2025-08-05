import React, { useEffect, useState, useMemo } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  writeBatch,
  updateDoc,
  onSnapshot, 
 increment   
 
} from "firebase/firestore";
import "./index.css";

// ── Bizppurio 호출 모킹 함수 (실제 API 없이 UI/로직만 테스트) ──
async function sendBizppurioMessage(text) {
  console.log(`[MOCK] Bizppurio 메시지: ${text}`);
  // 필요하면 return Promise.resolve();
}

console.log("🐞 App.jsx v2 로드됨");


function AttendanceApp() {

  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [todayMakeups, setTodayMakeups] = useState([]); // 🔥 보강 표시용
  const [selectedTab, setSelectedTab] = useState("attendance");
  const [animated, setAnimated] = useState({});
  // 비밀번호 입력값
  const [password, setPassword] = useState("");
  // 인증 여부: 로컬스토리지에 “authenticated”가 "true" 이면 바로 true, 아니면 false
   // 로컬스토리지에 저장된 인증 여부를 초기값으로 세팅
 const [authenticated, setAuthenticated] = useState(() =>
   localStorage.getItem("authenticated") === "true"
 );
  const [now, setNow] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(0); // 🔥 추가: 페이지 번호
// ✅ 1. 상단 useState 추가
const [luckyWinner, setLuckyWinner] = useState(null);
const [luckyVisible, setLuckyVisible] = useState(false);
const [highStudents, setHighStudents] = useState([]);
const [highAttendance, setHighAttendance] = useState({});
const [dateOffset, setDateOffset] = useState(0);
const selectedDate = useMemo(() => {
  const d = new Date();
  d.setDate(d.getDate() + dateOffset);
  return d.toISOString().split("T")[0];
}, [dateOffset]);

// ─── 오늘 날짜인지 판단 ───
  const actualTodayStr = new Date().toISOString().split("T")[0];
  const isToday = selectedDate === actualTodayStr;
  const totalToday = Object.keys(attendance).length;
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,  // ✅ 이 줄 추가
  });

  const studentsPerPage = 10;
  const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));
  const totalPages = Math.ceil(sortedStudents.length / studentsPerPage);
  const paginatedStudents = sortedStudents.slice(
    currentPage * studentsPerPage,
    currentPage * studentsPerPage + studentsPerPage
  );
  
// ✅ 포인트 항목 리스트 선언
const pointFields = ["출석", "숙제", "수업태도", "시험", "문제집완료"];


  const today = new Date();
// ➕ 로컬 시간(KST) 기준 YYYY-MM-DD
const todayStr = selectedDate;
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const todayWeekday = weekdays[new Date(selectedDate).getDay()];
  // ─── 개발용: localhost 에서 띄우면 자동 로그인 ───
  useEffect(() => {
    if (window.location.hostname === "localhost") {
      setAuthenticated(true);
      localStorage.setItem("authenticated", "true");
    }
  }, []);
  // 📌 브라우저 “/” 키로 열리는 페이지 찾기 막기
  useEffect(() => {
    const blockSlash = (e) => {
      if (e.key === "/") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", blockSlash);
    return () => window.removeEventListener("keydown", blockSlash);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const snap = await getDocs(collection(db, "students"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
      // ✅ 기존 points: 숫자 → 항목별 객체로 마이그레이션
     const batch = writeBatch(db);
      list.forEach((s) => {
        if (typeof s.points === "number") {
          const converted = {
            출석: s.points,
            숙제: 0,
            수업태도: 0,
            시험: 0,
            문제집완료: 0,
          };
          batch.set(doc(db, "students", s.id), { points: converted }, { merge: true });
          s.points = converted;
        } else {
          pointFields.forEach((key) => {
            if (!s.points || s.points[key] === undefined) {
              if (!s.points) s.points = {};
              s.points[key] = 0;
            }
          });
        }

  // 🔥 가용포인트 초기화: availablePoints 필드가 없으면 0으로 설정
      if (s.availablePoints === undefined) {
        s.availablePoints = 0;
        batch.update(doc(db, "students", s.id), { availablePoints: 0 });
      }

      });
      await batch.commit();
      setStudents(list);
    
      // 🚨 오늘 출석 초기화 (이전 테스트 기록 제거)
      // ➕ 오늘 출석 문서를 완전 덮어쓴 뒤, 다시 읽어와서 빈 상태로 초기화
   
    };
    

fetchData(); // ✅ 함수 실행
}, []);
const [scheduleChanges, setScheduleChanges] = useState([]);

useEffect(() => {
  const attRef = doc(db, "attendance", selectedDate);
  const unsubscribe = onSnapshot(attRef, snap => {
    setAttendance(snap.exists() ? snap.data() : {});
  });
  return () => unsubscribe();
}, [selectedDate]);


useEffect(() => {
  const fetchChanges = async () => {
    const snap = await getDocs(collection(db, 'schedule_changes'));
    const changes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setScheduleChanges(changes);
  };
  fetchChanges();
}, []);

useEffect(() => {
  const fetchHigh = async () => {
    const snap = await getDocs(collection(db, 'students_high'));
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setHighStudents(list);
  };
  fetchHigh();
}, []);

 useEffect(() => {
   const fetchHighAttendance = async () => {
     const snap = await getDoc(doc(db, "high-attendance", selectedDate));
     setHighAttendance(snap.exists() ? snap.data() : {});
   };
   fetchHighAttendance();
 }, [selectedDate]);


const getScheduleForDate = (studentId, dateStr) => {
  const changes = scheduleChanges.filter(c => c.studentId === studentId);
  const applicable = changes.filter(c => c.effectiveDate <= dateStr);
  if (applicable.length === 0) {
    const student = students.find(s => s.id === studentId);
    return student?.schedules || [];
  }
  applicable.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return applicable[0].schedules;
};

  const getTimeGroups = () => {
  const g = {};
  const dateStr = selectedDate;


  students.forEach((s) => {
    if (s.active === false || (s.pauseDate && s.pauseDate <= dateStr)) return;
    const schedules = getScheduleForDate(s.id, dateStr);
    schedules.forEach(({ day, time }) => {
      if (day === todayWeekday) {
        if (!g[time]) g[time] = [];
        g[time].push(s);
      }
    });
  });

  return g;
};

const groupedByTime = useMemo(
  () => getTimeGroups(),
  [students, scheduleChanges, selectedDate]
);

// 🔁 Lucky 당첨자 Firebase에서 불러오기
useEffect(() => {
  const loadLuckyWinner = async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const luckyRef = doc(db, "dailyLucky", todayStr);
    const luckySnap = await getDoc(luckyRef);
    if (luckySnap.exists()) {
      const data = luckySnap.data();
      setLuckyWinner(data.name);
    }
  };
  loadLuckyWinner();
}, []);






// App.jsx 상단에 increment 임포트가 되어 있어야 합니다.
// import { /* … */, updateDoc, setDoc, increment } from "firebase/firestore";

const handleCardClick = async (student, scheduleTime) => {
  const todayStr = new Date().toISOString().split("T")[0];
  const record   = attendance[student.name];

  // ── 1) 처음 클릭 → 출석 처리 ──
  if (!record) {
    // 생일 뒷 4자리 인증
    const input = prompt(`${student.name} 생일 뒷 4자리를 입력하세요 (예: 1225)`);
    if (input !== student.birth?.slice(-4)) {
      alert("생일이 일치하지 않습니다.");
      return;
    }

    // 시간/스케줄 비교
    const now     = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const [hh, mm] = scheduleTime.split(":");
    const sched   = new Date(); sched.setHours(+hh, +mm, 0);
    const diffMin = (now - sched) / 60000;

    // 상태(status)와 포인트(point) 결정
    let status = "onTime";
    let point  = 0;
    if (diffMin > 15) {
      status = "tardy";
      point  = 0;
    }
    else if (diffMin >= -10 && diffMin <= 5) {
      point = 1;
      // Lucky 2pt 로직
      const nowMs      = now.getTime();
      const winStart   = sched.getTime() - 10 * 60000;
      const winEnd     = sched.getTime() +  5 * 60000;
      if (!dailyLucky?.winnerId &&
          student.id === dailyLucky?.candidateId &&
          nowMs >= winStart &&
          nowMs <= winEnd
      ) {
        point = 2;
        await updateDoc(doc(db, "dailyLucky", todayStr), {
          winnerId: student.id,
          time: timeStr
        });
        setLuckyWinner(student.name);
      }
    }
    else if (diffMin >= -15 && diffMin < -10) {
      point = 1;
    }

    // Firestore에 출석 저장
   await setDoc(doc(db, "attendance", todayStr), {
   [student.name]: { time: timeStr, status }
 }, { merge: true });

    setAttendance(prev => ({
      ...prev,
      [student.name]: { time: timeStr, status }
    }));

    // 학생 포인트/가용포인트 업데이트
    const prevPts   = student.points || {};
    const newPts    = { ...prevPts, 출석: (prevPts.출석 || 0) + point };
    const prevAvail = student.availablePoints || 0;
    const newAvail  = prevAvail + point;
    await updateDoc(doc(db, "students", student.id), {
      points: newPts,
      availablePoints: newAvail
    });
    setStudents(prev =>
      prev.map(s =>
        s.id === student.id
          ? { ...s, points: newPts, availablePoints: newAvail }
          : s
      )
    );

    // 알림 및 UI
    sendBizppurioMessage(`${student.name}님 출석하였습니다`);
    alert(`✅ ${student.name}님 출석 완료! (+${point}pt)`);
    return;
  }

  // ── 2) 두 번째 클릭 → 하원 처리 ──
  if (record.time && !record.departureTime) {
// ▶ 수업 시작시간(scheduleTime)으로부터 100분 이후에만 하원 가능
    const now = new Date();
    const [hhStart, mmStart] = scheduleTime.split(":");
    const start = new Date();
    start.setHours(+hhStart, +mmStart, 0);
    if (now - start < 100 * 60 * 1000) {
      alert("하원은 수업 시작 후 100분 이후에만 가능합니다!");
      return;
    }

    const pw = prompt(`${student.name} 생일 뒷 4자리를 입력하세요 (예: 1225)`);
    if (pw !== student.birth?.slice(-4)) {
      alert("비밀번호가 틀렸습니다.");
      return;
    }
    const depTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    // Firestore에 하원시간 추가
    await updateDoc(doc(db, "attendance", todayStr), {
      [`${student.name}.departureTime`]: depTime
    });

    // 하원 시 출석 포인트 1pt 추가
    await updateDoc(doc(db, "students", student.id), {
      "points.출석": increment(1),
      availablePoints: increment(1)
    });
    setStudents(prev =>
      prev.map(s =>
        s.id === student.id
          ? {
              ...s,
              points: { ...s.points, 출석: (s.points.출석||0) + 1 },
              availablePoints: (s.availablePoints||0) + 1
            }
          : s
      )
    );

    // 로컬 출석 상태 업데이트
    setAttendance(prev => ({
      ...prev,
      [student.name]: { ...prev[student.name], departureTime: depTime }
    }));

    // 알림 및 UI
    sendBizppurioMessage(`${student.name}님 하원하였습니다`);
    alert(`✅ ${student.name}님 하원 완료! (+1pt)`);
    return;
  }

  // ── 3) 이미 출석·하원 모두 처리된 경우엔 아무 동작 안 함 ──
};

//setStudents((prev) =>
 // prev.map((s) => (s.id === student.id ? { ...s, points: updated } : s))
//);

  //  setAnimated((prev) => ({ ...prev, [student.name]: true }));
   // setTimeout(() => setAnimated((prev) => ({ ...prev, [student.name]: false })), 1500);
 //   alert(`✅ ${student.name}님 출석 완료! (+1pt)`);
//};

  
  const handleLogin = () => {
    if (password === "1234") {
      setAuthenticated(true);
      localStorage.setItem("authenticated", "true");
    } else {
      alert("비밀번호가 틀렸습니다.");
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    localStorage.removeItem("authenticated");
  };


  if (!authenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-6 rounded shadow-md">
          <input
            type="password"
            placeholder="출석 체크 비밀번호"
            className="border p-2 mr-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            onClick={handleLogin}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            로그인
          </button>
        </div>
      </div>
    );
  }


    
  const handleOverrideTardy = async (studentName) => {
    const record = attendance[studentName];
    const pw = prompt("지각 상태입니다. 선생님 비밀번호를 입력하세요");
    if (pw === "0301") {
      const newStatus = { time: record.time, status: "onTime" };
      await setDoc(
        doc(db, "attendance", todayStr),
        { [studentName]: newStatus },
        { merge: true }
      );
      setAttendance(prev => ({ ...prev, [studentName]: newStatus }));
      alert(`${studentName}님의 출석 상태가 초록으로 변경되었습니다!`);
    }
  };


  const totalPoints = (p) => pointFields.reduce((sum, key) => sum + (p[key] || 0), 0);


// 동점자 처리: 상위 5개 점수별로 names 배열을 반환
const getTopRankings = (field) => {
  const list = students.map((s) => ({
    name: s.name,
    value: s.points?.[field] || 0
  }));
  // 점수 기준 내림차순, 중복 제거 후 상위 5개 점수만 추출
  const topValues = [...new Set(list.map((i) => i.value))]
    .sort((a, b) => b - a)
    .slice(0, 5);
  // 각 점수별 동점자 목록 생성
  return topValues.map((value) => ({
    value,
    names: list
     .filter((i) => i.value === value)
      .map((i) => i.name)
  }));
};




  const handleHighCardClick = async (student) => {
  const input = prompt(`${student.name} 생일 뒷 4자리를 입력하세요 (예: 1225)`);
  if (input !== student.birth?.slice(-4)) {
    alert("생일이 일치하지 않습니다.");
    return;
  }

  const now = new Date();
  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const todayStr = now.toISOString().split("T")[0];

  
  await setDoc(doc(db, "high-attendance", todayStr), {
    [student.name]: { time, status: "출석" }
  }, { merge: true });

  setHighAttendance(prev => ({
    ...prev,
    [student.name]: { time, status: "출석" }
  }));

  alert(`✅ ${student.name}님 고등부 출석 완료!`);
};
  




  return (
      <>
    {luckyVisible && (
  <div className="fixed top-10 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-white text-2xl font-bold px-6 py-3 rounded shadow-lg z-50 animate-bounce">
    🎉 Lucky!!! {luckyWinner}님 2pt!
  </div>
)}
{/* ✅ 4. 출석 카드 상단 공지 텍스트 추가 */}
<div className="flex items-center gap-2 justify-center text-sm text-blue-700 bg-blue-100 px-4 py-2 rounded mb-4">
  <span>📣</span>
  <div>
    <div>생일 4자리 입력시 출석완료!</div>
    <div> 랜덤 Lucky 2pt는 10분전~5분후까지만! 지각시 0pt</div>
  </div>
</div>

    <div className="bg-gray-100 min-h-screen p-6">
      <div className="max-w-5xl mx-auto flex space-x-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${
            selectedTab === "attendance"
              ? "bg-blue-500 text-white"
              : "bg-white text-gray-700"
          }`}
          onClick={() => setSelectedTab("attendance")}
        >
          출석 체크
        </button>
       

        <button onClick={() => setSelectedTab("ranking")}
    className={`px-4 py-2 rounded ${selectedTab === "ranking" ? "bg-blue-500 text-white" : "bg-white text-gray-700"}`}>
    포인트 랭킹
  </button>


      </div>

      {selectedTab === "attendance" && (
        <>
          <div className="max-w-5xl mx-auto flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-gray-700">
                📌 출석 체크 - {todayWeekday}요일
              </h1>
              <div className="text-gray-600">
               📅 {selectedDate} / ⏰ {timeStr} / ✅ 출석 인원: {totalToday}

              </div>
              <div className="text-center text-lg text-yellow-600 font-bold mb-4">
  🎉 오늘의 Lucky 당첨자: {luckyWinner ? `${luckyWinner}님` : '아직 없음'}
</div>

            </div>
<div className="flex items-center space-x-2">
  <button
    onClick={() => setDateOffset((prev) => prev - 1)}
    className="bg-gray-300 px-2 py-1 rounded"
  >
    ←
  </button>
  <div className="text-gray-700 font-semibold">
    {selectedDate}
  </div>
  <button
    onClick={() => setDateOffset((prev) => prev + 1)}
    className="bg-gray-300 px-2 py-1 rounded"
  >
    →
  </button>
</div>


            <button
              onClick={handleLogout}
              className="bg-red-400 text-white px-4 py-2 rounded"
            >
              로그아웃
            </button>
          </div>

          {Object.keys(groupedByTime)
            .sort()
            .map((time) => (
              <div
                key={time}
                className="max-w-5xl mx-auto mb-6 bg-white p-4 rounded-lg shadow-md"
              >
                <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-800">
                  {time} 수업
                </h2>
                <div className="grid grid-cols-6 gap-4">
                {groupedByTime[time].map((student) => {
  const record      = attendance[student.name];
  const isPresent   = !!record;
  const hasDeparted = !!record?.departureTime;  // ✨ 하원 여부
 return (
    <div
      key={student.id}
      className={`
        relative            /* 스탬프 위치를 위해 */
        card
        ${isPresent
          ? record.status === "tardy" ? "tardy" : "attended"
         : ""
        }
{hasDeparted
  ? "border-4 border-blue-700 ring-4 ring-blue-300 ring-offset-2 ring-offset-white"
  : ""}        ${animated[student.name] ? "animated" : ""}
        ${!isToday
          ? "cursor-not-allowed pointer-events-none"
          : hasDeparted      /* 하원 완료된 경우에만 비활성화 */
            ? "cursor-not-allowed pointer-events-none"
            : "cursor-pointer hover:shadow-lg"
        }
      `}

      onContextMenu={(e) => e.preventDefault()}
     onClick={(e) => {
      e.preventDefault();           // 클릭 기본 동작 차단
      handleCardClick(student, time);
    }}
    >
      {/* ── 하원 완료 스탬프 ── */}
      {hasDeparted && (
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-1 py-0.5 rounded">
          
        </div>
      )}
      {/* ─── 카드 내부 콘텐츠 ─── */}
      {/* 👑 Lucky 당첨자 왕관 */}
{student.name === luckyWinner && (
    <div className="text-3xl text-yellow-500 text-center mb-1">👑</div>
)}
      
{/* 💡 전체 + 가용 포인트 */}
<div className="text-right text-xs font-semibold text-gray-700 leading-none mb-1">
  총 {totalPoints(student.points)}pt<br />
  <span className="text-green-600">가용 {student.availablePoints ?? totalPoints(student.points)}pt</span>
</div>



      {/* 2) 학생 이름 */}
      <p className="name m-0 leading-none mb-1">{student.name}</p>

      {/* 3) 이미 출석했으면 상태·시간 표시 */}
      {isPresent && (
  <div className="time-text m-0 leading-none mt-1 text-sm">
    <div>
      {record.status === "tardy" ? "⚠️ 지각" : "✅ 출석"}
    </div>
    {/* 출석시간 */}
    <div>출석: {record.time}</div>
    {/* 하원시간이 있을 때만 */}
    {record.departureTime && (
      <div>하원: {record.departureTime}</div>
    )}
  </div>
)}
      {/* ─── 카드 내부 콘텐츠 끝 ─── */}
    </div>
  );
})}
                
                </div>
              </div>
            ))}


           <div className="max-w-5xl mx-auto mt-8">
  <h2 className="text-xl font-bold mb-4">🎓 고등부 출석</h2>
  <div className="grid grid-cols-6 gap-4">

  {highStudents.map(student => {
    const record = highAttendance[student.name];
    const isPresent = record?.status === "출석";

    return (
       <div
      key={student.id}
     className={`
          card
          ${isPresent ? "attended" : ""}
          ${!isToday
            ? "cursor-not-allowed pointer-events-none"
            : "cursor-pointer hover:shadow-lg"
          }
        `}
      onClick={() => {
        if (!isToday) {
          alert("과거나 미래 날짜에는 출석 체크할 수 없습니다!");
          return;
        }
        handleHighCardClick(student);
      }}
    >
       <p className="name m-0 leading-none mb-1">{student.name}</p>
        {isPresent && (
          <p className="time-text m-0 leading-none mt-1">
            ✅ 출석<br />{record.time}
          </p>
        )}
      </div>
    );
  })}
</div>


</div>

        </>
      )}


{selectedTab === "ranking" && (
  <div className="max-w-5xl mx-auto bg-white p-6 rounded-lg shadow-md">
    <h2 className="text-xl font-semibold mb-4">🏆 포인트 랭킹 (실시간)</h2>

    {pointFields.map((field) => {
     const rankings = getTopRankings(field);
     return (
       <div
         key={field}
         className="bg-white p-4 rounded-lg shadow-md overflow-x-auto"
       >
         <div className="text-lg font-semibold mb-2">{field} TOP 5</div>
         <table className="w-full table-auto border border-gray-200 rounded-lg overflow-hidden">
           <thead className="bg-gray-50">
             <tr className="sticky top-0">
               <th className="px-4 py-2 text-left text-sm font-semibold">순위</th>
               <th className="px-4 py-2 text-left text-sm font-semibold">이름</th>
               <th className="px-4 py-2 text-right text-sm font-semibold">포인트</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-gray-100">
             {rankings.map((item, idx) => {
               const maxDisplay = 3;
               const namesToShow = item.names.slice(0, maxDisplay);
               const moreCount = item.names.length - maxDisplay;
               return (
                 <tr key={`${field}-${idx}`} className={idx === 0 ? "bg-blue-50" : ""}>
                   <td className="px-4 py-2 whitespace-nowrap font-bold">{idx + 1}등</td>
                   <td className="px-4 py-2 whitespace-nowrap">
                    {namesToShow.join(", ")}
                     {moreCount > 0 && ` 외 ${moreCount}명`}
                   </td>
                   <td className="px-4 py-2 whitespace-nowrap text-right text-gray-600">
                     {item.value}pt
                   </td>
                 </tr>
               );
             })}
           </tbody>
         </table>
       </div>
     );
   })}

  {/* 총합 TOP 5 테이블도 같은 스타일로 */}
  <div className="bg-white p-4 rounded-lg shadow-md overflow-x-auto">
    <div className="text-lg font-semibold mb-2">💯 총합 TOP 5</div>
    <table className="w-full table-auto border border-gray-200 rounded-lg overflow-hidden">
      <thead className="bg-gray-50">
        <tr className="sticky top-0">
          <th className="px-4 py-2 text-left text-sm font-semibold">순위</th>
          <th className="px-4 py-2 text-left text-sm font-semibold">이름</th>
          <th className="px-4 py-2 text-right text-sm font-semibold">포인트</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {(() => {
          const totalList = students.map((s) => ({
            name: s.name,
            value: totalPoints(s.points),
          }));
          const totalValues = [...new Set(totalList.map((i) => i.value))]
            .sort((a, b) => b - a)
            .slice(0, 5);
          const totalRankings = totalValues.map((value) => ({
            value,
            names: totalList.filter((i) => i.value === value).map((i) => i.name),
          }));
          return totalRankings.map((item, idx) => {
            const maxDisplay = 3;
            const namesToShow = item.names.slice(0, maxDisplay);
            const moreCount = item.names.length - maxDisplay;
            return (
              <tr key={`total-${idx}`} className={idx === 0 ? "bg-blue-50" : ""}>
                <td className="px-4 py-2 whitespace-nowrap font-bold">{idx + 1}등</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {namesToShow.join(", ")}
                  {moreCount > 0 && ` 외 ${moreCount}명`}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-right text-gray-600">
                  {item.value}pt
                </td>
              </tr>
            );
          });
        })()}
      </tbody>
    </table>
  </div>
  </div>
)}

 </div>   
    </>         
); 
}   

export default AttendanceApp;