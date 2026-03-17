/**
 * Neuron OS — Auth User Seeding Script
 *
 * Creates all 11 test auth accounts in Supabase, then updates their
 * public.users profile rows with canonical dept/role/name values.
 *
 * Usage:
 *   node src/supabase/create-auth-users.mjs <service_role_key>
 *
 * Prerequisites:
 *   - Migrations 001–004 have been applied in the Supabase SQL Editor
 *   - @supabase/supabase-js is installed (npm install)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ubspbukgcxmzegnomlgi.supabase.co';
const SERVICE_ROLE_KEY = process.argv[2];

if (!SERVICE_ROLE_KEY) {
  console.error('Usage: node src/supabase/create-auth-users.mjs <service_role_key>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** All 11 test users — canonical taxonomy enforced */
const TEST_USERS = [
  {
    email: 'bd.rep@neuron.ph',
    name: 'Ben Santos',
    department: 'Business Development',
    role: 'rep',
  },
  {
    email: 'bd.manager@neuron.ph',
    name: 'Diana Reyes',
    department: 'Business Development',
    role: 'manager',
  },
  {
    email: 'pricing.rep@neuron.ph',
    name: 'Carlo Cruz',
    department: 'Pricing',
    role: 'rep',
  },
  {
    email: 'pricing.manager@neuron.ph',
    name: 'Lena Torres',
    department: 'Pricing',
    role: 'manager',
  },
  {
    email: 'ops.handler@neuron.ph',
    name: 'Mike Villanueva',
    department: 'Operations',
    role: 'rep',
    service_type: 'Forwarding',
    operations_role: 'Handler',
  },
  {
    email: 'ops.supervisor@neuron.ph',
    name: 'Jenny Lim',
    department: 'Operations',
    role: 'manager',
    service_type: 'Forwarding',
    operations_role: 'Supervisor',
  },
  {
    email: 'ops.manager@neuron.ph',
    name: 'Robert Tan',
    department: 'Operations',
    role: 'director',
    service_type: 'Forwarding',
    operations_role: 'Manager',
  },
  {
    email: 'acct.rep@neuron.ph',
    name: 'Ana Mendoza',
    department: 'Accounting',
    role: 'rep',
  },
  {
    email: 'acct.manager@neuron.ph',
    name: 'Maria Cruz',
    department: 'Accounting',
    role: 'manager',
  },
  {
    email: 'exec@neuron.ph',
    name: 'Jose Ramos',
    department: 'Executive',
    role: 'director',
  },
  {
    email: 'hr.rep@neuron.ph',
    name: 'Grace Dela Cruz',
    department: 'HR',
    role: 'rep',
  },
];

async function createAuthUsers() {
  console.log('=== Step 1: Creating Supabase Auth accounts ===\n');

  for (const user of TEST_USERS) {
    process.stdout.write(`  ${user.email} ... `);

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: 'Test1234!',
      email_confirm: true,
      user_metadata: { name: user.name },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already been registered') ||
          error.message.toLowerCase().includes('already exists') ||
          error.status === 422) {
        console.log('already exists (skipped)');
      } else {
        console.log(`ERROR: ${error.message}`);
      }
    } else {
      console.log(`created (auth id: ${data.user.id})`);
    }
  }
}

async function updateUserProfiles() {
  console.log('\n=== Step 2: Waiting 2s for trigger to create profile rows ===\n');
  await new Promise((r) => setTimeout(r, 2000));

  console.log('=== Step 3: Updating public.users profiles ===\n');

  for (const user of TEST_USERS) {
    process.stdout.write(`  ${user.email} ... `);

    const updatePayload = {
      name: user.name,
      department: user.department,
      role: user.role,
      status: 'Active',
      is_active: true,
    };

    if (user.service_type) updatePayload.service_type = user.service_type;
    if (user.operations_role) updatePayload.operations_role = user.operations_role;

    const { error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('email', user.email);

    if (error) {
      console.log(`ERROR: ${error.message}`);
    } else {
      console.log(`updated (${user.department} / ${user.role})`);
    }
  }
}

async function verifyProfiles() {
  console.log('\n=== Step 4: Verifying profiles ===\n');

  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, department, role, auth_id')
    .in('email', TEST_USERS.map((u) => u.email))
    .order('department');

  if (error) {
    console.error('Verification query failed:', error.message);
    return;
  }

  console.log(`  Found ${data.length} / ${TEST_USERS.length} profiles:`);
  for (const u of data) {
    const authLinked = u.auth_id ? '✓ auth linked' : '✗ NO auth_id';
    console.log(`  [${authLinked}] ${u.email} → ${u.department} / ${u.role} (id: ${u.id})`);
  }

  if (data.length < TEST_USERS.length) {
    const found = new Set(data.map((u) => u.email));
    const missing = TEST_USERS.filter((u) => !found.has(u.email));
    console.log('\n  Missing profiles:');
    missing.forEach((u) => console.log(`    - ${u.email}`));
  }
}

async function main() {
  console.log('Neuron OS — Auth User Seed Script');
  console.log(`Target: ${SUPABASE_URL}\n`);

  await createAuthUsers();
  await updateUserProfiles();
  await verifyProfiles();

  console.log('\n=== Done ===');
  console.log('Next step: run src/supabase/seed.sql in the Supabase SQL Editor.\n');
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
