'use strict';
/**
 * server/db/seed.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds the Azure SQL database with sample views, workflow rules, users,
 * and alerts.  Run ONCE after creating the schema (DDL in connection.js).
 *
 * Key design notes (updated to match your schema):
 *   - users.id       → NVARCHAR(100), generated here as UUID
 *   - views.view_id  → NVARCHAR(100), set as readable strings (e.g. 'PARTY_IB')
 *   - user_view_access.user_id / view_id → both NVARCHAR(100)
 *   - created_at / updated_at → DB defaults, NOT inserted here
 *   - No IDENTITY columns → no OUTPUT INSERTED.id, no DBCC CHECKIDENT
 *
 * Usage:
 *   node server/db/seed.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { randomUUID } = require('crypto');
const bcrypt         = require('bcryptjs');
const { query, execute } = require('./connection');

// ── Views ─────────────────────────────────────────────────────────────────────
// view_id is NVARCHAR(100) — use readable string keys that match alerts.view_id
const VIEWS = [
  { view_id: 'PARTY_IB',  view_name: 'Party IB'  },
  { view_id: 'PARTY_WMA', view_name: 'Party WMA' },
  { view_id: 'PARTY_CB',  view_name: 'Party CB'  },
];

// ── Workflow config ───────────────────────────────────────────────────────────
const WORKFLOW = [
  [1,'AML IB Americas','Open','In Review'],
  [1,'AML IB Americas','In Review','Escalated'],
  [1,'AML IB Americas','In Review','Closed'],
  [1,'AML IB Americas','Escalated','Closed'],
  [1,'AML IB Americas','Escalated','Rejected'],
  [2,'AML IB APAC','Open','In Review'],
  [2,'AML IB APAC','Open','Escalated'],
  [2,'AML IB APAC','In Review','Escalated'],
  [2,'AML IB APAC','In Review','Closed'],
  [2,'AML IB APAC','Escalated','Closed'],
  [2,'AML IB APAC','Escalated','Rejected'],
  [3,'AML IB EMEA','Open','In Review'],
  [3,'AML IB EMEA','In Review','Escalated'],
  [3,'AML IB EMEA','In Review','Closed'],
  [3,'AML IB EMEA','Escalated','Closed'],
  [4,'AML WMA Americas','Open','In Review'],
  [4,'AML WMA Americas','In Review','Closed'],
  [4,'AML WMA Americas','In Review','Rejected'],
  [5,'AML WMA APAC','Open','In Review'],
  [5,'AML WMA APAC','In Review','Escalated'],
  [5,'AML WMA APAC','Escalated','Closed'],
  [6,'AML WMA EMEA','Open','In Review'],
  [6,'AML WMA EMEA','In Review','Escalated'],
  [6,'AML WMA EMEA','In Review','Closed'],
  [6,'AML WMA EMEA','Escalated','Closed'],
  [6,'AML WMA EMEA','Escalated','Rejected'],
  [7,'AML WMA Africa','Open','In Review'],
  [7,'AML WMA Africa','In Review','Closed'],
  [8,'AML CB Corporate','Open','In Review'],
  [8,'AML CB Corporate','In Review','Escalated'],
  [8,'AML CB Corporate','In Review','Closed'],
  [8,'AML CB Corporate','Escalated','Closed'],
  [8,'AML CB Corporate','Escalated','Rejected'],
  [9,'AML CB Trade Finance','Open','In Review'],
  [9,'AML CB Trade Finance','In Review','Escalated'],
  [9,'AML CB Trade Finance','Escalated','Closed'],
  [9,'AML CB Trade Finance','Escalated','Rejected'],
];

// ── Users ─────────────────────────────────────────────────────────────────────
// [name, username, email, plainPassword, role, group, business_unit, primaryViewId]
// primaryViewId must be one of the view_id strings from VIEWS above
const USER_DEFS = [
  ['System Admin',    'admin',      'admin@amlbank.com',     'Admin@123',   'admin',      'Operations', 'Global',      'PARTY_IB' ],
  ['Jane Supervisor', 'supervisor', 'j.super@amlbank.com',   'Super@123',   'supervisor', 'IB Team',    'IB',          'PARTY_IB' ],
  ['Alex Analyst',    'analyst1',   'a.analyst@amlbank.com', 'Analyst@123', 'analyst',    'IB Team',    'IB Americas', 'PARTY_IB' ],
  ['Brett Analyst',   'analyst2',   'b.analyst@amlbank.com', 'Analyst@123', 'analyst',    'WMA Team',   'WMA',         'PARTY_WMA'],
  ['Carol Analyst',   'analyst3',   'c.analyst@amlbank.com', 'Analyst@123', 'analyst',    'CB Team',    'CB',          'PARTY_CB' ],
  ['Read Only User',  'readonly',   'readonly@amlbank.com',  'Read@123',    'readonly',   'Compliance', 'Global',      'PARTY_IB' ],
];

// user index (0-based) → allowed view_id strings (must match VIEWS above)
const USER_VIEWS = {
  0: ['PARTY_IB', 'PARTY_WMA', 'PARTY_CB'],  // admin — all views
  1: ['PARTY_IB', 'PARTY_WMA', 'PARTY_CB'],  // supervisor — all views
  2: ['PARTY_IB'],                            // analyst1 — IB only
  3: ['PARTY_IB', 'PARTY_WMA'],              // analyst2 — IB + WMA
  4: ['PARTY_WMA', 'PARTY_CB'],              // analyst3 — WMA + CB
  5: ['PARTY_IB', 'PARTY_WMA', 'PARTY_CB'],  // readonly — all views
};

// ── Alerts ─────────────────────────────────────────────────────────────────────
// view_id must match the NVARCHAR view_id strings from VIEWS above
const ALERTS = [
  // Party IB
  ['PARTY_IB','IB Americas','ALT-00001','C10021','John Matthews','AML IB Americas',1,87,'Open','analyst1','2024-01-15',250000,'USD','US','Structuring - multiple cash deposits below threshold','High','["Structuring","Multiple Accounts"]'],
  ['PARTY_IB','IB APAC','ALT-00002','C10034','Sarah Chen','AML IB APAC',2,91,'In Review','analyst2','2024-01-16',520000,'HKD','HK','Wire transfers to high-risk jurisdiction','Critical','["High-Risk Country","Wire Transfer"]'],
  ['PARTY_IB','IB EMEA','ALT-00003','C10055','Carlos Rivera','AML IB EMEA',3,73,'Open','analyst1','2024-01-17',80000,'EUR','ES','Rapid movement of funds through multiple accounts','Medium','["Rapid Movement"]'],
  ['PARTY_IB','IB APAC','ALT-00004','C10072','Priya Sharma','AML IB APAC',2,95,'Escalated','supervisor','2024-01-18',1200000,'SGD','SG','Large cross-border transactions inconsistent with profile','Critical','["PEP","Cross-Border","Large Amount"]'],
  ['PARTY_IB','IB Americas','ALT-00005','C10088','Michael Brown','AML IB Americas',1,65,'Open','analyst2','2024-01-19',45000,'USD','MX','Unusual cash activity for business type','Low','["Cash Activity"]'],
  ['PARTY_IB','IB EMEA','ALT-00006','C10093','Fatima Al-Said','AML IB EMEA',3,82,'Closed','analyst1','2024-01-20',310000,'GBP','AE','Transactions linked to PEP network','High','["PEP","Sanctions"]'],
  ['PARTY_IB','IB APAC','ALT-00007','C10101','Zhang Wei','AML IB APAC',2,78,'Open','analyst3','2024-01-21',680000,'CNY','CN','Frequent round-number transactions','Medium','["Structuring"]'],
  ['PARTY_IB','IB EMEA','ALT-00008','C10115','Elena Petrov','AML IB EMEA',3,88,'In Review','analyst2','2024-01-22',420000,'EUR','RU','Shell company involvement suspected','High','["Shell Company","High-Risk Country"]'],
  // Party WMA
  ['PARTY_WMA','WMA Americas','ALT-00101','W20011','Robert Kline','AML WMA Americas',4,76,'Open','analyst2','2024-01-15',900000,'USD','US','Unusual portfolio liquidation pattern','High','["Liquidation","Unusual Pattern"]'],
  ['PARTY_WMA','WMA APAC','ALT-00102','W20025','Mei Ling','AML WMA APAC',5,84,'In Review','analyst3','2024-01-16',2100000,'HKD','HK','Transfer of wealth inconsistent with known sources','Critical','["Source of Wealth","High Amount"]'],
  ['PARTY_WMA','WMA EMEA','ALT-00103','W20037','Oliver Smith','AML WMA EMEA',6,67,'Open','analyst2','2024-01-17',550000,'GBP','GB','Rapid in-and-out trading with no business rationale','Medium','["Rapid Trading"]'],
  ['PARTY_WMA','WMA EMEA','ALT-00104','W20049','Ingrid Hansen','AML WMA EMEA',6,92,'Escalated','supervisor','2024-01-18',3400000,'SEK','SE','Multiple beneficial owners - UBO verification failed','Critical','["UBO","Multiple Owners"]'],
  ['PARTY_WMA','WMA Africa','ALT-00105','W20058','David Nkosi','AML WMA Africa',7,71,'Open','analyst3','2024-01-19',120000,'ZAR','ZA','Cross-border wire to unverified beneficiary','Medium','["Unverified Beneficiary"]'],
  // Party CB
  ['PARTY_CB','CB Corporate','ALT-00201','B30001','Apex Holdings','AML CB Corporate',8,89,'Open','analyst3','2024-01-15',5200000,'USD','KY','Large correspondent banking flow - high-risk domicile','Critical','["Correspondent Banking","High-Risk"]'],
  ['PARTY_CB','CB Trade','ALT-00202','B30012','Solaris Trade','AML CB Trade Finance',9,74,'In Review','analyst2','2024-01-16',780000,'EUR','DE','Trade-based money laundering indicators','High','["TBML","Invoice Fraud"]'],
  ['PARTY_CB','CB Corporate','ALT-00203','B30023','Pacific Bridge','AML CB Corporate',8,61,'Open','analyst3','2024-01-17',330000,'USD','PA','Frequent small transfers avoiding reporting threshold','Medium','["Structuring","Threshold Avoidance"]'],
  ['PARTY_CB','CB Trade','ALT-00204','B30031','Global Nexus','AML CB Trade Finance',9,95,'Escalated','supervisor','2024-01-18',8900000,'USD','HK','Phantom shipment documentation detected','Critical','["Phantom Shipment","TBML"]'],
];

// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱  Seeding Azure SQL database…\n');

  // ── Views ──────────────────────────────────────────────────────────────────
  console.log('  Inserting views…');
  for (const v of VIEWS) {
    await execute(
      `IF NOT EXISTS (SELECT 1 FROM views WHERE view_id = @vid)
       INSERT INTO views (view_id, view_name, active)
       VALUES (@vid, @vname, 1)`,
      { vid: v.view_id, vname: v.view_name }
    );
  }
  console.log(`  ✓  ${VIEWS.length} views`);

  // ── Workflow config ────────────────────────────────────────────────────────
  console.log('  Inserting workflow config…');
  for (const [atid, atname, src, tgt] of WORKFLOW) {
    await execute(
      `IF NOT EXISTS (
         SELECT 1 FROM workflow_config
         WHERE alert_type_id = @atid
           AND source_step   = @src
           AND target_step   = @tgt
       )
       INSERT INTO workflow_config (alert_type_id, alert_type_name, source_step, target_step)
       VALUES (@atid, @atname, @src, @tgt)`,
      { atid, atname, src, tgt }
    );
  }
  console.log(`  ✓  ${WORKFLOW.length} workflow transitions`);

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log('  Inserting users…');

  for (let i = 0; i < USER_DEFS.length; i++) {
    const [name, username, email, pw, role, grp, bu, primaryViewId] = USER_DEFS[i];

    // Reuse existing user if already seeded
    const existing = await query(
      'SELECT id FROM users WHERE username = @username',
      { username }
    );

    let userId;
    if (existing.length) {
      userId = existing[0].id;
      console.log(`    skipped (already exists): ${username}`);
    } else {
      // id is NVARCHAR(100) — generate a UUID, not an IDENTITY integer
      userId = randomUUID();
      const pwHash = await bcrypt.hash(pw, 12);

      // created_at and updated_at are NOT listed here — they use DB defaults
      await execute(
        `INSERT INTO users
           (id, name, username, email, password_hash, role, [group], business_unit, view_id, active)
         VALUES
           (@id, @name, @username, @email, @hash, @role, @grp, @bu, @primaryViewId, 1)`,
        {
          id:            userId,
          name,
          username,
          email,
          hash:          pwHash,
          role,
          grp:           grp            || null,
          bu:            bu             || null,
          primaryViewId: primaryViewId  || null,
        }
      );

      console.log(`    inserted: ${username} (id: ${userId})`);
    }

    // Upsert view access rows — view_id is also NVARCHAR(100)
    for (const viewId of (USER_VIEWS[i] || [])) {
      await execute(
        `IF NOT EXISTS (
           SELECT 1 FROM user_view_access
           WHERE user_id = @uid AND view_id = @viewId
         )
         INSERT INTO user_view_access (user_id, view_id)
         VALUES (@uid, @viewId)`,
        { uid: userId, viewId }
      );
    }
  }
  console.log(`  ✓  ${USER_DEFS.length} users processed`);

  // ── Alerts ────────────────────────────────────────────────────────────────
  console.log('  Inserting alerts…');
  for (const [
    vid, bu, aid, cid, cname, atype, atid,
    score, status, assigned, cdate, amount,
    currency, country, desc, priority, flags,
  ] of ALERTS) {
    await execute(
      `IF NOT EXISTS (SELECT 1 FROM alerts WHERE Alert_ID = @aid)
       INSERT INTO alerts
         (view_id, business_unit, Alert_ID, Customer_ID, Customer_Name,
          Alert_Type, Alert_Type_ID, Score, Status, Assigned_To,
          Created_Date, Amount, Currency, Country, Description,
          Priority, Risk_Flags)
       VALUES
         (@vid, @bu, @aid, @cid, @cname,
          @atype, @atid, @score, @status, @assigned,
          @cdate, @amount, @currency, @country, @desc,
          @priority, @flags)`,
      {
        vid, bu, aid, cid, cname, atype, atid,
        score, status, assigned, cdate, amount,
        currency, country, desc, priority, flags,
      }
    );
  }
  console.log(`  ✓  ${ALERTS.length} alerts`);

  console.log('\n✅  Seed complete!\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌  Seed failed:', err.message);
  console.error(err);
  process.exit(1);
});
