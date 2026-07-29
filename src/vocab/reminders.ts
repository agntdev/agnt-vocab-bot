import { remindAt, type WorkerEnv } from "../toolkit/session/durable.js";
import { nextNineAM } from "./time.js";
import type { Profile } from "./store.js";

/** Workers use a Durable Object alarm; local/test runtimes deliberately no-op. */
export async function scheduleDailyReminder(ctx: { from?: { id: number }; env?: WorkerEnv }, profile: Profile, dueCount: number): Promise<void> {
  const env = ctx.env;
  if (!env?.CHAT_DO || !ctx.from) return;
  const count = Math.max(0, dueCount);
  await remindAt(env, ctx.from.id, nextNineAM(profile.timezone), `You have ${count} card${count === 1 ? "" : "s"} ready for review. A few focused minutes can make them stick.`);
}
