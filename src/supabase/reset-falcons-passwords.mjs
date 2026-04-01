/**
 * Neuron OS — Falcons Logistics Password Reset Script
 *
 * Resets passwords for all @falconslogistics-ph.com accounts.
 * Also patches any broken (null) dept/role in public.users.
 *
 * Usage:
 *   node src/supabase/reset-falcons-passwords.mjs <service_role_key> [new_password]
 *
 * Defaults to password: Falcons2024!
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ubspbukgcxmzegnomlgi.supabase.co';
const SERVICE_ROLE_KEY = process.argv[2];
const NEW_PASSWORD = process.argv[3] || 'Falcons2026!';

if (!SERVICE_ROLE_KEY) {
  console.error('Usage: node src/supabase/reset-falcons-passwords.mjs <service_role_key> [new_password]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Correct profile data for any accounts with broken dept/role
// Add entries here if a user's dept/role needs fixing alongside the password reset
const PROFILE_FIXES = {
  'inquiry@falconslogistics-ph.com': {
    department: 'Executive',
    role: 'manager',
  },
};

async function resetPasswords() {
  console.log('=== Fetching Falcons Logistics auth accounts ===\n');

  const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  if (error) {
    console.error('Failed to list users:', error.message);
    process.exit(1);
  }

  const falconsUsers = users.filter(u => u.email?.endsWith('@falconslogistics-ph.com'));
  console.log(`Found ${falconsUsers.length} Falcons accounts.\n`);

  console.log('=== Step 1: Resetting passwords ===\n');

  for (const authUser of falconsUsers) {
    process.stdout.write(`  ${authUser.email} ... `);

    const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: NEW_PASSWORD,
    });

    if (updateError) {
      console.log(`ERROR: ${updateError.message}`);
    } else {
      console.log('password reset ✓');
    }
  }

  console.log('\n=== Step 2: Patching null dept/role profiles ===\n');

  const { data: brokenProfiles, error: profileError } = await supabase
    .from('users')
    .select('id, email, name, department, role')
    .like('email', '%@falconslogistics-ph.com')
    .or('department.is.null,role.is.null');

  if (profileError) {
    console.error('Profile query failed:', profileError.message);
  } else if (brokenProfiles.length === 0) {
    console.log('  No broken profiles found.\n');
  } else {
    for (const profile of brokenProfiles) {
      const fix = PROFILE_FIXES[profile.email];
      if (fix && fix.department && fix.role) {
        process.stdout.write(`  ${profile.email} (${profile.name}) ... `);
        const { error: fixError } = await supabase
          .from('users')
          .update({ department: fix.department, role: fix.role })
          .eq('id', profile.id);
        if (fixError) {
          console.log(`ERROR: ${fixError.message}`);
        } else {
          console.log(`fixed → ${fix.department} / ${fix.role} ✓`);
        }
      } else {
        console.log(`  ⚠ ${profile.email} (${profile.name}) — dept/role is null, no fix defined in PROFILE_FIXES`);
      }
    }
  }

  console.log('\n=== Step 3: Verification ===\n');

  const { data: profiles } = await supabase
    .from('users')
    .select('email, name, department, role, is_active')
    .like('email', '%@falconslogistics-ph.com')
    .order('email');

  for (const p of profiles || []) {
    const deptRole = (p.department && p.role) ? `${p.department} / ${p.role}` : '⚠ NULL dept or role';
    console.log(`  ${p.email} → ${deptRole}`);
  }

  console.log(`\n=== Done ===`);
  console.log(`New password for all Falcons accounts: ${NEW_PASSWORD}\n`);
}

resetPasswords().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
