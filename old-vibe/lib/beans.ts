import {
  balanceFor,
  hoursLabel,
  netForProject,
  paperForMinutes,
  reconcileProjectPaper,
} from "@/lib/paper";

export { balanceFor, hoursLabel, netForProject, paperForMinutes, reconcileProjectPaper };

// Backwards compatibility aliases
export const beansForMinutes = paperForMinutes;
export const reconcileProjectBeans = reconcileProjectPaper;
