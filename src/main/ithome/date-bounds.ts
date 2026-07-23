/**
 * src/main/ithome/date-bounds.ts
 *
 * 仅允许拉取「当前自然月」内、且不晚于今天的日期 (Asia/Shanghai)
 */
"use strict";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayShanghaiDateKey(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
    }).format(now);
}

export function currentMonthPrefix(now: Date = new Date()): string {
    return todayShanghaiDateKey(now).slice(0, 7);
}

export function isValidDateKey(dateKey: any): boolean {
    return typeof dateKey === "string" && DATE_RE.test(dateKey);
}

export function isInCurrentMonth(dateKey: string, now: Date = new Date()): boolean {
    if (!isValidDateKey(dateKey)) return false;
    return dateKey.slice(0, 7) === currentMonthPrefix(now);
}

export function isFetchableDate(dateKey: string, now: Date = new Date()): boolean {
    if (!isInCurrentMonth(dateKey, now)) return false;
    return dateKey <= todayShanghaiDateKey(now);
}

export function monthDayRange(now: Date = new Date()): any {
    const today = todayShanghaiDateKey(now);
    const [y, m] = today.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const prefix = `${y}-${String(m).padStart(2, "0")}`;
    const days: string[] = [];
    for (let d = 1; d <= lastDay; d += 1) {
        const key = `${prefix}-${String(d).padStart(2, "0")}`;
        if (key <= today) days.push(key);
    }
    return {
        today,
        prefix,
        days,
        firstDay: days[0],
        lastDay: days[days.length - 1],
    };
}

export function assertFetchableDate(dateKey: string, now: Date = new Date()): void {
    if (!isValidDateKey(dateKey)) {
        const err: any = new Error("invalid_date");
        err.code = "invalid_date";
        throw err;
    }
    if (!isInCurrentMonth(dateKey, now)) {
        const err: any = new Error("not_current_month");
        err.code = "not_current_month";
        throw err;
    }
    if (dateKey > todayShanghaiDateKey(now)) {
        const err: any = new Error("future_date");
        err.code = "future_date";
        throw err;
    }
}

export function listPageUrl(dateKey: string): string {
    return `https://www.ithome.com/list/${dateKey}.html`;
}

module.exports = {
    DATE_RE,
    todayShanghaiDateKey,
    currentMonthPrefix,
    isValidDateKey,
    isInCurrentMonth,
    isFetchableDate,
    monthDayRange,
    assertFetchableDate,
    listPageUrl,
};
