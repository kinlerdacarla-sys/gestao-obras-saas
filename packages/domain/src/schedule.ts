import { Decimal } from "decimal.js";

export class ScheduleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function reject(code: string, message: string): never {
  throw new ScheduleError(code, message);
}
const DAY = 86400000;
export function day(value: string | Date): number {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
  )
    reject("INVALID_TASK_DATES", "Data inválida");
  return date.getTime() / DAY;
}
export function duration(
  start: string | Date,
  end: string | Date,
  type: string,
): number {
  const delta = day(end) - day(start);
  if (delta < 0 || (type === "MILESTONE" && delta !== 0))
    reject("INVALID_TASK_DATES", "Intervalo de datas inválido");
  return type === "MILESTONE" ? 0 : delta + 1;
}
export function planned(
  start: string | Date,
  end: string | Date,
  type: string,
  reference: string | Date,
): string {
  const days = duration(start, end, type),
    at = day(reference),
    first = day(start);
  if (at < first) return "0.00";
  if (at >= day(end) || type === "MILESTONE") return "100.00";
  return new Decimal(at - first + 1).div(days).mul(100).toFixed(2);
}
export function progress(value: string): Decimal {
  const result = new Decimal(value);
  if (
    !result.isFinite() ||
    result.lt(0) ||
    result.gt(100) ||
    result.decimalPlaces() > 2
  )
    reject(
      "INVALID_TASK_PROGRESS",
      "Progresso deve estar entre 0 e 100, com duas casas decimais",
    );
  return result;
}
export function temporal(
  actual: string,
  target: string,
  threshold = 5,
): string {
  const current = progress(actual),
    delta = current.minus(target);
  if (current.eq(100)) return "COMPLETED";
  if (delta.lt(-threshold)) return "DELAYED";
  if (delta.lt(0)) return "AT_RISK";
  if (delta.gt(threshold)) return "AHEAD";
  return "ON_TIME";
}
export interface TaskLine {
  id: string;
  parentId: string | null;
  taskType: "SUMMARY" | "TASK" | "MILESTONE";
  plannedStart: Date;
  plannedEnd: Date;
  actualProgress: string;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  weight: string;
  status: string;
  budgetItemId: string | null;
  code: string;
  name: string;
  sortOrder: number;
}
export interface ComputedTask extends TaskLine {
  durationDays: number;
  plannedProgress: string;
  normalizedWeight: string;
  temporalStatus: string;
}
/** Iterative postorder keeps deep hierarchies safe and visits each task once. */
export function calculateSchedule(
  tasks: TaskLine[],
  method: string,
  values: Map<string, string>,
  reference: Date | string,
) {
  const active = tasks.filter((t) => t.status !== "CANCELLED");
  const nodes = new Map(active.map((t) => [t.id, { ...t }]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const t of active) {
    duration(t.plannedStart, t.plannedEnd, t.taskType);
    if (t.parentId) {
      const parent = nodes.get(t.parentId);
      if (!parent || parent.taskType !== "SUMMARY")
        reject("INVALID_DEPENDENCY", "Pai deve ser um resumo ativo desta obra");
      const list = children.get(t.parentId) ?? [];
      list.push(t.id);
      children.set(t.parentId, list);
    } else roots.push(t.id);
  }
  const ordered: string[] = [],
    stack = [...roots];
  while (stack.length) {
    const id = stack.pop()!;
    ordered.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  if (ordered.length !== active.length)
    reject("SCHEDULE_DEPENDENCY_CYCLE", "Ciclo na hierarquia");
  const mass = new Map<string, Decimal>(),
    actual = new Map<string, Decimal>(),
    target = new Map<string, Decimal>();
  for (const id of [...ordered].reverse()) {
    const t = nodes.get(id)!,
      descendants = children.get(id) ?? [];
    if (t.taskType === "SUMMARY") {
      let weight = new Decimal(0),
        real = new Decimal(0),
        plan = new Decimal(0);
      for (const child of descendants) {
        weight = weight.plus(mass.get(child)!);
        real = real.plus(actual.get(child)!);
        plan = plan.plus(target.get(child)!);
      }
      if (descendants.length) {
        t.plannedStart = new Date(
          Math.min(
            ...descendants.map((c) => nodes.get(c)!.plannedStart.getTime()),
          ),
        );
        t.plannedEnd = new Date(
          Math.max(
            ...descendants.map((c) => nodes.get(c)!.plannedEnd.getTime()),
          ),
        );
      }
      mass.set(id, weight);
      actual.set(id, real);
      target.set(id, plan);
      t.actualProgress = weight.gt(0) ? real.div(weight).toFixed(2) : "0.00";
      const starts = descendants
        .map((c) => nodes.get(c)!.actualStart)
        .filter((date): date is Date => date instanceof Date);
      const ends = descendants
        .map((c) => nodes.get(c)!.actualEnd)
        .filter((date): date is Date => date instanceof Date);
      t.actualStart = starts.length
        ? new Date(Math.min(...starts.map((d) => d.getTime())))
        : null;
      t.actualEnd =
        descendants.length && ends.length === descendants.length
          ? new Date(Math.max(...ends.map((d) => d.getTime())))
          : null;
      t.status =
        Number(t.actualProgress) === 100
          ? "COMPLETED"
          : Number(t.actualProgress) > 0
            ? "IN_PROGRESS"
            : "NOT_STARTED";
    } else {
      const weight = new Decimal(
        method === "BUDGET_VALUE"
          ? t.budgetItemId
            ? (values.get(t.budgetItemId) ?? "0")
            : "0"
          : t.weight,
      );
      if (!weight.isFinite() || weight.lt(0))
        reject("INVALID_TASK_PROGRESS", "Peso inválido");
      mass.set(id, weight);
      actual.set(id, weight.mul(progress(t.actualProgress)));
      target.set(
        id,
        weight.mul(
          planned(t.plannedStart, t.plannedEnd, t.taskType, reference),
        ),
      );
    }
  }
  const sum = (map: Map<string, Decimal>) =>
    roots.reduce((v, id) => v.plus(map.get(id)!), new Decimal(0));
  const total = sum(mass),
    real = total.gt(0) ? sum(actual).div(total).toFixed(2) : "0.00",
    plan = total.gt(0) ? sum(target).div(total).toFixed(2) : "0.00";
  const items: ComputedTask[] = active.map((source) => {
    const t = nodes.get(source.id)!,
      weight = mass.get(t.id)!;
    const p = weight.gt(0)
      ? target.get(t.id)!.div(weight).toFixed(2)
      : planned(t.plannedStart, t.plannedEnd, t.taskType, reference);
    return {
      ...t,
      durationDays: duration(t.plannedStart, t.plannedEnd, t.taskType),
      plannedProgress: p,
      normalizedWeight: total.gt(0) ? weight.div(total).toFixed(6) : "0.000000",
      temporalStatus: temporal(t.actualProgress, p),
    };
  });
  return {
    items,
    actualProgress: real,
    plannedProgress: plan,
    deviation: new Decimal(real).minus(plan).toFixed(2),
    totalWeight: total.toFixed(6),
    temporalStatus: temporal(real, plan),
  };
}
export function assertDependencies(
  ids: string[],
  edges: { predecessorId: string; successorId: string }[],
) {
  const incoming = new Map(ids.map((id) => [id, 0])),
    next = new Map<string, string[]>();
  for (const e of edges) {
    if (
      e.predecessorId === e.successorId ||
      !incoming.has(e.predecessorId) ||
      !incoming.has(e.successorId)
    )
      reject("INVALID_DEPENDENCY", "Dependência inválida");
    incoming.set(e.successorId, incoming.get(e.successorId)! + 1);
    const list = next.get(e.predecessorId) ?? [];
    list.push(e.successorId);
    next.set(e.predecessorId, list);
  }
  const queue = ids.filter((id) => incoming.get(id) === 0);
  let count = 0;
  for (let i = 0; i < queue.length; i++) {
    count++;
    for (const id of next.get(queue[i]) ?? []) {
      incoming.set(id, incoming.get(id)! - 1);
      if (!incoming.get(id)) queue.push(id);
    }
  }
  if (count !== ids.length)
    reject("SCHEDULE_DEPENDENCY_CYCLE", "A dependência criaria um ciclo");
}
export function variance(baseline: Date | string, current: Date | string) {
  return day(current) - day(baseline);
}
