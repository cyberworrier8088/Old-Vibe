import { Panel, PanelLabel } from "@/components/ui/Panel";
import type { Activity } from "@/lib/hackatime/activity";
import { formatHours } from "@/lib/hackatime/format";
import { EVENT_START_DATE } from "@/lib/hackatime/projects";

import styles from "./ActivityPanel.module.css";

const SINCE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
  new Date(EVENT_START_DATE + "T12:00:00Z"),
);
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

function label(date: string, last: boolean): string {
  return last ? "today" : WEEKDAY.format(new Date(`${date}T12:00:00Z`)).toLowerCase();
}

/** The maker's last seven days in Hackatime: a bar per day, what they used, what they worked on. */
export function ActivityPanel({ activity }: { activity: Activity }) {
  const peak = Math.max(1, ...activity.days.map((day) => day.seconds));

  return (
    <Panel>
      <PanelLabel>your last 7 days in hackatime</PanelLabel>

      <div className={styles.top}>
        <div className={styles.total}>
          <span className={styles.big}>{formatHours(activity.weekSeconds)}</span>
          <span className={styles.sub}>
            {activity.activeDays === 0
              ? "nothing tracked yet this week"
              : `across ${activity.activeDays} ${activity.activeDays === 1 ? "day" : "days"}, ${formatHours(activity.todaySeconds)} today`}
          </span>
        </div>
      </div>

      {activity.eventSeconds !== null ? (
        <p className={styles.since}>
          <b>{formatHours(activity.eventSeconds)}</b> tracked since {SINCE}, the hours that count here
        </p>
      ) : null}

      <ol className={styles.bars} aria-label="Hours coded per day, last seven days">
        {activity.days.map((day, index) => {
          const last = index === activity.days.length - 1;
          const height = day.seconds === 0 ? 3 : Math.max(8, Math.round((day.seconds / peak) * 100));
          return (
            <li
              key={day.date}
              className={styles.day}
              style={{ "--i": index } as React.CSSProperties}
              title={`${day.date}: ${formatHours(day.seconds)}`}
            >
              <span className={styles.time}>{day.seconds > 0 ? formatHours(day.seconds) : ""}</span>
              <span className={styles.track}>
                <span
                  className={[styles.bar, day.seconds === 0 ? styles.empty : null, last ? styles.now : null]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ height: `${height}%` }}
                />
              </span>
              <span className={[styles.name, last ? styles.nameNow : null].filter(Boolean).join(" ")}>
                {label(day.date, last)}
              </span>
            </li>
          );
        })}
      </ol>

      {activity.languages.length > 0 || activity.projects.length > 0 ? (
        <div className={styles.lists}>
          {activity.languages.length > 0 ? (
            <div className={styles.group}>
              <span className={styles.groupLabel}>languages</span>
              <div className={styles.chips}>
                {activity.languages.slice(0, 4).map((item) => (
                  <span key={item.name} className={styles.chip}>
                    {item.name}
                    <span>{formatHours(item.seconds)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {activity.projects.length > 0 ? (
            <div className={styles.group}>
              <span className={styles.groupLabel}>projects</span>
              <div className={styles.chips}>
                {activity.projects.slice(0, 4).map((item) => (
                  <span key={item.name} className={styles.chip}>
                    {item.name}
                    <span>{formatHours(item.seconds)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
