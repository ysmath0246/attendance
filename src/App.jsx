// src/App.jsx
import React, { useEffect, useState, useMemo } from "react";

import { getFunctions, httpsCallable } from "firebase/functions";
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
  increment,
} from "firebase/firestore";

import "./index.css";

// ── Bizppurio 실제 호출 (Cloud Functions httpsCallable) ──
const functions = getFunctions(undefined, "asia-northeast3");
const sendNoti = httpsCallable(functions, "sendAttendanceNotifications");

/**
 * kind: "checkin" | "checkout"
 * student: 학생 객체(부모 연락처 필드가 있으면 자동 인식)
 * opts: { scheduleTime?: "HH:MM", timeText: "HH:MM" }
 */
async function sendBizppurioMessage(kind, student, opts = {}) {
  const rawPhone = student.parentPhone ?? "";
  const to = String(rawPhone).replace(/\D/g, ""); // 하이픈/공백 제거
  if (!to) {
    console.warn("학부모 연락처가 없어 알림 전송을 스킵합니다:", student.name);
    return;
  }
  if (!/^0\d{9,10}$/.test(to)) {
    console.warn("전화번호 형식이 올바르지 않습니다:", student.name, rawPhone);
    return; // 잘못된 번호면 전송 스킵(로그만 남김)
  }

  const payload = {
    kind, // "checkin" | "checkout"
    studentName: student.name, // 학생명
    parentPhone: to, // 받는번호(숫자만)
    classTitle: student.classTitle ?? "", // 선택: 반 이름/요일 등
    classTime: opts.scheduleTime, // 선택: 수업 시작 "HH:MM"
    timeText: opts.timeText, // 실제 등/하원 시각 "HH:MM"
    sendBoth: true, // 알림톡+문자 동시 발송
  };

  try {
    await sendNoti(payload);
  } catch (e) {
    console.error("Bizppurio 전송 실패:", e);
  }
}

console.log("🐞 App.jsx v2 로드됨");

// KST(로컬) 기준 YYYY-MM-DD
function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function AttendanceApp() {
  // ── useState ──
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [todayMakeups, setTodayMakeups] = useState([]); // (보강 표시용 - 지금은 미사용이면 나중에 써도 됨)
  const [selectedTab, setSelectedTab] = useState("attendance");
  const [animated, setAnimated] = useState({});
  const [password, setPassword] = useState(""); // 출석 비번
  const [authenticated, setAuthenticated] = useState(() =>
    localStorage.getItem("authenticated") === "true"
  );
  const [now, setNow] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(0);
  const [luckyWinner, setLuckyWinner] = useState(null);
  const [luckyVisible, setLuckyVisible] = useState(false);
  const [dateOffset, setDateOffset] = useState(0);
  const [dailyLucky, setDailyLucky] = useState({
    winnerId: null,
    candidateId: null,
  });
  const [scheduleChanges, setScheduleChanges] = useState([]);

  // ── 고정 상수 ──
  const pointFields = ["출석", "숙제", "수업태도", "시험", "문제집완료"];

  // ── 파생값 ──
  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    return ymdLocal(d);
  }, [dateOffset]);

  const actualTodayStr = ymdLocal(new Date());
  const isToday = selectedDate === actualTodayStr;

  const totalToday = Object.keys(attendance).length;
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const studentsPerPage = 10;
  const sortedStudents = [...students].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const totalPages = Math.ceil(sortedStudents.length / studentsPerPage);
  const paginatedStudents = sortedStudents.slice(
    currentPage * studentsPerPage,
    currentPage * studentsPerPage + studentsPerPage
  );

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const todayWeekday = weekdays[new Date(selectedDate).getDay()];

  // ── Effects ──
  useEffect(() => {
    // localhost는 자동 로그인
    if (window.location.hostname === "localhost") {
      setAuthenticated(true);
      localStorage.setItem("authenticated", "true");
    }
  }, []);

  useEffect(() => {
    // "/" 입력 방지
    const blockSlash = (e) => {
      if (e.key === "/") e.preventDefault();
    };
    window.addEventListener("keydown", blockSlash);
    return () => window.removeEventListener("keydown", blockSlash);
  }, []);

  // 학생 데이터 + points 마이그레이션 + availablePoints 초기화
  useEffect(() => {
    const fetchData = async () => {
      const snap = await getDocs(collection(db, "students"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const batch = writeBatch(db);

      list.forEach((s) => {
        // points가 숫자였던 예전 데이터 → 객체로 변환
        if (typeof s.points === "number") {
          const converted = {
            출석: s.points,
            숙제: 0,
            수업태도: 0,
            시험: 0,
            문제집완료: 0,
          };
          batch.set(
            doc(db, "students", s.id),
            { points: converted },
            { merge: true }
          );
          s.points = converted;
        } else {
          // points 객체 누락 필드 보정
          pointFields.forEach((key) => {
            if (!s.points || s.points[key] === undefined) {
              if (!s.points) s.points = {};
              s.points[key] = 0;
            }
          });
        }

        // availablePoints 없으면 0으로 초기화
        if (s.availablePoints === undefined) {
          s.availablePoints = 0;
          batch.update(doc(db, "students", s.id), { availablePoints: 0 });
        }
      });

      await batch.commit();
      setStudents(list);
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 출석 문서 실시간 구독
  useEffect(() => {
    const attRef = doc(db, "attendance", selectedDate);
    const unsubscribe = onSnapshot(attRef, (snap) => {
      setAttendance(snap.exists() ? snap.data() : {});
    });
    return () => unsubscribe();
  }, [selectedDate]);

  // 스케줄 변경 실시간 구독
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schedule_changes"), (snap) => {
      const changes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setScheduleChanges(changes);
    });
    return () => unsub();
  }, []);

  // Lucky 당첨자 불러오기 (오늘 기준)
  useEffect(() => {
    const loadLuckyWinner = async () => {
      const t = ymdLocal(new Date());
      const luckyRef = doc(db, "dailyLucky", t);
      const luckySnap = await getDoc(luckyRef);
      if (luckySnap.exists()) {
        const data = luckySnap.data();
        setLuckyWinner(data.name);
        setDailyLucky(data);
      }
    };
    loadLuckyWinner();
  }, []);

  // now 10초마다 업데이트 (색상/시간 표시용)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  // ── Helper: 날짜별 스케줄 가져오기 ──
  const getScheduleForDate = (studentId, dateStr) => {
    const changes = scheduleChanges.filter((c) => c.studentId === studentId);
    const applicable = changes.filter((c) => c.effectiveDate <= dateStr);

    if (applicable.length === 0) {
      const student = students.find((s) => s.id === studentId);
      return student?.schedules || [];
    }

    applicable.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    return applicable[0].schedules;
  };

  // ── 시간대별 그룹 ──
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, scheduleChanges, selectedDate, todayWeekday]
  );

  // ── 카드 클릭 (출석 → 하원) ──
  const handleCardClick = async (student, scheduleTime) => {
    const todayStr = ymdLocal(new Date());
    const record = attendance[student.name];

    // ── 1) 처음 클릭 → 출석 처리 ──
    if (!record) {
      const input = prompt(
        `${student.name} 생일 뒷 4자리를 입력하세요 (예: 1225)`
      );
      if (input !== student.birth?.slice(-4)) {
        alert("생일이 일치하지 않습니다.");
        return;
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const [hh, mm] = scheduleTime.split(":");
      const sched = new Date();
      sched.setHours(+hh, +mm, 0);
      const diffMin = (now - sched) / 60000;

      // ✅ 포인트는 출석하면 언제든 +1 고정
      const status = diffMin > 15 ? "tardy" : "onTime";

      // Firestore: 출석 저장 (+ studentId)
      await setDoc(
        doc(db, "attendance", todayStr),
        {
          [student.name]: { time: timeStr, status, studentId: student.id },
        },
        { merge: true }
      );

      // 로컬 상태 반영
      setAttendance((prev) => ({
        ...prev,
        [student.name]: { time: timeStr, status, studentId: student.id },
      }));

      // 학생 포인트/가용포인트 업데이트
      await updateDoc(doc(db, "students", student.id), {
        "points.출석": increment(1),
        availablePoints: increment(1),
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? {
                ...s,
                points: { ...s.points, 출석: (s.points?.출석 || 0) + 1 },
                availablePoints: (s.availablePoints || 0) + 1,
              }
            : s
        )
      );

      // 알림톡 + 문자 발송
      await sendBizppurioMessage("checkin", student, {
        scheduleTime,
        timeText: timeStr,
      });

      alert(`✅ ${student.name}님 출석 완료! (+1pt)`);
      return;
    }

    // ── 2) 두 번째 클릭 → 하원 처리 ──
    if (record.time && !record.departureTime) {
      // ✅ [변경] 수업 시작시간(scheduleTime)으로부터 30분 이후에만 하원 가능
      const now = new Date();
      const [hhStart, mmStart] = scheduleTime.split(":");
      const start = new Date();
      start.setHours(+hhStart, +mmStart, 0);

      if (now - start < 30 * 60 * 1000) {
        alert("하원은 수업 시작 후 30분 이후에만 가능합니다!");
        return;
      }

      const pw = prompt(
        `${student.name} 생일 뒷 4자리를 입력하세요 (예: 1225)`
      );
      if (pw !== student.birth?.slice(-4)) {
        alert("비밀번호가 틀렸습니다.");
        return;
      }

      const depTime = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      // Firestore: 하원시간 추가 (+ studentId 보정)
      await updateDoc(doc(db, "attendance", todayStr), {
        [`${student.name}.departureTime`]: depTime,
        [`${student.name}.studentId`]: student.id,
      });

      // 하원 시 출석 포인트 +1
      await updateDoc(doc(db, "students", student.id), {
        "points.출석": increment(1),
        availablePoints: increment(1),
      });

      setStudents((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? {
                ...s,
                points: { ...s.points, 출석: (s.points?.출석 || 0) + 1 },
                availablePoints: (s.availablePoints || 0) + 1,
              }
            : s
        )
      );

      setAttendance((prev) => ({
        ...prev,
        [student.name]: { ...prev[student.name], departureTime: depTime },
      }));

      await sendBizppurioMessage("checkout", student, {
        scheduleTime,
        timeText: depTime,
      });

      alert(`✅ ${student.name}님 하원 완료! (+1pt)`);
      return;
    }

    // ── 3) 이미 출석·하원 모두 완료된 경우: 아무 동작 없음 ──
  };

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

  // 지각 → 선생님 비번으로 onTime 변경
  const handleOverrideTardy = async (studentName) => {
    const record = attendance[studentName];
    const pw = prompt("지각 상태입니다. 선생님 비밀번호를 입력하세요");

    if (pw === "0301") {
      const matched = students.find((s) => s.name === studentName);
      const sid = matched?.id || record?.studentId || null;

      const newStatus = { time: record.time, status: "onTime" };
      if (sid) newStatus.studentId = sid;

      await setDoc(
        doc(db, "attendance", selectedDate),
        { [studentName]: newStatus },
        { merge: true }
      );

      setAttendance((prev) => ({ ...prev, [studentName]: newStatus }));
      alert(`${studentName}님의 출석 상태가 초록으로 변경되었습니다!`);
    }
  };

  const totalPoints = (p) =>
    pointFields.reduce((sum, key) => sum + (p?.[key] || 0), 0);

  // 동점자 처리: 상위 5개 점수별로 names 배열 반환
  const getTopRankings = (field) => {
    const list = students.map((s) => ({
      name: s.name,
      value: s.points?.[field] || 0,
    }));

    const topValues = [...new Set(list.map((i) => i.value))]
      .sort((a, b) => b - a)
      .slice(0, 5);

    return topValues.map((value) => ({
      value,
      names: list.filter((i) => i.value === value).map((i) => i.name),
    }));
  };

  // ── 로그인 화면 ──
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

  return (
    <>
      {luckyVisible && (
        <div className="fixed top-10 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-white text-2xl font-bold px-6 py-3 rounded shadow-lg z-50 animate-bounce">
          🎉 Lucky!!! {luckyWinner}님 2pt!
        </div>
      )}

      {/* 상단 공지 */}
      <div className="flex items-center gap-2 justify-center text-sm text-blue-700 bg-blue-100 px-4 py-2 rounded mb-4">
        <span>📣</span>
        <div>
          <div>생일 4자리 입력시 출석완료!</div>
          <div>랜덤 Lucky 2pt는 10분전~5분후까지만! 지각시 0pt</div>
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

          <button
            onClick={() => setSelectedTab("ranking")}
            className={`px-4 py-2 rounded ${
              selectedTab === "ranking"
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-700"
            }`}
          >
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
                  🎉 오늘의 Lucky 당첨자:{" "}
                  {luckyWinner ? `${luckyWinner}님` : "아직 없음"}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setDateOffset((prev) => prev - 1)}
                  className="bg-gray-300 px-2 py-1 rounded"
                >
                  ←
                </button>
                <div className="text-gray-700 font-semibold">{selectedDate}</div>
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
                      const record = attendance[student.name];
                      const isPresent = !!record;
                      const hasDeparted = !!record?.departureTime;

                      // ⏰ 현재(now)와 수업시각(time) 차이(분)
                      const [hh, mm] = time.split(":");
                      const sched = new Date(now);
                      sched.setHours(+hh, +mm, 0, 0);
                      const diffMin = (now - sched) / 60000;

                      // 🎨 카드 색상 규칙
                      const isTardy =
                        record?.status === "tardy" || record?.status === "late";

                      const colorClass = (() => {
                        if (isPresent) return isTardy ? "attended-late" : "attended";
                        if (diffMin >= 20) return "pending-overdue";
                        if (diffMin > 5) return "pending-warn";
                        return "";
                      })();

                      return (
                        <div
                          key={student.id}
                          className={`
                            relative card
                            ${colorClass}
                            ${
                              hasDeparted
                                ? "border-4 border-blue-700 ring-4 ring-blue-300 ring-offset-2 ring-offset-white"
                                : ""
                            }
                            ${
                              !isToday
                                ? "cursor-not-allowed pointer-events-none"
                                : hasDeparted
                                ? "cursor-not-allowed pointer-events-none"
                                : "cursor-pointer hover:shadow-lg"
                            }
                            touch-manipulation
                          `}
                          onContextMenu={(e) => e.preventDefault()}
                          onPointerUp={() => handleCardClick(student, time)}
                        >
                          {/* 👑 Lucky 당첨자 왕관 */}
                          {student.name === luckyWinner && (
                            <div className="text-3xl text-yellow-500 text-center mb-1">
                              👑
                            </div>
                          )}

                          {/* 💡 전체 + 가용 포인트 */}
                          <div className="text-right text-xs font-semibold text-gray-700 leading-none mb-1">
                            총 {totalPoints(student.points)}pt
                            <br />
                            <span className="text-green-600">
                              가용{" "}
                              {student.availablePoints ?? totalPoints(student.points)}pt
                            </span>
                          </div>

                          {/* 이름 */}
                          <p className="name m-0 leading-none mb-1">{student.name}</p>

                          {/* 출석/하원 표시 */}
                          {isPresent && (
                            <div className="time-text m-0 leading-none mt-1 text-sm">
                              <div>{isTardy ? "⚠️ 지각" : "✅ 출석"}</div>
                              <div>출석: {record.time}</div>
                              {record.departureTime && (
                                <div>하원: {record.departureTime}</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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
                  className="bg-white p-4 rounded-lg shadow-md overflow-x-auto mb-6"
                >
                  <div className="text-lg font-semibold mb-2">{field} TOP 5</div>

                  <table className="w-full table-auto border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr className="sticky top-0">
                        <th className="px-4 py-2 text-left text-sm font-semibold">
                          순위
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">
                          이름
                        </th>
                        <th className="px-4 py-2 text-right text-sm font-semibold">
                          포인트
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rankings.map((item, idx) => {
                        const maxDisplay = 3;
                        const namesToShow = item.names.slice(0, maxDisplay);
                        const moreCount = item.names.length - maxDisplay;

                        return (
                          <tr
                            key={`${field}-${idx}`}
                            className={idx === 0 ? "bg-blue-50" : ""}
                          >
                            <td className="px-4 py-2 whitespace-nowrap font-bold">
                              {idx + 1}등
                            </td>
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

            {/* 총합 TOP 5 */}
            <div className="bg-white p-4 rounded-lg shadow-md overflow-x-auto">
              <div className="text-lg font-semibold mb-2">💯 총합 TOP 5</div>
              <table className="w-full table-auto border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr className="sticky top-0">
                    <th className="px-4 py-2 text-left text-sm font-semibold">
                      순위
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">
                      이름
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold">
                      포인트
                    </th>
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
                      names: totalList
                        .filter((i) => i.value === value)
                        .map((i) => i.name),
                    }));

                    return totalRankings.map((item, idx) => {
                      const maxDisplay = 3;
                      const namesToShow = item.names.slice(0, maxDisplay);
                      const moreCount = item.names.length - maxDisplay;

                      return (
                        <tr
                          key={`total-${idx}`}
                          className={idx === 0 ? "bg-blue-50" : ""}
                        >
                          <td className="px-4 py-2 whitespace-nowrap font-bold">
                            {idx + 1}등
                          </td>
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
