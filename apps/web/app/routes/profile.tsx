import { avatarSchema, nicknameSchema } from "@brick/game";
import { data, redirect } from "react-router";
import { ProfileScreen } from "../components/profile/ProfileScreen.stsx";
import { forgetPlayer, rememberPlayer, requirePlayer } from "../lib/session.server";
import { regenerateKey, restorePlayer, updatePlayer } from "../lib/store.server";
import type { Route } from "./+types/profile";

export const meta: Route.MetaFunction = () => [{ title: "My brick · Brick Party" }];

export async function loader({ request }: Route.LoaderArgs) {
  const player = await requirePlayer(request);
  return { player };
}

type ActionResult = { intent: string; error: string | null; saved?: boolean; recoveryKey?: string };

export async function action({ request }: Route.ActionArgs) {
  const player = await requirePlayer(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const fail = (error: string) => data<ActionResult>({ intent, error }, { status: 400 });

  switch (intent) {
    case "update": {
      const nickname = nicknameSchema.safeParse(form.get("nickname"));
      if (!nickname.success) return fail(nickname.error.issues[0]?.message ?? "Pick a nickname");
      const avatar = avatarSchema.safeParse({
        color: form.get("color"),
        hat: form.get("hat"),
        face: form.get("face") ?? undefined,
        shape: form.get("shape") ?? undefined,
      });
      if (!avatar.success) return fail("Pick a color, hat, face and shape");
      await updatePlayer(player.id, { nickname: nickname.data, avatar: avatar.data });
      return data<ActionResult>({ intent, error: null, saved: true });
    }
    case "regenerate":
      return data<ActionResult>({ intent, error: null, recoveryKey: await regenerateKey(player.id) });
    case "restore": {
      const other = await restorePlayer(String(form.get("key") ?? ""));
      if (!other) return fail("That key doesn't match any brick.");
      throw redirect("/profile", { headers: { "Set-Cookie": await rememberPlayer(other.id) } });
    }
    case "signout":
      throw redirect("/", { headers: { "Set-Cookie": await forgetPlayer() } });
    default:
      return fail("Unknown action");
  }
}

export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
  const error = (intent: string) => (actionData?.intent === intent ? actionData.error : null);
  return (
    <ProfileScreen
      key={`${loaderData.player.nickname}-${Object.values(loaderData.player.avatar).join("-")}`}
      player={loaderData.player}
      saved={!!actionData?.saved}
      newKey={actionData?.recoveryKey ?? null}
      errors={{ update: error("update"), restore: error("restore") }}
    />
  );
}
