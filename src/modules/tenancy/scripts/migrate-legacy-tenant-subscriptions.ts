import { connectDatabase, disconnectDatabase } from '../../../database/connection.js';
import { Tenant } from '../models/tenant.model.js';
import { Subscription } from '../models/subscription.model.js';

async function main() {
  await connectDatabase();
  let migrated = 0;
  let skipped = 0;
  try {
    const tenants = await Tenant.collection.find({ plan: { $exists: true, $ne: null } }).toArray();
    for (const tenant of tenants) {
      const legacyPlan = typeof tenant.plan === 'string' ? tenant.plan.trim() : '';
      if (!legacyPlan) {
        skipped++;
        continue;
      }

      const code = legacyPlan.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'legacy-plan';
      const legacyCurrency = typeof tenant.settings?.currency === 'string' ? tenant.settings.currency.toUpperCase() : 'XXX';
      await Subscription.updateOne(
        { tenantId: tenant._id },
        {
          $setOnInsert: {
            tenantId: tenant._id,
            plan: { code, name: legacyPlan, amount: 0, currency: legacyCurrency },
            billingCycle: 'monthly',
            status: 'pending',
            notes: 'Migrated from legacy tenant.plan. Amount and billing cycle are placeholders. Confirm plan, price, currency, and billing cycle before activation.',
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );

      await Tenant.collection.updateOne({ _id: tenant._id }, { $unset: { plan: '' } });
      migrated++;
    }
    console.info(`Legacy tenant plans migrated: ${migrated}; skipped: ${skipped}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('Tenant subscription migration failed:', error);
  process.exitCode = 1;
});
