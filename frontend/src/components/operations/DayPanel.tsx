import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DeliveryStatusSection } from "./DeliveryStatusSection";
import { DispatchSection } from "./DispatchSection";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// 營運總覽「送件與派車」分頁：原「員工送件狀況」與「派遣紀錄」都是挑一天看誰做了什麼，合成一頁共用日期
export function DayPanel() {
  // 網址可帶 ?date=（資料檢查「去修正」里程），直接看那一天
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(() => {
    const d = searchParams.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayDateString();
  });
  return (
    <div className="space-y-8">
      <DeliveryStatusSection date={date} setDate={(update) => setDate((d) => update(d))} />
      <div className="border-t border-gray-200 pt-6">
        <DispatchSection date={date} />
      </div>
    </div>
  );
}
