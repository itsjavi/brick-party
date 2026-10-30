import { avatarSchema, nicknameSchema, roomCodeSchema } from "@brick/game";
import { openRoomFor } from "@brick/party";
import { data, redirect } from "react-router";
import { Onboarding } from "../components/home/Onboarding.stsx";
import { TitleScreen } from "../components/home/TitleScreen.stsx";
import { appEnv } from "../lib/cloudflare.server";
import { passedTurnstile, turnstileSiteKey, underFormLimit } from "../lib/protect.server";
import { currentPlayer, rememberPlayer, safeNext } from "../lib/session.server";
import { createPlayer, restorePlayer } from "../lib/store.server";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  const next = new URL(request.url).searchParams.get("next");
  const player = await currentPlayer(request);
  if (player && next) throw redirect(safeNext(next));
  return { player, next: next ? safeNext(next) : null, turnstileSiteKey: player ? null : turnstileSiteKey() };
}

type ActionResult = { intent: string; error: string | null; recoveryKey?: string };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const fail = (error: string) => data<ActionResult>({ intent, error }, { status: 400 });
  const tooFast = () =>
    data<ActionResult>({ intent, error: "Too many tries from your network. Wait a minute and try again." }, { status: 429 });

  switch (intent) {
    case "create-player": {
      if (!(await underFormLimit(request, intent))) return tooFast();
      const nickname = nicknameSchema.safeParse(form.get("nickname"));
      if (!nickname.success) return fail(nickname.error.issues[0]?.message ?? "Pick a nickname");
      const avatar = avatarSchema.safeParse({
        color: form.get("color"),
        hat: form.get("hat"),
        face: form.get("face") ?? undefined,
        shape: form.get("shape") ?? undefined,
      });
      if (!avatar.success) return fail("Pick a color, hat, face and shape");
      if (!(await passedTurnstile(request, form.get("cf-turnstile-response")))) {
        return fail("We couldn't confirm you're human. Try the check again.");
      }
      const { player, recoveryKey } = await createPlayer({ nickname: nickname.data, avatar: avatar.data });
      return data<ActionResult>(
        { intent, error: null, recoveryKey },
        { headers: { "Set-Cookie": await rememberPlayer(player.id) } },
      );
    }
    case "restore": {
      if (!(await underFormLimit(request, intent))) return tooFast();
      const player = await restorePlayer(String(form.get("key") ?? ""));
      if (!player) return fail("That key doesn't match any brick. Check for typos?");
      throw redirect(safeNext(String(form.get("next") ?? "")), {
        headers: { "Set-Cookie": await rememberPlayer(player.id) },
      });
    }
    case "create-room": {
      const player = await currentPlayer(request);
      if (!player) throw redirect("/");
      if (!(await underFormLimit(request, intent))) return tooFast();
      // Your own code if you used it lately, otherwise a free one; it starts fresh (DECISION-13).
      const code = await openRoomFor(appEnv(), player.id);
      if (!code) return data<ActionResult>({ intent, error: "No free room codes right now. Try again in a minute." }, { status: 503 });
      throw redirect(`/r/${code}`);
    }
    case "join": {
      const code = roomCodeSchema.safeParse(form.get("code"));
      if (!code.success) return fail("Room codes are 4 letters, like BRKZ.");
      throw redirect(`/r/${code.data}`);
    }
    default:
      return fail("Unknown action");
  }
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const { player, next, turnstileSiteKey } = loaderData;
  const error = (forIntent: string) => (actionData?.intent === forIntent ? actionData.error : null);

  if (!player || actionData?.recoveryKey) {
    return (
      <Onboarding
        next={next}
        createError={error("create-player")}
        restoreError={error("restore")}
        recoveryKey={actionData?.recoveryKey ?? null}
        turnstileSiteKey={turnstileSiteKey}
      />
    );
  }
  return <TitleScreen player={player} joinError={error("join")} roomError={error("create-room")} />;
}
