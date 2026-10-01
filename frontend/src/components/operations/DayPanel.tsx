import { useState } from "react";
import { DeliveryStatusSection } from "./DeliveryStatusSection";
import { DispatchSection } from "./DispatchSection";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// 營運總覽「送件與派車」分頁：原「員工送件狀況」與「派遣紀錄」都是挑一天看誰做了什麼，合成一頁共用日期
export function DayPanel() {
  const [date, setDate] = useState(todayDateString());
  return (
    <div className="space-y-8">
      <DeliveryStatusSection date={date} setDate={(update) => setDate((d) => update(d))} />
      <div className="border-t border-gray-200 pt-6">
        <DispatchSection date={date} />
      </div>
    </div>
  );
}
