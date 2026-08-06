// Finding M1 — is the `attachments` bucket still readable by a stranger?
//
// Uploads one probe file as a signed-in user, then asks three questions:
//   1. can an authenticated user still read it via a signed URL?   (must: YES)
//   2. can anon fetch the public URL for it?                       (must: NO)
//   3. can anon list the bucket?                                   (must: NO)
// Cleans up the probe file either way.
//
//   node scripts/probeAttachmentsBucket.mjs <url> <anon-key> <email> <password>
import { createClient } from "@supabase/supabase-js";

const [url, key, email, password] = process.argv.slice(2);
if (!url || !key || !email || !password) {
  console.error("usage: probeAttachmentsBucket.mjs <url> <anon-key> <email> <password>");
  process.exit(1);
}

const BUCKET = "attachments";
const PATH = `qa-probe/m1/${Date.now()}-probe.txt`;
const BODY = "M1 probe — safe to delete";

const user = createClient(url, key, { auth: { persistSession: false } });
const anon = createClient(url, key, { auth: { persistSession: false } });

let failed = false;
const expect = (label, ok, detail) => {
  if (!ok) failed = true;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const auth = await user.auth.signInWithPassword({ email, password });
if (auth.error) { console.error(`sign-in failed: ${auth.error.message}`); process.exit(1); }
console.log(`signed in as ${email}\n`);

const up = await user.storage.from(BUCKET).upload(PATH, new Blob([BODY]), { contentType: "text/plain" });
if (up.error) { console.error(`probe upload failed: ${up.error.message}`); process.exit(1); }

try {
  // 1. The app's own read path must keep working.
  const signed = await user.storage.from(BUCKET).createSignedUrl(PATH, 60);
  let signedOk = false;
  if (!signed.error && signed.data?.signedUrl) {
    const res = await fetch(signed.data.signedUrl);
    signedOk = res.ok && (await res.text()) === BODY;
  }
  expect("signed URL serves the file to its owner", signedOk, signed.error?.message);

  // 2. The hole itself: the public URL must stop serving bytes.
  const publicUrl = anon.storage.from(BUCKET).getPublicUrl(PATH).data.publicUrl;
  const anonRes = await fetch(publicUrl); // no Authorization header at all
  expect("anon fetch of the public URL is refused", !anonRes.ok, `HTTP ${anonRes.status}`);

  // 3. And the index must stay shut (this is what 274 already bought on dev).
  const listed = await anon.storage.from(BUCKET).list("");
  const count = listed.data?.length ?? 0;
  expect("anon cannot list the bucket root", !!listed.error || count === 0,
         listed.error?.message ?? `saw ${count} entries`);
} finally {
  await user.storage.from(BUCKET).remove([PATH]);
  await user.auth.signOut();
}

console.log(`\n${failed ? "OPEN — the bucket still serves strangers" : "CLOSED — private to signed URLs only"}`);
process.exit(failed ? 1 : 0);
